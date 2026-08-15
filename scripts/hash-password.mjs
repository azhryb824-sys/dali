import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  process.stderr.write("Usage: npm run auth:hash -- 'a-password-with-at-least-12-characters'\n");
  process.exit(1);
}
const iterations = 310_000;
const salt = randomBytes(24);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
process.stdout.write(`pbkdf2$${iterations}$${salt.toString("base64url")}$${hash.toString("base64url")}\n`);
