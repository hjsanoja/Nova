import { BarChart3, ClipboardPlus, CheckCircle2, Database, LayoutDashboard, Pill, Settings, ShoppingBag, Users } from 'lucide-react';
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

const INICIO = (label: string): TabDef => ({ id: 'inicio', label, corto: 'Inicio', icon: LayoutDashboard, grupo: 'Operación', principal: true });
const CAPTURA: TabDef = { id: 'captura', label: 'Tomar pedido', corto: 'Pedido', icon: ClipboardPlus, grupo: 'Operación', principal: true };
const POR_PROCESAR: TabDef = { id: 'por_procesar', label: 'Por procesar', corto: 'Procesar', icon: CheckCircle2, grupo: 'Operación', principal: true };
const PEDIDOS = (label: string, principal = false): TabDef => ({ id: 'pedidos', label, corto: 'Pedidos', icon: ShoppingBag, grupo: 'Operación', principal });
const CLIENTES = (label: string, principal = false): TabDef => ({ id: 'clientes', label, corto: 'Clientes', icon: Users, grupo: 'Consulta', principal });
const CATALOGO: TabDef = { id: 'catalogo', label: 'Catálogo', corto: 'Catálogo', icon: Pill, grupo: 'Consulta' };
const REPORTES = (principal = false): TabDef => ({ id: 'reportes', label: 'Reportes', corto: 'Reportes', icon: BarChart3, grupo: 'Consulta', principal });
const DATOS: TabDef = { id: 'datos', label: 'Cargar y editar datos', corto: 'Datos', icon: Database, grupo: 'Administración', principal: true };
const CONFIG: TabDef = { id: 'config', label: 'Configuración', corto: 'Ajustes', icon: Settings, grupo: 'Administración' };

/** Módulos permitidos por rol. La seguridad real está en la base de datos (RLS); esto solo ordena lo que cada persona ve. */
export const TABS_POR_ROL: Record<RolUsuario, TabDef[]> = {
  vendedor: [INICIO('Inicio'), CAPTURA, CLIENTES('Mis clientes', true), PEDIDOS('Mis pedidos', true), CATALOGO, CONFIG],
  teletransferencista: [POR_PROCESAR, PEDIDOS('Pedidos', true), CLIENTES('Clientes', true), { ...CATALOGO, principal: true }, CONFIG],
  gerente: [INICIO('Resumen'), REPORTES(true), PEDIDOS('Pedidos', true), CLIENTES('Clientes', true), CATALOGO, CONFIG],
  admin: [INICIO('Resumen'), CAPTURA, POR_PROCESAR, PEDIDOS('Pedidos'), CLIENTES('Clientes', true), CATALOGO, REPORTES(), DATOS, CONFIG].map((t) =>
    // En móvil: Resumen, Por procesar, Clientes y Datos; lo demás en "Más".
    ['inicio', 'por_procesar', 'clientes', 'datos'].includes(t.id) ? { ...t, principal: true } : { ...t, principal: false }
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
