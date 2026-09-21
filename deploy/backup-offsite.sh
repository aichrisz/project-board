#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
NODE_BIN=${NODE_BIN:-node}
RESTIC_BIN=${RESTIC_BIN:-restic}
FLOCK_BIN=${FLOCK_BIN:-flock}

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

[[ "$RESTIC_REPOSITORY" == 'rclone:onedrive:Project Board' ]] || {
  printf 'RESTIC_REPOSITORY must be exactly rclone:onedrive:Project Board\n' >&2
  exit 1
}
[[ -r "$RESTIC_PASSWORD_FILE" ]] || {
  printf 'RESTIC_PASSWORD_FILE must point to a readable file\n' >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
LOCK_FILE=${LOCK_FILE:-$BACKUP_DIR/.backup-offsite.lock}
exec 9>"$LOCK_FILE"
if ! "$FLOCK_BIN" -n 9; then
  printf 'offsite backup already running\n' >&2
  exit 1
fi

staging_dir=''
completed=0
cleanup() {
  local status=$?
  if [[ "$completed" == 1 && -n "$staging_dir" ]]; then
    rm -rf -- "$staging_dir" || status=$?
  elif [[ -n "$staging_dir" ]]; then
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

"$RESTIC_BIN" --repo "$RESTIC_REPOSITORY" backup "$snapshot"
"$RESTIC_BIN" --repo "$RESTIC_REPOSITORY" forget \
  --keep-daily 7 \
  --keep-weekly 5 \
  --keep-monthly 12 \
  --prune
"$RESTIC_BIN" --repo "$RESTIC_REPOSITORY" check

completed=1
printf 'offsite backup completed\n'
