import React, { useState } from 'react';
import { 
  BookOpen, 
  Mic, 
  Barcode, 
  Sparkles, 
  Layers, 
  Clock, 
  ShieldCheck, 
  User, 
  Database,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const UserGuideTab: React.FC = () => {
  const { esClaro } = useTheme();
  const [seccionActiva, setSeccionActiva] = useState<'vendedor' | 'transferencista' | 'admin' | 'sugerido' | 'ruta_real'>('ruta_real');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Cabecera del Manual */}
      <div className={`p-6 rounded-2xl border transition-all ${
        esClaro 
          ? 'bg-white border-slate-200 shadow-sm' 
          : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
              Guía Operativa & Manual de Uso
            </h2>
            <p className={`text-xs ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              Flujos paso a paso para la fuerza de ventas, teletransferencias y administración farmacéutica.
            </p>
          </div>
        </div>

        {/* Selector de Rol / Sección */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          {[
            { id: 'ruta_real', label: '★ Ruta de Pruebas & Datos Reales', icon: Database },
            { id: 'vendedor', label: '1. Vendedor en Campo (Móvil)', icon: User },
            { id: 'sugerido', label: '2. Motor de Sugerido Global', icon: Sparkles },
            { id: 'transferencista', label: '3. Teletransferencia & CSV', icon: Layers },
            { id: 'admin', label: '4. Administrador & Carga Masiva', icon: ShieldCheck },
          ].map((item) => {
            const Icon = item.icon;
            const activo = seccionActiva === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSeccionActiva(item.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activo
                    ? 'bg-teal-600 text-white shadow-sm'
                    : esClaro
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido según Sección Activa */}
      {seccionActiva === 'vendedor' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div className={`p-5 rounded-2xl border space-y-3 ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-sm">
              <Barcode className="w-5 h-5" />
              <span>Entrada con Código de Barras (Cámara)</span>
            </div>
            <p className={`text-xs leading-relaxed ${esClaro ? 'text-slate-600' : 'text-slate-300'}`}>
              Usa la cámara de tu teléfono para escanear medicamentos directamente en el anaquel de la farmacia:
            </p>
            <ol className={`text-xs space-y-2 list-decimal list-inside ${esClaro ? 'text-slate-600' : 'text-slate-300'}`}>
              <li>Abre <b>Toma de Pedido</b> y presiona el botón <b>"Escanear Barra/QR"</b>.</li>
              <li>Apunta al código EAN-13 del empaque o blíster.</li>
              <li>Al detectar el código, el sistema identifica el producto y sugiere la cantidad según su empaque mínimo (ej. cajas x10).</li>
              <li>Ajusta la cantidad deseada y confirma para agregarlo a la orden en 1 segundo.</li>
            </ol>
          </div>

          <div className={`p-5 rounded-2xl border space-y-3 ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
              <Mic className="w-5 h-5" />
              <span>Dictado por Voz en Lenguaje Natural</span>
            </div>
            <p className={`text-xs leading-relaxed ${esClaro ? 'text-slate-600' : 'text-slate-300'}`}>
              Toma pedidos manos libres hablando de manera cotidiana:
            </p>
            <div className={`p-3 rounded-xl text-xs font-mono border ${
              esClaro ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              "Agrégate 30 de Losartán con 15 de descuento y 20 de Atamel"
            </div>
            <p className={`text-xs ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              El motor semántico extrae automáticamente el medicamento por nombre o principio activo, las unidades numéricas y el descuento comercial permitido.
            </p>
          </div>

          <div className={`p-5 rounded-2xl border space-y-3 md:col-span-2 ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              <Clock className="w-5 h-5" />
              <span>Dashboard de Control & Días de Atraso</span>
            </div>
            <p className={`text-xs leading-relaxed ${esClaro ? 'text-slate-600' : 'text-slate-300'}`}>
              En la pestaña <b>Dashboard Vendedor</b> podrás monitorear el estado exacto de cada pedido:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className={`p-3 rounded-xl border text-xs ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className="font-bold text-amber-600 dark:text-amber-400 block mb-1">Pendientes de Envío</span>
                <span className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                  Órdenes recién transmitidas en espera de ser atendidas por teletransferencia.
                </span>
              </div>
              <div className={`p-3 rounded-xl border text-xs ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className="font-bold text-red-600 dark:text-red-400 block mb-1">Alerta de Atraso</span>
                <span className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                  Indica cuántos días lleva la droguería sin procesar la orden para que puedas gestionar prioridad.
                </span>
              </div>
              <div className={`p-3 rounded-xl border text-xs ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-1">Fill-Rate Reportado</span>
                <span className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                  Porcentaje de unidades confirmadas que realmente serán facturadas por la droguería.
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {seccionActiva === 'sugerido' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${
          esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-base">
            <Sparkles className="w-5 h-5" />
            <span>Cómo Funciona el Motor de Pedido Sugerido</span>
          </div>

          <p className={`text-xs leading-relaxed ${esClaro ? 'text-slate-600' : 'text-slate-300'}`}>
            El algoritmo analiza la demanda histórica consolidada del cliente sin segregar entre vendedores de Equipo A o Equipo B:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className={`p-4 rounded-xl border ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1">1. Ventana Histórica</h4>
              <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                Calcula la velocidad de consumo mensual proyectada dividiendo las compras de los últimos 30, 60 o 90 días.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1">2. Ponderación Estratégica</h4>
              <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                Los SKUs prioritarios reciben un multiplicador (ej. 1.40x) para impulsar su colocación y reposición en el punto de venta.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1">3. Redondeo a Empaque Mínimo</h4>
              <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                Ninguna recomendación queda en fracciones; se redondea siempre al múltiplo de embalaje de fábrica (cajas de 10, 12 o 20 unidades).
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1">4. Conversión con 1 Clic</h4>
              <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                Al presionar "Convertir a Pedido", todas las líneas seleccionadas pasan inmediatamente al borrador de despacho.
              </p>
            </div>
          </div>
        </div>
      )}

      {seccionActiva === 'transferencista' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${
          esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-base">
            <Layers className="w-5 h-5" />
            <span>Teletransferencia, Ajuste de Quiebres & Exportación CSV</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0">1</span>
              <div>
                <b className="text-slate-900 dark:text-white">Recepción de Pedidos:</b>
                <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                  En la "Cola de Teletransferencia" seleccionas el pedido transmitido por el vendedor de campo.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0">2</span>
              <div>
                <b className="text-slate-900 dark:text-white">Ajuste de Confirmadas vs Solicitadas:</b>
                <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                  Si la droguería tiene quiebre de stock en su centro de distribución, ajustas las unidades y seleccionas el motivo (ej. <i>Quiebre Almacén Droguería</i>). El Fill-Rate se actualiza instantáneamente.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0">3</span>
              <div>
                <b className="text-slate-900 dark:text-white">Exportación Dinámica del Archivo CSV:</b>
                <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                  Al presionar "Procesar y Descargar CSV", el motor genera en tu navegador el archivo con el layout exacto exigido por esa droguería (delimitador punto y coma, comas, o tabuladores).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {seccionActiva === 'ruta_real' && (
        <div className="space-y-5">
          {/* Tarjeta de Inicio Rápido */}
          <div className={`p-6 rounded-2xl border space-y-4 ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-base">
              <Database className="w-5 h-5" />
              <span>Ruta de Puesta en Marcha con Datos Reales (Supabase + Nova)</span>
            </div>
            <p className={`text-xs leading-relaxed ${esClaro ? 'text-slate-600' : 'text-slate-300'}`}>
              Sigue esta secuencia paso a paso para configurar tu entorno en la nube de Supabase (PostgreSQL y Auth gratuito) y alimentar el sistema con los datos maestros y transaccionales de tu operación:
            </p>

            <div className="space-y-4 pt-2">
              {/* Paso 1: Configurar Supabase */}
              <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-xl bg-teal-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  1
                </span>
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Crear Proyecto y Conectar Supabase
                  </h4>
                  <p className={esClaro ? 'text-slate-600' : 'text-slate-300'}>
                    Ve a <strong>supabase.com</strong>, crea una organización y un proyecto gratuito. Luego ve a <b>Project Settings &gt; API</b> y copia tu <b>Project URL</b> y tu clave pública <b>anon public key</b>.
                  </p>
                  <p className="text-teal-600 dark:text-teal-400 font-medium">
                    Haz clic en el botón superior <b>"Supabase (Configurar)"</b> en Nova, ingresa la URL y la Anon Key, y presiona "Guardar y Conectar".
                  </p>
                </div>
              </div>

              {/* Paso 2: Ejecutar el Script SQL */}
              <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  2
                </span>
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Ejecutar el Script SQL de Base de Datos
                  </h4>
                  <p className={esClaro ? 'text-slate-600' : 'text-slate-300'}>
                    Abre el módulo <b>"Script SQL"</b> en Nova y sigue los pasos en orden: en un proyecto nuevo solo el <b>esquema v3</b>; si ya tenías la versión anterior, primero <b>archivar</b> el esquema anterior, luego el esquema v3 y al final <b>migrar</b> los datos. Cada script se pega en Supabase &gt; <b>SQL Editor</b> y se ejecuta con <b>Run</b>.
                  </p>
                  <p className="text-indigo-600 dark:text-indigo-400 font-medium">
                    Crea las dimensiones (<code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">dim_clientes</code>, <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">dim_productos</code>, <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">dim_droguerias</code>), la homologación de cada droguería (<code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">map_cliente_drogueria</code>, <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">map_producto_drogueria</code>), las ventas reportadas (<code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">fact_ventas_drogueria</code>), los pedidos (<code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">fact_pedidos</code>, <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">fact_pedido_detalles</code>) y las reglas de seguridad RLS.
                  </p>
                </div>
              </div>

              {/* Paso 3: Carga de Tablas de Dimensiones */}
              <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  3
                </span>
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Carga de Tablas Maestras / Dimensiones (Clientes, Productos, Droguerías)
                  </h4>
                  <p className={esClaro ? 'text-slate-600' : 'text-slate-300'}>
                    Abre el módulo <b>"Carga de Datos"</b> (Data Import Studio):
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400">
                    <li><b>Clientes:</b> Descarga la plantilla CSV modelo, complétala con tus farmacias (RIF, Código, Razón Social, Cupo y Equipo asignado) y súbela con 1 clic.</li>
                    <li><b>Vademécum / Productos:</b> Sube el catálogo farmacéutico (SKU, EAN-13, Principio Activo, Precio de Lista, Empaque Mínimo y Equipo: La Santé, Comercial u OTC).</li>
                    <li><b>Droguerías:</b> Configura las droguerías aliadas y sus formatos de exportación CSV.</li>
                  </ul>
                </div>
              </div>

              {/* Paso 4: Carga del Histórico de Ventas */}
              <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  4
                </span>
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Carga del Histórico de Pedidos Previos (Motor de Sugerido)
                  </h4>
                  <p className={esClaro ? 'text-slate-600' : 'text-slate-300'}>
                    En la pestaña <b>"4. Histórico Previo"</b> dentro de <i>Carga de Datos</i>, sube el historial acumulado de ventas de los últimos 30, 60 o 90 días (sumando compras del cliente a todos los equipos).
                  </p>
                  <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Esto alimentará automáticamente el <b>Motor de Sugeridos Global</b> para calcular rotación mensual, reposición estimada y pedidos sugeridos inteligentes en campo.
                  </p>
                </div>
              </div>

              {/* Paso 5: Gestión de Usuarios y Accesos Segregados */}
              <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-xl bg-purple-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  5
                </span>
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Gestión de Usuarios y Roles Independientes
                  </h4>
                  <p className={esClaro ? 'text-slate-600' : 'text-slate-300'}>
                    Inicias como <strong>Hernando Sanoja (Admin / Dev)</strong> con control total. En el módulo <b>"Gestión Usuarios"</b>, puedes registrar los usuarios de tu equipo:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400">
                    <li><b>Gerentes:</b> Solo monitoreo y auditoría de pedidos.</li>
                    <li><b>Vendedores (La Santé, Comercial, OTC):</b> Cada uno con su portafolio y clientes únicos o coincidentes, toma de pedidos y motor de sugeridos.</li>
                    <li><b>Teletransferencistas:</b> Recepción de órdenes, generación de CSV por droguería y confirmación de unidades facturadas.</li>
                  </ul>
                  <p className="text-purple-600 dark:text-purple-400 font-medium mt-1">
                    Cada usuario inicia sesión con su propio correo y clave en Supabase Auth, asegurando independencia total.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {seccionActiva === 'admin' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${
          esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-base">
            <ShieldCheck className="w-5 h-5" />
            <span>Módulos de Administración & Carga de Droguerías</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className={`p-4 rounded-xl border ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1">Carga Masiva de Inventario</h4>
              <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                Sube archivos CSV de inventario por droguería para refrescar el stock disponible de cada proveedor farmacéutico.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1">Configuración Supabase</h4>
              <p className={esClaro ? 'text-slate-600' : 'text-slate-400'}>
                Permite conectar la base de datos PostgreSQL de Supabase en producción o alternar al modo Sandbox local.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
