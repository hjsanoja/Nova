// Comunicados de la gerencia: cuáles están vigentes, cuáles ve cada persona y cómo describir a quién van dirigidos.
import type { LocalComunicado, TipoComunicado } from '../offline/types';

export const TIPOS: { id: TipoComunicado; texto: string; tono: 'marca' | 'exito' | 'aviso' | 'neutro' }[] = [
  { id: 'anuncio', texto: 'Anuncio', tono: 'marca' },
  { id: 'descuento', texto: 'Descuento', tono: 'exito' },
  { id: 'estrategia', texto: 'Estrategia', tono: 'neutro' },
  { id: 'alerta', texto: 'Alerta', tono: 'aviso' },
];
export const tipo = (id: TipoComunicado) => TIPOS.find((t) => t.id === id) ?? TIPOS[0];

/** Roles tal como los guarda la base (el de la mesa se llama "transferencista"). */
export const ROLES: { id: string; texto: string }[] = [
  { id: 'vendedor', texto: 'Vendedores' },
  { id: 'transferencista', texto: 'Transferencistas' },
  { id: 'gerente', texto: 'Gerentes' },
  { id: 'admin', texto: 'Administradores' },
];

export type EstadoVigencia = 'activo' | 'programado' | 'vencido';

export function vigencia(c: Pick<LocalComunicado, 'vigente_desde' | 'vigente_hasta'>, ahora = new Date()): EstadoVigencia {
  if (c.vigente_desde && new Date(c.vigente_desde) > ahora) return 'programado';
  if (c.vigente_hasta && new Date(c.vigente_hasta) < ahora) return 'vencido';
  return 'activo';
}

/** Los que ve esta persona ahora (dirigidos a ella y vigentes), los más recientes primero. */
export function paraMostrar(lista: LocalComunicado[], ahora = new Date()): LocalComunicado[] {
  return lista
    .filter((c) => c.para_mi && vigencia(c, ahora) === 'activo')
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde));
}

/** "Vendedores · Equipo Ético · Zulia, Lara" o "Todos". */
export function describirDestino(c: Pick<LocalComunicado, 'roles' | 'equipos' | 'estados' | 'ciudades' | 'regiones'>, nombreEquipo: (id: string) => string = (id) => id): string {
  const partes = [
    c.roles.map((r) => ROLES.find((x) => x.id === r)?.texto ?? r).join(', '),
    c.equipos.map(nombreEquipo).join(', '),
    c.regiones.length ? `Región ${c.regiones.join(', ')}` : '',
    c.estados.join(', '),
    c.ciudades.join(', '),
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Todos';
}
