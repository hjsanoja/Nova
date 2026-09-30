import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft, ArrowRight, BadgePercent, BarChart3, CheckCircle2, ClipboardList, Database, Download, Inbox, LayoutDashboard,
  PackageCheck, Route, Send, ShoppingCart, Sparkles, Truck, Users, WifiOff,
} from 'lucide-react';
import type { RolUsuario, Usuario } from '../../types/pharmacy';
import { Boton } from '../ui/kit';
import { VERSION, textoCreditos } from '../../version';

/**
 * Guía de bienvenida: se abre sola en el primer inicio de sesión de cada persona y se puede volver a ver desde
 * Configuración → Ayuda. Pocos pasos, frases cortas y el flujo de un pedido de principio a fin.
 */

interface Paso {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  puntos?: string[];
  /** Muestra el recorrido de un pedido (vendedor → mesa → droguería → resultado). */
  flujo?: boolean;
}

const NOMBRE_ROL: Record<RolUsuario, string> = { vendedor: 'vendedor', teletransferencista: 'transferencista (mesa)', gerente: 'gerente', admin: 'administrador' };

/** En qué paso del recorrido trabaja cada rol (gerencia y administración lo ven completo). */
const PASO_DEL_ROL: Record<RolUsuario, number | null> = { vendedor: 0, teletransferencista: 1, gerente: null, admin: null };

const FLUJO: { icono: LucideIcon; quien: string; que: string }[] = [
  { icono: ShoppingCart, quien: 'Vendedor', que: 'Toma el pedido en la farmacia o lo dicta.' },
  { icono: Inbox, quien: 'Mesa', que: 'Lo recibe y descarga el archivo de la droguería.' },
  { icono: Truck, quien: 'Droguería', que: 'Recibe el archivo y despacha.' },
  { icono: PackageCheck, quien: 'Resultado', que: 'Se registra lo despachado y el vendedor lo ve.' },
];

export function pasosDeLaGuia(usuario: Pick<Usuario, 'rol' | 'nombre_completo'>): Paso[] {
  const nombre = usuario.nombre_completo.trim().split(/\s+/)[0] || '';
  const inicio: Paso[] = [
    {
      icono: Sparkles,
      titulo: nombre ? `Te damos la bienvenida, ${nombre}` : 'Te damos la bienvenida',
      texto: `NOVA sirve para tomar pedidos de farmacias y hacerlos llegar a las droguerías. Entraste como ${NOMBRE_ROL[usuario.rol]}. En un minuto te mostramos lo esencial.`,
    },
    { icono: Route, titulo: 'Cómo viaja un pedido', texto: 'Cada pedido pasa por cuatro pasos. Lo resaltado es lo que haces tú.', flujo: true },
  ];
  const porRol: Record<RolUsuario, Paso[]> = {
    vendedor: [
      {
        icono: ShoppingCart,
        titulo: 'Tomar un pedido',
        texto: 'En Pedir eliges la farmacia, agregas productos, eliges la droguería y tocas Enviar.',
        puntos: ['Cada producto empieza en 1 unidad; cámbiala con + y −.', 'Con el micrófono puedes dictar el pedido completo.', 'La primera vez con una droguería te pide el código de la farmacia. Es solo una vez.'],
      },
      {
        icono: BadgePercent,
        titulo: 'Descuentos',
        texto: 'El carrito aplica solo los descuentos vigentes.',
        puntos: ['También puedes escribir tu % en cada producto.', 'Si pasa lo autorizado, la mesa lo revisa antes de enviarlo.'],
      },
      {
        icono: WifiOff,
        titulo: 'Sin señal también funciona',
        texto: 'Todo se guarda en el teléfono y se envía solo cuando vuelve la señal.',
        puntos: ['Un aviso amarillo te dice si algo falta por enviar.', 'No cierres sesión si tienes pedidos sin enviar.'],
      },
      {
        icono: ClipboardList,
        titulo: 'Sigue tus pedidos',
        texto: 'En Pedidos ves cada pedido con su hora y su estado.',
        puntos: ['Por procesar → Procesado → Facturado.', 'Si la droguería despachó menos, envías lo pendiente a otra droguería.', 'En Inicio ves tus números y metas del mes; en Ruta, las farmacias del día.'],
      },
    ],
    teletransferencista: [
      {
        icono: Inbox,
        titulo: 'Los pedidos te llegan solos',
        texto: 'En Por procesar aparecen los pedidos que envían los vendedores, del más antiguo al más nuevo.',
        puntos: ['Al abrir uno queda reservado para ti mientras lo trabajas.', 'En revisión están los que tienen descuentos altos o farmacias por validar.'],
      },
      {
        icono: Download,
        titulo: 'Descarga el archivo',
        texto: 'Cada pedido trae el archivo con los códigos de su droguería. Súbelo en el portal de la droguería.',
        puntos: ['Si falta un código, el aviso rojo dice cuál.', 'Puedes descargarlo sin los productos que no tienen código.'],
      },
      {
        icono: CheckCircle2,
        titulo: 'Registra lo despachado',
        texto: 'Escribe cuántas unidades despachó la droguería y el número de factura.',
        puntos: ['Si faltó algo, elige el motivo.', 'El vendedor ve el resultado al momento.'],
      },
    ],
    gerente: [
      { icono: LayoutDashboard, titulo: 'Tu resumen', texto: 'En Inicio ves pedidos, unidades y promedios del equipo.', puntos: ['Toca cualquier número o gráfico para ver los pedidos que lo forman.'] },
      { icono: BarChart3, titulo: 'Reportes y metas', texto: 'En Reportes: pedidos, cumplimiento de las droguerías y accesos.', puntos: ['En Metas defines objetivos por representante, farmacia o droguería.', 'En Comunicados envías avisos a los equipos.'] },
    ],
    admin: [
      { icono: Database, titulo: 'Datos maestros', texto: 'Carga desde Excel las farmacias, los productos, las droguerías y sus códigos en cada droguería.', puntos: ['Lo que falta por homologar aparece en Pendientes.'] },
      { icono: Users, titulo: 'Usuarios', texto: 'En Configuración → Usuarios creas cuentas y asignas rol y equipo.', puntos: ['En Reportes → Accesos ves quién entra y con qué versión de la app.'] },
      { icono: Send, titulo: 'Descuentos, metas y comunicados', texto: 'Define descuentos por pedido o por producto, metas del mes y avisos para los equipos.' },
      { icono: LayoutDashboard, titulo: 'Todo se puede revisar', texto: 'Toca cualquier cifra o gráfico del Resumen para ver los pedidos que la forman.' },
    ],
  };
  const fin: Paso = {
    icono: CheckCircle2,
    titulo: '¡Listo!',
    texto: 'Si tienes dudas, la ayuda y esta guía están en Configuración → Ayuda.',
    puntos: [`En el menú, toca "NOVA v${VERSION}" para ver qué trae cada versión.`],
  };
  return [...inicio, ...(porRol[usuario.rol] ?? porRol.vendedor), fin];
}

