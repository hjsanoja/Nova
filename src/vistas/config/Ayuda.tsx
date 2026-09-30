import type { RolUsuario } from '../../types/pharmacy';
import { Tarjeta } from '../../components/ui/kit';

const PASOS: Record<RolUsuario, { titulo: string; items: string[] }> = {
  vendedor: {
    titulo: 'Para vendedores',
    items: [
      'Inicio: tus unidades y pedidos del mes, cuántas farmacias de tu fichero ya compraron y quiénes llevan tiempo sin comprar.',
      'Nuevo pedido: elige la farmacia, agrega productos con sus unidades y la droguería; cada farmacia tiene su propio carrito. Puedes armar varios y enviarlos juntos con "Enviar todos". Funciona sin señal.',
      'Dictar: toca el micrófono y di la farmacia, los productos y las unidades (por ejemplo "Farmacia La Paz, diez losartán 50 y cinco omeprazol"). Revisa la vista previa y confirma.',
      'Mis clientes: tus farmacias con su teléfono y ubicación. Con "Agregar farmacias" armas tu fichero.',
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
    items: ['Resumen: unidades y pedidos del mes con su variación, unidades por día, ranking de vendedores, productos y droguerías.', 'Condiciones comerciales: descuento, mínimo de productos distintos y mínimo de unidades por pedido.', 'Reportes: pedidos con filtros (descargables a Excel), cumplimiento de cada droguería y alertas comerciales.', 'Clientes, Pedidos y Catálogo son de consulta.'],
  },
  admin: {
    titulo: 'Para administradores',
    items: [
      'Datos maestros: carga o edita droguerías, productos, farmacias y ventas. Marca uno o varios registros para borrarlos.',
      'Fichero: asigna a cada vendedor las farmacias que atiende. Homologación: relaciona los códigos de cada droguería con tus farmacias y productos.',
      'Condiciones comerciales: define el % de descuento y sus requisitos (productos distintos y unidades del pedido), juntos o por separado.',
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
