import type { RolUsuario } from '../../types/pharmacy';
import { Tarjeta } from '../../components/ui/kit';

const PASOS: Record<RolUsuario, { titulo: string; items: string[] }> = {
  vendedor: {
    titulo: 'Para vendedores',
    items: [
      'Inicio te muestra qué clientes llevan tiempo sin comprar. Toca "Pedido" junto a uno para empezar.',
      'Tomar pedido: elige la farmacia, busca los productos (o escanea el código) y toca "Enviar". Funciona sin señal: se envía solo al recuperar la conexión.',
      'Mis clientes: solo aparecen las farmacias de tu fichero, con su teléfono, ubicación y lo que más compran.',
      'Mis pedidos: mira en qué estado va cada uno. Si la droguería despacha solo una parte, aquí puedes re-rutear lo pendiente a otra droguería.',
    ],
  },
  teletransferencista: {
    titulo: 'Para transferencistas',
    items: [
      'Por procesar: abre un pedido, descarga el archivo con los códigos de la droguería y envíalo por su portal.',
      'Cuando la droguería responda, escribe cuántas unidades confirmó por producto y toca "Confirmar". Si no despachó algo, indica el motivo.',
      'Si el archivo no se puede descargar, el aviso dice qué falta (por ejemplo, un producto sin código en esa droguería).',
      'Clientes y Catálogo son de consulta: verás todas las farmacias, productos y droguerías.',
    ],
  },
  gerente: {
    titulo: 'Para gerencia',
    items: ['Resumen: pedidos del día y cuáles llevan tiempo esperando.', 'Reportes: pedidos con filtros (descargables a Excel), cumplimiento de cada droguería y alertas comerciales.', 'Clientes, Pedidos y Catálogo son de consulta.'],
  },
  admin: {
    titulo: 'Para administradores',
    items: [
      'Cargar y editar datos: sube droguerías, productos, farmacias y el historial de ventas desde archivos CSV.',
      'Fichero: asigna a cada vendedor las farmacias que atiende. Pendientes: relaciona lo que las droguerías reportan con tus farmacias y productos.',
      'Configuración → Usuarios: crea cuentas y define rol y equipo. Configuración → Base de datos: instalar el esquema y borrar datos de prueba.',
    ],
  },
};

const PREGUNTAS: { p: string; r: string }[] = [
  { p: 'Estoy sin señal, ¿pierdo lo que hago?', r: 'No. Todo se guarda en tu dispositivo y se envía solo cuando vuelva la conexión. El indicador de la barra superior muestra cuántos cambios esperan.' },
  { p: 'El indicador dice "Sesión vencida".', r: 'Ve a Configuración → Sincronización y toca "Volver a entrar". Tus pedidos no se pierden.' },
  { p: 'No veo un cliente o un pedido.', r: 'Un vendedor solo ve lo que tiene asignado. Si falta una farmacia, pídele a un administrador que la agregue a tu fichero.' },
  { p: 'Olvidé mi contraseña.', r: 'En la pantalla de inicio de sesión toca "Olvidé mi contraseña": te llega un enlace por correo.' },
];

/** Guía corta y por rol; el detalle vive en cada pantalla. */
export function Ayuda({ rol }: { rol: RolUsuario }) {
  const g = PASOS[rol];
  return (
    <div className="space-y-3">
      <Tarjeta>
        <h2 className="mb-2 text-sm font-bold">{g.titulo}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          {g.items.map((t) => <li key={t}>{t}</li>)}
        </ol>
      </Tarjeta>
      <Tarjeta className="!p-0">
        <h2 className="px-4 pt-3 text-sm font-bold">Preguntas frecuentes</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {PREGUNTAS.map((x) => (
            <details key={x.p} className="group px-4 py-2.5">
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">{x.p}</summary>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{x.r}</p>
            </details>
          ))}
        </div>
      </Tarjeta>
    </div>
  );
}
