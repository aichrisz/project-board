#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCRIPT="$ROOT_DIR/deploy/backup-offsite.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_file() { [[ -f "$1" ]] || fail "expected file: $1"; }
assert_dir() { [[ -d "$1" ]] || fail "expected directory: $1"; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || fail "expected $2 in $1"; }
assert_not_contains() { ! grep -F -- "$2" "$1" >/dev/null || fail "did not expect $2 in $1"; }
assert_mode_owner() {
  [[ "$(stat -c '%a' "$1")" == 600 ]] || fail "expected mode 0600: $1"
  [[ "$(stat -c '%u' "$1")" == "$EUID" ]] || fail "expected current-user owner: $1"
}

[[ -x "$SCRIPT" ]] || fail "backup-offsite.sh must be executable"

FAKE_BIN="$TMP_DIR/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/restic" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cmd=''
for argument in "$@"; do
  case "$argument" in
    backup|forget|check|prune) cmd="$argument";;
  esac
done
printf 'CALL' >> "$FAKE_RESTIC_LOG"
printf ' %s' "$@" >> "$FAKE_RESTIC_LOG"
printf '\n' >> "$FAKE_RESTIC_LOG"
if [[ "$cmd" == backup ]]; then
  last_argument=${!#}
  printf '%s\n' "$last_argument" > "$FAKE_BACKUP_PATH"
fi
if [[ "${FAKE_RESTIC_FAIL_COMMAND:-}" == "$cmd" ]]; then
  exit 23
fi
if [[ "${FAKE_RESTIC_SLEEP_COMMAND:-}" == "$cmd" ]]; then
  sleep "${FAKE_RESTIC_SLEEP_SECONDS:-2}"
fi
EOF
chmod +x "$FAKE_BIN/restic"
cat > "$FAKE_BIN/date" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${FAKE_DATE_WEEKDAY:-3}"
EOF
chmod +x "$FAKE_BIN/date"
cat > "$FAKE_BIN/rclone" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_RCLONE_LOG"
exit 99
EOF
chmod +x "$FAKE_BIN/rclone"

DATABASE_PATH="$TMP_DIR/source.db"
export DATABASE_PATH
node --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(process.env.DATABASE_PATH);
database.exec('CREATE TABLE checks (value TEXT NOT NULL); INSERT INTO checks VALUES (\'snapshot\');');
database.close();
NODE
PASSWORD_FILE="$TMP_DIR/restic-password"
printf 'test-password\n' > "$PASSWORD_FILE"
chmod 600 "$PASSWORD_FILE"
RCLONE_CONFIG="$TMP_DIR/rclone.conf"
printf '[onedrive]\ntype = onedrive\n' > "$RCLONE_CONFIG"
chmod 600 "$RCLONE_CONFIG"
assert_mode_owner "$PASSWORD_FILE"
assert_mode_owner "$RCLONE_CONFIG"

run_backup() {
  local backup_dir=$1
  shift
  env PATH="$FAKE_BIN:$PATH" \
    DATABASE_PATH="$DATABASE_PATH" \
    BACKUP_DIR="$backup_dir" \
    RESTIC_REPOSITORY='rclone:onedrive:Project Board' \
    RESTIC_PASSWORD_FILE="$PASSWORD_FILE" \
    RCLONE_CONFIG="$RCLONE_CONFIG" \
    RESTIC_BIN="$FAKE_BIN/restic" \
    DATE_BIN="$FAKE_BIN/date" \
    FAKE_DATE_WEEKDAY="${FAKE_DATE_WEEKDAY:-3}" \
    FAKE_RESTIC_LOG="$TMP_DIR/restic.log" \
    FAKE_BACKUP_PATH="$TMP_DIR/backup-path" \
    FAKE_RCLONE_LOG="$TMP_DIR/rclone.log" \
    "$@" "$SCRIPT"
}

: > "$TMP_DIR/restic.log"
: > "$TMP_DIR/rclone.log"
run_backup "$TMP_DIR/success" || fail 'valid offsite backup should succeed'

SNAPSHOT=$(<"$TMP_DIR/backup-path")
[[ "$SNAPSHOT" == "$TMP_DIR/success/offsite/project-board.db" ]] || fail 'restic must receive a stable offsite snapshot path'
[[ "$SNAPSHOT" != "$DATABASE_PATH" ]] || fail 'restic must not receive the live database'
[[ "$SNAPSHOT" != *.db-wal && "$SNAPSHOT" != *.db-shm ]] || fail 'restic must not receive WAL/SHM files'
[[ ! -e "$SNAPSHOT" ]] || fail 'successful backup must clean the staged snapshot'
assert_contains "$TMP_DIR/restic.log" '--host project-board'
assert_contains "$TMP_DIR/restic.log" '--tag project-board'
assert_contains "$TMP_DIR/restic.log" '--tag sqlite'
assert_contains "$TMP_DIR/restic.log" '--group-by host,tags'
assert_not_contains "$TMP_DIR/rclone.log" 'sync'
assert_contains "$TMP_DIR/restic.log" 'backup'
assert_contains "$TMP_DIR/restic.log" 'forget'
assert_contains "$TMP_DIR/restic.log" '--keep-daily 7'
assert_contains "$TMP_DIR/restic.log" '--keep-weekly 5'
assert_contains "$TMP_DIR/restic.log" '--keep-monthly 12'
assert_not_contains "$TMP_DIR/restic.log" ' prune'
assert_not_contains "$TMP_DIR/restic.log" ' check'
if find "$TMP_DIR/success" -mindepth 1 -maxdepth 1 -type d -name '.offsite-*' -print -quit | grep -q .; then
  fail 'successful backup must remove staging'
fi

FAKE_DATE_WEEKDAY=7 run_backup "$TMP_DIR/maintenance" || fail 'weekly maintenance backup should succeed'
assert_contains "$TMP_DIR/restic.log" ' prune'
assert_contains "$TMP_DIR/restic.log" ' check'

if run_backup "$TMP_DIR/unsafe" RESTIC_REPOSITORY='rclone:other:Project Board'; then
  fail 'unsafe repository must be rejected'
fi
if env -u RESTIC_PASSWORD_FILE PATH="$FAKE_BIN:$PATH" \
    DATABASE_PATH="$DATABASE_PATH" BACKUP_DIR="$TMP_DIR/missing-secret" \
    RESTIC_REPOSITORY='rclone:onedrive:Project Board' RESTIC_BIN="$FAKE_BIN/restic" \
    RCLONE_CONFIG="$RCLONE_CONFIG" DATE_BIN="$FAKE_BIN/date" \
    FAKE_RESTIC_LOG="$TMP_DIR/restic.log" FAKE_BACKUP_PATH="$TMP_DIR/backup-path" \
    FAKE_RCLONE_LOG="$TMP_DIR/rclone.log" "$SCRIPT"; then
  fail 'missing password file variable must be rejected'
fi

chmod 644 "$PASSWORD_FILE"
if run_backup "$TMP_DIR/unsafe-mode"; then
  fail 'password file with unsafe mode must be rejected'
fi
chmod 600 "$PASSWORD_FILE"

if (( EUID == 0 )); then
  chown 65534:65534 "$PASSWORD_FILE"
  if run_backup "$TMP_DIR/unsafe-owner"; then
    fail 'password file with unsafe owner must be rejected'
  fi
  chown 0:0 "$PASSWORD_FILE"
fi

FAKE_RESTIC_FAIL_COMMAND=backup run_backup "$TMP_DIR/failure" || true
FAILURE_SNAPSHOT=$(<"$TMP_DIR/backup-path")
assert_file "$FAILURE_SNAPSHOT"
assert_dir "$(dirname "$FAILURE_SNAPSHOT")"

FAKE_RESTIC_SLEEP_COMMAND=backup FAKE_RESTIC_SLEEP_SECONDS=2 \
  run_backup "$TMP_DIR/locked" &
FIRST_PID=$!
sleep 0.3
if run_backup "$TMP_DIR/locked"; then
  fail 'a concurrent backup must be rejected by flock'
fi
wait "$FIRST_PID"

printf 'offsite backup tests passed\n'
