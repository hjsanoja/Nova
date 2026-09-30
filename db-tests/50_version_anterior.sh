#!/usr/bin/env bash
# Proyecto con una versión anterior: v3 se detiene sin tocar nada, el reinicio aparta lo anterior y quita el
# trigger roto de auth.users, v3 se instala (dos veces), "Add user" funciona y el primer admin se promueve.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=nova_test_anterior
P="psql -v ON_ERROR_STOP=1 -q -d $DB"
falla() { echo "FALLO: $*"; exit 1; }
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -f db-tests/00_stub_supabase.sql
$P -f db-tests/fixtures/version_antigua.sql

# 1. El trigger antiguo hace fallar el alta (reproduce "Database error creating new user").
$P -c "insert into auth.users (id, email) values (gen_random_uuid(), 'x@y.com')" 2>/dev/null && falla "el trigger antiguo debía fallar"
# 2. v3 se detiene con un mensaje que nombra las tablas y el trigger, sin crear nada.
salida=$($P -f src/sql/nova_produccion_v3.sql 2>&1) && falla "v3 debía detenerse"
grep -q "00_reiniciar_esquema_anterior.sql" <<<"$salida" || falla "el aviso no indica el script de reinicio: $salida"
grep -q "dim_clientes" <<<"$salida" && grep -q "on_new_auth_user" <<<"$salida" || falla "el aviso no nombra tablas/trigger: $salida"
[ "$($P -tAc "select count(*) from pg_namespace where nspname = 'app'")" = 0 ] || falla "v3 tocó la base antes de la guarda"
echo "OK 26: v3 se detiene ante una versión anterior y explica qué hacer"

# 3. Reinicio: aparta todo en un respaldo y quita el trigger.
$P -f src/sql/00_reiniciar_esquema_anterior.sql > /dev/null
resp=$($P -tAc "select nspname from pg_namespace where nspname like 'nova_anterior_%'")
[ -n "$resp" ] || falla "no se creó el esquema de respaldo"
[ "$($P -tAc "select nombre from $resp.dim_clientes")" = "Farmacia antigua" ] || falla "los datos antiguos no están en el respaldo"
[ "$($P -tAc "select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal")" = 0 ] || falla "quedó el trigger"
[ "$($P -tAc "select count(*) from pg_extension where extname = 'uuid-ossp'")" = 1 ] || falla "se tocó una extensión"
[ "$($P -tAc "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','v')
              and not exists (select 1 from pg_depend d where d.objid = pg_class.oid and d.deptype = 'e')")" = 0 ] || falla "quedaron tablas en public"
echo "OK 27: el reinicio aparta lo anterior en $resp (datos intactos) y quita el trigger de auth.users"

# 4. v3 se instala y es re-ejecutable.
for i in 1 2; do $P -f src/sql/nova_produccion_v3.sql > /dev/null 2>/tmp/nova_v3_err.txt || falla "v3 falló (ejecución $i): $(grep ERROR /tmp/nova_v3_err.txt)"; done
[ "$($P -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='dim_clientes' and column_name='codigo_interno'")" = 1 ] || falla "v3 no quedó instalado"
# El reinicio se niega a actuar sobre una base v3.
$P -f src/sql/00_reiniciar_esquema_anterior.sql > /dev/null 2>&1 && falla "el reinicio debía negarse sobre v3"
echo "OK 28: v3 se instala tras el reinicio (dos veces) y el reinicio se niega a tocar una base v3"

# 5. "Add user" funciona: nace vendedor inactivo. Un choque en dim_usuarios no bloquea el alta.
$P -c "insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000a001', 'hernando@ejemplo.com')"
[ "$($P -tAc "select rol || ',' || activo from dim_usuarios where email = 'hernando@ejemplo.com'")" = "vendedor,false" ] || falla "alta sin fila en dim_usuarios"
$P -c "alter table dim_usuarios add constraint prueba_falla check (email <> 'rompe@ejemplo.com')"
$P -c "insert into auth.users (id, email) values (gen_random_uuid(), 'rompe@ejemplo.com')" 2>/dev/null || falla "un error en dim_usuarios bloqueó el alta"
$P -c "alter table dim_usuarios drop constraint prueba_falla"
echo "OK 29: crear usuario en Supabase Auth funciona y nunca queda bloqueado por NOVA"

# 6. Primer administrador, también para una cuenta sin fila en dim_usuarios.
[ "$($P -tAc "select app.promover_administrador('Hernando@Ejemplo.com', 'Hernando Sanoja')")" = "Listo: hernando@ejemplo.com es administrador activo." ] || falla "promover"
[ "$($P -tAc "select nombre_completo || ',' || rol || ',' || activo from dim_usuarios where email = 'hernando@ejemplo.com'")" = "Hernando Sanoja,admin,true" ] || falla "no quedó admin"
$P -tAc "select app.promover_administrador('rompe@ejemplo.com')" > /dev/null
[ "$($P -tAc "select rol from dim_usuarios where email = 'rompe@ejemplo.com'")" = "admin" ] || falla "no creó la fila faltante"
$P -tAc "select app.promover_administrador('nadie@ejemplo.com')" > /dev/null 2>&1 && falla "debía fallar con un correo inexistente"
[ "$($P -tAc "select has_function_privilege('authenticated', 'app.promover_administrador(text,text)', 'execute')")" = f ] || falla "authenticated puede promover"
echo "OK 30: app.promover_administrador (crea la fila si falta; solo desde el SQL Editor)"
echo "VERSION ANTERIOR: TODOS LOS ESCENARIOS PASARON"
