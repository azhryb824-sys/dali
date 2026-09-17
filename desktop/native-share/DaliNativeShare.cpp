#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <wincrypt.h>
#include <shobjidl_core.h>

#include <winrt/base.h>
#include <winrt/Windows.ApplicationModel.DataTransfer.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.h>

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

HWND g_ownerWindow = nullptr;
DataTransferManager g_manager{nullptr};
IVector<IStorageItem> g_storageItems{nullptr};
std::wstring g_title;
std::wstring g_text;
std::filesystem::path g_statusPath;
bool g_shareReady = false;

void WriteStatus(std::string const& value) noexcept {
  if (g_statusPath.empty()) return;
  try {
    std::ofstream stream(g_statusPath, std::ios::binary | std::ios::trunc);
    if (stream) stream << value;
  } catch (...) {
  }
}

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
    if (!line.empty()) lines.push_back(DecodeBase64(line));
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
    case WM_TIMER:
      if (wparam == kInitialTimeout || wparam == kChosenTimeout)
        DestroyWindow(window);
      return 0;
    case WM_DESTROY:
      if (!g_shareReady) WriteStatus("error:windows-share-window-closed");
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(window, message, wparam, lparam);
  }
}

HWND CreateOwnerWindow(HINSTANCE instance) {
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
      WS_EX_TOOLWINDOW | WS_EX_LAYERED, kWindowClass, L"Dali File Share",
      WS_POPUP, x, y, width, height, nullptr, nullptr, instance, nullptr);
  if (!window) throw_hresult(HRESULT_FROM_WIN32(GetLastError()));
  SetLayeredWindowAttributes(window, 0, 1, LWA_ALPHA);
  ShowWindow(window, SW_SHOW);
  UpdateWindow(window);
  BringWindowToTop(window);
  SetForegroundWindow(window);
  SetActiveWindow(window);
  return window;
}

void ConfigureShare(HWND owner) {
  auto interop =
      get_activation_factory<DataTransferManager, IDataTransferManagerInterop>();
  check_hresult(interop->GetForWindow(
      owner, guid_of<DataTransferManager>(), put_abi(g_manager)));

  g_manager.DataRequested([](DataTransferManager const&,
                             DataRequestedEventArgs const& args) {
    auto data = args.Request().Data();
    data.Properties().Title(g_title);
    if (!g_text.empty()) data.SetText(g_text);
    data.SetStorageItems(g_storageItems.GetView(), true);
    data.RequestedOperation(DataPackageOperation::Copy);
    g_shareReady = true;
    WriteStatus("ready");
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
    if (!argv || argc != 2) return 2;
    const auto manifestPath = std::filesystem::path(argv[1]);
    LocalFree(argv);

    const auto lines = ReadManifestLines(manifestPath);
    g_title = Utf8ToWide(lines[0]);
    g_text = Utf8ToWide(lines[1]);
    if (g_title.empty()) return 3;

    const auto manifestDirectory =
        std::filesystem::weakly_canonical(manifestPath).parent_path();
    g_statusPath = std::filesystem::absolute(Utf8ToWide(lines[2]));
    if (g_statusPath.parent_path() != manifestDirectory) return 4;
    WriteStatus("starting");

    g_storageItems = single_threaded_vector<IStorageItem>();
    for (size_t index = 3; index < lines.size(); ++index) {
      auto path = std::filesystem::absolute(Utf8ToWide(lines[index]));
      if (!std::filesystem::is_regular_file(path)) return 5;
      g_storageItems.Append(
          WaitFor(StorageFile::GetFileFromPathAsync(hstring{path.c_str()})));
    }
    if (g_storageItems.Size() == 0) return 6;

    g_ownerWindow = CreateOwnerWindow(instance);
    SetTimer(g_ownerWindow, kInitialTimeout, kInitialTimeoutMs, nullptr);
    ConfigureShare(g_ownerWindow);

    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
    return 0;
  } catch (hresult_error const& error) {
    WriteStatus(
        "error:windows-share-hresult-" +
        std::to_string(static_cast<unsigned long>(error.code().value)));
    return 7;
  } catch (...) {
    WriteStatus("error:windows-share-unexpected-error");
    return 1;
  }
}
