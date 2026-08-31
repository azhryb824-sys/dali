const { execFileSync } = require("node:child_process");
const { lstatSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

function walk(root, files, bundles) {
  for (const name of readdirSync(root)) {
    const fullPath = join(root, name);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      walk(fullPath, files, bundles);
      if (/\.(app|appex|framework|xpc)$/.test(name)) bundles.push(fullPath);
    } else if (stat.isFile()) {
      const kind = execFileSync("/usr/bin/file", ["-b", fullPath], { encoding: "utf8" });
      if (kind.includes("Mach-O")) files.push(fullPath);
    }
  }
}

function sign(target, entitlements) {
  const args = [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
  ];
  if (entitlements) args.push("--entitlements", entitlements);
  args.push(target);
  execFileSync("/usr/bin/codesign", args, { stdio: "inherit" });
}

exports.default = async function adhocSignMac(context) {
  if (process.platform !== "darwin") return;

  const appName = readdirSync(context.appOutDir).find((name) => name.endsWith(".app"));
  if (!appName) throw new Error(`No macOS application bundle found in ${context.appOutDir}`);

  const appPath = join(context.appOutDir, appName);
  const mainEntitlements = join(__dirname, "..", "build", "entitlements.mac.plist");
  const inheritEntitlements = join(__dirname, "..", "build", "entitlements.mac.inherit.plist");
  const files = [];
  const bundles = [];
  walk(appPath, files, bundles);

  files.sort((a, b) => b.length - a.length).forEach((file) => sign(file));
  bundles
    .filter((bundle) => bundle !== appPath)
    .sort((a, b) => b.length - a.length)
    .forEach((bundle) =>
      sign(
        bundle,
        bundle.endsWith(".app") || bundle.endsWith(".xpc")
          ? inheritEntitlements
          : null,
      ),
    );
  sign(appPath, mainEntitlements);
};
