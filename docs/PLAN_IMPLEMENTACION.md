# Plan de implementación — NOVA v8 en adelante

Cada fase es un PR con su propia versión (regla de `CLAUDE.md`). Los números de versión son estimados:
si una fase se parte en dos PR, cada uno sube su versión.

| Fase | Versión | Qué trae | ¿Cambia el SQL? |
|------|---------|----------|-----------------|
| 1 | v8.0 | Diseño nuevo «Bosque» | No |
| 2 ✅ | v9.0 | Respuesta de la droguería por archivo · Metas con alertas · Farmacias en riesgo | Sí |
| 3 | v10.0 | CRM: Ficha 360° · Tareas y recordatorios · Visitas con reporte (farmacias y médicos, visitador mixto) · Registro de cambios | Sí |
| 4 | v11.0 | Automatizaciones · WhatsApp · Monitoreo de errores y respaldo · Robustez de la base | Sí |
| 5 | v12.0 (experimental) | Laboratorio de precios e inventario por droguería (solo administrador) | Sí |

---

## Fase 1 — Diseño «Bosque» (v8.0) ✅

1. **Colores y letra:**
   - Verde bosque `#0b4628` como color principal, con acento verde claro.
   - Letra Plus Jakarta Sans.
   - Tarjetas con bordes redondeados de 16 px y sombras suaves.
   - Las paletas Azul (v7.0) y Verde azulado se pueden elegir en **Configuración → Mi cuenta**.
2. **Menú lateral completo:**
   - Logo y botón «Tomar pedido».
   - Grupos con título.
   - Tarjeta del usuario con su rol, la versión y los créditos.
3. **Barra superior:**
   - Muestra el nombre del módulo abierto.
   - Avatar de la cuenta.
4. **Teléfono:** la barra inferior es translúcida.
5. **Inicio:**
   - Banner verde con el resumen del mes y accesos rápidos.
   - Indicadores con mini gráfico de los últimos 14 días.
   - Gráfico de barras por día con línea del promedio de 7 días, con selector Pedidos / Unidades.
   - Tabla de últimos pedidos, que en el teléfono se muestra como tarjetas.
   - Centro de avisos.
   - Columna derecha con metas y droguerías.
6. **Estados:** se muestran como píldoras con punto de color, en todas las listas.
7. **Créditos:** Hernando Sanoja (Responsable) · Dubralis Fajardo (Responsable).

---

## Fase 2 — Operación diaria (v9.0) ✅

### 2.1 Respuesta de la droguería por archivo
1. La mesa toca **Por procesar → Cargar respuesta**, elige la droguería y sube el Excel (.xlsx) o CSV que devolvió.
2. NOVA busca sola la fila de títulos y las columnas (pedido, código del producto, despachado o faltante, motivo, factura).
   - Cada pedido se ubica por su número (PED-1045, o solo 1045) o, si el archivo no lo trae, por la cuenta de la farmacia.
   - Cada producto se ubica por el código de la droguería, el código de barras o el código interno.
3. Vista previa: cada pedido con su estado final (completo, parcial o sin despacho), los productos que no vinieron y las filas que no se pudieron ubicar (no se pierden: se listan para revisarlas a mano).
4. «Confirmar N pedidos» toma, confirma y libera cada pedido con las mismas funciones de siempre. Los avisos al vendedor salen igual que al confirmar a mano.
5. Dentro de un pedido, «Llenar con el archivo de la droguería» solo escribe las cantidades: la persona revisa y confirma.
6. El formato de respuesta de cada droguería se guarda en **Datos maestros → Droguerías → Formatos de archivo → Respuesta** (con prueba en vivo usando un archivo real).
   - Se guarda dentro del formato de la droguería (`formato_export.respuesta`), así que no necesitó tabla nueva.
   - El Excel antiguo (.xls) no se lee: se pide guardarlo como .xlsx o CSV.

### 2.2 Metas con alertas
1. Cada meta muestra su nivel con texto (nunca solo color): **En camino** (95 % o más de lo esperado a hoy), **Atención** (80–95 %), **En riesgo** (menos de 80 %), **Cumplida**, **No se cumplió** y **Inicio de mes** (los 3 primeros días no se juzga).
2. La barra tiene una marca con lo esperado a hoy.
3. **Avisos** (en la app y al teléfono):
   - meta en riesgo: al representante y a la gerencia/administración, una vez por semana;
   - meta cumplida: una sola vez.
   - La revisión la pide la app al abrir el Inicio (una vez al día) y, si el proyecto tiene pg_cron, corre sola a las 8:00.
