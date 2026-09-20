import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const bytes = Buffer.from("%PDF-1.7\nVerified files\n%%EOF");
const descriptor = (fileName, changes = {}) => ({ url: `https://www.dally.info/api/shared-documents/${"a".repeat(64)}`, fileName, sizeBytes: bytes.length, ...changes });
const options = { title: "الملفات", text: "المرفقات" };
for (const packageName of ["desktop", "desktop-universal"]) {
  const { prepareDesktopFileShare } = await import(`../${packageName}/native-file-share.mjs`);
  test(`${packageName}: filenames cannot collide with attachments, manifests, or Windows devices`, async () => {
    const root = await mkdtemp(join(tmpdir(), "dali-download-test-"));
    try {
      const result = await prepareDesktopFileShare({ getPath: () => root }, ["quote.pdf", "quote-3.pdf", "quote.pdf", "CON.pdf", "share.dali", "share-status.dali"].map(name => descriptor(name)), options, async (_url, init) => {
        assert.equal(init.redirect, "error"); assert.ok(init.signal); return new Response(bytes);
      });
      assert.equal(new Set(result.filePaths.map(path => basename(path).toLowerCase())).size, 6);
      assert.ok(result.filePaths.some(path => basename(path) === "quote-4.pdf"));
      assert.ok(result.filePaths.some(path => basename(path) === "dali-CON.pdf"));
      for (const path of result.filePaths) assert.deepEqual(await readFile(path), bytes);
    } finally { await rm(root, { force: true, recursive: true }); }
  });
  test(`${packageName}: network, expired, truncated, empty and excessive files fail before native handoff and clean up`, async () => {
    const root = await mkdtemp(join(tmpdir(), "dali-download-test-"));
    try {
      const failures = [
        [async () => { throw new TypeError("fetch failed with private URL"); }, /share-download-network/],
        [async () => { throw new DOMException("timeout", "TimeoutError"); }, /share-download-timeout/],
        [async () => new Response("Expired", { status: 410 }), /share-download-410/],
        [async () => new Response("truncated"), /share-file-size-mismatch/],
        [async () => new Response(""), /share-file-empty/],
        [async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024)); } })), /share-files-too-large/],
      ];
      for (const [fetchFile, reason] of failures) {
        await assert.rejects(prepareDesktopFileShare({ getPath: () => root }, [descriptor("quote.pdf")], options, fetchFile), reason);
        assert.deepEqual(await readdir(root), []);
      }
      let requests = 0;
      await assert.rejects(prepareDesktopFileShare({ getPath: () => root }, [descriptor("file.pdf", { url: "https://other.example/file.pdf" })], options, async () => { requests++; }), /untrusted/);
      assert.equal(requests, 0);
    } finally { await rm(root, { force: true, recursive: true }); }
  });
}
