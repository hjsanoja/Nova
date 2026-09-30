# NOVA — reglas para trabajar en este repositorio

- La app, los textos y las respuestas al usuario van en español simple, con pasos numerados cuando haya que hacer algo.
- **Cada PR publica una versión nueva.** Agrégala ARRIBA en `src/novedades.json` (fecha, tipo, título y cambios):
  un ajuste sube un decimal (v7.0 → v7.1) y un cambio grande pasa al siguiente entero (v7.1 → v8.0). Pon la misma
  versión en `package.json` y `package-lock.json` (`7.1` → `"7.1.0"`). Cuando el PR anterior ya tenga número, anótalo
  como `"pr"` en su entrada. Lo verifican `src/version.test.ts` y `.github/workflows/version.yml`.
- Nunca escribas contraseñas, claves ni secretos en el repositorio.
- Base de datos: `src/sql/nova_produccion_v3.sql` es idempotente y se ejecuta completo en el SQL Editor de Supabase;
  si cambia, avisa al usuario que lo vuelva a ejecutar. Pruebas SQL: `db-tests/run.sh`.
- Antes de subir cambios: `npx tsc --noEmit`, `npx vitest run` y `npx vite build`.
- El PR lo abre el usuario: no crees PR ni comentes en GitHub salvo que lo pida.
