#!/usr/bin/env bash
set -euo pipefail

NODE_BIN=${NODE_BIN:-node}
RESTIC_BIN=${RESTIC_BIN:-restic}
FLOCK_BIN=${FLOCK_BIN:-flock}
TIMEOUT_BIN=${TIMEOUT_BIN:-timeout}
RESTIC_TIMEOUT_SEC=${RESTIC_TIMEOUT_SEC:-900}

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
: "${RCLONE_CONFIG:?RCLONE_CONFIG is required}"
: "${PROJECT_BOARD_OWNER:?PROJECT_BOARD_OWNER is required}"
EXPECTED_PROJECT_COUNT=${EXPECTED_PROJECT_COUNT:-31}
RESTORE_PARENT_DIR=${RESTORE_PARENT_DIR:-/var/backups/project-board}
LOCK_FILE=${LOCK_FILE:-$RESTORE_PARENT_DIR/.project-board-backup.lock}
RESTIC_HOST=${RESTIC_HOST:-project-board}
RESTIC_PATH=${RESTIC_PATH:-/var/backups/project-board/offsite/project-board.db}

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

[[ "$RESTIC_HOST" == project-board ]] || {
  printf 'RESTIC_HOST must be exactly project-board\n' >&2
  exit 1
}
[[ "$RESTIC_PATH" == /var/backups/project-board/offsite/project-board.db ]] || {
  printf 'RESTIC_PATH must be the offsite snapshot path\n' >&2
  exit 1
}
[[ "$RESTIC_TIMEOUT_SEC" =~ ^[1-9][0-9]*$ ]] || {
  printf 'RESTIC_TIMEOUT_SEC must be a positive integer\n' >&2
  exit 1
}
[[ "$EXPECTED_PROJECT_COUNT" =~ ^[0-9]+$ ]] || {
  printf 'EXPECTED_PROJECT_COUNT must be a non-negative integer\n' >&2
  exit 1
}

mkdir -p "$RESTORE_PARENT_DIR"
exec 9>"$LOCK_FILE"
if ! "$FLOCK_BIN" -n 9; then
  printf 'backup or restore drill already running\n' >&2
  exit 1
fi

restore_dir=''
completed=0
cleanup() {
  local status=$?
  if [[ "$completed" == 1 && -n "$restore_dir" ]]; then
    rm -rf -- "$restore_dir" || status=$?
  elif [[ -n "$restore_dir" ]]; then
    printf 'restore drill failed; restore preserved at %s\n' "$restore_dir" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

restore_dir=$(mktemp -d "$RESTORE_PARENT_DIR/.restore-XXXXXX")
run_restic() {
  "$TIMEOUT_BIN" --signal=TERM --kill-after=30s "${RESTIC_TIMEOUT_SEC}s" \
    "$RESTIC_BIN" "$@"
}

run_restic --repo "$RESTIC_REPOSITORY" restore latest \
  --host "$RESTIC_HOST" \
  --tag project-board \
  --tag sqlite \
  --path "$RESTIC_PATH" \
  --target "$restore_dir"

snapshot="$restore_dir/${RESTIC_PATH#/}"
if [[ ! -f "$snapshot" || -L "$snapshot" ]]; then
  printf 'expected restored SQLite snapshot at %s\n' "$snapshot" >&2
  exit 1
fi

CHECK_DATABASE="$snapshot" \
PROJECT_BOARD_OWNER="$PROJECT_BOARD_OWNER" \
EXPECTED_PROJECT_COUNT="$EXPECTED_PROJECT_COUNT" \
  "$NODE_BIN" --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(process.env.CHECK_DATABASE);
try {
  const integrity = database.prepare('PRAGMA integrity_check').get();
  if (integrity?.integrity_check !== 'ok') {
    throw new Error('restored snapshot integrity check failed');
  }

  const row = database
    .prepare('SELECT data_json FROM workspaces WHERE owner_email = ?')
    .get(process.env.PROJECT_BOARD_OWNER);
  if (!row) {
    throw new Error('restored snapshot does not contain the requested owner');
  }

  let workspace;
  try {
    workspace = JSON.parse(row.data_json);
  } catch {
    throw new Error('restored owner workspace is not valid JSON');
  }
  const expected = Number(process.env.EXPECTED_PROJECT_COUNT);
  if (!Array.isArray(workspace.projects) || workspace.projects.length !== expected) {
    const actual = Array.isArray(workspace.projects) ? workspace.projects.length : 'missing';
    throw new Error(`restored project count ${actual} does not match expected ${expected}`);
  }
} finally {
  database.close();
}
NODE

completed=1
printf 'restore drill completed for %s (%s projects)\n' "$PROJECT_BOARD_OWNER" "$EXPECTED_PROJECT_COUNT"
