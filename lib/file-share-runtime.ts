export type DaliShareFileDescriptor = {
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type DaliPreparedShareFiles = {
  files: File[];
  totalBytes: number;
};

type DaliCapacitorBridge = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: {
    Filesystem?: {
      downloadFile?: (
        options: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
    };
    Share?: {
      share?: (
        options: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
    };
  };
  nativePromise?: (
    pluginName: string,
    methodName: string,
    options: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

type DaliMobileWindow = Window & {
  Capacitor?: DaliCapacitorBridge;
};

type DaliDesktopFileShareBridge = {
  share: (
    files: DaliShareFileDescriptor[],
    options: { title: string; text: string },
  ) => Promise<{
    opened: boolean;
    method?: "macos-share-menu" | "windows-share-ui";
    reason?: string;
  }>;
};

type DaliDesktopWindow = Window & {
  daliDesktop?: {
    fileShare?: DaliDesktopFileShareBridge;
  };
};

const allowedDownloadPath =
  /^\/api\/(?:shared-documents\/[a-f0-9]{64}|legal-shares\/[a-f0-9]{64}|legal-share-bundles\/[a-f0-9]{64}\/items\/[1-9]\d*)$/i;
const maxBrowserShareBytes = 200 * 1024 * 1024;

function safeFileName(value: string, index: number) {
  return (
    value
      .replace(/[\u0000-\u001f\u007f/\\]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || `dali-file-${index + 1}`
  );
}

function trustedDescriptor(
  descriptor: DaliShareFileDescriptor,
  index: number,
) {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(descriptor.url, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !allowedDownloadPath.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return null;
    return {
      url: url.toString(),
      fileName: safeFileName(descriptor.fileName, index),
      contentType:
        String(descriptor.contentType || "application/octet-stream")
          .trim()
          .slice(0, 180) || "application/octet-stream",
      sizeBytes: Math.max(0, Math.round(Number(descriptor.sizeBytes) || 0)),
    };
  } catch {
    return null;
  }
}

function trustedDescriptors(descriptors: DaliShareFileDescriptor[]) {
  if (!Array.isArray(descriptors) || !descriptors.length || descriptors.length > 200)
    throw new Error("قائمة الملفات غير صالحة للمشاركة");
  const trusted = descriptors.map(trustedDescriptor);
  if (trusted.some((item) => !item))
    throw new Error("تعذر التحقق من روابط الملفات الآمنة");
  return trusted as Array<NonNullable<ReturnType<typeof trustedDescriptor>>>;
}

function capacitorBridge() {
  if (typeof window === "undefined") return null;
  const bridge = (window as DaliMobileWindow).Capacitor;
  if (
    !bridge ||
    bridge.isNativePlatform?.() !== true
  )
    return null;
  return bridge;
}

function capacitorPluginMethod(
  bridge: DaliCapacitorBridge,
  pluginName: "Filesystem" | "Share",
  methodName: "downloadFile" | "share",
) {
  const publicPlugin = bridge.Plugins?.[pluginName] as
    | Record<string, unknown>
    | undefined;
  const publicMethod = publicPlugin?.[methodName];
  if (typeof publicMethod === "function") {
    return (options: Record<string, unknown>) =>
      (publicMethod as (
        value: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>).call(publicPlugin, options);
  }
  if (typeof bridge.nativePromise === "function") {
    return (options: Record<string, unknown>) =>
      bridge.nativePromise!(pluginName, methodName, options);
  }
  return null;
}

function desktopFileShareBridge() {
  if (typeof window === "undefined") return null;
  return (window as DaliDesktopWindow).daliDesktop?.fileShare || null;
}

export function supportsDaliNativeFileShare() {
  const bridge = capacitorBridge();
  return Boolean(
    bridge &&
      bridge.isPluginAvailable?.("Filesystem") !== false &&
      bridge.isPluginAvailable?.("Share") !== false &&
      capacitorPluginMethod(bridge, "Filesystem", "downloadFile") &&
      capacitorPluginMethod(bridge, "Share", "share"),
  );
}

export function supportsDaliDesktopFileShare() {
  return Boolean(desktopFileShareBridge());
}

export function requiresDaliDesktopFileShareUpdate() {
  if (typeof window === "undefined") return false;
  const desktopWindow = window as DaliDesktopWindow;
  return Boolean(desktopWindow.daliDesktop) && !desktopWindow.daliDesktop?.fileShare;
}

export function daliDesktopFileShareError(reason?: string) {
  if (reason === "windows-share-ui-timeout")
    return "لم تستجب نافذة مشاركة Windows. أغلق تطبيق دالي بالكامل ثم افتحه وحاول مرة أخرى.";
  if (reason === "windows-share-helper-missing")
    return "مكوّن مشاركة الملفات غير موجود. أغلق تطبيق دالي وافتحه لإكمال التحديث.";
  if (reason?.startsWith("windows-share-hresult-"))
    return "تعذر على Windows فتح نافذة مشاركة الملفات. أعد تشغيل تطبيق دالي ثم حاول مرة أخرى.";
  return "تعذر فتح نافذة مشاركة الملفات في Windows.";
}

export function supportsDaliWebFileShare() {
  if (typeof navigator === "undefined" || typeof File === "undefined")
    return false;
  const shareNavigator = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  return (
    typeof shareNavigator.share === "function" &&
    typeof shareNavigator.canShare === "function"
  );
}

export async function prepareDaliShareFiles(
  descriptors: DaliShareFileDescriptor[],
): Promise<DaliPreparedShareFiles> {
  const trusted = trustedDescriptors(descriptors);
  const declaredBytes = trusted.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (declaredBytes > maxBrowserShareBytes)
    throw new Error(
      "حجم الملفات كبير للمشاركة المباشرة من المتصفح؛ استخدم تنزيل الملفات ثم افتح واتساب.",
    );

  const files: File[] = [];
  let totalBytes = 0;
  for (const [index, descriptor] of trusted.entries()) {
    const response = await fetch(descriptor.url, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`تعذر تحميل الملف «${descriptor.fileName}» للمشاركة`);
    const blob = await response.blob();
    totalBytes += blob.size;
    if (totalBytes > maxBrowserShareBytes)
      throw new Error(
        "حجم الملفات كبير للمشاركة المباشرة من المتصفح؛ استخدم تنزيل الملفات ثم افتح واتساب.",
      );
    files.push(
      new File([blob], safeFileName(descriptor.fileName, index), {
        type: blob.type || descriptor.contentType,
        lastModified: Date.now(),
      }),
    );
  }
  return { files, totalBytes };
}

export function sharePreparedDaliFiles(
  prepared: DaliPreparedShareFiles,
  options: { title: string; text: string },
) {
  if (!supportsDaliWebFileShare())
    return Promise.resolve<"unsupported">("unsupported");
  const shareNavigator = navigator as Navigator & {
    canShare: (data?: ShareData) => boolean;
    share: (data?: ShareData) => Promise<void>;
  };
  const payload: ShareData = {
    title: options.title,
    text: options.text,
    files: prepared.files,
  };
  if (!shareNavigator.canShare(payload))
    return Promise.resolve<"unsupported">("unsupported");

  // navigator.share must be invoked in the same user gesture that called this
  // function. Do not add an await before this call.
  return shareNavigator.share(payload).then(
    () => "shared" as const,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError")
        return "cancelled" as const;
      throw error;
    },
  );
}

export async function shareDaliFilesNatively(
  descriptors: DaliShareFileDescriptor[],
  options: { title: string; text: string },
) {
  const bridge = capacitorBridge();
  if (!bridge) return false;
  const downloadFile = capacitorPluginMethod(
    bridge,
    "Filesystem",
    "downloadFile",
  );
  const share = capacitorPluginMethod(bridge, "Share", "share");
  if (!downloadFile || !share) return false;
  const trusted = trustedDescriptors(descriptors);
  const session = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileUrls: string[] = [];

  for (const [index, descriptor] of trusted.entries()) {
    const path = `dali-share/${session}/${index + 1}-${safeFileName(descriptor.fileName, index)}`;
    const result = await downloadFile({
      url: descriptor.url,
      path,
      directory: "CACHE",
      recursive: true,
    });
    const downloadedPath = String(result.path || "");
    if (!downloadedPath)
      throw new Error(`تعذر تجهيز الملف «${descriptor.fileName}» للمشاركة`);
    fileUrls.push(
      downloadedPath.startsWith("file://")
        ? downloadedPath
        : `file://${downloadedPath}`,
    );
  }

  const targetShare = bridge.isPluginAvailable?.("DaliWhatsApp") === true && bridge.nativePromise
    ? (payload: Record<string, unknown>) => bridge.nativePromise!("DaliWhatsApp", "share", payload)
    : share;
  await targetShare({
    title: options.title,
    text: options.text,
    files: fileUrls,
    dialogTitle: "اختر واتساب لمشاركة ملفات دالي",
  });
  return true;
}

export async function shareDaliFilesOnDesktop(
  descriptors: DaliShareFileDescriptor[],
  options: { title: string; text: string },
) {
  const bridge = desktopFileShareBridge();
  if (!bridge) return { opened: false, reason: "desktop-bridge-unavailable" };
  const trusted = trustedDescriptors(descriptors);
  return bridge.share(
    trusted.map((descriptor) => ({
      url: descriptor.url,
      fileName: descriptor.fileName,
      contentType: descriptor.contentType,
      sizeBytes: descriptor.sizeBytes,
    })),
    options,
  );
}

export function downloadDaliShareFiles(
  descriptors: DaliShareFileDescriptor[],
) {
  const trusted = trustedDescriptors(descriptors);
  for (const descriptor of trusted) {
    const anchor = document.createElement("a");
    anchor.href = descriptor.url;
    anchor.download = descriptor.fileName;
    anchor.rel = "noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  return trusted.length;
}
