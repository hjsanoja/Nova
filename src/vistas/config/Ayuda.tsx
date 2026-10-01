import type { RolUsuario } from '../../types/pharmacy';
import { PlayCircle } from 'lucide-react';
import { Boton, Tarjeta } from '../../components/ui/kit';
import { abrirGuia } from '../../components/guia/estadoGuia';

const PASOS: Record<RolUsuario, { titulo: string; items: string[] }> = {
  vendedor: {
    titulo: 'Para vendedores',
    items: [
      'Inicio: tus unidades y pedidos del mes, cuántas farmacias de tu fichero ya compraron y quiénes llevan tiempo sin comprar. Toca cualquier cifra o gráfico para ver los pedidos que la forman.',
      'Mi ruta: las farmacias a las que les toca visita, en un mapa y ordenadas por cercanía. Desde cada una: "Cómo llegar", "Registrar visita" (con tu GPS) o "Pedido".',
      'Nuevo pedido: elige la farmacia, agrega productos con sus unidades y la droguería; cada farmacia tiene su propio carrito. Puedes armar varios y enviarlos juntos con "Enviar todos". Funciona sin señal.',
      'Dictar: toca el micrófono y di la farmacia, la droguería, los productos y las unidades (por ejemplo "Farmacia La Paz por Cobeca, diez losartán 50 y cinco omeprazol"). Revisa la vista previa y confirma.',
      'Plantillas: termina el dictado con "guárdalo como plantilla semanal" (o usa "Guardar como plantilla" en el carrito). La próxima vez di "Farmacia La Paz, plantilla semanal" o tócala sobre el catálogo.',
      'Código de la farmacia: si la droguería elegida aún no tiene el número de cliente de esa farmacia, la app te lo pide una sola vez antes de enviar. Sin ese código la droguería no reconoce el pedido.',
      'Mis clientes: tus farmacias con su teléfono y ubicación. Con "Agregar farmacias" armas tu fichero.',
      'Farmacias en riesgo: NOVA aprende cada cuánto compra cada farmacia. Si una se atrasa mucho la marca como "Atrasada", "En riesgo" o "Perdida" (en el Inicio y en Mis clientes) para que la llames o le tomes pedido a tiempo.',
      'Descuentos: el catálogo marca los productos en oferta (por ejemplo "−10%") y el carrito aplica solo los descuentos por producto y por pedido. En el carrito puedes escribir tu propio % en cada producto; si supera lo autorizado, el pedido pasa por revisión de la mesa.',
      'Si ves el aviso "guardado solo en este teléfono", esos pedidos aún no llegaron a la nube: se envían solos con señal; no cierres sesión mientras tanto.',
      'Configuración → Avisos: activa los avisos para enterarte cuando tus pedidos se despachan o hay un comunicado nuevo.',
      'Mis pedidos: mira en qué estado va cada uno. Si la droguería despacha solo una parte, aquí puedes re-rutear lo pendiente a otra droguería.',
    ],
  },
  teletransferencista: {
    titulo: 'Para transferencistas',
    items: [
      'Por procesar: abre un pedido, descarga el archivo con los códigos de la droguería y envíalo por su portal. Si falta algo (farmacia sin código, producto sin código), el aviso rojo dice qué es; con productos sin código puedes descargar el archivo sin ellos.',
      'Cuando la droguería responda, escribe cuántas unidades confirmó por producto y toca "Confirmar". Si no despachó algo, indica el motivo.',
      'Si la droguería responde con un archivo (Excel o CSV): toca "Cargar respuesta" arriba en Por procesar, elige la droguería y el archivo. NOVA muestra cómo quedaría cada pedido (completo, parcial o sin despacho) y los confirmas todos juntos. Dentro de un pedido, "Llenar con el archivo de la droguería" escribe las cantidades para que las revises.',
      'Si el archivo no se puede descargar, el aviso dice qué falta (por ejemplo, un producto sin código en esa droguería). Si falta el código de la farmacia, escríbelo ahí mismo y queda guardado.',
      'Clientes y Catálogo son de consulta: verás todas las farmacias, productos y droguerías.',
    ],
  },
  gerente: {
    titulo: 'Para gerencia',
    items: [
      'Resumen: pedidos, unidades, promedios por día y por mes, farmacias con pedido, avance de metas y rankings de representantes, productos y droguerías.',
      'Metas: objetivos del mes por representante, farmacia o droguería (o combinados), en unidades, pedidos o farmacias con pedido.',
      'Alertas de metas: cada meta dice si va "En camino", necesita "Atención" o está "En riesgo" (la marca en la barra es lo esperado a hoy). Si va en riesgo, NOVA avisa al representante y a la gerencia una vez por semana; también avisa cuando se cumple.',
      'Comunicados: anuncios, descuentos o estrategias para todos o por rol, equipo, estado, ciudad o región. Aparecen arriba en la app de cada persona.',
      'Descuentos: por pedido (según productos distintos y unidades) o por producto (un % para productos elegidos, o para todos los productos desde un mínimo de unidades de cada uno).',
      'Reportes: pedidos (descargables a Excel), cumplimiento de cada droguería, alertas comerciales y accesos (quién entra y cuántas veces).',
    ],
  },
  admin: {
    titulo: 'Para administradores',
    items: [
      'Datos maestros: carga o edita droguerías, productos, farmacias y ventas. Marca uno o varios registros para borrarlos.',
      'Pedidos de prueba: en Pedidos marca los que quieras y toca "Eliminar"; para vaciar todos usa Configuración → Base de datos → Pedidos. Los teléfonos se limpian solos al sincronizar.',
      'Archivo de pedido de cada droguería: Datos maestros → Droguerías → toca la droguería → "Formatos de archivo". Arma las columnas, el separador y el nombre del archivo, con vista previa.',
      'Respuesta de la droguería: en "Formatos de archivo" → "Respuesta" indica qué columna trae el pedido, el producto y lo despachado (prueba con un archivo real). La mesa lo sube en Por procesar → "Cargar respuesta" y confirma varios pedidos de una vez.',
      'Fichero: asigna a cada vendedor las farmacias que atiende. Homologación: relaciona los códigos de cada droguería con tus farmacias y productos.',
      'Descuentos: por pedido (productos distintos y unidades, juntos o por separado) o por producto (lista de productos, o "Todos los productos" con un mínimo de unidades por producto: solo reciben el % los que llegan al mínimo).',
      'Configuración → Avisos: conecta una vez los avisos con la app cerrada (Edge Function "enviar-push") siguiendo los pasos de esa pantalla.',
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Guía de bienvenida</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">El recorrido paso a paso que viste al entrar por primera vez.</p>
          </div>
          <Boton variante="primario" icono={PlayCircle} onClick={abrirGuia}>Ver la guía</Boton>
        </div>
      </Tarjeta>
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
