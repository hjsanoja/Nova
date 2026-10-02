# Plan de implementación — NOVA v8 en adelante

Cada fase es un PR con su propia versión (regla de `CLAUDE.md`). Los números de versión son estimados:
si una fase se parte en dos PR, cada uno sube su versión.

| Fase | Versión | Qué trae | ¿Cambia el SQL? |
|------|---------|----------|-----------------|
| 1 ✅ | v8.0 | Diseño nuevo «Bosque» | No |
| 2 ✅ | v9.0 | Respuesta de la droguería por archivo · Metas con alertas · Farmacias en riesgo | Sí |
| 3 ✅ | v10.0 | CRM: Médicos · Visitas con reporte (visitador mixto) · Tareas y recordatorios · Ficha 360° · Registro de cambios | Sí |
| 4 ✅ | v11.0 | **Ciclos por equipo**: calendario con días hábiles y feriados nacionales y regionales · todo se mide por ciclo · metas por ciclo fáciles de repetir · cierre con foto de resultados | Sí |
| 5 | v12.0 | **Otras actividades** (nuevo): días libres y actividades con aprobación del gerente · cobertura ajustada | Sí |
| 6 | v13.0 | Automatizaciones · WhatsApp · Monitoreo de errores y respaldo · Robustez de la base | Sí |
| 7 | v14.0 (experimental) | Laboratorio de precios e inventario por droguería (solo administrador) | Sí |

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

## Fase 3 — CRM (v10.0) ✅

### 3.1 Médicos (cartera del visitador)
1. Nuevo módulo **Médicos** (el visitador lo ve como «Mis médicos»): nombre, especialidad, centro, dirección, ciudad, zona, teléfono, correo, categoría A/B/C, visitas al mes, ubicación GPS y representante.
2. La gerencia y la administración los cargan con un Excel/CSV (plantilla descargable; el representante va por su correo) o uno por uno. El visitador también agrega los suyos.
3. Cobertura del mes: cuántas visitas «realizadas» lleva cada médico contra las esperadas; los pendientes (y los de categoría A) primero.

### 3.2 Visitas con reporte (farmacias y médicos)
1. Formulario corto para el teléfono: resultado, objetivo, productos presentados, **muestras** por producto (médicos), nota y **próxima acción con fecha** (queda como tarea).
2. Se guarda con el GPS: el servidor calcula la distancia a la farmacia o al consultorio. Funciona sin señal.
3. La **ruta del día** tiene la pestaña «Médicos» con los pendientes del mes, ordenados por cercanía.
4. **Visitador mixto**: el mismo vendedor toma pedidos y visita médicos; no hizo falta un rol nuevo.

### 3.3 Tareas y recordatorios
1. «Mis tareas»: vencidas, hoy y próximas; se marca hecha con un toque. Funciona sin señal.
2. Se crean a mano, desde la ficha de una farmacia o médico, como próxima acción de una visita o desde «Farmacias en riesgo».
3. La gerencia ve las del equipo y puede asignar tareas a un representante.
4. Aviso al teléfono el día que vence (revisión diaria: `revision_diaria()`).

### 3.4 Ficha 360°
1. Farmacia: pestañas Resumen (riesgo, indicadores, datos, cuentas por droguería, lo que más compra y **lo que dejó de comprar**) · Pedidos · Visitas · Tareas · Historial.
2. Médico: Resumen (cobertura del mes, datos, muestras entregadas) · Visitas · Tareas · Historial.

### 3.5 Registro de cambios
1. Quién cambió qué y cuándo (antes → después) en pedidos, farmacias, médicos, droguerías, descuentos, metas, usuarios y tareas.
2. Se ve en **Reportes → Cambios** (con filtros y descarga) y en el «Historial» de cada ficha. Solo administración y gerencia.
3. Se guarda 18 meses.

### 3.6 Reportes de visitas
**Reportes → Visitas**: visitas por representante (farmacias, médicos, % en el lugar, con pedido, muestras), cobertura de médicos del mes y muestras por producto, con descarga a Excel.

---

## Fase 4 — Ciclos (v11.0) ✅

**Qué se pidió:** medir visitas, pedidos y demás indicadores por **ciclos** (no por mes calendario); un módulo para definir cuándo empieza y termina cada ciclo; metas de unidades, pedidos y visitas por ciclo, fáciles de establecer y de **repetir** de ciclos anteriores; metas por farmacias, pedidos y médicos; los ciclos empiezan y terminan en **días hábiles**. Respuestas del equipo: los ciclos son **por equipo** (cada equipo puede tener uno distinto), duran normalmente 4 semanas pero pueden variar, y hay feriados **nacionales y regionales**.

**Cómo quedó:** si no hay ciclos, NOVA sigue midiendo por mes, así que se activa sin romper nada.

