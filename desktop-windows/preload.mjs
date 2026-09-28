import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("daliDesktop",{version:"2.0.0",isOnline:()=>navigator.onLine,syncNow:()=>location.reload(),policy:{externalLinks:"system",whatsapp:"native-protocol",portalOrigin:"https://www.dally.info",offline:"snapshot-only"}});