function Flujo({ rol }: { rol: RolUsuario }) {
  const mio = PASO_DEL_ROL[rol];
  return (
    <ol className="mt-4 grid gap-2 sm:grid-cols-4" aria-label="Recorrido de un pedido">
      {FLUJO.map((f, i) => {
        const Icono = f.icono;
        const resaltado = mio === i;
        return (
          <li key={f.quien} className={`flex items-center gap-3 rounded-xl border p-3 sm:flex-col sm:items-start sm:gap-2 ${resaltado ? 'border-marca-600 bg-marca-50 dark:border-marca-400 dark:bg-marca-950' : 'border-slate-200 dark:border-slate-800'}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${resaltado ? 'bg-marca-700 text-white dark:bg-marca-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              <Icono className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-500">{i + 1}. {f.quien}{resaltado ? ' · tú' : ''}</span>
              <span className="block text-sm text-slate-800 dark:text-slate-100">{f.que}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function GuiaBienvenida({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const pasos = pasosDeLaGuia(usuario);
  const [i, setI] = useState(0);
  const paso = pasos[i];
  const ultimo = i === pasos.length - 1;
  const Icono = paso.icono;

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(pasos.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [onCerrar, pasos.length]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="guia-titulo" aria-describedby="guia-texto" className="animate-in flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:border dark:border-slate-700 dark:bg-slate-900 sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500">Guía rápida · paso {i + 1} de {pasos.length}</span>
          <button type="button" onClick={onCerrar} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white">
            Saltar guía
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-marca-50 text-marca-700 dark:bg-marca-950 dark:text-marca-300">
            <Icono className="h-6 w-6" aria-hidden />
          </span>
          <h2 id="guia-titulo" className="mt-3 text-xl font-bold text-slate-900 dark:text-white">{paso.titulo}</h2>
          <p id="guia-texto" className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{paso.texto}</p>
          {paso.puntos && (
            <ul className="mt-3 space-y-1.5">
              {paso.puntos.map((p) => (
                <li key={p} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-marca-600 dark:text-marca-400" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          {paso.flujo && <Flujo rol={usuario.rol} />}
          {ultimo && <p className="mt-5 text-xs text-slate-500">NOVA v{VERSION} · {textoCreditos()}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 pb-safe dark:border-slate-800">
          <div className="flex gap-1.5" aria-hidden>
            {pasos.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-marca-600' : 'w-1.5 bg-slate-300 dark:bg-slate-700'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && <Boton icono={ArrowLeft} onClick={() => setI(i - 1)}>Atrás</Boton>}
            {ultimo ? (
              <Boton variante="primario" onClick={onCerrar} autoFocus>Empezar</Boton>
            ) : (
              <Boton variante="primario" onClick={() => setI(i + 1)} autoFocus>
                Siguiente <ArrowRight className="h-4 w-4" aria-hidden />
              </Boton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
