#!/usr/bin/env bash
set -euo pipefail

mobile_root="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$mobile_root/.." && pwd)"
source_icon="$repo_root/desktop/assets/dali-icon.png"
source_logo="$repo_root/public/dally-logo.jpg"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

convert "$source_icon" -crop 400x315+312+270 +repage -resize 650x512 -background '#031e2b' -gravity center -extent 1024x1024 "$temporary_dir/icon.png"
convert -size 2732x2732 xc:'#031e2b' \( "$source_logo" -resize 1450x745 \) -gravity center -composite "$temporary_dir/splash.png"

while read -r density size; do
  target="$mobile_root/android/app/src/main/res/mipmap-$density"
  convert "$temporary_dir/icon.png" -resize "${size}x${size}" "$target/ic_launcher.png"
  convert "$temporary_dir/icon.png" -resize "${size}x${size}" "$target/ic_launcher_round.png"
  convert "$temporary_dir/icon.png" -resize "${size}x${size}" "$target/ic_launcher_foreground.png"
done <<'SIZES'
mdpi 48
hdpi 72
xhdpi 96
xxhdpi 144
xxxhdpi 192
SIZES

for target in "$mobile_root"/android/app/src/main/res/drawable*/splash.png; do
  case "$target" in
    *-mdpi/*) size=480x800 ;;
    *-hdpi/*) size=720x1280 ;;
    *-xhdpi/*) size=960x1600 ;;
    *-xxhdpi/*) size=1440x2560 ;;
    *-xxxhdpi/*) size=2160x3840 ;;
    *) size=1024x1024 ;;
  esac
  convert "$temporary_dir/splash.png" -resize "$size^" -gravity center -extent "$size" "$target"
done

convert "$temporary_dir/icon.png" -resize 1024x1024 "$mobile_root/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
for target in "$mobile_root"/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png; do
  convert "$temporary_dir/splash.png" -resize 2732x2732 "$target"
done

echo '{"status":"ok","brand":"Dally Corporation","android":true,"ios":true}'
