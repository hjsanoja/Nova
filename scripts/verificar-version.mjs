#!/usr/bin/env node
/*
 * Versión de NOVA en cada PR (se usa en GitHub Actions):
 *   node scripts/verificar-version.mjs origin/main   → el PR debe subir la versión respecto de la rama base
 *   node scripts/verificar-version.mjs --notas       → notas de la versión actual (para GitHub Releases)
 * Regla: cambio chico +0.1 (v6.2 → v6.3); cambio grande, siguiente entero (v6.3 → v7.0). Ver src/novedades.json.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const novedades = leer('src/novedades.json');
const actual = novedades[0];

if (process.argv[2] === '--notas') {
  console.log(`**${actual.titulo}**\n\n${actual.cambios.map((c) => `- ${c}`).join('\n')}\n`);
  process.exit(0);
}

const fallar = (mensaje) => {
  console.error(`::error::${mensaje}`);
  process.exit(1);
};
const numeros = (v) => v.split('.').map(Number);
const comparar = (a, b) => {
  const [ma, na] = numeros(a);
  const [mb, nb] = numeros(b);
  return ma !== mb ? ma - mb : na - nb;
};

const paquete = leer('package.json').version;
if (paquete !== `${actual.version}.0`) fallar(`package.json dice ${paquete} y src/novedades.json dice ${actual.version}: deben coincidir (${actual.version}.0).`);

const base = process.argv[2] ?? 'origin/main';
let anterior = null;
try {
  anterior = JSON.parse(execSync(`git show ${base}:src/novedades.json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0];
} catch {
  console.log(`La rama base aún no tiene historial de versiones: este PR publica la v${actual.version}.`);
  process.exit(0);
}

if (comparar(actual.version, anterior.version) <= 0) {
  fallar(`Este PR debe publicar una versión nueva: la rama base ya tiene la v${anterior.version}. Agrega la siguiente arriba en src/novedades.json (v${numeros(anterior.version)[0]}.${numeros(anterior.version)[1] + 1} si es un ajuste, v${numeros(anterior.version)[0] + 1}.0 si es un cambio grande) y la misma en package.json.`);
}
const [ma, na] = numeros(anterior.version);
const [mv, nv] = numeros(actual.version);
const valida = actual.tipo === 'mayor' ? mv === ma + 1 && nv === 0 : mv === ma && nv === na + 1;
if (!valida) fallar(`De la v${anterior.version} a la v${actual.version} no corresponde a un cambio "${actual.tipo}": un ajuste sube un decimal y un cambio grande pasa al siguiente entero (.0).`);

console.log(`Versión correcta: v${anterior.version} → v${actual.version} (${actual.tipo === 'mayor' ? 'cambio grande' : 'ajuste'}): ${actual.titulo}`);
