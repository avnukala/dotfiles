#!/usr/bin/env bash
# Mirror ~/.config and Rectangle settings into ~/config-backup/latest.
# Secrets and regenerated caches are excluded. Files removed from ~/.config stay in the backup.
set -eu

BACKUP_ROOT="$HOME/config-backup/latest"
RECTANGLE_DOMAIN="com.knollsoft.Rectangle"

mkdir -p "$BACKUP_ROOT/config" "$BACKUP_ROOT/macos"

rsync -a \
  --exclude 'node-compile-cache' \
  --exclude '.git' \
  --exclude 'logs' \
  --exclude 'gcloud' \
  --exclude 'hosts.yml' \
  --exclude 'credentials.json' \
  --exclude '*.db' \
  --exclude '*.lock' \
  "$HOME/.config/" "$BACKUP_ROOT/config/"

defaults export "$RECTANGLE_DOMAIN" "$BACKUP_ROOT/macos/Rectangle.plist"

date '+%Y-%m-%d %H:%M:%S' > "$BACKUP_ROOT/last-backup.txt"
echo "Backed up to $BACKUP_ROOT"
