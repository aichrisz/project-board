#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
NODE_BIN=${NODE_BIN:-node}
RESTIC_BIN=${RESTIC_BIN:-restic}
FLOCK_BIN=${FLOCK_BIN:-flock}
DATE_BIN=${DATE_BIN:-date}
TIMEOUT_BIN=${TIMEOUT_BIN:-timeout}
RESTIC_TIMEOUT_SEC=${RESTIC_TIMEOUT_SEC:-900}

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
: "${RCLONE_CONFIG:?RCLONE_CONFIG is required}"

[[ "$RESTIC_REPOSITORY" == 'rclone:onedrive:Project Board' ]] || {
  printf 'RESTIC_REPOSITORY must be exactly rclone:onedrive:Project Board\n' >&2
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
  [[ "$(stat -c '%u' "$path")" == "$EUID" ]] || {
    printf '%s must be owned by the current user\n' "$name" >&2
    exit 1
  }
}

validate_secret_file RESTIC_PASSWORD_FILE "$RESTIC_PASSWORD_FILE"
validate_secret_file RCLONE_CONFIG "$RCLONE_CONFIG"

[[ "$RESTIC_TIMEOUT_SEC" =~ ^[1-9][0-9]*$ ]] || {
  printf 'RESTIC_TIMEOUT_SEC must be a positive integer\n' >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
LOCK_FILE=${LOCK_FILE:-$BACKUP_DIR/.project-board-backup.lock}
exec 9>"$LOCK_FILE"
if ! "$FLOCK_BIN" -n 9; then
  printf 'offsite backup already running\n' >&2
  exit 1
fi

staging_dir=''
stable_snapshot="$BACKUP_DIR/offsite/project-board.db"
completed=0
cleanup() {
  local status=$?
  if [[ "$completed" == 1 ]]; then
    [[ -z "$stable_snapshot" ]] || rm -f -- "$stable_snapshot" || status=$?
    [[ -z "$staging_dir" ]] || rm -rf -- "$staging_dir" || status=$?
    rmdir -- "$(dirname "$stable_snapshot")" 2>/dev/null || true
  elif [[ -n "$staging_dir" ]]; then
    printf 'offsite backup failed; snapshot preserved at %s\n' "$stable_snapshot" >&2
    printf 'offsite backup failed; staging preserved at %s\n' "$staging_dir" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

staging_dir=$(mktemp -d "$BACKUP_DIR/.offsite-XXXXXX")
DATABASE_PATH="$DATABASE_PATH" BACKUP_DIR="$staging_dir" "$NODE_BIN" "$SCRIPT_DIR/backup.mjs"

shopt -s nullglob
snapshots=("$staging_dir"/project-board-*.db)
if (( ${#snapshots[@]} != 1 )); then
  printf 'expected exactly one SQLite snapshot in %s\n' "$staging_dir" >&2
  exit 1
fi
snapshot=${snapshots[0]}
mkdir -p -- "$(dirname "$stable_snapshot")"
cp -- "$snapshot" "$stable_snapshot"
chmod 600 "$stable_snapshot"

CHECK_DATABASE="$snapshot" "$NODE_BIN" --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(process.env.CHECK_DATABASE);
try {
  const result = database.prepare('PRAGMA integrity_check').get();
  if (result?.integrity_check !== 'ok') {
    throw new Error('snapshot integrity check failed');
  }
} finally {
  database.close();
}
NODE

run_restic() {
  "$TIMEOUT_BIN" --signal=TERM --kill-after=30s "${RESTIC_TIMEOUT_SEC}s" \
    "$RESTIC_BIN" "$@"
}

run_restic --repo "$RESTIC_REPOSITORY" \
  --host project-board \
  --tag project-board \
  --tag sqlite \
  backup "$stable_snapshot"
run_restic --repo "$RESTIC_REPOSITORY" forget \
  --group-by host,tags \
  --keep-daily 7 \
  --keep-weekly 5 \
  --keep-monthly 12

if [[ "$($DATE_BIN +%u)" == 7 ]]; then
  run_restic --repo "$RESTIC_REPOSITORY" prune
  run_restic --repo "$RESTIC_REPOSITORY" check
fi

completed=1
printf 'offsite backup completed\n'
