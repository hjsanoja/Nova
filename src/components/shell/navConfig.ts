import { BadgePercent, BarChart3, CheckCircle2, Database, LayoutDashboard, ListTodo, Map as IconoMapa, Megaphone, Pill, Settings, ShoppingBag, ShoppingCart, Stethoscope, Target, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RolUsuario } from '../../types/pharmacy';

export interface TabDef {
  id: string;
  label: string;
  /** Etiqueta corta para barra inferior y riel de tablet. */
  corto: string;
  icon: LucideIcon;
  grupo: string;
  /** Aparece directamente en la barra inferior del móvil (el resto va en "Más"). */
  principal?: boolean;
}

/*
 * Menú por rol, en cuatro grupos fijos (el mismo orden para todos):
 *   Ventas              · lo del día: resumen, pedir, pedidos, mesa de transferencias
 *   Clientes y productos · consulta
 *   Gestión              · reportes, metas, condiciones comerciales, comunicados y datos maestros (solo quien administra)
 *   Cuenta               · configuración personal y del sistema
 * En el móvil la barra inferior muestra hasta 4 módulos principales + "Más".
 */
const T = {
  inicio: (label = 'Resumen'): TabDef => ({ id: 'inicio', label, corto: 'Inicio', icon: LayoutDashboard, grupo: 'Ventas' }),
  ruta: { id: 'ruta', label: 'Mi ruta', corto: 'Ruta', icon: IconoMapa, grupo: 'Ventas' } as TabDef,
  pedir: { id: 'captura', label: 'Nuevo pedido', corto: 'Pedir', icon: ShoppingCart, grupo: 'Ventas' } as TabDef,
  pedidos: (label = 'Pedidos'): TabDef => ({ id: 'pedidos', label, corto: 'Pedidos', icon: ShoppingBag, grupo: 'Ventas' }),
  porProcesar: { id: 'por_procesar', label: 'Por procesar', corto: 'Procesar', icon: CheckCircle2, grupo: 'Ventas' } as TabDef,
  clientes: (label = 'Clientes'): TabDef => ({ id: 'clientes', label, corto: 'Clientes', icon: Users, grupo: 'Clientes y productos' }),
  tareas: (label = 'Tareas'): TabDef => ({ id: 'tareas', label, corto: 'Tareas', icon: ListTodo, grupo: 'Ventas' }),
  medicos: (label = 'Médicos'): TabDef => ({ id: 'medicos', label, corto: 'Médicos', icon: Stethoscope, grupo: 'Clientes y productos' }),
  catalogo: { id: 'catalogo', label: 'Catálogo', corto: 'Catálogo', icon: Pill, grupo: 'Clientes y productos' } as TabDef,
  reportes: { id: 'reportes', label: 'Reportes', corto: 'Reportes', icon: BarChart3, grupo: 'Gestión' } as TabDef,
  condiciones: { id: 'condiciones', label: 'Descuentos', corto: 'Descuentos', icon: BadgePercent, grupo: 'Gestión' } as TabDef,
  metas: { id: 'metas', label: 'Metas', corto: 'Metas', icon: Target, grupo: 'Gestión' } as TabDef,
  comunicados: { id: 'comunicados', label: 'Comunicados', corto: 'Avisos', icon: Megaphone, grupo: 'Gestión' } as TabDef,
  datos: { id: 'datos', label: 'Datos maestros', corto: 'Datos', icon: Database, grupo: 'Gestión' } as TabDef,
  config: { id: 'config', label: 'Configuración', corto: 'Ajustes', icon: Settings, grupo: 'Cuenta' } as TabDef,
};

const principales = (tabs: TabDef[], ids: string[]) => tabs.map((t) => ({ ...t, principal: ids.includes(t.id) }));

/** Módulos permitidos por rol. La seguridad real está en la base de datos (RLS); esto solo ordena lo que cada persona ve. */
export const TABS_POR_ROL: Record<RolUsuario, TabDef[]> = {
  // El vendedor pide desde el catálogo de "Nuevo pedido": no necesita un catálogo aparte.
  // Visitador mixto: toma pedidos en farmacias y visita médicos.
  vendedor: principales([T.inicio('Inicio'), T.ruta, T.pedir, T.pedidos('Mis pedidos'), T.tareas('Mis tareas'), T.clientes('Mis clientes'), T.medicos('Mis médicos'), T.config], ['inicio', 'ruta', 'captura', 'pedidos']),
  teletransferencista: principales([T.porProcesar, T.pedidos(), T.clientes(), T.catalogo, T.config], ['por_procesar', 'pedidos', 'clientes', 'catalogo']),
  gerente: principales([T.inicio(), T.pedidos(), T.tareas(), T.clientes(), T.medicos(), T.catalogo, T.reportes, T.metas, T.condiciones, T.comunicados, T.config], ['inicio', 'reportes', 'pedidos', 'metas']),
  admin: principales(
    [T.inicio(), T.pedir, T.pedidos(), T.porProcesar, T.tareas(), T.clientes(), T.medicos(), T.catalogo, T.reportes, T.metas, T.condiciones, T.comunicados, T.datos, T.config],
    ['inicio', 'por_procesar', 'pedidos', 'datos']
  ),
};

export function tabsDelRol(rol: RolUsuario): TabDef[] {
  return TABS_POR_ROL[rol] ?? TABS_POR_ROL.vendedor;
}

/** Módulo con el que arranca cada rol. */
export const TAB_INICIAL: Record<RolUsuario, string> = {
  vendedor: 'inicio',
  teletransferencista: 'por_procesar',
  gerente: 'inicio',
  admin: 'inicio',
};

const ETIQUETA_ROL: Record<RolUsuario, string> = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', teletransferencista: 'Transferencista' };

/** "Vendedor · OTC", "Administrador"… */
export const etiquetaRol = (rol: RolUsuario, equipo?: string): string =>
  rol === 'vendedor' && equipo && equipo !== 'TODOS' ? `${ETIQUETA_ROL[rol]} · ${equipo}` : ETIQUETA_ROL[rol];
