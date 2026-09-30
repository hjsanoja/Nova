import type { RolUsuario } from '../../types/pharmacy';
import { Tarjeta } from '../../components/ui/kit';

const PASOS: Record<RolUsuario, { titulo: string; items: string[] }> = {
  vendedor: {
    titulo: 'Para vendedores',
    items: [
      'Inicio: tus unidades y pedidos del mes, cuántas farmacias de tu fichero ya compraron y quiénes llevan tiempo sin comprar.',
      'Nuevo pedido: elige la farmacia, agrega productos con sus unidades y la droguería; cada farmacia tiene su propio carrito. Puedes armar varios y enviarlos juntos con "Enviar todos". Funciona sin señal.',
      'Dictar: toca el micrófono y di la farmacia, la droguería, los productos y las unidades (por ejemplo "Farmacia La Paz por Cobeca, diez losartán 50 y cinco omeprazol"). Revisa la vista previa y confirma.',
      'Plantillas: termina el dictado con "guárdalo como plantilla semanal" (o usa "Guardar como plantilla" en el carrito). La próxima vez di "Farmacia La Paz, plantilla semanal" o tócala sobre el catálogo.',
      'Código de la farmacia: si la droguería elegida aún no tiene el número de cliente de esa farmacia, la app te lo pide una sola vez antes de enviar. Sin ese código la droguería no reconoce el pedido.',
      'Mis clientes: tus farmacias con su teléfono y ubicación. Con "Agregar farmacias" armas tu fichero.',
      'Mis pedidos: mira en qué estado va cada uno. Si la droguería despacha solo una parte, aquí puedes re-rutear lo pendiente a otra droguería.',
    ],
  },
  teletransferencista: {
    titulo: 'Para transferencistas',
    items: [
      'Por procesar: abre un pedido, descarga el archivo con los códigos de la droguería y envíalo por su portal.',
      'Cuando la droguería responda, escribe cuántas unidades confirmó por producto y toca "Confirmar". Si no despachó algo, indica el motivo.',
      'Si el archivo no se puede descargar, el aviso dice qué falta (por ejemplo, un producto sin código en esa droguería). Si falta el código de la farmacia, escríbelo ahí mismo y queda guardado.',
      'Clientes y Catálogo son de consulta: verás todas las farmacias, productos y droguerías.',
    ],
  },
  gerente: {
    titulo: 'Para gerencia',
    items: [
      'Resumen: pedidos, unidades, promedios por día y por mes, farmacias con pedido, avance de metas y rankings de representantes, productos y droguerías.',
      'Metas: objetivos del mes por representante, farmacia o droguería (o combinados), en unidades, pedidos o farmacias con pedido.',
      'Comunicados: anuncios, descuentos o estrategias para todos o por rol, equipo, estado, ciudad o región. Aparecen arriba en la app de cada persona.',
      'Condiciones comerciales: descuento, mínimo de productos distintos y mínimo de unidades por pedido.',
      'Reportes: pedidos (descargables a Excel), cumplimiento de cada droguería, alertas comerciales y accesos (quién entra y cuántas veces).',
    ],
  },
  admin: {
    titulo: 'Para administradores',
    items: [
      'Datos maestros: carga o edita droguerías, productos, farmacias y ventas. Marca uno o varios registros para borrarlos.',
      'Archivo de pedido de cada droguería: Datos maestros → Droguerías → toca la droguería → "Formato del archivo de pedido". Arma las columnas, el separador y el nombre del archivo, con vista previa.',
      'Fichero: asigna a cada vendedor las farmacias que atiende. Homologación: relaciona los códigos de cada droguería con tus farmacias y productos.',
      'Condiciones comerciales: define el % de descuento y sus requisitos (productos distintos y unidades del pedido), juntos o por separado.',
      'Configuración → Usuarios: crea cuentas, define rol, equipo y zona (región, estado, ciudad). Configuración → Sincronización: copia el enlace con la conexión ya puesta para compartir la app.',
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