### 4.1 Calendario de ciclos y feriados (Gestión → Ciclos)
1. **Ciclos por equipo:** una tarjeta por equipo y una **General** (la usan los equipos que no tienen ciclo propio). Cada ciclo tiene nombre (C10-2026…), inicio, fin y nota; estado planificado, vigente, terminado o cerrado.
2. **Días hábiles:** lunes a viernes menos los feriados. Los **nacionales** cuentan para todos; los **regionales** solo para quien tenga ese estado en su zona (Configuración → Usuarios → Zona).
   - No deja guardar un ciclo que empiece o termine en fin de semana o feriado; el botón «Ajustar a días hábiles» lo corrige.
   - No deja que dos ciclos del mismo equipo se crucen, y avisa (sin impedir guardar) si quedan días hábiles sin ciclo entre dos ciclos.
   - Atajos de duración: 2, 4 o 5 semanas; muestra los días hábiles y los feriados que caen dentro.
3. **Crear el siguiente con un toque:** propone el próximo con la misma duración, empezando el siguiente día hábil y con el nombre que sigue.
4. **Feriados:** por año; nacionales o regionales (eligiendo los estados). Sugiere los feriados nacionales de Venezuela del año (incluye Carnaval y Semana Santa) para marcarlos y guardarlos de una vez.
5. Solo la administración crea, cambia o borra ciclos y feriados; todos los ven (también sin señal).

### 4.2 Todo se mide por ciclo
1. **Inicio:** pedidos, unidades y farmacias **del ciclo**, comparados con el ciclo anterior; promedio por **día hábil**; días hábiles que quedan; productos, representantes y droguerías del ciclo. El vendedor ve el ciclo de su equipo; la gerencia elige el ciclo vigente de cada equipo o el mes calendario.
2. **Cobertura de médicos** (Médicos, Mi ruta y Reportes → Visitas): cada representante se mide con el ciclo vigente de su equipo. El dato del médico pasa a llamarse «visitas por ciclo».
3. **Reportes → Visitas** tiene el período «Ciclo».
4. El ritmo de las metas usa **días hábiles**: lo esperado a hoy = objetivo × días hábiles completos ÷ días hábiles del ciclo.
5. **Cierre de ciclo:** al terminar, la revisión diaria lo cierra sola (o la administración con «Cerrar ciclo») y guarda la foto de los resultados de cada meta, que ya no cambia aunque luego se corrijan datos.

### 4.3 Metas por ciclo (Gestión → Metas)
1. **Indicadores:** unidades, pedidos, farmacias con pedido, visitas a médicos (realizadas), visitas a farmacias y médicos visitados (distintos).
2. **Alcance:** todo el equipo, un representante, una farmacia, un médico o una droguería (o combinados).
3. **Tabla rápida:** una fila por representante del equipo (más «Todo el equipo») y una columna por indicador; «= todos» copia un valor a toda la columna.
4. **Repetir:** «Repetir las metas del ciclo anterior», «Copiar de otro ciclo» (con % de ajuste, sumando o reemplazando) y «Ajustar %» a todas las metas del ciclo.
5. Las alertas (en camino, atención, en riesgo, cumplida) siguen funcionando, ahora por ciclo y con días hábiles.
6. Las metas por mes se conservan y se pueden seguir usando («Por mes»).

### 4.4 Base de datos (resumen técnico)
- Tablas `feriados`, `ciclos` (con `equipo_id`; nulo = general) y `resultados_ciclo`; en `metas`, `ciclo_id` y `medico_id` (cada meta es de un mes o de un ciclo).
- Funciones `app.es_dia_habil`, `dias_habiles`, `app.avance_metas_ciclo`, `cerrar_ciclo`, `copiar_metas_ciclo`, `ajustar_metas_ciclo`; `revisar_metas` revisa también los ciclos vigentes y `revision_diaria` cierra los ciclos terminados.
- Validación en la base (trigger): días hábiles y ciclos que no se cruzan por equipo.
- Pruebas SQL 53 a 56 (`db-tests/95_ciclos.sql`).

### 4.5 Para después (si se necesita)
- Metas por producto y carga de metas desde Excel.
- Farmacias en riesgo no cambia: se calcula con el ritmo de compra de cada farmacia, no con el período.

---

## Fase 5 — Otras actividades y días libres (v12.0) · *nueva petición, evaluada*

**Qué se pidió:** un apartado donde el vendedor o visitador reporte otras actividades o días libres (feriados, vacaciones, día producto, impulsos, jornada médica…); los motivos los define la administración; todo reporte lo aprueba el gerente **antes** de descontarlo de la cobertura de visitas.

**Evaluación:** viable y necesario para que la cobertura por ciclo sea justa. Depende de la Fase 4 (días hábiles del ciclo), que ya está lista.

**Respuestas del equipo:**
1. Cada representante tiene **su propio gerente**; aprueban **ese gerente o la administración**.
2. Motivos iniciales: **Reunión de Ciclo, Vacaciones e Impulso**. La administración puede agregar, cambiar o desactivar motivos.

