import { useState } from 'react';
import type { Usuario } from '../types/pharmacy';
import { PageHeader, Segmentado, Vacio } from '../components/ui/kit';
import { consumirSeccion } from './navegacion';
import { Fichero } from './datos/Fichero';
import { Pendientes } from './datos/Pendientes';
import { Farmacias } from './maestros/Farmacias';
import { Productos } from './maestros/Productos';
import { Droguerias } from './maestros/Droguerias';
import { Ventas } from './maestros/Ventas';

type Seccion = 'farmacias' | 'productos' | 'droguerias' | 'fichero' | 'pendientes' | 'ventas';
const SECCIONES = ['farmacias', 'productos', 'droguerias', 'fichero', 'pendientes', 'ventas'] as const;
const OPCIONES: { id: Seccion; texto: string }[] = [
  { id: 'farmacias', texto: 'Farmacias' },
  { id: 'productos', texto: 'Productos' },
  { id: 'droguerias', texto: 'Droguerías' },
  { id: 'fichero', texto: 'Fichero de vendedores' },
  { id: 'pendientes', texto: 'Homologación' },
  { id: 'ventas', texto: 'Ventas de droguerías' },
];

/**
 * Datos maestros (solo administrador). Cada sección busca, crea, edita, carga por archivo y elimina uno o varios
 * registros directamente en la nube. Orden sugerido para empezar: droguerías → productos → farmacias → fichero.
 */
export function DatosVista({ usuario, esDemo }: { usuario: Usuario; esDemo: boolean }) {
  const [seccion, setSeccion] = useState<Seccion>(() => consumirSeccion('datos', SECCIONES, 'farmacias'));
  if (usuario.rol !== 'admin') return <Vacio titulo="Solo para administradores" />;
  if (esDemo) return <Vacio titulo="Los datos maestros viven en la nube" texto="Conecta Supabase para cargar y editar farmacias, productos y droguerías." />;

  return (
    <div>
      <PageHeader titulo="Datos maestros" descripcion="Farmacias, productos, droguerías, ficheros, homologación y ventas." />
      <Segmentado opciones={OPCIONES} valor={seccion} onChange={setSeccion} />
      {seccion === 'farmacias' && <Farmacias />}
      {seccion === 'productos' && <Productos />}
      {seccion === 'droguerias' && <Droguerias />}
      {seccion === 'fichero' && <Fichero />}
      {seccion === 'pendientes' && <Pendientes />}
      {seccion === 'ventas' && <Ventas />}
    </div>
  );
}
