#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

bash -n "$ROOT_DIR/deploy/check.sh" "$ROOT_DIR/deploy/install.sh" \
  "$ROOT_DIR/deploy/backup-offsite.sh" "$ROOT_DIR/deploy/backup-offsite.test.sh" \
  "$ROOT_DIR/deploy/restore-drill.sh" "$ROOT_DIR/deploy/restore-drill.test.sh"

CHECK_INSTALL="$ROOT_DIR/deploy/install.sh" node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const script = readFileSync(process.env.CHECK_INSTALL, "utf8");
  const quote = String.fromCharCode(34);
  const backup = script.indexOf(`${quote}$ROOT_DIR/deploy/backup.mjs${quote}`);
  const replace = script.indexOf(`find ${quote}$APP_DIR${quote}`);
  if (
    !script.includes(`if [[ -e ${quote}$DATABASE_PATH${quote} ]]`) ||
    backup < 0 ||
    replace < 0 ||
    backup > replace
  ) {
    throw new Error("install.sh must integrity-backup an existing database before replacing the app");
  }
'

NODE_BIN=$(command -v node)

rendered_units=()
for unit in \
  project-board.service \
  project-board-backup.service project-board-backup.timer \
  project-board-offsite-backup.service project-board-offsite-backup.timer \
  project-board-restore-drill.service project-board-restore-drill.timer; do
  rendered="$TMP_DIR/$unit"
  sed \
    -e "s|/opt/project-board|$TMP_DIR/opt/project-board|g" \
    -e "s|/var/lib/project-board|$TMP_DIR/var/lib/project-board|g" \
    -e "s|/var/backups/project-board|$TMP_DIR/var/backups/project-board|g" \
    -e "s|@NODE_BIN@|$NODE_BIN|g" \
    "$ROOT_DIR/deploy/$unit" > "$rendered"
  rendered_units+=("$rendered")
done

install -d "$TMP_DIR/opt/project-board/deploy"
for script in backup-offsite.sh restore-drill.sh; do
  install -m 0755 "$ROOT_DIR/deploy/$script" "$TMP_DIR/opt/project-board/deploy/$script"
done

systemd-analyze verify "${rendered_units[@]}"

missing_database="$TMP_DIR/missing.db"
if DATABASE_PATH="$missing_database" BACKUP_DIR="$TMP_DIR/backups" node "$ROOT_DIR/deploy/backup.mjs" >/dev/null 2>&1; then
  printf 'backup.mjs accepted a missing database\n' >&2
  exit 1
fi

source_database="$TMP_DIR/source.db"
CHECK_DATABASE="$source_database" node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const database = new DatabaseSync(process.env.CHECK_DATABASE);
  database.exec("CREATE TABLE checks (value TEXT NOT NULL);");
  database.close();
'
DATABASE_PATH="$source_database" BACKUP_DIR="$TMP_DIR/backups" node "$ROOT_DIR/deploy/backup.mjs"

shopt -s nullglob
backups=("$TMP_DIR/backups"/project-board-*.db)
if (( ${#backups[@]} != 1 )); then
  printf 'expected one verified backup, found %s\n' "${#backups[@]}" >&2
  exit 1
fi
CHECK_DATABASE="${backups[0]}" node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const database = new DatabaseSync(process.env.CHECK_DATABASE);
  const result = database.prepare("PRAGMA integrity_check").get();
  database.close();
  if (result?.integrity_check !== "ok") process.exit(1);
'

printf 'deployment checks passed\n'
