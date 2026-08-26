import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const root = path.resolve(process.env.UPLOADS_DIR || ".data/uploads");
const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
const allowedKey = /^[a-zA-Z0-9/_().@+-]{1,500}$/;
const types = new Map([
  [".pdf", "application/pdf"], [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".webp", "image/webp"], [".svg", "image/svg+xml"], [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"], [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

async function files(directory) {
  const rows = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === "ENOENT") return rows;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await files(target));
    else if (entry.isFile()) rows.push(target);
  }
  return rows;
}

let imported = 0;
let preserved = 0;
let invalid = 0;
try {
  for (const file of await files(root)) {
    const key = path.relative(root, file).split(path.sep).join("/");
    if (!allowedKey.test(key) || key.includes("..")) { invalid++; continue; }
    const bytes = await readFile(file);
    const etag = createHash("sha256").update(bytes).digest("hex");
    const contentType = types.get(path.extname(file).toLowerCase()) || "application/octet-stream";
    const inserted = await sql.unsafe(
      "INSERT INTO private.object_storage (storage_key, object_data, content_type, etag, updated_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT (storage_key) DO NOTHING RETURNING storage_key",
      [key, bytes, contentType, etag],
    );
    if (inserted.length) imported++;
    else preserved++;
  }
  console.log(JSON.stringify({ status: "ok", root, imported, preservedExisting: preserved, invalidSkipped: invalid }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
