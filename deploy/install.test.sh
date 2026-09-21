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
log=${FAKE_SYSTEMCTL_LOG:?}
state=${FAKE_SYSTEMCTL_STATE:?}
printf '%s' "$*" >> "$log"
printf '\n' >> "$log"
units=()
for arg in "$@"; do
  [[ "$arg" == --quiet ]] || units+=("$arg")
done
case "${1:-}" in
  is-active) exit 0 ;;
  is-enabled)
    grep -Fxq "${units[1]}" "$state"
    ;;
  restart) exit 23 ;;
  start) exit 0 ;;
  stop) exit 0 ;;
  enable)
    printf '%s\n' "${units[@]:1}" >> "$state"
    ;;
  disable)
    for unit in "${units[@]:1}"; do
      sed -i "/^${unit}$/d" "$state"
    done
    ;;
  daemon-reload) ;;
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

SYSTEMD_UNIT_DIR="$TMP_DIR/etc/systemd/system"
mkdir -p "$TMP_DIR/opt/project-board" "$TMP_DIR/etc/project-board" "$SYSTEMD_UNIT_DIR"
printf 'previous-release\n' > "$TMP_DIR/opt/project-board/marker"
printf 'PROJECT_BOARD_OWNER=owner@example.com\n' > "$TMP_DIR/etc/project-board/project-board-offsite.env"
printf 'test-password\n' > "$TMP_DIR/etc/project-board/restic-password"
printf '[onedrive]\ntype = onedrive\n' > "$TMP_DIR/etc/project-board/rclone.conf"
chmod 600 "$TMP_DIR/etc/project-board"/*

units=(
  project-board.service
  project-board-backup.service
  project-board-backup.timer
  project-board-offsite-backup.service
  project-board-offsite-backup.timer
  project-board-restore-drill.service
  project-board-restore-drill.timer
)
for unit in "${units[@]}"; do
  printf 'previous-%s\n' "$unit" > "$SYSTEMD_UNIT_DIR/$unit"
done
printf '%s\n' project-board.service project-board-backup.timer > "$TMP_DIR/systemctl.state.before"
cp "$TMP_DIR/systemctl.state.before" "$TMP_DIR/systemctl.state"
cp -a "$SYSTEMD_UNIT_DIR" "$TMP_DIR/systemd.before"

if env PATH="$FAKE_BIN:$PATH" \
    FAKE_SYSTEMCTL_LOG="$TMP_DIR/systemctl.log" \
    FAKE_SYSTEMCTL_STATE="$TMP_DIR/systemctl.state" \
    SYSTEMD_UNIT_DIR="$SYSTEMD_UNIT_DIR" \
    bash "$INSTALL_SCRIPT"; then
  fail 'install should fail when the post-swap service restart fails'
fi

[[ -f "$TMP_DIR/opt/project-board/marker" ]] \
  || fail 'failed install must restore the previous release marker'
[[ "$(<"$TMP_DIR/opt/project-board/marker")" == 'previous-release' ]] \
  || fail 'failed install must restore the previous release marker'
grep -Fq 'stop project-board.service' "$TMP_DIR/systemctl.log" \
  || fail 'failed install must stop the active service'
grep -Fq 'start project-board.service' "$TMP_DIR/systemctl.log" \
  || fail 'failed install must restart the previous service'
for unit in "${units[@]}"; do
  cmp "$TMP_DIR/systemd.before/$unit" "$SYSTEMD_UNIT_DIR/$unit" \
    || fail "failed install must restore $unit"
done
cmp "$TMP_DIR/systemctl.state.before" "$TMP_DIR/systemctl.state" \
  || fail 'failed install must restore prior unit enablement state'
[[ "$(grep -Fc 'daemon-reload' "$TMP_DIR/systemctl.log")" -ge 2 ]] \
  || fail 'failed install must reload systemd after restoring units'
grep -Fq 'disable project-board.service project-board-backup.service project-board-backup.timer project-board-offsite-backup.service project-board-offsite-backup.timer project-board-restore-drill.service project-board-restore-drill.timer' "$TMP_DIR/systemctl.log" \
  || fail 'failed install must disable newly enabled units before restoring enablement'
grep -Fq 'enable project-board.service project-board-backup.timer' "$TMP_DIR/systemctl.log" \
  || fail 'failed install must restore previously enabled units'

rm -rf "$TMP_DIR/opt/project-board"
rm -f "$SYSTEMD_UNIT_DIR"/*
: > "$TMP_DIR/systemctl.state"
if env PATH="$FAKE_BIN:$PATH" \
    FAKE_SYSTEMCTL_LOG="$TMP_DIR/systemctl.log" \
    FAKE_SYSTEMCTL_STATE="$TMP_DIR/systemctl.state" \
    SYSTEMD_UNIT_DIR="$SYSTEMD_UNIT_DIR" \
    bash "$INSTALL_SCRIPT"; then
  fail 'first install should fail when the post-swap service restart fails'
fi
[[ ! -e "$TMP_DIR/opt/project-board" ]] \
  || fail 'failed first install must not leave a partial live app'
for unit in "${units[@]}"; do
  [[ ! -e "$SYSTEMD_UNIT_DIR/$unit" ]] \
    || fail "failed first install must remove newly installed $unit"
done
[[ ! -s "$TMP_DIR/systemctl.state" ]] \
  || fail 'failed first install must leave all units disabled'

printf 'install rollback tests passed\n'
