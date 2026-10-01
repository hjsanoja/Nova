import { useState } from 'react';
import { Check, KeyRound, LogOut, Palette } from 'lucide-react';
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
import { EstadoVersiones, ListaNovedades } from '../../components/version/Version';
import { useVersionPublicada } from '../../pwa/versionPublicada';
import { useTheme } from '../../context/ThemeContext';
import type { Paleta } from '../../context/ThemeContext';

type Seccion = 'cuenta' | 'avisos' | 'sincronizacion' | 'usuarios' | 'basedatos' | 'ayuda' | 'acerca';
const SECCIONES = ['cuenta', 'avisos', 'sincronizacion', 'usuarios', 'basedatos', 'ayuda', 'acerca'] as const;

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
    { id: 'acerca' as const, texto: 'Acerca de' },
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
      {seccion === 'acerca' && <AcercaDe />}
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

      <Apariencia />

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

/** Versión en uso y publicada, quienes hacen NOVA y el historial de versiones. */
function AcercaDe() {
  const { publicada, hayNueva } = useVersionPublicada();
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Tarjeta className="self-start">
        <p className="mb-3 text-sm font-bold">NOVA · Comercial & Teletransferencia</p>
        <EstadoVersiones publicada={publicada} hayNueva={hayNueva} />
      </Tarjeta>
      <Tarjeta>
        <p className="mb-3 text-sm font-bold">Historial de versiones</p>
        <p className="mb-3 text-xs text-slate-500">Cada actualización publicada tiene su número: los ajustes suben un decimal (v6.1 → v6.2) y los cambios grandes pasan al siguiente número (v6.2 → v7.0).</p>
        <ListaNovedades publicada={publicada} />
      </Tarjeta>
    </div>
  );
}

const PALETAS: { id: Paleta; nombre: string; nota: string; muestra: string[] }[] = [
  { id: 'bosque', nombre: 'Bosque', nota: 'Predeterminado desde la v8.0', muestra: ['#0b4628', '#137a3e', '#86e3a4'] },
  { id: 'azul', nombre: 'Azul', nota: 'El de la v7.0', muestra: ['#1e53bc', '#2a66db', '#c6dafe'] },
  { id: 'clasica', nombre: 'Verde azulado', nota: 'El de las primeras versiones', muestra: ['#0f766e', '#0d9488', '#99f6e4'] },
];

/** Tema claro/oscuro y color principal de la app (se guarda en este equipo). */
function Apariencia() {
  const { esClaro, toggleTema, paleta, setPaleta } = useTheme();
  return (
    <Tarjeta>
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><Palette className="h-4 w-4" /> Apariencia</p>
      <p className="mb-1.5 text-xs font-medium text-slate-500">Tema</p>
      <Segmentado valor={esClaro ? 'claro' : 'oscuro'} onChange={(v) => (v === 'claro') !== esClaro && toggleTema()} opciones={[{ id: 'claro', texto: 'Claro' }, { id: 'oscuro', texto: 'Oscuro' }]} />
      <p className="mb-1.5 text-xs font-medium text-slate-500">Color de la app</p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Color de la app">
        {PALETAS.map((p) => {
          const activa = paleta === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setPaleta(p.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left ${activa ? 'border-marca-600 bg-marca-50 dark:border-marca-400 dark:bg-marca-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
            >
              <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                {p.muestra.map((c) => <span key={c} className="h-6 w-6 rounded-full border-2 border-white dark:border-slate-900" style={{ background: c }} />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{p.nombre}</span>
                <span className="block text-xs text-slate-500">{p.nota}</span>
              </span>
              {activa && <Check className="h-4 w-4 shrink-0 text-marca-700 dark:text-marca-300" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Se guarda en este equipo. Los estados (completo, en revisión, rechazado) conservan siempre su color.</p>
    </Tarjeta>
  );
}
