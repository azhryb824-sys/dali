#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
native_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$native_root/.." && pwd)"
version="$(tr -d '[:space:]' < "$native_root/VERSION")"
arch="${1:-arm64}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This build must run on macOS." >&2
  exit 2
fi
if [[ "$arch" != "arm64" ]]; then
  echo "Only the Apple Silicon arm64 build is supported." >&2
  exit 2
fi
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid application version: $version" >&2
  exit 2
fi

app_name="نظام دالي الإداري الخفيف"
executable_name="DaliAdminLight"
build_root="$native_root/build/$arch"
dist_dir="$native_root/dist"
app_path="$build_root/$app_name.app"
contents_path="$app_path/Contents"
macos_path="$contents_path/MacOS"
resources_path="$contents_path/Resources"
iconset_path="$build_root/AppIcon.iconset"
dmg_stage="$build_root/dmg-stage"
dmg_path="$dist_dir/Dali-Mac-Light-$version-$arch.dmg"
zip_path="$dist_dir/Dali-Mac-Light-$version-$arch.zip"
checksum_path="$dist_dir/Dali-Mac-Light-$version-$arch-SHA256.txt"

rm -rf "$build_root"
mkdir -p "$macos_path" "$resources_path" "$iconset_path" "$dist_dir"
rm -f "$dmg_path" "$zip_path" "$checksum_path"

sdk_path="$(xcrun --sdk macosx --show-sdk-path)"
xcrun swiftc \
  -O \
  -whole-module-optimization \
  -target "arm64-apple-macos13.0" \
  -sdk "$sdk_path" \
  -framework Cocoa \
  -framework WebKit \
  "$native_root/Sources/main.swift" \
  -o "$macos_path/$executable_name"

cp "$native_root/Resources/Info.plist" "$contents_path/Info.plist"
build_number="${GITHUB_RUN_NUMBER:-300}"
build_number="${build_number//[^0-9]/}"
build_number="${build_number:-300}"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$contents_path/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_number" "$contents_path/Info.plist"
printf 'APPL????' > "$contents_path/PkgInfo"

source_icon="$repo_root/desktop/assets/dali-icon.png"
for size in 16 32 128 256 512; do
  double_size=$((size * 2))
  sips -z "$size" "$size" "$source_icon" --out "$iconset_path/icon_${size}x${size}.png" >/dev/null
  sips -z "$double_size" "$double_size" "$source_icon" --out "$iconset_path/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset_path" -o "$resources_path/AppIcon.icns"

chmod 0755 "$macos_path/$executable_name"
codesign --force --deep --sign - "$app_path"
codesign --verify --deep --strict --verbose=2 "$app_path"

mkdir -p "$dmg_stage"
ditto "$app_path" "$dmg_stage/$app_name.app"
ln -s /Applications "$dmg_stage/Applications"
hdiutil create \
  -volname "Dali Admin Light" \
  -srcfolder "$dmg_stage" \
  -ov \
  -format UDZO \
  "$dmg_path" >/dev/null
ditto -c -k --sequesterRsrc --keepParent "$app_path" "$zip_path"

(
  cd "$dist_dir"
  shasum -a 256 "$(basename "$dmg_path")" "$(basename "$zip_path")" > "$(basename "$checksum_path")"
)

echo "APP_PATH=$app_path"
echo "DMG_PATH=$dmg_path"
echo "ZIP_PATH=$zip_path"
echo "CHECKSUM_PATH=$checksum_path"
