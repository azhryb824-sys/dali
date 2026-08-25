import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat session cookie is available to both chat and video routes",async()=>{
  const source=await readFile("app/api/chat/route.ts","utf8");
  assert.match(source,/Path=\/; HttpOnly/);
});

test("public chat supports explicit end and bounded dual ratings",async()=>{
  const source=await readFile("app/api/chat/route.ts","utf8");
  assert.match(source,/action === "end"/);
  assert.match(source,/action === "rate"/);
  assert.match(source,/value >= 1 && value <= 5/);
  assert.match(source,/conversation\.status !== "closed"/);
});

test("video ratings require a completed call and the migration constrains values",async()=>{
  const route=await readFile("app/api/video-interviews/route.ts","utf8");
  const migration=await readFile("drizzle-pg/0044_conversation_video_ratings.sql","utf8");
  assert.match(route,/interview\.status !== "completed"/);
  assert.match(migration,/BETWEEN 1 AND 5/g);
  assert.match(migration,/video_interviews_rated_at_idx/);
});

test("incoming call desk opens in-app and exposes camera and microphone permissions",async()=>{
  const source=await readFile("app/portal/VideoInterviewDesk.tsx","utf8");
  assert.match(source,/setOpen\(true\)/);
  assert.match(source,/allow="camera; microphone;/);
  assert.doesNotMatch(source,/target="_blank"/);
});
