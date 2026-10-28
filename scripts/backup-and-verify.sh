#!/usr/bin/env bash
# Daily backup with a restore that's actually tried:
#   1. dump SOURCE_URL (the live database) to $OUT (pg_dump custom format);
#   2. restore that dump into RESTORE_URL (an EMPTY throwaway database);
#   3. compare every table's row count, live vs restored - any difference
#      fails the run (exit 1), so a backup that can't be restored is noticed.
# Optionally encrypts the verified dump with BACKUP_PASSPHRASE ($OUT.gpg).
#
#   SOURCE_URL=... RESTORE_URL=... OUT=backup.dump [BACKUP_PASSPHRASE=...] scripts/backup-and-verify.sh
set -euo pipefail
: "${SOURCE_URL:?set SOURCE_URL (the database to back up)}"
: "${RESTORE_URL:?set RESTORE_URL (an empty throwaway database to test the restore in)}"
OUT="${OUT:-backup.dump}"

echo "== 1. Dumping"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$SOURCE_URL"
ls -lh "$OUT"

echo "== 2. Restoring into the throwaway database"
existing=$(psql "$RESTORE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")
if [ "$existing" != "0" ]; then echo "RESTORE_URL is not empty ($existing tables) - refusing to restore over it." >&2; exit 1; fi
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$OUT"

echo "== 3. Comparing row counts"
# The live database can change while the dump runs (someone saves a deal),
# so a small difference is reported, not failed. A missing table, a table
# empty after the restore, or a bigger difference fails the run.
tables=$(psql "$SOURCE_URL" -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
fail=0
for t in $tables; do
  a=$(psql "$SOURCE_URL" -Atc "select count(*) from public.\"$t\"")
  b=$(psql "$RESTORE_URL" -Atc "select count(*) from public.\"$t\"" 2>/dev/null || echo "missing")
  if [ "$b" = "missing" ]; then printf "  FAIL  %-28s missing after the restore\n" "$t"; fail=1; continue; fi
  d=$(( a > b ? a - b : b - a ))
  slack=$(( a / 100 > 5 ? a / 100 : 5 ))
  if [ "$d" = "0" ]; then printf "  ok    %-28s %s\n" "$t" "$a"
  elif [ "$b" = "0" ] || [ "$d" -gt "$slack" ]; then printf "  FAIL  %-28s live %s, restored %s\n" "$t" "$a" "$b"; fail=1
  else printf "  ok    %-28s live %s, restored %s (changed during the backup)\n" "$t" "$a" "$b"; fi
done
if [ "$fail" != "0" ]; then echo "Restore check FAILED - see the FAIL lines above." >&2; exit 1; fi
echo "Restore check passed: $(echo "$tables" | wc -w) tables restored."

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  echo "== 4. Encrypting"
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 --output "$OUT.gpg" "$OUT"
  rm -f "$OUT"
  ls -lh "$OUT.gpg"
fi
