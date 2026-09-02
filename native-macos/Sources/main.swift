import Cocoa
import Foundation
import WebKit

private enum DaliConfig {
    static let portalOrigin = URL(string: "https://www.dally.info")!
    static let entryEndpoint = URL(string: "https://www.dally.info/api/portal/desktop/entry-link")!
    static let desktopMarker = "dali-desktop-v1"
    static let nativeUserAgent = "DaliDesktopNative/1 DaliApp/0.3.0"
    static let deviceDefaultsKey = "sa.dally.desktop.light.device-id"
    static let appTitle = "نظام دالي الإداري الخفيف"

    static func isPortalURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else { return false }
        return scheme == "https" && host == portalOrigin.host
    }
}

private struct EntryLink: Decodable {
    let url: String
}

private final class DeviceIdentity {
    let value: String

    init(defaults: UserDefaults = .standard) {
        if let stored = defaults.string(forKey: DaliConfig.deviceDefaultsKey), UUID(uuidString: stored) != nil {
            value = stored.lowercased()
        } else {
            let generated = UUID().uuidString.lowercased()
            defaults.set(generated, forKey: DaliConfig.deviceDefaultsKey)
            value = generated
        }
    }
}

private enum PortalBootstrapper {
    static func entryURL(deviceID: String) async -> URL? {
        var request = URLRequest(url: DaliConfig.entryEndpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(DaliConfig.desktopMarker, forHTTPHeaderField: "x-dali-desktop-app")
        request.setValue(deviceID, forHTTPHeaderField: "x-dali-desktop-device")
        request.setValue(DaliConfig.nativeUserAgent, forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            let payload = try JSONDecoder().decode(EntryLink.self, from: data)
            guard let url = URL(string: payload.url), DaliConfig.isPortalURL(url), url.path.hasPrefix("/desktop-access/") else {
                return nil
            }
            return url
        } catch {
            return nil
        }
    }
}

private final class DaliApplicationDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let device = DeviceIdentity()
    private var window: NSWindow!
    private var webView: WKWebView!
    private var progressIndicator: NSProgressIndicator!
    private var offlinePanel: NSVisualEffectView!
    private var statusLabel: NSTextField!
    private var progressObservation: NSKeyValueObservation?
    private var activeDownloads: [ObjectIdentifier: WKDownload] = [:]
    private var downloadDestinations: [ObjectIdentifier: URL] = [:]
    private var isRewritingNavigation = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenus()
        configureWindow()
        configureWebView()
        configureOfflinePanel()
        beginPortalEntry()

