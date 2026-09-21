#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

FAKE_BIN="$TMP_DIR/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/restic" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/rclone" <<'EOF'
#!/usr/bin/env bash
printf 'onedrive:\n'
EOF
cat > "$FAKE_BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  is-active) exit 0 ;;
  restart) printf 'restart\n' >> "$FAKE_SYSTEMCTL_LOG"; exit 23 ;;
  start) printf 'start\n' >> "$FAKE_SYSTEMCTL_LOG"; exit 0 ;;
  stop) printf 'stop\n' >> "$FAKE_SYSTEMCTL_LOG"; exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKE_BIN"/*

INSTALL_SCRIPT="$TMP_DIR/install.sh"
sed \
  -e "s|^ROOT_DIR=.*|ROOT_DIR=\"$ROOT_DIR\"|" \
  -e "s|^APP_DIR=.*|APP_DIR=\"$TMP_DIR/opt/project-board\"|" \
  -e "s|^DATA_DIR=.*|DATA_DIR=\"$TMP_DIR/var/lib/project-board\"|" \
  -e "s|^BACKUP_DIR=.*|BACKUP_DIR=\"$TMP_DIR/var/backups/project-board\"|" \
  -e "s|^SERVICE_USER=.*|SERVICE_USER=root|" \
  -e "s|^CONFIG_DIR=.*|CONFIG_DIR=\"$TMP_DIR/etc/project-board\"|" \
  "$ROOT_DIR/deploy/install.sh" > "$INSTALL_SCRIPT"
chmod +x "$INSTALL_SCRIPT"

mkdir -p "$TMP_DIR/opt/project-board" "$TMP_DIR/etc/project-board"
printf 'previous-release\n' > "$TMP_DIR/opt/project-board/marker"
printf 'PROJECT_BOARD_OWNER=owner@example.com\n' > "$TMP_DIR/etc/project-board/project-board-offsite.env"
printf 'test-password\n' > "$TMP_DIR/etc/project-board/restic-password"
printf '[onedrive]\ntype = onedrive\n' > "$TMP_DIR/etc/project-board/rclone.conf"
chmod 600 "$TMP_DIR/etc/project-board"/*

if env PATH="$FAKE_BIN:$PATH" \
    FAKE_SYSTEMCTL_LOG="$TMP_DIR/systemctl.log" \
    bash "$INSTALL_SCRIPT"; then
  fail 'install should fail when the post-swap service restart fails'
fi

[[ -f "$TMP_DIR/opt/project-board/marker" ]] \
  || fail 'failed install must restore the previous release marker'
[[ "$(<"$TMP_DIR/opt/project-board/marker")" == 'previous-release' ]] \
  || fail 'failed install must restore the previous release marker'
grep -Fxq stop "$TMP_DIR/systemctl.log" \
  || fail 'failed install must stop the active service'
grep -Fxq start "$TMP_DIR/systemctl.log" \
  || fail 'failed install must restart the previous service'

rm -rf "$TMP_DIR/opt/project-board"
if env PATH="$FAKE_BIN:$PATH" \
    FAKE_SYSTEMCTL_LOG="$TMP_DIR/systemctl.log" \
    bash "$INSTALL_SCRIPT"; then
  fail 'first install should fail when the post-swap service restart fails'
fi
[[ ! -e "$TMP_DIR/opt/project-board" ]] \
  || fail 'failed first install must not leave a partial live app'

printf 'install rollback tests passed\n'
