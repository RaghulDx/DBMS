#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
pg_dump "$DATABASE_URL" --format=custom --file="backups/chronocommerce-$(date +%Y%m%d-%H%M%S).dump"
