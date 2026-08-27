import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { desktopDevices, desktopSyncOperations, portalActivity } from "@/db/schema";
import { requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

const MAX_SYNC_BYTES=30*1024*1024;
const DEVICE_PATTERN=/^[a-f0-9-]{20,80}$/i;
const KEY_PATTERN=/^[a-f0-9]{64}$/i;
const ALLOWED_METHODS=new Set(["POST","PATCH","DELETE"]);
const ONLINE_ONLY_ACTIONS=new Set(["approve","post","mark-paid","pay-judgment","assign-case","initialize","add-bank","reset-password","activate"]);
const ONLINE_ONLY_PATHS=[/^\/api\/portal\/users/,/^\/api\/portal\/role-definitions/,/^\/api\/portal\/access-scopes/,/^\/api\/portal\/accounting/,/^\/api\/portal\/finance\/posting/,/\/contracts\/\d+\/status/,/\/signed-document/];

function clean(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):""}
function bodyAction(body:{type?:string;value?:unknown}|null){
  if(body?.type!=="text"||typeof body.value!=="string")return"";
  try{return clean((JSON.parse(body.value)as{action?:unknown}).action,40)}catch{return""}
}
function onlineOnly(method:string,path:string,body:{type?:string;value?:unknown}|null){
  if(method==="DELETE"||ONLINE_ONLY_PATHS.some(pattern=>pattern.test(path)))return true;
  return ONLINE_ONLY_ACTIONS.has(bodyAction(body));
}
function restoreBody(body:{type?:string;value?:unknown}|null){
  if(!body)return undefined;
  if(body.type==="text"&&typeof body.value==="string")return body.value;
  if(body.type==="urlencoded"&&typeof body.value==="string")return new URLSearchParams(body.value);
  if(body.type==="form"&&Array.isArray(body.value)){
    const form=new FormData();
    for(const raw of body.value){
      const item=raw as{name?:unknown;file?:unknown;fileName?:unknown;contentType?:unknown;value?:unknown};
      const name=clean(item.name,200);if(!name)continue;
      if(item.file===true&&typeof item.value==="string"){
        const bytes=Uint8Array.from(Buffer.from(item.value,"base64"));
        form.append(name,new File([bytes],clean(item.fileName,300)||"attachment", {type:clean(item.contentType,200)||"application/octet-stream"}));
      }else form.append(name,String(item.value??""));
    }
    return form;
  }
  return undefined;
}

