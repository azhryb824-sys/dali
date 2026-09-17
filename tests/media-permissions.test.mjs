import assert from "node:assert/strict";
import test from "node:test";
import { allowsDaliMedia, installDaliMediaPermissions } from "../desktop/media-permissions.mjs";
import { allowsDaliMedia as macAllows } from "../desktop-universal/media-permissions.mjs";

test("camera and microphone are limited to Dali and the meeting iframe inside Dali", () => {
  for (const allows of [allowsDaliMedia, macAllows]) {
    assert.equal(allows("media", "https://meet.jit.si/dally-room", "https://www.dally.info/portal"), true);
    assert.equal(allows("media", "https://www.dally.info/portal", "https://www.dally.info/portal"), true);
    for (const [permission, origin, top] of [
      ["media", "https://untrusted.test", "https://www.dally.info/portal"],
      ["media", "https://meet.jit.si", "https://untrusted.test"],
      ["media", "https://meet.jit.si.evil.test", "https://www.dally.info/portal"],
      ["media", "http://meet.jit.si", "https://www.dally.info/portal"],
      ["geolocation", "https://www.dally.info", "https://www.dally.info/portal"],
      ["media", "", ""],
    ]) assert.equal(allows(permission, origin, top), false);
  }
});

test("Electron permission check and request use the same media rules", () => {
  let check, request;
  installDaliMediaPermissions({ setPermissionCheckHandler: value => { check = value; }, setPermissionRequestHandler: value => { request = value; } });
  const contents = { getURL: () => "https://www.dally.info/portal" };
  assert.equal(check(contents, "media", "https://meet.jit.si"), true);
  let result;
  request(contents, "media", value => { result = value; }, { requestingUrl: "https://meet.jit.si/dally-room" });
  assert.equal(result, true);
  request(contents, "media", value => { result = value; }, { requestingUrl: "https://untrusted.test" });
  assert.equal(result, false);
});
