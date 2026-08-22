import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const file = (await context.params).file;
  if (!/^[a-f0-9-]{36}\.(png|jpg)$/.test(file)) return Response.json({ error: "الصورة غير صحيحة" }, { status: 400 });
  const object = await getRuntimeEnv().BUCKET.get(`website-assets/${file}`);
  if (!object?.body) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": file.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
