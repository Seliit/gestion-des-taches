#!/usr/bin/env bash
# Lance un PostgreSQL jetable, applique les migrations et exécute les tests de sécurité.
# Prérequis : PostgreSQL 15+ installé (initdb, pg_ctl, psql dans le PATH ou PG_BIN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
TMP="$(mktemp -d)"
PORT="${PORT:-54329}"
trap '"$PG_BIN/pg_ctl" -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

"$PG_BIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null
PSQL=("$PG_BIN/psql" -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done
echo "→ tests de sécurité"
"${PSQL[@]}" -f "$ROOT/supabase/tests/10_rls_tests.sql" 2>&1 | sed -n 's/^psql:.*NOTICE:  //p; /ÉCHEC\|ERROR\|Tous les tests/p'
