#!/usr/bin/env bash
# Sauvegarde manuelle complète de la base (schéma + données) au format pg_dump.
# Usage : SUPABASE_DB_URL="postgresql://postgres:MOT_DE_PASSE@db.xxxx.supabase.co:5432/postgres" npm run db:backup
# Restauration : pg_restore --clean --if-exists -d "$SUPABASE_DB_URL" sauvegardes/<fichier>.dump
set -euo pipefail
: "${SUPABASE_DB_URL:?Définissez SUPABASE_DB_URL (Supabase > Project Settings > Database > Connection string)}"
mkdir -p sauvegardes
FILE="sauvegardes/pilotage-$(date +%Y%m%d-%H%M%S).dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --schema=public --schema=auth --schema=storage -f "$FILE"
echo "Sauvegarde écrite dans $FILE"
