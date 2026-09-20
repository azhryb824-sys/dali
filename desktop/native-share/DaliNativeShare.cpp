#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wincrypt.h>
#include <shobjidl_core.h>

#include <winrt/base.h>
#include <winrt/Windows.ApplicationModel.DataTransfer.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.h>

#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

using namespace winrt;
using namespace Windows::ApplicationModel::DataTransfer;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;
using namespace Windows::Storage;

namespace {
constexpr wchar_t kWindowClass[] = L"DaliNativeShareOwner";
constexpr UINT_PTR kInitialTimeout = 1;
constexpr UINT_PTR kChosenTimeout = 2;
constexpr UINT kInitialTimeoutMs = 10 * 60 * 1000;
constexpr UINT kChosenTimeoutMs = 2 * 60 * 1000;
constexpr UINT kOpenShare = WM_APP + 1;

HWND g_ownerWindow = nullptr;
DataTransferManager g_manager{nullptr};
IVector<IStorageItem> g_storageItems{nullptr};
std::wstring g_title;
std::wstring g_text;
std::filesystem::path g_statusPath;
bool g_shareReady = false;
bool g_failed = false;
std::vector<std::filesystem::path> g_paths;

void WriteStatus(std::string const& value) noexcept {
  if (g_statusPath.empty()) return;
  try {
    std::ofstream stream(g_statusPath, std::ios::binary | std::ios::trunc);
    if (stream) stream << value;
  } catch (...) {
  }
}

void ReportFailure(hresult_error const& error) noexcept {
  g_failed = true;
  WriteStatus("error:windows-share-hresult-" +
              std::to_string(static_cast<unsigned long>(error.code().value)));
}

void ConfigureShare(HWND owner);

std::wstring Utf8ToWide(std::string const& input) {
  if (input.empty()) return {};
  const int count = MultiByteToWideChar(
      CP_UTF8, MB_ERR_INVALID_CHARS, input.data(), static_cast<int>(input.size()),
      nullptr, 0);
  if (count <= 0) throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  std::wstring output(static_cast<size_t>(count), L'\0');
  if (MultiByteToWideChar(
          CP_UTF8, MB_ERR_INVALID_CHARS, input.data(),
          static_cast<int>(input.size()), output.data(), count) != count) {
    throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  }
  return output;
}

std::string DecodeBase64(std::string const& encoded) {
  if (encoded.empty()) return {};
  DWORD byteCount = 0;
  if (!CryptStringToBinaryA(
          encoded.c_str(), static_cast<DWORD>(encoded.size()),
          CRYPT_STRING_BASE64, nullptr, &byteCount, nullptr, nullptr)) {
    throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  }
  std::string decoded(static_cast<size_t>(byteCount), '\0');
  if (!CryptStringToBinaryA(
          encoded.c_str(), static_cast<DWORD>(encoded.size()),
          CRYPT_STRING_BASE64, reinterpret_cast<BYTE*>(decoded.data()),
          &byteCount, nullptr, nullptr)) {
    throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  }
  decoded.resize(byteCount);
  if (decoded.find('\0') != std::string::npos) throw_hresult(E_INVALIDARG);
  return decoded;
}

std::vector<std::string> ReadManifestLines(std::filesystem::path const& path) {
  std::ifstream stream(path, std::ios::binary);
  if (!stream) throw_hresult(HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND));
  std::vector<std::string> lines;
  std::string line;
  while (std::getline(stream, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    lines.push_back(DecodeBase64(line));
  }
  if (lines.size() < 4 || lines.size() > 203) throw_hresult(E_INVALIDARG);
  return lines;
}

template <typename TResult>
TResult WaitFor(IAsyncOperation<TResult> const& operation) {
  HANDLE ready = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!ready) throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  operation.Completed([ready](auto const&, AsyncStatus) noexcept {
    SetEvent(ready);
  });
  for (;;) {
    const DWORD result = MsgWaitForMultipleObjects(
        1, &ready, FALSE, INFINITE, QS_ALLINPUT);
    if (result == WAIT_OBJECT_0) break;
    if (result == WAIT_OBJECT_0 + 1) {
      MSG message{};
      while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
      }
      continue;
    }
    CloseHandle(ready);
    throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  }
  CloseHandle(ready);
  if (operation.Status() != AsyncStatus::Completed)
    throw_hresult(operation.ErrorCode());
  return operation.GetResults();
}

