const { execFileSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function afterSign(context) {
  if (process.platform !== "darwin") return;

  const appName = readdirSync(context.appOutDir).find(name => name.endsWith(".app"));
  if (!appName) {
    throw new Error(`No macOS application bundle found in ${context.appOutDir}`);
  }

  const appPath = join(context.appOutDir, appName);
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath], {
    stdio: "inherit",
  });
};
