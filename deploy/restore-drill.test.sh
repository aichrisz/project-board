#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCRIPT="$ROOT_DIR/deploy/restore-drill.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || fail "expected $2 in $1"; }

[[ -x "$SCRIPT" ]] || fail "restore-drill.sh must be executable"

FAKE_BIN="$TMP_DIR/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/restic" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
command_name=''
target=''
previous=''
for argument in "$@"; do
  if [[ "$previous" == --target ]]; then target="$argument"; fi
  case "$argument" in
    restore|backup|forget|check|prune) command_name="$argument";;
  esac
  previous="$argument"
done
printf 'CALL' >> "$FAKE_RESTIC_LOG"
printf ' %q' "$@" >> "$FAKE_RESTIC_LOG"
printf '\n' >> "$FAKE_RESTIC_LOG"
if [[ "${FAKE_RESTIC_FAIL_COMMAND:-}" == "$command_name" ]]; then
  exit 23
fi
if [[ "$command_name" == restore ]]; then
  target=${target:?restore target missing}
  mkdir -p "$target/var/backups/project-board/offsite"
  cp "$FAKE_RESTORE_SOURCE" "$target/var/backups/project-board/offsite/project-board.db"
  if [[ "${FAKE_RESTIC_SLEEP_RESTORE:-}" == 1 ]]; then
    sleep 2
  fi
fi
EOF
chmod +x "$FAKE_BIN/restic"

SOURCE_DATABASE="$TMP_DIR/source.db"
export SOURCE_DATABASE
PROJECT_BOARD_OWNER=owner@example.com node --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(process.env.SOURCE_DATABASE);
const owner = process.env.PROJECT_BOARD_OWNER;
const workspace = JSON.stringify({
  version: 1,
  projects: Array.from({ length: 31 }, (_, index) => ({ id: `project-${index}` })),
});
database.exec('CREATE TABLE workspaces (owner_email TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
database.prepare('INSERT INTO workspaces VALUES (?, ?, ?)').run(owner, workspace, new Date().toISOString());
database.close();
NODE
PASSWORD_FILE="$TMP_DIR/restic-password"
printf 'test-password\n' > "$PASSWORD_FILE"
chmod 600 "$PASSWORD_FILE"
RCLONE_CONFIG="$TMP_DIR/rclone.conf"
printf '[onedrive]\ntype = onedrive\n' > "$RCLONE_CONFIG"
chmod 600 "$RCLONE_CONFIG"

run_drill() {
  local restore_parent=$1
  shift
  env PATH="$FAKE_BIN:$PATH" \
    RESTIC_REPOSITORY='rclone:onedrive:Project Board' \
    RESTIC_PASSWORD_FILE="$PASSWORD_FILE" \
    RCLONE_CONFIG="$RCLONE_CONFIG" \
    RESTIC_HOST='project-board' \
    RESTIC_PATH='/var/backups/project-board/offsite/project-board.db' \
    PROJECT_BOARD_OWNER='owner@example.com' \
    EXPECTED_PROJECT_COUNT=31 \
    RESTORE_PARENT_DIR="$restore_parent" \
    RESTIC_BIN="$FAKE_BIN/restic" \
    FAKE_RESTIC_LOG="$TMP_DIR/restic.log" \
    FAKE_RESTORE_SOURCE="$SOURCE_DATABASE" \
    "$@" "$SCRIPT"
}

: > "$TMP_DIR/restic.log"
run_drill "$TMP_DIR/success" || fail 'valid restore drill should succeed'
if find "$TMP_DIR/success" -mindepth 1 -maxdepth 1 -type d -name '.restore-*' -print -quit | grep -q .; then
  fail 'successful restore drill must remove temporary restore data'
fi
assert_contains "$TMP_DIR/restic.log" 'restore'
assert_contains "$TMP_DIR/restic.log" 'latest'
assert_contains "$TMP_DIR/restic.log" '--target'
assert_contains "$TMP_DIR/restic.log" '--host project-board'
assert_contains "$TMP_DIR/restic.log" '--tag project-board'
assert_contains "$TMP_DIR/restic.log" '--tag sqlite'
assert_contains "$TMP_DIR/restic.log" '--path /var/backups/project-board/offsite/project-board.db'

if run_drill "$TMP_DIR/wrong-owner" PROJECT_BOARD_OWNER='other@example.com'; then
  fail 'wrong owner must fail'
fi
find "$TMP_DIR/wrong-owner" -mindepth 1 -maxdepth 1 -type d -name '.restore-*' -print -quit | grep -q . \
  || fail 'failed restore drill must preserve its temporary restore data'

if run_drill "$TMP_DIR/wrong-count" EXPECTED_PROJECT_COUNT=30; then
  fail 'unexpected project count must fail'
fi


if run_drill "$TMP_DIR/unsafe" RESTIC_REPOSITORY='rclone:other:Project Board'; then
  fail 'unsafe repository must be rejected'
fi
if env -u RESTIC_PASSWORD_FILE PATH="$FAKE_BIN:$PATH" \
    RESTIC_REPOSITORY='rclone:onedrive:Project Board' \
    RCLONE_CONFIG="$RCLONE_CONFIG" \
    PROJECT_BOARD_OWNER='owner@example.com' \
    RESTORE_PARENT_DIR="$TMP_DIR/missing-secret" \
    RESTIC_BIN="$FAKE_BIN/restic" \
    FAKE_RESTIC_LOG="$TMP_DIR/restic.log" \
    FAKE_RESTORE_SOURCE="$SOURCE_DATABASE" "$SCRIPT"; then
  fail 'missing password file variable must be rejected'
fi

FAKE_RESTIC_SLEEP_RESTORE=1 run_drill "$TMP_DIR/locked" &
FIRST_PID=$!
sleep 0.3
if run_drill "$TMP_DIR/locked"; then
  fail 'concurrent restore drills must be rejected by flock'
fi
wait "$FIRST_PID"

printf 'restore drill tests passed\n'