LRESULT CALLBACK OwnerWindowProc(HWND window, UINT message, WPARAM wparam,
                                 LPARAM lparam) {
  switch (message) {
    case kOpenShare:
      try {
        ConfigureShare(window);
      } catch (hresult_error const& error) {
        ReportFailure(error);
        DestroyWindow(window);
      } catch (...) {
        g_failed = true;
        WriteStatus("error:windows-share-unexpected-error");
        DestroyWindow(window);
      }
      return 0;
    case WM_TIMER:
      if (wparam == kInitialTimeout || wparam == kChosenTimeout)
        DestroyWindow(window);
      return 0;
    case WM_DESTROY:
      if (!g_shareReady && !g_failed) WriteStatus("error:windows-share-window-closed");
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(window, message, wparam, lparam);
  }
}

HWND CreateOwnerWindow(HINSTANCE instance, bool visible = true) {
  WNDCLASSEXW windowClass{};
  windowClass.cbSize = sizeof(windowClass);
  windowClass.lpfnWndProc = OwnerWindowProc;
  windowClass.hInstance = instance;
  windowClass.lpszClassName = kWindowClass;
  windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  if (!RegisterClassExW(&windowClass) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
    throw_hresult(HRESULT_FROM_WIN32(GetLastError()));

  RECT workArea{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
  const int width = 900;
  const int height = 680;
  const int x = workArea.left + ((workArea.right - workArea.left) - width) / 2;
  const int y = workArea.top + ((workArea.bottom - workArea.top) - height) / 2;
  HWND window = CreateWindowExW(
      WS_EX_APPWINDOW, kWindowClass, L"دالي — مشاركة الملفات عبر واتساب",
      WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU, x, y, width, height, nullptr, nullptr, instance, nullptr);
  if (!window) throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  CreateWindowExW(0, L"STATIC", L"اختر واتساب من نافذة المشاركة ثم حدد المستلم وأكد الإرسال.\nالملفات مرفقة بطلب المشاركة.", WS_CHILD | WS_VISIBLE | SS_CENTER,
      30, 50, width - 60, 100, window, nullptr, instance, nullptr);
  if (visible) {
    ShowWindow(window, SW_SHOW);
    UpdateWindow(window);
    BringWindowToTop(window);
    SetForegroundWindow(window);
    SetActiveWindow(window);
  }
  return window;
}

void PopulateData(DataPackage const& data) {
  data.Properties().Title(g_title);
  if (!g_text.empty()) data.SetText(g_text);
  data.SetStorageItems(g_storageItems.GetView(), true);
  data.RequestedOperation(DataPackageOperation::Copy);
}

void CopyFiles(HWND owner) {
  size_t characters = 1;
  for (auto const& path : g_paths) characters += path.native().size() + 1;
  HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT,
      sizeof(DROPFILES) + characters * sizeof(wchar_t));
  if (!memory) throw_hresult(E_OUTOFMEMORY);
  auto drop = static_cast<DROPFILES*>(GlobalLock(memory));
  if (!drop) { GlobalFree(memory); throw_hresult(E_OUTOFMEMORY); }
  drop->pFiles = sizeof(DROPFILES);
  drop->fWide = TRUE;
  auto output = reinterpret_cast<wchar_t*>(reinterpret_cast<BYTE*>(drop) + sizeof(DROPFILES));
  for (auto const& path : g_paths) {
    auto const& name = path.native();
    memcpy(output, name.c_str(), (name.size() + 1) * sizeof(wchar_t));
    output += name.size() + 1;
  }
  GlobalUnlock(memory);
  bool opened = false;
  for (int attempt = 0; attempt < 20 && !opened; ++attempt) {
    opened = OpenClipboard(owner) != FALSE;
    if (!opened) Sleep(25);
  }
  if (!opened) { GlobalFree(memory); throw_hresult(HRESULT_FROM_WIN32(ERROR_BUSY)); }
  if (!EmptyClipboard() || !SetClipboardData(CF_HDROP, memory)) {
    auto error = GetLastError();
    CloseClipboard();
    GlobalFree(memory);
    throw_hresult(HRESULT_FROM_WIN32(error ? error : ERROR_INVALID_DATA));
  }
  // Windows now owns memory. Verify the OS accepted all file paths before success.
  const auto copied = static_cast<HDROP>(GetClipboardData(CF_HDROP));
  const auto count = copied ? DragQueryFileW(copied, 0xffffffff, nullptr, 0) : 0;
  CloseClipboard();
  if (count != g_paths.size()) throw_hresult(E_FAIL);
}

void ConfigureShare(HWND owner) {
  auto interop =
      get_activation_factory<DataTransferManager, IDataTransferManagerInterop>();
  check_hresult(interop->GetForWindow(
      owner, guid_of<DataTransferManager>(), put_abi(g_manager)));

  g_manager.DataRequested([](DataTransferManager const&,
                             DataRequestedEventArgs const& args) {
    try {
      PopulateData(args.Request().Data());
      g_shareReady = true;
      WriteStatus("ready");
    } catch (hresult_error const& error) {
      ReportFailure(error);
      PostMessageW(g_ownerWindow, WM_CLOSE, 0, 0);
    } catch (...) {
      g_failed = true;
      WriteStatus("error:windows-share-data-failed");
      PostMessageW(g_ownerWindow, WM_CLOSE, 0, 0);
    }
  });
  g_manager.TargetApplicationChosen(
      [](DataTransferManager const&, TargetApplicationChosenEventArgs const&) {
        if (g_ownerWindow) {
          KillTimer(g_ownerWindow, kInitialTimeout);
          SetTimer(g_ownerWindow, kChosenTimeout, kChosenTimeoutMs, nullptr);
        }
      });
  check_hresult(interop->ShowShareUIForWindow(owner));
}
}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
  try {
    init_apartment(apartment_type::single_threaded);
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv || (argc != 2 && argc != 3)) { if (argv) LocalFree(argv); return 2; }
    const std::wstring mode = argc == 3 ? argv[1] : L"";
    const auto manifestPath = std::filesystem::path(argv[argc - 1]);
    LocalFree(argv);
    if (!mode.empty() && mode != L"--copy-files" && mode != L"--verify-files") return 2;

    const auto lines = ReadManifestLines(manifestPath);
    g_title = Utf8ToWide(lines[0]);
    g_text = Utf8ToWide(lines[1]);
    if (g_title.empty()) return 3;

    const auto manifestDirectory =
        std::filesystem::weakly_canonical(manifestPath).parent_path();
    const auto statusPath = std::filesystem::weakly_canonical(Utf8ToWide(lines[2]));
    if (!std::filesystem::equivalent(statusPath.parent_path(), manifestDirectory) ||
        statusPath.filename() != L"share-status.dali") return 4;
    g_statusPath = statusPath;
    WriteStatus("starting");

    for (size_t index = 3; index < lines.size(); ++index) {
      auto path = std::filesystem::weakly_canonical(Utf8ToWide(lines[index]));
      if (!std::filesystem::is_regular_file(path) ||
          !std::filesystem::equivalent(path.parent_path(), manifestDirectory)) {
        WriteStatus("error:share-file-unavailable");
        return 5;
      }
      g_paths.push_back(path);
    }
    if (mode == L"--copy-files") {
      g_ownerWindow = CreateOwnerWindow(instance, false);
      CopyFiles(g_ownerWindow);
      WriteStatus("copied");
      return 0;
    }

    g_storageItems = single_threaded_vector<IStorageItem>();
    for (auto const& path : g_paths) {
      g_storageItems.Append(
          WaitFor(StorageFile::GetFileFromPathAsync(hstring{path.c_str()})));
    }
    if (g_storageItems.Size() == 0) return 6;
    if (mode == L"--verify-files") {
      DataPackage data;
      PopulateData(data);
      const auto items = WaitFor(data.GetView().GetStorageItemsAsync());
      if (items.Size() != g_paths.size()) throw_hresult(E_FAIL);
      for (uint32_t index = 0; index < items.Size(); ++index) {
        if (!std::filesystem::equivalent(std::filesystem::path(items.GetAt(index).Path().c_str()), g_paths[index]))
          throw_hresult(E_FAIL);
      }
      WriteStatus("verified");
      return 0;
    }

    g_ownerWindow = CreateOwnerWindow(instance);
    SetTimer(g_ownerWindow, kInitialTimeout, kInitialTimeoutMs, nullptr);
    // Start only after the visible owner is running its STA message loop.
    PostMessageW(g_ownerWindow, kOpenShare, 0, 0);

    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
    return 0;
  } catch (hresult_error const& error) {
    ReportFailure(error);
    return 7;
  } catch (...) {
    WriteStatus("error:windows-share-unexpected-error");
    return 1;
  }
}
