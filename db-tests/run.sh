#!/usr/bin/env bash
# Valida el DDL de producción y los escenarios de negocio contra un PostgreSQL con PostGIS.
# Uso: PGHOST=/tmp/pgsock PGPORT=5544 PGUSER=postgres ./db-tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -v ON_ERROR_STOP=1"
$P -q -d postgres -c "drop database if exists nova_test" -c "create database nova_test"
$P -q -d nova_test -f db-tests/00_stub_supabase.sql
$P -q -d nova_test -f src/sql/nova_produccion_v3.sql 2>&1 | grep -v NOTICE || true
echo "-- segunda ejecución (idempotencia)"
$P -q -d nova_test -f src/sql/nova_produccion_v3.sql 2>&1 | grep -v NOTICE || true
$P -d nova_test -f db-tests/10_escenarios.sql 2>&1 | grep -E "NOTICE|ERROR|TODOS" | sed 's/^psql:[^ ]* NOTICE: *//'
$P -d nova_test -f db-tests/20_homologacion.sql 2>&1 | grep -E "NOTICE|ERROR|TODOS|DETAIL|CONTEXT" | sed 's/^psql:[^ ]* NOTICE: *//'
$P -d nova_test -f db-tests/40_gestion.sql 2>&1 | grep -E "NOTICE|ERROR|TODOS|DETAIL|CONTEXT" | sed 's/^psql:[^ ]* NOTICE: *//'

./db-tests/50_version_anterior.sh
