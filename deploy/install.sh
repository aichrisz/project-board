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
CONFIG_DIR=/etc/project-board
RESTIC_PASSWORD_FILE="$CONFIG_DIR/restic-password"
RCLONE_CONFIG="$DATA_DIR/rclone/rclone.conf"
OFFSITE_ENV="$CONFIG_DIR/project-board-offsite.env"
SYSTEMD_UNIT_DIR=${SYSTEMD_UNIT_DIR:-/etc/systemd/system}
APP_PARENT_DIR=$(dirname "$APP_DIR")
UNIT_DIR=$(mktemp -d)
UNIT_ROLLBACK_DIR=$(mktemp -d)
RELEASE_DIR=''
ROLLBACK_DIR=''
app_swapped=0
service_was_active=0
unit_rollback_captured=0
prior_enabled_units=()
units=(
  project-board.service
  project-board-backup.service
  project-board-backup.timer
  project-board-offsite-backup.service
  project-board-offsite-backup.timer
  project-board-restore-drill.service
  project-board-restore-drill.timer
)

cleanup() {
  local status=$?
  trap - EXIT

  if (( status != 0 )); then
    if (( app_swapped == 1 )); then
      systemctl stop project-board.service || true
      rm -rf -- "$APP_DIR" || true
      if [[ -n "$ROLLBACK_DIR" ]]; then
        if ! mv -- "$ROLLBACK_DIR" "$APP_DIR"; then
          printf 'install failed and the previous project-board release could not be restored\n' >&2
        else
          ROLLBACK_DIR=''
        fi
      fi
    elif [[ -n "$ROLLBACK_DIR" ]]; then
      rm -rf -- "$ROLLBACK_DIR" || true
    fi
    if (( unit_rollback_captured == 1 )); then
      install -d -o root -g root -m 0755 "$SYSTEMD_UNIT_DIR" || true
      for unit in "${units[@]}"; do
        rm -f -- "$SYSTEMD_UNIT_DIR/$unit" || true
        if [[ -e "$UNIT_ROLLBACK_DIR/$unit" || -L "$UNIT_ROLLBACK_DIR/$unit" ]]; then
          cp -a -- "$UNIT_ROLLBACK_DIR/$unit" "$SYSTEMD_UNIT_DIR/$unit" || true
        fi
      done
      systemctl daemon-reload || true
      systemctl disable "${units[@]}" || true
      if (( ${#prior_enabled_units[@]} > 0 )); then
        systemctl enable "${prior_enabled_units[@]}" || true
      fi
    fi
    if (( service_was_active == 1 )); then
      if ! systemctl start project-board.service; then
        printf 'install failed and the previous project-board service could not be restarted\n' >&2
      fi
    fi
  elif [[ -n "$ROLLBACK_DIR" ]]; then
    rm -rf -- "$ROLLBACK_DIR" || true
  fi

  if [[ -n "$RELEASE_DIR" ]]; then
    rm -rf -- "$RELEASE_DIR" || true
  fi
  rm -rf -- "$UNIT_DIR" || true
  rm -rf -- "$UNIT_ROLLBACK_DIR" || true
  exit "$status"
}
trap cleanup EXIT

command -v node >/dev/null
command -v npm >/dev/null
command -v systemctl >/dev/null
command -v restic >/dev/null
command -v rclone >/dev/null
command -v timeout >/dev/null

NODE_BIN=$(command -v node)
NODE_RUNTIME="$APP_DIR/bin/node"

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
SERVICE_UID=$(id -u "$SERVICE_USER")

[[ -f "$OFFSITE_ENV" && ! -L "$OFFSITE_ENV" ]] || {
  printf '%s is required for offsite backup and restore units\n' "$OFFSITE_ENV" >&2
  exit 1
}
[[ "$(stat -c '%a' "$OFFSITE_ENV")" == 600 ]] || {
  printf '%s must have mode 0600\n' "$OFFSITE_ENV" >&2
  exit 1
}
[[ "$(stat -c '%u' "$OFFSITE_ENV")" == 0 ]] || {
  printf '%s must be owned by root\n' "$OFFSITE_ENV" >&2
  exit 1
}

env_value() {
  local key=$1
  local value
  value=$(awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$OFFSITE_ENV")
  value=${value#\"}
  value=${value%\"}
  value=${value#\'}
  value=${value%\'}
  printf '%s' "$value"
}

PROJECT_BOARD_OWNER=$(env_value PROJECT_BOARD_OWNER)
[[ "$PROJECT_BOARD_OWNER" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  printf 'PROJECT_BOARD_OWNER in %s must be a valid email\n' "$OFFSITE_ENV" >&2
  exit 1
}
configured_repository=$(env_value RESTIC_REPOSITORY)
[[ -z "$configured_repository" || "$configured_repository" == 'rclone:onedrive:Project Board' ]] || {
  printf 'RESTIC_REPOSITORY in %s must be exactly rclone:onedrive:Project Board\n' "$OFFSITE_ENV" >&2
  exit 1
}
configured_config=$(env_value RCLONE_CONFIG)
[[ -z "$configured_config" || "$configured_config" == "$RCLONE_CONFIG" ]] || {
  printf 'RCLONE_CONFIG in %s must be %s\n' "$OFFSITE_ENV" "$RCLONE_CONFIG" >&2
  exit 1
}
configured_host=$(env_value RESTIC_HOST)
[[ -z "$configured_host" || "$configured_host" == project-board ]] || {
  printf 'RESTIC_HOST in %s must be exactly project-board\n' "$OFFSITE_ENV" >&2
  exit 1
}
configured_path=$(env_value RESTIC_PATH)
[[ -z "$configured_path" || "$configured_path" == /var/backups/project-board/offsite/project-board.db ]] || {
  printf 'RESTIC_PATH in %s must be the offsite snapshot path\n' "$OFFSITE_ENV" >&2
  exit 1
}

validate_secret_file() {
  local name=$1
  local path=$2
  [[ -f "$path" && ! -L "$path" ]] || {
    printf '%s must point to a regular file\n' "$name" >&2
    exit 1
  }
  [[ "$(stat -c '%a' "$path")" == 600 ]] || {
    printf '%s must have mode 0600\n' "$name" >&2
    exit 1
  }
  [[ "$(stat -c '%u' "$path")" == "$SERVICE_UID" ]] || {
    printf '%s must be owned by %s\n' "$name" "$SERVICE_USER" >&2
    exit 1
  }
}

validate_secret_file RESTIC_PASSWORD_FILE "$RESTIC_PASSWORD_FILE"
validate_secret_file RCLONE_CONFIG "$RCLONE_CONFIG"
RCLONE_REMOTES=$(RCLONE_CONFIG="$RCLONE_CONFIG" rclone listremotes) || {
  printf 'rclone could not read %s\n' "$RCLONE_CONFIG" >&2
  exit 1
}
grep -Fxq 'onedrive:' <<<"$RCLONE_REMOTES" || {
  printf 'rclone config must define the onedrive: remote\n' >&2
  exit 1
}

cd "$ROOT_DIR"
npm ci
npm run build

if [[ -L "$DATABASE_PATH" ]]; then
  printf 'refusing to install with symlink database: %s\n' "$DATABASE_PATH" >&2
  exit 1
fi
if [[ -e "$DATABASE_PATH" ]]; then
  DATABASE_PATH="$DATABASE_PATH" BACKUP_DIR="$BACKUP_DIR" "$NODE_BIN" "$ROOT_DIR/deploy/backup.mjs"
fi

install -d -o root -g root -m 0755 "$APP_PARENT_DIR"
RELEASE_DIR=$(mktemp -d "$APP_PARENT_DIR/.project-board-release.XXXXXX")
cp -a dist server package.json package-lock.json deploy "$RELEASE_DIR"/
install -D -o root -g root -m 0755 "$NODE_BIN" "$RELEASE_DIR/bin/node"
chown -R root:root "$RELEASE_DIR"

if systemctl is-active --quiet project-board.service; then
  service_was_active=1
  systemctl stop project-board.service
fi

if [[ -e "$APP_DIR" || -L "$APP_DIR" ]]; then
  ROLLBACK_DIR=$(mktemp -d "$APP_PARENT_DIR/.project-board-rollback.XXXXXX")
  rmdir -- "$ROLLBACK_DIR"
  mv -- "$APP_DIR" "$ROLLBACK_DIR"
  app_swapped=1
fi
mv -- "$RELEASE_DIR" "$APP_DIR"
RELEASE_DIR=''
app_swapped=1
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$DATA_DIR" "$BACKUP_DIR"

if [[ ! -d "$SYSTEMD_UNIT_DIR" ]]; then
  install -d -o root -g root -m 0755 "$SYSTEMD_UNIT_DIR"
fi
for unit in "${units[@]}"; do
  if [[ -e "$SYSTEMD_UNIT_DIR/$unit" || -L "$SYSTEMD_UNIT_DIR/$unit" ]]; then
    cp -a -- "$SYSTEMD_UNIT_DIR/$unit" "$UNIT_ROLLBACK_DIR/$unit"
  fi
  if systemctl is-enabled --quiet "$unit"; then
    prior_enabled_units+=("$unit")
  fi
done
unit_rollback_captured=1

for unit in "${units[@]}"; do
  sed -e "s|@NODE_BIN@|$NODE_RUNTIME|g" \
    "$ROOT_DIR/deploy/$unit" > "$UNIT_DIR/$unit"
  install -o root -g root -m 0644 "$UNIT_DIR/$unit" "$SYSTEMD_UNIT_DIR/$unit"
done
systemctl daemon-reload
systemctl enable \
  project-board.service \
  project-board-backup.timer \
  project-board-offsite-backup.timer \
  project-board-restore-drill.timer
systemctl restart project-board.service
systemctl start \
  project-board-backup.timer \
  project-board-offsite-backup.timer \
  project-board-restore-drill.timer

printf 'Project Board installed at %s\n' "$APP_DIR"
