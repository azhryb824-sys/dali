import { app, BrowserWindow, dialog, safeStorage, session, shell } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const PORTAL_ORIGIN = "https://www.dally.info";
const FALLBACK = `${PORTAL_ORIGIN}/login?returnTo=%2Fportal`;
const MARKER = "dali-desktop-v2";
const APP_DATA = "DaliAdminWindows";
const MAX_RECOVERY = 3;
let win, key, storePath, deviceId, recoveries = 0;

function trusted(value) {
  try { const u = new URL(value, PORTAL_ORIGIN); return u.origin === PORTAL_ORIGIN ? u.toString() : null; }
  catch { return null; }
}
function safeHttps(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function whatsapp(value) {
  try {
    const u = new URL(value);
    const phone = u.hostname === "wa.me" ? u.pathname.split("/").filter(Boolean)[0] : u.searchParams.get("phone") || "";
    if (!/^9665\d{8}$/.test(phone.replace(/\D/g,""))) return null;
    const p = phone.replace(/\D/g,""), text = u.searchParams.get("text") || "";
    return { app: `whatsapp://send?phone=${p}&text=${encodeURIComponent(text)}`, web: `https://web.whatsapp.com/send?phone=${p}&text=${encodeURIComponent(text)}` };
  } catch { return null; }
}
async function external(value) {
  const w = whatsapp(value);
  if (w) { try { await shell.openExternal(w.app); return; } catch { await shell.openExternal(w.web); return; } }
  if (safeHttps(value)) await shell.openExternal(value);
}
function encrypt(value) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(value),"utf8"),c.final()]);
  return { iv:iv.toString("base64"), tag:c.getAuthTag().toString("base64"), data:data.toString("base64") };
}
function decrypt(v) {
  const d=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(v.iv,"base64"));
  d.setAuthTag(Buffer.from(v.tag,"base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(v.data,"base64")),d.final()]).toString("utf8"));
}
async function initKey() {
  await mkdir(app.getPath("userData"),{recursive:true});
  const p=join(app.getPath("userData"),"desktop.key");
  if (existsSync(p)) {
    try {
      const raw=Buffer.from(await readFile(p,"utf8"),"base64");
      const s=safeStorage.isEncryptionAvailable()?safeStorage.decryptString(raw):raw.toString("utf8");
      const k=Buffer.from(s,"base64"); if(k.length===32){key=k;return;}
    } catch {}
  }
  key=crypto.randomBytes(32); const s=key.toString("base64");
  const raw=safeStorage.isEncryptionAvailable()?safeStorage.encryptString(s):Buffer.from(s);
  await writeFile(p,raw.toString("base64"),{mode:0o600});
}
async function loadStore() {
  try { return decrypt(JSON.parse(await readFile(storePath,"utf8"))); }
  catch { return {deviceId:crypto.randomUUID(),cache:{},queue:[],conflicts:[],cursor:0}; }
}
async function saveStore(v) { await writeFile(storePath,JSON.stringify(encrypt(v)),{mode:0o600}); }
function wireNavigation(contents) {
  contents.setWindowOpenHandler(({url}) => { if(trusted(url)){void contents.loadURL(trusted(url));} else void external(url); return {action:"deny"}; });
  const stop=(e,url)=>{ if(trusted(url)) return; e.preventDefault(); void external(url); };
  contents.on("will-navigate",stop); contents.on("will-redirect",stop);
}
async function entry() {
  // Enter through the real administrative login flow; authentication remains server-side.
  return FALLBACK;
}
async function loadPortal() {
  if(!win||win.isDestroyed())return;
  try {
    await win.loadURL(await entry());
    await win.webContents.savePage(join(app.getPath("userData"),"portal-snapshot.mhtml"),"MHTML").catch(()=>{});
  } catch {
    const snap=join(app.getPath("userData"),"portal-snapshot.mhtml");
    if(existsSync(snap)) await win.loadFile(snap).catch(()=>win.loadFile(join(import.meta.dirname,"offline.html")));
    else await win.loadFile(join(import.meta.dirname,"offline.html"));
  }
}
function createWindow() {
  win=new BrowserWindow({width:1440,height:920,minWidth:1024,minHeight:700,show:false,title:"نظام دالي الإداري",icon:join(import.meta.dirname,"assets","dali-icon.png"),
    webPreferences:{preload:join(import.meta.dirname,"preload.mjs"),contextIsolation:true,nodeIntegration:false,sandbox:false,spellcheck:true}});
  const timer=setTimeout(()=>win&&!win.isDestroyed()&&win.show(),10000);
  win.once("ready-to-show",()=>{clearTimeout(timer);win.show();});
  win.webContents.on("did-finish-load",()=>recoveries=0);
  win.webContents.on("render-process-gone",(_e,d)=>{ if(["crashed","oom","abnormal-exit","killed"].includes(d.reason)&&recoveries<MAX_RECOVERY){recoveries++;setTimeout(()=>void loadPortal(),500*recoveries);return;} void dialog.showMessageBox(win,{type:"error",title:"تعذر تشغيل الواجهة",message:"أغلق التطبيق وافتحه مجددًا.",detail:d.reason}); });
  wireNavigation(win.webContents); void loadPortal();
}
app.setPath("userData",join(app.getPath("appData"),APP_DATA));
app.setAppUserModelId("sa.dally.desktop.windows");
app.whenReady().then(async()=>{
  storePath=join(app.getPath("userData"),"offline-store.enc"); await initKey();
  const s=await loadStore(); deviceId=s.deviceId; await saveStore(s);
  session.defaultSession.webRequest.onBeforeSendHeaders({urls:[`${PORTAL_ORIGIN}/*`]},(d,cb)=>{d.requestHeaders["x-dali-desktop-app"]=MARKER;d.requestHeaders["x-dali-desktop-device"]=deviceId;cb({requestHeaders:d.requestHeaders});});
  session.defaultSession.setPermissionRequestHandler((_c,p,cb)=>cb(p==="media"));
  createWindow();
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
