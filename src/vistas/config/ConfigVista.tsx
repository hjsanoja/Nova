import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import type { Usuario } from '../../types/pharmacy';
import { cambiarPasswordNube } from '../../services/sesion';
import { Boton, Etiqueta, PageHeader, Segmentado, Tarjeta, estiloInput, useAviso } from '../../components/ui/kit';
import { consumirSeccion, irASeccion } from '../navegacion';
import { Ayuda } from './Ayuda';
import { BorradoDatos } from './BorradoDatos';
import { Sincronizacion } from './Sincronizacion';
import { AvisosConfig } from '../../avisos/AvisosConfig';
import { Usuarios } from './Usuarios';
import { InstalarBaseDatos } from './InstalarBaseDatos';

type Seccion = 'cuenta' | 'avisos' | 'sincronizacion' | 'usuarios' | 'basedatos' | 'ayuda';
const SECCIONES = ['cuenta', 'avisos', 'sincronizacion', 'usuarios', 'basedatos', 'ayuda'] as const;

const ETIQUETA_ROL: Record<Usuario['rol'], string> = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', teletransferencista: 'Transferencista' };

interface Props {
  usuario: Usuario;
  irATab: (tab: string) => void;
  esDemo: boolean;
  onCerrarSesion: () => void;
  onConexionCambiada: () => void;
  onUsuarioActualizado: (u: Usuario) => void;
}

/** Cuenta, sincronización, usuarios, base de datos y ayuda: lo que no es del trabajo diario vive aquí. */
export function ConfigVista({ usuario, irATab, esDemo, onCerrarSesion, onConexionCambiada }: Props) {
  const esAdmin = usuario.rol === 'admin';
  const [seccion, setSeccion] = useState<Seccion>(() => consumirSeccion('config', SECCIONES, 'cuenta'));
  const opciones = [
    { id: 'cuenta' as const, texto: 'Mi cuenta' },
    { id: 'avisos' as const, texto: 'Avisos' },
    { id: 'sincronizacion' as const, texto: 'Sincronización' },
    ...(esAdmin ? [{ id: 'usuarios' as const, texto: 'Usuarios' }, { id: 'basedatos' as const, texto: 'Base de datos' }] : []),
    { id: 'ayuda' as const, texto: 'Ayuda' },
  ];

  return (
    <div>
      <PageHeader titulo="Configuración" />
      <Segmentado opciones={opciones} valor={seccion} onChange={setSeccion} />
      {seccion === 'cuenta' && <Cuenta usuario={usuario} esDemo={esDemo} onCerrarSesion={onCerrarSesion} />}
      {seccion === 'avisos' && <AvisosConfig esAdmin={esAdmin} esDemo={esDemo} />}
      {seccion === 'sincronizacion' && <Sincronizacion esDemo={esDemo} esAdmin={esAdmin} onCerrarSesion={onCerrarSesion} onConexionCambiada={onConexionCambiada} />}
      {seccion === 'usuarios' && esAdmin && <Usuarios yo={usuario} onFichero={() => irASeccion(irATab, 'datos', 'fichero')} />}
      {seccion === 'basedatos' && esAdmin && (
        <div className="space-y-3">
          <BorradoDatos />
          <InstalarBaseDatos />
        </div>
      )}
      {seccion === 'ayuda' && <Ayuda rol={usuario.rol} />}
    </div>
  );
}

function Cuenta({ usuario, esDemo, onCerrarSesion }: { usuario: Usuario; esDemo: boolean; onCerrarSesion: () => void }) {
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const { mostrar, nodo } = useAviso();

  const cambiar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nueva !== repetida) return mostrar({ tipo: 'error', texto: 'Las dos contraseñas no coinciden.' });
    setOcupado(true);
    try {
      await cambiarPasswordNube(nueva);
      setNueva('');
      setRepetida('');
      mostrar({ tipo: 'ok', texto: 'Contraseña actualizada.' });
    } catch (err) {
      mostrar({ tipo: 'error', texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {nodo}
      <Tarjeta>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marca-700 text-lg font-bold text-white">{usuario.nombre_completo.charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate font-bold">{usuario.nombre_completo}</p>
            <p className="truncate text-xs text-slate-500">{usuario.email}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Etiqueta tono="teal">{ETIQUETA_ROL[usuario.rol]}</Etiqueta>
          {usuario.equipo !== 'TODOS' && <Etiqueta>Equipo {usuario.equipo}</Etiqueta>}
          {esDemo && <Etiqueta tono="ambar">Demostración</Etiqueta>}
        </div>
        <Boton className="mt-4" icono={LogOut} onClick={onCerrarSesion}>Cerrar sesión</Boton>
      </Tarjeta>

      {!esDemo && (
        <Tarjeta>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><KeyRound className="h-4 w-4" /> Cambiar contraseña</p>
          <form onSubmit={cambiar} className="space-y-2">
            <input type="password" autoComplete="new-password" required minLength={6} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva contraseña" aria-label="Nueva contraseña" className={estiloInput} />
            <input type="password" autoComplete="new-password" required minLength={6} value={repetida} onChange={(e) => setRepetida(e.target.value)} placeholder="Repite la contraseña" aria-label="Repite la contraseña" className={estiloInput} />
            <Boton type="submit" variante="primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar contraseña'}</Boton>
          </form>
        </Tarjeta>
      )}
    </div>
  );
}
