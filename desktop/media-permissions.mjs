const portalOrigin = "https://www.dally.info";
const meetingOrigin = "https://meet.jit.si";

export function allowsDaliMedia(permission, requestingUrl, topLevelUrl) {
  if (permission !== "media") return false;
  try {
    if (new URL(topLevelUrl).origin !== portalOrigin) return false;
    return [portalOrigin, meetingOrigin].includes(new URL(requestingUrl).origin);
  } catch {
    return false;
  }
}

export function installDaliMediaPermissions(session) {
  session.setPermissionCheckHandler((contents, permission, origin) =>
    allowsDaliMedia(permission, origin, contents?.getURL() || ""),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowsDaliMedia(permission, details.requestingUrl || contents?.getURL() || "", contents?.getURL() || "")),
  );
}
