#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  printf 'run deploy/install.sh as root\n' >&2
  exit 1
fi

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_DIR=/opt/project-board
DATA_DIR=/var/lib/project-board
DATABASE_PATH="$DATA_DIR/project-board.db"
BACKUP_DIR=/var/backups/project-board
SERVICE_USER=project-board
UNIT_DIR=$(mktemp -d)
trap 'rm -rf "$UNIT_DIR"' EXIT

command -v node >/dev/null
command -v npm >/dev/null
command -v systemctl >/dev/null

NODE_BIN=$(command -v node)
NODE_RUNTIME="$APP_DIR/bin/node"

cd "$ROOT_DIR"
npm ci
npm run build

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

if [[ -e "$DATABASE_PATH" ]]; then
  DATABASE_PATH="$DATABASE_PATH" BACKUP_DIR="$BACKUP_DIR" "$NODE_BIN" "$ROOT_DIR/deploy/backup.mjs"
fi

if systemctl is-active --quiet project-board.service; then
  systemctl stop project-board.service
fi

install -d -o root -g root -m 0755 "$APP_DIR"
find "$APP_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a dist server package.json package-lock.json deploy "$APP_DIR"/
install -D -o root -g root -m 0755 "$NODE_BIN" "$NODE_RUNTIME"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$DATA_DIR" "$BACKUP_DIR"
chown -R root:root "$APP_DIR"

for unit in project-board.service project-board-backup.service project-board-backup.timer; do
  sed -e "s|@NODE_BIN@|$NODE_RUNTIME|g" \
    "$ROOT_DIR/deploy/$unit" > "$UNIT_DIR/$unit"
done
install -o root -g root -m 0644 "$UNIT_DIR/project-board.service" /etc/systemd/system/project-board.service
install -o root -g root -m 0644 "$UNIT_DIR/project-board-backup.service" /etc/systemd/system/project-board-backup.service
install -o root -g root -m 0644 "$UNIT_DIR/project-board-backup.timer" /etc/systemd/system/project-board-backup.timer
systemctl daemon-reload
systemctl enable project-board.service project-board-backup.timer
systemctl restart project-board.service
systemctl start project-board-backup.timer

printf 'Project Board installed at %s\n' "$APP_DIR"
