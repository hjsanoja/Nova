import {
  BookOpen,
  ClipboardPlus,
  CheckCircle2,
  Database,
  Layers,
  LayoutDashboard,
  Pill,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  UploadCloud,
  Users,
} from 'lucide-react';
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

const GUIA: TabDef = { id: 'guia_uso', label: 'Guía de Uso', corto: 'Guía', icon: BookOpen, grupo: 'Ayuda' };

/** Pestañas permitidas por rol. Definido una sola vez (antes se recreaba en cada render). */
export const TABS_POR_ROL: Record<RolUsuario, TabDef[]> = {
  vendedor: [
    { id: 'dashboard', label: 'Mi Rendimiento', corto: 'Inicio', icon: LayoutDashboard, grupo: 'Operación', principal: true },
    { id: 'captura', label: 'Captura de Pedido (offline)', corto: 'Captura', icon: ClipboardPlus, grupo: 'Operación', principal: true },
    { id: 'sugerido', label: 'Motor Sugerido', corto: 'Sugerido', icon: RefreshCw, grupo: 'Operación', principal: true },
    { id: 'mis_pedidos', label: 'Mis Pedidos', corto: 'Pedidos', icon: ShoppingBag, grupo: 'Operación', principal: true },
    { id: 'nuevo_pedido', label: 'Toma de Pedido (clásica)', corto: 'Clásica', icon: ShoppingCart, grupo: 'Operación' },
    { id: 'vademecum', label: 'Medicamentos', corto: 'Catálogo', icon: Pill, grupo: 'Consulta' },
    GUIA,
  ],
  teletransferencista: [
    { id: 'teletransferencia', label: 'Teletransferencias', corto: 'Pedidos', icon: CheckCircle2, grupo: 'Procesamiento', principal: true },
    { id: 'droguerias_csv', label: 'Layouts CSV', corto: 'Layouts', icon: Layers, grupo: 'Procesamiento', principal: true },
    { id: 'vademecum', label: 'Medicamentos', corto: 'Catálogo', icon: Pill, grupo: 'Consulta', principal: true },
    { ...GUIA, principal: true },
  ],
  gerente: [
    { id: 'dashboard', label: 'Monitoreo Ejecutivo', corto: 'Inicio', icon: LayoutDashboard, grupo: 'Monitoreo', principal: true },
    { id: 'mis_pedidos', label: 'Auditoría de Pedidos', corto: 'Auditoría', icon: ShoppingBag, grupo: 'Monitoreo', principal: true },
    { id: 'sugerido', label: 'Motor Sugeridos', corto: 'Sugerido', icon: RefreshCw, grupo: 'Monitoreo', principal: true },
    { id: 'carga_datos', label: 'Visor de Datos', corto: 'Datos', icon: Database, grupo: 'Datos', principal: true },
    { id: 'vademecum', label: 'Medicamentos', corto: 'Catálogo', icon: Pill, grupo: 'Datos' },
    GUIA,
  ],
  admin: [
    { id: 'dashboard', label: 'Dashboard', corto: 'Inicio', icon: LayoutDashboard, grupo: 'Operación', principal: true },
    { id: 'captura', label: 'Captura de Pedido (offline)', corto: 'Captura', icon: ClipboardPlus, grupo: 'Operación' },
    { id: 'nuevo_pedido', label: 'Toma de Pedidos (clásica)', corto: 'Clásica', icon: ShoppingCart, grupo: 'Operación' },
    { id: 'sugerido', label: 'Sugeridos', corto: 'Sugerido', icon: RefreshCw, grupo: 'Operación' },
    { id: 'mis_pedidos', label: 'Auditoría', corto: 'Auditoría', icon: ShoppingBag, grupo: 'Operación' },
    { id: 'teletransferencia', label: 'Teletransferencias', corto: 'Transfer.', icon: CheckCircle2, grupo: 'Teletransferencia', principal: true },
    { id: 'droguerias_csv', label: 'Layouts CSV', corto: 'Layouts', icon: Layers, grupo: 'Teletransferencia' },
    { id: 'carga_inventario', label: 'Carga Masiva', corto: 'Carga', icon: UploadCloud, grupo: 'Teletransferencia' },
    { id: 'carga_datos', label: 'Carga de Datos', corto: 'Datos', icon: Database, grupo: 'Administración', principal: true },
    { id: 'vademecum', label: 'Vademécum', corto: 'Catálogo', icon: Pill, grupo: 'Administración', principal: true },
    { id: 'usuarios', label: 'Gestión de Usuarios', corto: 'Usuarios', icon: Users, grupo: 'Administración' },
    { id: 'sql_script', label: 'Script SQL', corto: 'SQL', icon: Database, grupo: 'Administración' },
    GUIA,
  ],
};

export function tabsDelRol(rol: RolUsuario): TabDef[] {
  return TABS_POR_ROL[rol] ?? TABS_POR_ROL.admin;
}

/** Pestaña con la que arranca cada rol. */
export const TAB_INICIAL: Record<RolUsuario, string> = {
  vendedor: 'dashboard',
  teletransferencista: 'teletransferencia',
  gerente: 'dashboard',
  admin: 'dashboard',
};