        if CommandLine.arguments.contains("--smoke-test") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) {
                print("DALI_SMOKE_OK")
                NSApp.terminate(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        progressObservation?.invalidate()
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        activeDownloads.removeAll()
        downloadDestinations.removeAll()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: false)
        }
        return true
    }

    private func configureWindow() {
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let width = min(max(visible.width * 0.88, 980), 1440)
        let height = min(max(visible.height * 0.88, 680), 940)
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = DaliConfig.appTitle
        window.minSize = NSSize(width: 900, height: 620)
        window.center()
        window.delegate = self
        window.tabbingMode = .disallowed
        window.isReleasedWhenClosed = false
        window.titlebarAppearsTransparent = false
        window.backgroundColor = NSColor(calibratedRed: 0.016, green: 0.106, blue: 0.169, alpha: 1)

        let toolbar = NSToolbar(identifier: "sa.dally.desktop.light.toolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.showsBaselineSeparator = true
        window.toolbar = toolbar
        window.toolbarStyle = .unified
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: false)
    }

    private func configureWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.addUserScript(WKUserScript(
            source: desktopBridgeScript(deviceID: device.value),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = DaliConfig.nativeUserAgent
        webView.allowsMagnification = true
        webView.allowsBackForwardNavigationGestures = true
        webView.setValue(false, forKey: "drawsBackground")

        progressIndicator = NSProgressIndicator()
        progressIndicator.translatesAutoresizingMaskIntoConstraints = false
        progressIndicator.style = .bar
        progressIndicator.controlSize = .small
        progressIndicator.minValue = 0
        progressIndicator.maxValue = 1
        progressIndicator.isIndeterminate = false
        progressIndicator.isHidden = true

        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor(calibratedRed: 0.016, green: 0.106, blue: 0.169, alpha: 1).cgColor
        root.addSubview(webView)
        root.addSubview(progressIndicator)
        window.contentView = root

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            webView.topAnchor.constraint(equalTo: root.topAnchor),
            webView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            progressIndicator.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            progressIndicator.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            progressIndicator.topAnchor.constraint(equalTo: root.topAnchor),
            progressIndicator.heightAnchor.constraint(equalToConstant: 3)
        ])

        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.progressIndicator.doubleValue = webView.estimatedProgress
                self.progressIndicator.isHidden = webView.estimatedProgress >= 1
            }
        }
    }

    private func configureOfflinePanel() {
        offlinePanel = NSVisualEffectView()
        offlinePanel.translatesAutoresizingMaskIntoConstraints = false
        offlinePanel.material = .contentBackground
        offlinePanel.blendingMode = .withinWindow
        offlinePanel.state = .active
        offlinePanel.wantsLayer = true
        offlinePanel.layer?.cornerRadius = 18
        offlinePanel.layer?.borderWidth = 1
        offlinePanel.layer?.borderColor = NSColor.separatorColor.cgColor
        offlinePanel.isHidden = true

        let heading = NSTextField(labelWithString: "تعذّر فتح نظام دالي")
        heading.alignment = .center
        heading.font = .systemFont(ofSize: 24, weight: .bold)
        heading.textColor = .labelColor

        statusLabel = NSTextField(wrappingLabelWithString: "تحقق من اتصال الإنترنت ثم أعد المحاولة. لا يعمل التطبيق في الخلفية ولا يؤثر في البرامج المفتوحة.")
        statusLabel.alignment = .center
        statusLabel.font = .systemFont(ofSize: 15, weight: .regular)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.maximumNumberOfLines = 3

        let retry = NSButton(title: "إعادة المحاولة", target: self, action: #selector(retryPortal))
        retry.bezelStyle = .rounded
        retry.controlSize = .large
        retry.keyEquivalent = "\r"

        let stack = NSStackView(views: [heading, statusLabel, retry])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 18
        stack.edgeInsets = NSEdgeInsets(top: 34, left: 38, bottom: 34, right: 38)
        offlinePanel.addSubview(stack)
        window.contentView?.addSubview(offlinePanel)

        NSLayoutConstraint.activate([
            offlinePanel.centerXAnchor.constraint(equalTo: window.contentView!.centerXAnchor),
            offlinePanel.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor),
            offlinePanel.widthAnchor.constraint(lessThanOrEqualToConstant: 520),
            offlinePanel.leadingAnchor.constraint(greaterThanOrEqualTo: window.contentView!.leadingAnchor, constant: 28),
            offlinePanel.trailingAnchor.constraint(lessThanOrEqualTo: window.contentView!.trailingAnchor, constant: -28),
            stack.leadingAnchor.constraint(equalTo: offlinePanel.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: offlinePanel.trailingAnchor),
            stack.topAnchor.constraint(equalTo: offlinePanel.topAnchor),
            stack.bottomAnchor.constraint(equalTo: offlinePanel.bottomAnchor),
            statusLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 420)
        ])
    }

    private func beginPortalEntry() {
        offlinePanel?.isHidden = true
        progressIndicator?.isHidden = false
        progressIndicator?.doubleValue = 0.08
        Task { [weak self] in
            guard let self else { return }
            let entryURL = await PortalBootstrapper.entryURL(deviceID: self.device.value)
            await MainActor.run {
                guard let entryURL else {
                    self.showOffline("تعذّر الاتصال الآمن بالنظام. تأكد من الإنترنت ثم أعد المحاولة.")
                    return
                }
                self.loadPortal(entryURL)
            }
        }
    }

    private func loadPortal(_ url: URL) {
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.cachePolicy = .reloadRevalidatingCacheData
        addDesktopHeaders(to: &request)
        webView.load(request)
    }

    private func addDesktopHeaders(to request: inout URLRequest) {
        request.setValue(DaliConfig.desktopMarker, forHTTPHeaderField: "x-dali-desktop-app")
        request.setValue(device.value, forHTTPHeaderField: "x-dali-desktop-device")
        request.setValue(DaliConfig.nativeUserAgent, forHTTPHeaderField: "User-Agent")
    }

    private func showOffline(_ message: String) {
        statusLabel?.stringValue = message
        offlinePanel?.isHidden = false
        progressIndicator?.isHidden = true
    }

    private func hideOffline() {
        offlinePanel?.isHidden = true
    }

    @objc private func retryPortal() {
        beginPortalEntry()
    }

    @objc private func goBack() {
        if webView.canGoBack { webView.goBack() }
    }

    @objc private func goForward() {
        if webView.canGoForward { webView.goForward() }
    }

    @objc private func reloadPortal() {
        if webView.url == nil { beginPortalEntry() } else { webView.reload() }
    }

    @objc private func goHome() {
        beginPortalEntry()
    }

    @objc private func printPage() {
        let operation = webView.printOperation(with: NSPrintInfo.shared)
        operation.showsPrintPanel = true
        operation.showsProgressPanel = true
        operation.run()
    }

    @objc private func zoomIn() {
        webView.pageZoom = min(webView.pageZoom + 0.1, 2.0)
    }

    @objc private func zoomOut() {
        webView.pageZoom = max(webView.pageZoom - 0.1, 0.6)
    }

    @objc private func actualSize() {
        webView.pageZoom = 1
    }

    private func configureMenus() {
        let menu = NSMenu()

        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "حول نظام دالي", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "إخفاء نظام دالي", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "إخفاء التطبيقات الأخرى", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "إظهار الكل", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "إنهاء نظام دالي", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let fileItem = NSMenuItem()
        menu.addItem(fileItem)
        let fileMenu = NSMenu(title: "ملف")
        let printItem = fileMenu.addItem(withTitle: "طباعة…", action: #selector(printPage), keyEquivalent: "p")
        printItem.target = self
        fileItem.submenu = fileMenu

        let editItem = NSMenuItem()
        menu.addItem(editItem)
        let editMenu = NSMenu(title: "تحرير")
        editMenu.addItem(withTitle: "تراجع", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "إعادة", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "قص", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "نسخ", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "لصق", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "تحديد الكل", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        let viewItem = NSMenuItem()
        menu.addItem(viewItem)
        let viewMenu = NSMenu(title: "عرض")
        let back = viewMenu.addItem(withTitle: "رجوع", action: #selector(goBack), keyEquivalent: "[")
        back.target = self
        let forward = viewMenu.addItem(withTitle: "تقدم", action: #selector(goForward), keyEquivalent: "]")
        forward.target = self
        let reload = viewMenu.addItem(withTitle: "إعادة تحميل", action: #selector(reloadPortal), keyEquivalent: "r")
        reload.target = self
        viewMenu.addItem(.separator())
        let larger = viewMenu.addItem(withTitle: "تكبير", action: #selector(zoomIn), keyEquivalent: "+")
        larger.target = self
        let smaller = viewMenu.addItem(withTitle: "تصغير", action: #selector(zoomOut), keyEquivalent: "-")
        smaller.target = self
        let actual = viewMenu.addItem(withTitle: "الحجم الفعلي", action: #selector(actualSize), keyEquivalent: "0")
        actual.target = self
        viewItem.submenu = viewMenu

        let windowItem = NSMenuItem()
        menu.addItem(windowItem)
        let windowMenu = NSMenu(title: "نافذة")
        windowMenu.addItem(withTitle: "تصغير", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "تكبير النافذة", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu

        NSApp.mainMenu = menu
    }

    private func desktopBridgeScript(deviceID: String) -> String {
        """
        (() => {
          'use strict';
          const marker = 'dali-desktop-v1';
          const device = '\(deviceID)';
          const portalOrigin = 'https://www.dally.info';
          const isPortal = (value) => {
            try { return new URL(value, location.href).origin === portalOrigin; }
            catch { return false; }
          };
          const securedHeaders = (source) => {
            const headers = new Headers(source || {});
            headers.set('x-dali-desktop-app', marker);
            headers.set('x-dali-desktop-device', device);
            return headers;
          };

          const nativeFetch = window.fetch.bind(window);
          window.fetch = (input, init = {}) => {
            try {
              const target = input instanceof Request ? input.url : String(input);
              if (!isPortal(target)) return nativeFetch(input, init);
              if (input instanceof Request) {
                return nativeFetch(new Request(input, { ...init, headers: securedHeaders(init.headers || input.headers) }));
              }
              return nativeFetch(input, { ...init, headers: securedHeaders(init.headers) });
            } catch (_) {
              return nativeFetch(input, init);
            }
          };

          const nativeOpen = XMLHttpRequest.prototype.open;
          const nativeSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.__daliPortalRequest = isPortal(url);
            return nativeOpen.call(this, method, url, ...rest);
          };
          XMLHttpRequest.prototype.send = function(body) {
            if (this.__daliPortalRequest) {
              try {
                this.setRequestHeader('x-dali-desktop-app', marker);
                this.setRequestHeader('x-dali-desktop-device', device);
              } catch (_) {}
            }
            return nativeSend.call(this, body);
          };

          const secureImage = (image) => {
            if (!(image instanceof HTMLImageElement) || image.dataset.daliSecured === '1') return;
            const raw = image.getAttribute('src');
            if (!raw) return;
            let url;
            try { url = new URL(raw, location.href); } catch { return; }
            if (url.origin !== portalOrigin || !url.pathname.startsWith('/api/portal/')) return;
            image.dataset.daliSecured = '1';
            window.fetch(url.href, { credentials: 'include' })
              .then((response) => {
                if (!response.ok) throw new Error('image-' + response.status);
                return response.blob();
              })
              .then((blob) => {
                const objectURL = URL.createObjectURL(blob);
                image.src = objectURL;
                window.setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
              })
              .catch(() => { image.dataset.daliSecured = '0'; });
          };
          const scanImages = (root) => {
            if (root instanceof HTMLImageElement) secureImage(root);
            if (root && root.querySelectorAll) root.querySelectorAll('img').forEach(secureImage);
          };
          const startImageGuard = () => {
            scanImages(document);
            new MutationObserver((records) => {
              records.forEach((record) => record.addedNodes.forEach(scanImages));
            }).observe(document.documentElement, { childList: true, subtree: true });
          };
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startImageGuard, { once: true });
          else startImageGuard();

          Object.defineProperty(window, '__DALI_NATIVE__', {
            value: Object.freeze({ platform: 'macOS', protocol: 1 }),
            configurable: false,
            writable: false
          });
        })();
        """
    }

    private func shouldShowOffline(for error: Error) -> Bool {
        let code = (error as NSError).code
        return [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorDNSLookupFailed
        ].contains(code)
    }

    private func showJavaScriptAlert(message: String, buttons: [String], completion: @escaping (NSApplication.ModalResponse) -> Void) {
        let alert = NSAlert()
        alert.messageText = DaliConfig.appTitle
        alert.informativeText = message
        buttons.forEach { alert.addButton(withTitle: $0) }
        alert.beginSheetModal(for: window, completionHandler: completion)
    }
}

extension DaliApplicationDelegate: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if ["about", "blob", "data"].contains(url.scheme?.lowercased() ?? "") {
            decisionHandler(.allow)
            return
        }

        guard DaliConfig.isPortalURL(url) else {
            if ["https", "http", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
            return
        }

        if #available(macOS 11.3, *), navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }

        let hasMarker = navigationAction.request.value(forHTTPHeaderField: "x-dali-desktop-app") == DaliConfig.desktopMarker
        let hasDevice = navigationAction.request.value(forHTTPHeaderField: "x-dali-desktop-device") == device.value
        if navigationAction.targetFrame?.isMainFrame != false && (!hasMarker || !hasDevice) && !isRewritingNavigation {
            isRewritingNavigation = true
            var request = navigationAction.request
            addDesktopHeaders(to: &request)
            decisionHandler(.cancel)
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.webView.load(request)
                self.isRewritingNavigation = false
            }
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if #available(macOS 11.3, *), !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        progressIndicator.isHidden = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideOffline()
        progressIndicator.isHidden = true
        window.title = DaliConfig.appTitle
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if shouldShowOffline(for: error) {
            showOffline("انقطع الاتصال بالنظام. البرامج الأخرى على جهازك لم تتأثر؛ تحقق من الإنترنت ثم أعد المحاولة.")
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if shouldShowOffline(for: error) {
            showOffline("تعذّر إكمال تحميل النظام. تحقق من الإنترنت ثم أعد المحاولة.")
        }
    }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        register(download)
    }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        register(download)
    }

    @available(macOS 11.3, *)
    private func register(_ download: WKDownload) {
        let id = ObjectIdentifier(download)
        activeDownloads[id] = download
        download.delegate = self
    }
}

extension DaliApplicationDelegate: WKDownloadDelegate {
    @available(macOS 11.3, *)
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let invalid = CharacterSet(charactersIn: "/:\\")
        let safeName = suggestedFilename.components(separatedBy: invalid).joined(separator: "-").prefix(180)
        let panel = NSSavePanel()
        panel.nameFieldStringValue = safeName.isEmpty ? "Dali-Document" : String(safeName)
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let url = panel.url else {
                self?.activeDownloads.removeValue(forKey: ObjectIdentifier(download))
                completionHandler(nil)
                return
            }
            self?.downloadDestinations[ObjectIdentifier(download)] = url
            completionHandler(url)
        }
    }

    @available(macOS 11.3, *)
    func downloadDidFinish(_ download: WKDownload) {
        let id = ObjectIdentifier(download)
        if let destination = downloadDestinations[id] {
            window.title = "تم حفظ \(destination.lastPathComponent) — \(DaliConfig.appTitle)"
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                self?.window.title = DaliConfig.appTitle
            }
        }
        activeDownloads.removeValue(forKey: id)
        downloadDestinations.removeValue(forKey: id)
    }

    @available(macOS 11.3, *)
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let id = ObjectIdentifier(download)
        activeDownloads.removeValue(forKey: id)
        downloadDestinations.removeValue(forKey: id)
        showJavaScriptAlert(message: "تعذّر حفظ الملف. أعد المحاولة من داخل النظام.", buttons: ["حسنًا"]) { _ in }
    }
}

extension DaliApplicationDelegate: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if DaliConfig.isPortalURL(url) {
            var request = navigationAction.request
            addDesktopHeaders(to: &request)
            webView.load(request)
        } else {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        showJavaScriptAlert(message: message, buttons: ["حسنًا"]) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        showJavaScriptAlert(message: message, buttons: ["موافق", "إلغاء"]) { result in
            completionHandler(result == .alertFirstButtonReturn)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = DaliConfig.appTitle
        alert.informativeText = prompt
        let input = NSTextField(string: defaultText ?? "")
        input.frame = NSRect(x: 0, y: 0, width: 360, height: 26)
        alert.accessoryView = input
        alert.addButton(withTitle: "موافق")
        alert.addButton(withTitle: "إلغاء")
        alert.beginSheetModal(for: window) { result in
            completionHandler(result == .alertFirstButtonReturn ? input.stringValue : nil)
        }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        if origin.protocol.lowercased() == "https" && origin.host.lowercased() == DaliConfig.portalOrigin.host {
            decisionHandler(.prompt)
        } else {
            decisionHandler(.deny)
        }
    }
}

extension DaliApplicationDelegate: NSToolbarDelegate {
    private static let backItem = NSToolbarItem.Identifier("sa.dally.desktop.light.back")
    private static let forwardItem = NSToolbarItem.Identifier("sa.dally.desktop.light.forward")
    private static let reloadItem = NSToolbarItem.Identifier("sa.dally.desktop.light.reload")
    private static let homeItem = NSToolbarItem.Identifier("sa.dally.desktop.light.home")

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [Self.backItem, Self.forwardItem, Self.reloadItem, .flexibleSpace, Self.homeItem]
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [Self.backItem, Self.forwardItem, Self.reloadItem, .flexibleSpace, Self.homeItem]
    }

    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: itemIdentifier)
        item.target = self
        switch itemIdentifier {
        case Self.backItem:
            item.label = "رجوع"
            item.toolTip = "الصفحة السابقة"
            item.image = NSImage(systemSymbolName: "chevron.right", accessibilityDescription: "رجوع")
            item.action = #selector(goBack)
        case Self.forwardItem:
            item.label = "تقدم"
            item.toolTip = "الصفحة التالية"
            item.image = NSImage(systemSymbolName: "chevron.left", accessibilityDescription: "تقدم")
            item.action = #selector(goForward)
        case Self.reloadItem:
            item.label = "تحديث"
            item.toolTip = "إعادة تحميل الصفحة"
            item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "تحديث")
            item.action = #selector(reloadPortal)
        case Self.homeItem:
            item.label = "نظام دالي"
            item.toolTip = "فتح النظام من البداية"
            item.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "نظام دالي")
            item.action = #selector(goHome)
        default:
            return nil
        }
        return item
    }
}

if CommandLine.arguments.contains("--self-test") {
    let checks = DaliConfig.portalOrigin.scheme == "https"
        && DaliConfig.portalOrigin.host == "www.dally.info"
        && DaliConfig.desktopMarker == "dali-desktop-v1"
        && DaliConfig.nativeUserAgent.hasPrefix("DaliDesktopNative/1")
    print(checks ? "DALI_SELF_TEST_OK" : "DALI_SELF_TEST_FAILED")
    exit(checks ? 0 : 1)
}

let application = NSApplication.shared
private let delegate = DaliApplicationDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
