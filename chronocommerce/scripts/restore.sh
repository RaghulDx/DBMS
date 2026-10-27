#!/usr/bin/env bash
# usage: scripts/restore.sh backups/chronocommerce-YYYYmmdd-HHMMSS.dump
set -euo pipefail
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$1"