4. **Base de datos:** `app.avance_metas`, `revisar_metas()` y la columna `notificaciones.clave` (evita avisos repetidos).

### 2.3 Farmacias en riesgo
1. Ciclo de compra de cada farmacia: la frecuencia de su ficha o, si no tiene, la mediana de días entre sus compras del último año (entre 7 y 60 días).
2. Niveles: **Al día** · **Atrasada** (1,5 ciclos sin comprar) · **En riesgo** (2 ciclos o más de 45 días) · **Perdida** (más de 90 días).
3. Se ve en el Inicio (tarjeta con pestañas por nivel, llamar y tomar pedido) y en **Mis clientes** (filtro por nivel y la línea de riesgo en la ficha).
4. Con conexión usa `historial_compra_farmacias()` (pedidos de NOVA + compras reportadas por las droguerías); sin conexión calcula lo mismo con los datos del equipo.

---

## Fase 3 — CRM (v10.0)

### 3.1 Ficha 360° del cliente
1. **Pantalla única por farmacia, con:**
   - datos y códigos por droguería;
   - pedidos y unidades por mes (gráfico);
   - productos que más compra;
   - productos que dejó de comprar;
   - condiciones comerciales vigentes;
   - visitas, tareas y notas;
   - estado de riesgo (fase 2.3).
2. **Desde dónde se abre:** Clientes, Pedidos, Ruta del día y la búsqueda general.
3. Se usa el mismo diseño de tarjetas «Bosque», con pestañas: Resumen · Pedidos · Visitas · Tareas · Notas.

### 3.2 Tareas y recordatorios
1. Tabla `crm_tareas`, con estos datos:
   - título y fecha de vencimiento;
   - responsable y estado (pendiente / hecha / cancelada);
   - a quién se refiere: farmacia o médico;
   - nota.
2. Pantalla «Mis tareas» con grupos **Vencidas · Hoy · Próximas**. Se marca hecha con un toque.
3. Recordatorio en el teléfono el día que vence, con los avisos que ya existen.
4. Se pueden crear desde la ficha 360°, desde una visita o desde «Farmacias en riesgo».
5. Funciona sin internet, con Dexie y la cola de envío, igual que los pedidos.

### 3.3 Visitas con reporte (farmacias y **médicos**)
1. **Maestro nuevo `dim_medicos`:**
   - nombre y especialidad;
   - centro o consultorio y zona;
   - representante asignado.
   - Se importa por Excel, como los demás maestros.
2. Tabla `crm_visitas`, con estos datos:
   - fecha y hora, y ubicación GPS (ya existe en la Ruta del día);
   - a quién se visitó: farmacia o médico;
   - objetivo, resultado y productos presentados;
   - muestras entregadas (producto + cantidad);
   - próxima acción, que crea una tarea automáticamente.
3. Formulario corto pensado para el teléfono. Se puede dictar la nota.
4. **Reportes de visitas:**
   - visitas por representante y por semana;
   - cobertura (médicos visitados contra asignados);
   - muestras entregadas.
5. **Visitador mixto** (confirmado por Hernando): el mismo representante visita médicos **y** toma pedidos en farmacias.
   - No hace falta un rol nuevo: el vendedor gana la cartera de médicos además de su fichero de farmacias.
   - La ruta del día y los reportes mezclan las dos visitas (farmacia y médico), con el pedido como resultado posible de la visita a farmacia.

### 3.4 Registro de cambios (auditoría)
1. **Trigger genérico `app.auditar()`:**
   - guarda en `registro_cambios` quién, cuándo, la tabla, el registro y el antes/después (solo los campos que cambiaron);
   - se aplica a pedidos, clientes, condiciones comerciales, metas, usuarios y formatos.
2. **Dónde se ve:** pantalla para el administrador con filtros (fecha, usuario, tabla) y el historial dentro de cada ficha.
3. **Limpieza:** los registros de más de 18 meses se borran solos.

---

## Fase 4 — Automatización y confiabilidad (v11.0)

### 4.1 Automatizaciones
Reglas simples que el administrador activa o desactiva. Primero vienen las reglas fijas; el editor libre queda para después.

1. Pedido parcial → crear tarea al vendedor: «Ofrecer reemplazo».
2. Farmacia pasa a «En riesgo» → tarea de visita o llamada.
3. Meta «En riesgo» a mitad de mes → aviso al responsable del equipo.
4. Pedido sin procesar después de X horas → aviso a la mesa.
5. Visita con «próxima acción» → tarea con fecha.

