#!/usr/bin/env bash
# Restore ~/config-backup/latest (or the snapshot path given as $1) onto this Mac.
# Existing files with the same names are overwritten. Run after a fresh setup.
set -eu

SOURCE="${1:-$HOME/config-backup/latest}"
RECTANGLE_DOMAIN="com.knollsoft.Rectangle"

if [ ! -d "$SOURCE/config" ]; then
  echo "No backup found at $SOURCE" >&2
  exit 1
fi

echo "Restore from: $SOURCE"
echo "Last backup:  $(cat "$SOURCE/last-backup.txt" 2>/dev/null || echo unknown)"
echo "This overwrites matching files in ~/.config and Rectangle settings."
printf 'Continue? [y/N] '
read -r answer
case "$answer" in
  y|Y|yes|YES) ;;
  *) echo "Cancelled"; exit 0 ;;
esac

mkdir -p "$HOME/.config"
rsync -a "$SOURCE/config/" "$HOME/.config/"

if [ -f "$SOURCE/macos/Rectangle.plist" ]; then
  defaults import "$RECTANGLE_DOMAIN" "$SOURCE/macos/Rectangle.plist"
  killall Rectangle 2>/dev/null || true
  open -a Rectangle 2>/dev/null || true
fi

echo "Restored. Restart Ghostty and Raycast to pick up changes."
