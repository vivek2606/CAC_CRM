# Database backups and restore

Two layers protect the CRM's data:

1. **Neon's own history** (point-in-time restore) - Neon keeps the database's
   history for a window that depends on the plan. Fastest way back from a
   recent mistake: in the Neon console, *Branches -> Restore*, pick a time
   just before the problem.
2. **A daily backup that's restore-tested every night** - the GitHub Actions
   workflow `.github/workflows/backup.yml` runs at 02:30 Lagos time. It
   dumps the live database, **restores the dump into a fresh Postgres and
   compares every table's row count with the live database**, then keeps
   the verified dump, encrypted, for 30 days. A run that can't restore its
   own backup fails (red X in the Actions tab, and GitHub emails the repo
   admins).

## One-time setup

> **Currently on hold:** the nightly schedule in `.github/workflows/backup.yml`
> is switched off. To start: add the two secrets below, then remove the `#`
> from the two `schedule` lines in that file (or ask for it to be done).

1. In GitHub: *Settings -> Secrets and variables -> Actions -> New repository secret*:
   - `PROD_DATABASE_URL` - the live connection string from Neon
     (*Connection details*, **un-tick "Connection pooling"** so the host has no
     `-pooler`). Same database as Vercel's `DATABASE_URL`.
   - `BACKUP_PASSPHRASE` - a long random passphrase. **Store a copy in a
     password manager / safe place** - the backups can't be opened without it.
2. In the *Actions* tab: *Database backup -> Run workflow* once, and check it
   goes green. The log shows each table's row count, live and restored.

## Restoring

1. *Actions -> Database backup ->* open the run for the day you want ->
   *Artifacts* -> download `crm-backup-YYYY-MM-DD` (a zip holding
   `crm-backup-YYYY-MM-DD.dump.gpg`).
2. Decrypt (asks for the passphrase):

   ```sh
   unzip crm-backup-YYYY-MM-DD.zip
   gpg --decrypt --output crm-backup.dump crm-backup-YYYY-MM-DD.dump.gpg
   ```

3. Make an **empty** database to restore into - in Neon: *Databases -> New
   database* (or a new branch). Never restore over the live database.
4. Restore (PostgreSQL 17 client tools):

   ```sh
   pg_restore --no-owner --no-privileges --exit-on-error --dbname="<new database's connection string>" crm-backup.dump
   ```

5. Check it, then switch the CRM over: in Vercel, *Settings -> Environment
   Variables -> DATABASE_URL* = the new database's connection string, and
   redeploy.

To bring back just a few records instead (e.g. a deleted deal), restore into
the new database as above and copy the rows across - or use the CRM's
Recycle Bin first (deleted deals, leads, quotations and billings stay
restorable for 30 days), and the Change History page to see exactly what
changed and when.

## Tried and tested

The restore was tried end to end while setting this up (28 Oct 2026, on a
test copy): backup -> encrypt -> decrypt -> restore into a new database ->
the CRM run on the restored copy (sign-in, deals, quotation history, Sales
Register totals and Change History all as before). A wrong passphrase is
refused. The nightly workflow repeats the restore and comparison every day.

Worth doing every few months: download a recent backup and run steps 1-4
into a scratch database, so restoring is familiar before it's needed.
