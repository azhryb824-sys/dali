import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "sa.dally.mobile",
  appName: "نظام دالي الإداري",
  webDir: "www",
  appendUserAgent: " DaliMobile/1",
  backgroundColor: "#071a2b",
  loggingBehavior: "none",
  server: {
    url: "https://www.dally.info/portal",
    errorPath: "offline.html",
    cleartext: false,
    allowNavigation: ["www.dally.info", "dally.info"],
  },
  android: {
    appendUserAgent: " DaliMobile/1 Android",
    backgroundColor: "#071a2b",
    allowMixedContent: false,
    captureInput: true,
    minWebViewVersion: 111,
    resolveServiceWorkerRequests: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    appendUserAgent: " DaliMobile/1 iOS",
    backgroundColor: "#071a2b",
    contentInset: "automatic",
    limitsNavigationsToAppBoundDomains: true,
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1400,
      launchAutoHide: true,
      backgroundColor: "#071a2b",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#071a2b",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
