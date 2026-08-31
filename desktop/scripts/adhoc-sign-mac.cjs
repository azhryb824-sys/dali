/* eslint-disable @typescript-eslint/no-require-imports */
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
    "--options",
    "runtime",
  ];
  if (entitlements) args.push("--entitlements", entitlements);
  args.push(target);
  execFileSync("/usr/bin/codesign", args, { stdio: "inherit" });
}

function alignBundleNameWithHelpers(appPath) {
  const frameworksPath = join(appPath, "Contents", "Frameworks");
  const primaryHelper = readdirSync(frameworksPath).find((name) => name.endsWith(" Helper.app"));
  if (!primaryHelper) throw new Error(`No primary Electron helper found in ${frameworksPath}`);

  const helperBaseName = primaryHelper.slice(0, -" Helper.app".length);
  const infoPlist = join(appPath, "Contents", "Info.plist");
  execFileSync("/usr/bin/plutil", ["-replace", "CFBundleName", "-string", helperBaseName, infoPlist], {
    stdio: "inherit",
  });
}

exports.default = async function adhocSignMac(context) {
  if (process.platform !== "darwin") return;

  const appName = readdirSync(context.appOutDir).find((name) => name.endsWith(".app"));
  if (!appName) throw new Error(`No macOS application bundle found in ${context.appOutDir}`);

  const appPath = join(context.appOutDir, appName);
  // electron-builder v26 normalizes Unicode file names to NFD but leaves
  // CFBundleName composed. Electron derives helper names from CFBundleName,
  // so Arabic product names otherwise fail before application JavaScript runs.
  alignBundleNameWithHelpers(appPath);
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
