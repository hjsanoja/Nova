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

# ---- Migración desde el esquema de fase 1 (archivar -> v3 -> migrar, y de nuevo para comprobar que es re-ejecutable)
echo "-- migración desde la fase 1"
$P -q -d postgres -c "drop database if exists nova_mig" -c "create database nova_mig"
$P -q -d nova_mig -f db-tests/00_stub_supabase.sql
# El seed de ejemplo del script de fase 1 tiene un error conocido (ON CONFLICT sin restricción única): se ignora, las tablas ya están creadas.
psql -q -d nova_mig -f db-tests/fixtures/esquema_fase1_anterior.sql >/dev/null 2>&1 || true
$P -q -d nova_mig -f db-tests/30_datos_fase1.sql
$P -q -d nova_mig -f src/sql/migracion/1_archivar_esquema_anterior.sql 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^psql:[^ ]* NOTICE: *//' || true
$P -q -d nova_mig -f src/sql/nova_produccion_v3.sql 2>&1 | grep -v NOTICE || true
$P -q -d nova_mig -f src/sql/migracion/2_migrar_datos_anteriores.sql 2>&1 | sed 's/^psql:[^ ]* //'
echo "-- segunda ejecución de la migración"
$P -q -d nova_mig -f src/sql/migracion/2_migrar_datos_anteriores.sql 2>&1 | grep -E "ERROR" || true
$P -d nova_mig -f db-tests/31_verificar_migracion.sql 2>&1 | grep -E "NOTICE|ERROR|PASARON|DETAIL|CONTEXT" | sed 's/^psql:[^ ]* NOTICE: *//'