export async function GET(request:Request){
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access)return jsonNoStore({error:"غير مصرح"},{status:403});
  const url=new URL(request.url),deviceId=clean(url.searchParams.get("deviceId"),80),cursor=Math.max(0,Number(url.searchParams.get("cursor")||0)||0);
  if(!DEVICE_PATTERN.test(deviceId))return jsonNoStore({error:"معرّف الجهاز غير صحيح"},{status:400});
  const db=getDb();const device=await db.query.desktopDevices.findFirst({where:and(eq(desktopDevices.id,deviceId),eq(desktopDevices.userEmail,access.user.email))});
  if(device?.status==="revoked")return jsonNoStore({error:"تم إلغاء اعتماد هذا الجهاز"},{status:403});
  const now=new Date().toISOString();
  const changes=await db.select({id:portalActivity.id,action:portalActivity.action,entityType:portalActivity.entityType,entityId:portalActivity.entityId,createdAt:portalActivity.createdAt}).from(portalActivity).where(gt(portalActivity.id,cursor)).orderBy(asc(portalActivity.id)).limit(500);
  const nextCursor=changes.length?changes[changes.length-1].id:cursor;
  await db.insert(desktopDevices).values({id:deviceId,userEmail:access.user.email,deviceName:clean(request.headers.get("x-dali-device-name"),160)||null,lastSeenAt:now,lastSyncAt:now,lastActivityId:nextCursor,updatedAt:now}).onConflictDoUpdate({target:desktopDevices.id,set:{userEmail:access.user.email,lastSeenAt:now,lastSyncAt:now,lastActivityId:nextCursor,updatedAt:now}});
  return jsonNoStore({status:"ok",serverTime:now,deviceId,cursor:nextCursor,changes,hasMore:changes.length===500,intervalSeconds:20,privilegedOperationsRequireOnline:true});
}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access)return jsonNoStore({error:"غير مصرح"},{status:403});
  const raw=await request.text();if(Buffer.byteLength(raw,"utf8")>MAX_SYNC_BYTES)return jsonNoStore({error:"عملية المزامنة أكبر من الحد المسموح"},{status:413});
  let payload:Record<string,unknown>;try{payload=JSON.parse(raw)as Record<string,unknown>}catch{return jsonNoStore({error:"بيانات المزامنة غير صحيحة"},{status:400})}
  const deviceId=clean(payload.deviceId,80),idempotencyKey=clean(payload.idempotencyKey,64).toLowerCase(),method=clean(payload.method,10).toUpperCase(),requestPath=clean(payload.requestPath,1000);
  const body=(payload.body&&typeof payload.body==="object"?payload.body:null)as{type?:string;value?:unknown}|null;
  if(!DEVICE_PATTERN.test(deviceId)||!KEY_PATTERN.test(idempotencyKey)||!ALLOWED_METHODS.has(method)||!requestPath.startsWith("/api/portal/")||requestPath.startsWith("/api/portal/desktop/"))return jsonNoStore({error:"عملية المزامنة غير مسموحة"},{status:400});
  if(onlineOnly(method,requestPath,body))return jsonNoStore({error:"هذا الإجراء حساس ولا يُقبل من طابور العمل دون اتصال"},{status:403});
  const db=getDb(),now=new Date().toISOString();
  const existing=await db.query.desktopSyncOperations.findFirst({where:eq(desktopSyncOperations.idempotencyKey,idempotencyKey)});
  if(existing){
    if(existing.userEmail!==access.user.email||existing.deviceId!==deviceId)return jsonNoStore({error:"مفتاح العملية مرتبط بجهاز آخر"},{status:409});
    if(existing.status==="completed"||existing.status==="conflict")return new Response(existing.responseBody||"{}",{status:existing.responseStatus||200,headers:{"content-type":"application/json","x-dali-idempotent-replay":"1"}});
    return jsonNoStore({status:"processing",operationId:existing.id},{status:202});
  }
  const device=await db.query.desktopDevices.findFirst({where:eq(desktopDevices.id,deviceId)});
  if(device?.status==="revoked")return jsonNoStore({error:"تم إلغاء اعتماد هذا الجهاز"},{status:403});
  await db.insert(desktopDevices).values({id:deviceId,userEmail:access.user.email,deviceName:clean(payload.deviceName,160)||null,lastSeenAt:now,lastSyncAt:now,updatedAt:now}).onConflictDoUpdate({target:desktopDevices.id,set:{userEmail:access.user.email,lastSeenAt:now,lastSyncAt:now,updatedAt:now}});
  const[operation]=await db.insert(desktopSyncOperations).values({idempotencyKey,deviceId,userEmail:access.user.email,method,requestPath,status:"processing"}).returning();
  try{
    const incomingHeaders=Array.isArray(payload.headers)?payload.headers:[];
    const headers=new Headers();
    for(const pair of incomingHeaders){if(Array.isArray(pair)&&pair.length===2){const name=clean(pair[0],100).toLowerCase();if(["content-type","accept"].includes(name))headers.set(name,String(pair[1]));}}
    headers.set("cookie",request.headers.get("cookie")||"");
    headers.set("origin",new URL(request.url).origin);
    headers.set("x-idempotency-key",idempotencyKey);
    headers.set("x-dali-desktop-device",deviceId);
    headers.set("x-dali-desktop-app","dali-desktop-v1");
    const target=new URL(requestPath,new URL(request.url).origin);
    const response=await fetch(target,{method,headers,body:restoreBody(body),redirect:"manual"});
    const responseBody=(await response.text()).slice(0,2_000_000),responseHeaders=JSON.stringify([...response.headers.entries()].filter(([name])=>["content-type","location"].includes(name.toLowerCase())));
    const status=response.status===409||response.status===412||response.status===422?"conflict":response.ok?"completed":"failed";
    await db.update(desktopSyncOperations).set({status,responseStatus:response.status,responseHeadersJson:responseHeaders,responseBody,errorMessage:response.ok?null:responseBody.slice(0,1000),completedAt:new Date().toISOString()}).where(eq(desktopSyncOperations.id,operation.id));
    return new Response(responseBody,{status:response.status,headers:{"content-type":response.headers.get("content-type")||"application/json","x-dali-sync-operation":String(operation.id)}});
  }catch(error){
    await db.update(desktopSyncOperations).set({status:"failed",errorMessage:error instanceof Error?error.message:"تعذر إرسال العملية",completedAt:new Date().toISOString()}).where(eq(desktopSyncOperations.id,operation.id));
    return jsonNoStore({error:"تعذر تنفيذ عملية المزامنة"},{status:502});
  }
}