Se ejecutan en la base (triggers y `pg_cron` de Supabase) para que funcionen aunque nadie tenga la app abierta.

### 4.2 WhatsApp
1. **Paso 1, sin costo:** botones que abren WhatsApp con el mensaje ya escrito (enlace `wa.me`). No envía nada solo; la persona revisa y envía. Sirve para:
   - confirmar un pedido;
   - avisar faltantes;
   - recordar a una farmacia en riesgo.
2. **Paso 2, a evaluar juntos:** WhatsApp Business API, para enviar mensajes automáticos. Requiere:
   - cuenta de empresa verificada en Meta;
   - plantillas aprobadas;
   - un costo por conversación.
   - Solo se haría si el paso 1 se usa mucho.

### 4.3 Monitoreo de errores y respaldo
1. **Errores:**
   - la app registra sus errores (sin datos personales) en una tabla `registro_errores`, con versión, pantalla y equipo;
   - el administrador los ve en Reportes;
   - si aumentan después de publicar una versión, aparece una alerta.
2. **Respaldo:**
   - botón del administrador «Descargar respaldo», que baja un Excel con todas las tablas maestras y los pedidos del período;
   - recordatorio mensual para descargarlo.
   - Supabase también guarda copias diarias (plan Pro) y eso se documenta.
3. **Estado de sincronización por equipo:** última subida, pendientes en cola, versión. Así se ve quién tiene pedidos sin enviar.

### 4.4 Robustez de la base de datos
1. **Revisión de índices:**
   - en las consultas más usadas, por fecha, vendedor y droguería;
   - en las claves que usa la sincronización.
2. **Restricciones `CHECK` que faltan:**
   - unidades > 0;
   - porcentajes entre 0 y 100;
   - fechas coherentes.
3. **Bloqueo y versión por fila:** en todas las tablas editables (ya existe en pedidos), para que dos personas no se pisen.
4. **Pruebas SQL de carga:** 50.000 pedidos, para medir que Inicio y Reportes sigan rápidos.
5. **Archivo de pedidos viejos:** los pedidos de más de 24 meses pasan a una tabla de histórico, para que la app no los descargue.

---

## Fase 5 — Laboratorio de precios e inventario (experimental, solo administrador)

Cada droguería manda su inventario y sus precios en un formato distinto. En lugar de adivinar, se arma un
**laboratorio** donde el administrador prueba y pule cada formato antes de que lo vea el resto del equipo.

1. **Módulo «Laboratorio»:**
   - visible solo para el administrador, con la etiqueta *Experimental*;
   - se activa en Configuración.
2. **Perfil de archivo por droguería:**
   - tipo de archivo (Excel, CSV, TXT de ancho fijo);
   - hoja, fila de encabezado y separador decimal;
   - columnas: código de la droguería, código propio, descripción, existencia, precio, precio con descuento, IVA, moneda, fecha de vigencia.
   - Se guarda con versión: si la droguería cambia el formato, se crea un perfil nuevo sin perder el anterior.
3. **Asistente de carga:**
   1. Subir el archivo.
   2. NOVA adivina las columnas por el nombre.
   3. El administrador corrige.
   4. NOVA muestra una vista previa con errores marcados: precio vacío, código desconocido, existencia negativa.
4. **Homologación de productos:**
   - tabla `producto_codigo_drogueria`, que dice qué código usa cada droguería para cada producto;
   - lo que no cruce queda en una bandeja «Por homologar».
5. **Historial:**
   - cada carga queda guardada con fecha (`cargas_precio_inventario`);
   - así se puede comparar el precio de hoy contra el de la semana pasada y ver las variaciones.
6. **Cuando un formato quede estable**, se pasa a producción:
   - existencia y precio por droguería al tomar el pedido;
   - aviso de «sin existencia»;
   - monto estimado del pedido.

**Para empezar necesito:** un archivo real de inventario y uno de precios de cada droguería (Cobeca, Drocerca, Nena y las demás). Pueden venir con los datos sensibles borrados; lo importante es la forma.

---

## Pendientes de información (los entrega el equipo cuando los tenga)

1. **Archivos reales de inventario y de precios** de cada droguería (Cobeca, Drocerca, Nena y las demás), aunque vengan con datos borrados. Sin ellos no arranca la Fase 5.
2. **Un ejemplo del archivo de respuesta** (lo despachado) de cada droguería, para dejar su formato configurado y probado. Mientras tanto, NOVA adivina las columnas por sus títulos.
3. **Datos del médico** que se quieren guardar en la Fase 3 (por ejemplo: especialidad, centro, horario de consulta, teléfono, potencial).