### 5.1 Motivos (administración)
1. Catálogo editable que arranca con **Reunión de Ciclo, Vacaciones e Impulso** (luego se agregan día producto, jornada médica, reposo médico, capacitación… si hacen falta): nombre, si **descuenta de la cobertura**, si **requiere aprobación** y si está activo.
2. Los **feriados** del calendario (Fase 4) se descuentan solos para todos, sin aprobación.

### 5.2 Reporte del vendedor o visitador
1. Módulo **Mis actividades**: fecha o rango de fechas, jornada completa o media jornada, motivo y nota. Funciona sin señal.
2. Ve el estado de cada reporte: pendiente, aprobado o rechazado (con el comentario del gerente).

### 5.3 Aprobación del gerente
1. Bandeja **Por aprobar** para el gerente, con aviso al teléfono cuando llega un reporte; aprueba o rechaza con un comentario (también varios a la vez).
2. El representante recibe el aviso de la decisión.
3. Cada representante tiene asignado su **gerente** (nuevo dato en Configuración → Usuarios). Solo ese gerente o la administración pueden aprobar; si aún no tiene gerente, aprueba la administración.

### 5.4 Cobertura ajustada
1. **Días efectivos** del representante en el ciclo = días hábiles − feriados − días **aprobados** que descuentan.
2. Lo esperado (visitas y, si se decide, metas) se prorratea con los días efectivos: si alguien tuvo 3 días de vacaciones aprobadas en un ciclo de 20 días hábiles, se le esperan 17/20 de las visitas.
3. Los reportes muestran la cobertura real y la ajustada, y la lista de actividades del período.

### 5.5 Base de datos (resumen técnico)
- Tablas `motivos_actividad` y `actividades` (con estado, quién aprobó y cuándo), y `dim_usuarios.gerente_id`.
- Función `dias_efectivos(vendedor, ciclo)` y avisos de solicitud y decisión (con la revisión diaria y al instante).

---

## Fase 6 — Automatización y confiabilidad (v13.0)

### 6.1 Automatizaciones
Reglas simples que el administrador activa o desactiva. Primero vienen las reglas fijas; el editor libre queda para después.

1. Pedido parcial → crear tarea al vendedor: «Ofrecer reemplazo».
2. Farmacia pasa a «En riesgo» → tarea de visita o llamada.
3. Meta «En riesgo» a mitad de mes → aviso al responsable del equipo.
4. Pedido sin procesar después de X horas → aviso a la mesa.
5. Visita con «próxima acción» → tarea con fecha.

Se ejecutan en la base (triggers y `pg_cron` de Supabase) para que funcionen aunque nadie tenga la app abierta.

### 6.2 WhatsApp
1. **Paso 1, sin costo:** botones que abren WhatsApp con el mensaje ya escrito (enlace `wa.me`). No envía nada solo; la persona revisa y envía. Sirve para:
   - confirmar un pedido;
   - avisar faltantes;
   - recordar a una farmacia en riesgo.
2. **Paso 2, a evaluar juntos:** WhatsApp Business API, para enviar mensajes automáticos. Requiere:
   - cuenta de empresa verificada en Meta;
   - plantillas aprobadas;
   - un costo por conversación.
   - Solo se haría si el paso 1 se usa mucho.

### 6.3 Monitoreo de errores y respaldo
1. **Errores:**
   - la app registra sus errores (sin datos personales) en una tabla `registro_errores`, con versión, pantalla y equipo;
   - el administrador los ve en Reportes;
   - si aumentan después de publicar una versión, aparece una alerta.
2. **Respaldo:**
   - botón del administrador «Descargar respaldo», que baja un Excel con todas las tablas maestras y los pedidos del período;
   - recordatorio mensual para descargarlo.
   - Supabase también guarda copias diarias (plan Pro) y eso se documenta.
3. **Estado de sincronización por equipo:** última subida, pendientes en cola, versión. Así se ve quién tiene pedidos sin enviar.

### 6.4 Robustez de la base de datos
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

## Fase 7 — Laboratorio de precios e inventario (experimental, solo administrador)

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

1. **Archivos reales de inventario y de precios** de cada droguería (Cobeca, Drocerca, Nena y las demás), aunque vengan con datos borrados. Sin ellos no arranca la Fase 7.
2. **Un ejemplo del archivo de respuesta** (lo despachado) de cada droguería, para dejar su formato configurado y probado. Mientras tanto, NOVA adivina las columnas por sus títulos.
3. **Datos del médico** adicionales (horario de consulta, potencial en recetas, etc.): la Fase 3 ya guarda especialidad, centro, teléfono, correo, categoría y visitas por ciclo; lo que falte se agrega.
4. **Para las otras actividades (Fase 5):** qué gerente tiene cada representante (se podrá cargar en Usuarios cuando llegue la Fase 5).

