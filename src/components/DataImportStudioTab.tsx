import React, { useState, useMemo, useRef, useDeferredValue } from 'react';
import { 
  Cliente, 
  Producto, 
  Drogueria, 
  HistoricoPedidoPrevio, 
  EquipoVentas,
  ClienteDrogueriaAlias,
  ProductoDrogueriaMapeo
} from '../types/pharmacy';
import { getSupabaseClient } from '../services/supabaseClient';
import { getStoredSupabaseConfig } from '../services/supabaseConfig';
import {
  contarVentasNube,
  guardarDroguerias,
  importarCatalogoClientes,
  importarCatalogoProductos,
  importarHomologacion,
  importarVentas,
} from '../services/nubeV3';
import { prepararNombre, similitudPreparada, detectarMesDeNombreArchivo, crearLectorColumnas, norm } from '../services/importUtils';
import type { NombrePreparado } from '../services/importUtils';
import { leerLista } from '../services/storageMigrations';
import { usePersistentState } from '../hooks/usePersistentState';
import { PanelHomologarFarmacias, PanelMapeoSap } from './import/HomologationPanels';
import type { FarmaciaPendiente, ProductoPendiente } from './import/HomologationPanels';
import { 
  UploadCloud, 
  Download, 
  FileSpreadsheet, 
  Check, 
  AlertCircle, 
  Database, 
  Users, 
  Pill, 
  History,
  Building2,
  ExternalLink,
  Globe,
  Pencil,
  Trash2,
  Plus,
  MapPin,
  Search,
  Link2,
  Network,
  Zap,
  CheckCircle2,
  Sparkles,
  Calculator,
  Calendar,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const AHORA_SEMILLA = '2026-01-01T00:00:00.000Z';

const ALIAS_SEMILLA: ClienteDrogueriaAlias[] = [
  { id: 'alias-001', cliente_ident01: 'CLI-1001', drogueria: 'COBECA', cod_cliente_drogueria: 'COB-1001', nombre_cliente_drogueria: 'FARMATODO LAS MERCEDES CARACAS', verificado: true, created_at: AHORA_SEMILLA },
  { id: 'alias-002', cliente_ident01: 'CLI-1001', drogueria: 'NENA', cod_cliente_drogueria: 'NEN-4410', nombre_cliente_drogueria: 'FTO LAS MERCEDES AV PPAL', verificado: true, created_at: AHORA_SEMILLA },
  { id: 'alias-003', cliente_ident01: 'CLI-1002', drogueria: 'DROBIENCA', cod_cliente_drogueria: 'DROB-882', nombre_cliente_drogueria: 'DROG Y FARM LA PAZ CHACAO', verificado: true, created_at: AHORA_SEMILLA },
  { id: 'alias-004', cliente_ident01: 'CLI-1003', drogueria: 'COBECA', cod_cliente_drogueria: 'COB-2041', nombre_cliente_drogueria: 'FARMACIA SAN RAFAEL BARCELONA', verificado: true, created_at: AHORA_SEMILLA },
];

const MAPEO_SEMILLA: ProductoDrogueriaMapeo[] = [
  { id: 'map-001', cod_sap: 'SKU-LOS-50', drogueria: 'COBECA', codigo_producto_drogueria: 'COB-LOS-50', nombre_producto_drogueria: 'Losartan Potasico 50mg x 30 Tab', created_at: AHORA_SEMILLA },
  { id: 'map-002', cod_sap: 'SKU-ATO-20', drogueria: 'NENA', codigo_producto_drogueria: 'NEN-ATO-20', nombre_producto_drogueria: 'Atorvastatina 20mg x 30 Tab', created_at: AHORA_SEMILLA },
  { id: 'map-003', cod_sap: 'SKU-AMX-500', drogueria: 'DROBIENCA', codigo_producto_drogueria: 'DRO-AMX-500', nombre_producto_drogueria: 'Clavumox 500/125mg', created_at: AHORA_SEMILLA },
  { id: 'map-004', cod_sap: 'SKU-ATA-500', drogueria: 'COBECA', codigo_producto_drogueria: 'COB-ATA-500', nombre_producto_drogueria: 'Atamel 500mg x 20 Tab', created_at: AHORA_SEMILLA },
  { id: 'map-005', cod_sap: 'SKU-OME-20', drogueria: 'NENA', codigo_producto_drogueria: 'NEN-OME-20', nombre_producto_drogueria: 'Omeprazol 20mg x 28 Cap', created_at: AHORA_SEMILLA },
];


interface DataImportStudioTabProps {
  clientes: Cliente[];
  productos: Producto[];
  droguerias: Drogueria[];
  historicoPrevio: HistoricoPedidoPrevio[];
  onImportarClientes: (nuevos: Cliente[]) => void;
  onEditarCliente?: (cliente: Cliente) => void;
  onEliminarCliente?: (clienteIdent01: string) => void;
  onCrearCliente?: (cliente: Cliente) => void;
  onImportarProductos: (nuevos: Producto[]) => void;
  onImportarDroguerias?: (nuevas: Drogueria[]) => void;
  onEditarDrogueria?: (drogueria: Drogueria) => void;
  onEliminarDrogueria?: (drogueriaId: string) => void;
  onCrearDrogueria?: (drogueria: Drogueria) => void;
  onEditarProducto?: (producto: Producto) => void;
  onEliminarProducto?: (productoId: string) => void;
  onCrearProducto?: (producto: Omit<Producto, 'id' | 'created_at'>) => void;
  onImportarHistorico: (nuevos: HistoricoPedidoPrevio[]) => void;
}

export const DataImportStudioTab: React.FC<DataImportStudioTabProps> = ({
  clientes,
  productos,
  droguerias,
  historicoPrevio,
  onImportarClientes,
  onEditarCliente,
  onEliminarCliente,
  onCrearCliente,
  onImportarProductos,
  onImportarDroguerias,
  onEditarDrogueria,
  onEliminarDrogueria,
  onCrearDrogueria,
  onEditarProducto,
  onEliminarProducto,
  onCrearProducto,
  onImportarHistorico,
}) => {
  const { esClaro } = useTheme();
  const [subTab, setSubTab] = useState<'droguerias' | 'clientes' | 'productos' | 'historico'>('droguerias');
  const [archivoTexto, setArchivoTexto] = useState('');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [notificacion, setNotificacion] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  // Estados para CRUD de Droguerías
  const [modalDrogueriaEditarAbierto, setModalDrogueriaEditarAbierto] = useState(false);
  const [drogueriaAEditar, setDrogueriaAEditar] = useState<Drogueria | null>(null);
  const [modalDrogueriaNuevaAbierto, setModalDrogueriaNuevaAbierto] = useState(false);
  const [formDrogueriaNueva, setFormDrogueriaNueva] = useState({
    nombre_drogueria: '',
    codigo_drogueria: '',
    pagina_web: '',
    delimitador: ';' as ';' | ',' | '|' | '\t',
    email_pedidos: '',
    telefono: '',
    tiempo_entrega_promedio_dias: 2,
    activo: true,
  });

  // Estados para CRUD de Productos (12 Campos sin acentos)
  const [modalProductoEditarAbierto, setModalProductoEditarAbierto] = useState(false);
  const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null);
  const [modalProductoNuevoAbierto, setModalProductoNuevoAbierto] = useState(false);
  const initialFormProducto = {
    codigo: '',
    descripcion: '',
    unidad_negocio: 'La Sante',
    clase_terapeutica: '',
    sistemas: '',
    clasificacion_portafolio: 'Estrategico',
    product_code: '',
    product: '',
    pack_code: '',
    pack: '',
    molecula: '',
    estado_texto: 'Activo',
    precio_lista: 0,
    descuento_maximo_porc: 15.0,
    empaque_minimo: 10,
    stock_disponible: 500,
    activo: true,
  };
  const [formProductoNuevo, setFormProductoNuevo] = useState(initialFormProducto);

  // Estados para CRUD y Búsqueda de Clientes (11 Campos con ident01 como Primary Key)
  const [modalClienteEditarAbierto, setModalClienteEditarAbierto] = useState(false);
  const [clienteAEditar, setClienteAEditar] = useState<Cliente | null>(null);
  const [modalClienteNuevoAbierto, setModalClienteNuevoAbierto] = useState(false);
  const [filtroBusquedaCliente, setFiltroBusquedaCliente] = useState('');
  const initialFormCliente = {
    ident01: '',
    razon_social: '',
    nombre_fantasia: '',
    brick: '',
    municipio_ciudad: '',
    estado: '',
    rif: '',
    frecuencia: 'Semanal (F1)',
    bandera: 'Independiente',
    local_gps_lat: 10.4800,
    local_gps_lon: -66.8600,
    activo: true,
  };
  const [formClienteNuevo, setFormClienteNuevo] = useState(initialFormCliente);

  // Estados para Estrategia de +1.000.000 de Filas en Histórico
  const [filtroHistorico, setFiltroHistorico] = useState('');

  // Diccionarios aprendidos (alias de farmacias y Cod SAP por droguería), persistidos con debounce
  const [aliasesFarmacias, setAliasesFarmacias] = usePersistentState<ClienteDrogueriaAlias[]>(
    'PHARMA_CLIENTE_ALIAS',
    () => (getStoredSupabaseConfig().isConnected ? [] : ALIAS_SEMILLA),
    leerLista
  );
  const [mapeosProductosDrogueria, setMapeosProductosDrogueria] = usePersistentState<ProductoDrogueriaMapeo[]>(
    'PHARMA_PRODUCTO_MAPEO',
    () => (getStoredSupabaseConfig().isConnected ? [] : MAPEO_SEMILLA),
    leerLista
  );

  const [infoMesDetectado, setInfoMesDetectado] = useState<{ mesNum: string; mesTexto: string; anio: string; periodo: string } | null>(null);
  const [seccionHistoricoActiva, setSeccionHistoricoActiva] = useState<'cargar' | 'homologar' | 'mapeo_sap' | 'acumulado'>('cargar');
  const [filasEnSupabase, setFilasEnSupabase] = useState<number | null>(null);
  const [verificandoSupabase, setVerificandoSupabase] = useState(false);
  const [sincronizandoSupabase, setSincronizandoSupabase] = useState(false);
  const [progresoSync, setProgresoSync] = useState<{ insertadas: number; total: number } | null>(null);

  // Cambia de sección del histórico y lleva la vista hasta ella (el panel queda debajo de la vista previa del archivo).
  const irASeccionHistorico = (seccion: typeof seccionHistoricoActiva) => {
    setSeccionHistoricoActiva(seccion);
    requestAnimationFrame(() =>
      document.getElementById('historico-secciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const showNotification = (tipo: 'exito' | 'error', texto: string) => {
    setNotificacion({ tipo, texto });
    setTimeout(() => setNotificacion(null), 4000);
  };

  // Verificar directamente en Supabase cuántas filas de ventas de droguerías hay guardadas (fact_ventas_drogueria)
  const handleVerificarSupabase = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      showNotification('error', 'Supabase no está conectado en este navegador. Haz clic en "Supabase (configurar)" en la barra superior.');
      return;
    }
    setVerificandoSupabase(true);
    try {
      const total = await contarVentasNube(supabase);
      setFilasEnSupabase(total);
      showNotification('exito', `Supabase confirmado: ${total.toLocaleString()} filas de ventas registradas en fact_ventas_drogueria.`);
    } catch (err: unknown) {
      showNotification('error', `Error al consultar Supabase: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVerificandoSupabase(false);
    }
  };

  // Sube todo el histórico en memoria: un lote por archivo, en trozos de 1000 filas. Es idempotente (reenviar no duplica)
  // y el servidor enlaza cada fila con la farmacia y el producto usando los códigos propios de cada droguería.
  const handleSincronizarTodoASupabase = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      showNotification('error', 'Supabase no está conectado. Configura tu URL y Anon Key primero.');
      return;
    }
    if (historicoPrevio.length === 0) {
      showNotification('error', 'No hay registros en memoria para sincronizar.');
      return;
    }
    setSincronizandoSupabase(true);
    setProgresoSync({ insertadas: 0, total: historicoPrevio.length });
    try {
      // El servidor reconoce la droguería de cada fila por su código o nombre: deben existir en la nube.
      await guardarDroguerias(supabase, droguerias);
      const r = await importarVentas(supabase, historicoPrevio, (ins, tot) => setProgresoSync({ insertadas: ins, total: tot }));
      const avisos: string[] = [];
      if (r.droguerias_desconocidas.length > 0) avisos.push(`droguerías no reconocidas (${r.droguerias_desconocidas.join(', ')})`);
      showNotification(
        avisos.length ? 'error' : 'exito',
        `Histórico subido: ${r.insertadas.toLocaleString()} filas nuevas${r.insertadas < r.recibidas ? ` (${(r.recibidas - r.insertadas).toLocaleString()} ya estaban)` : ''}.` +
          (avisos.length ? ` Revisar: ${avisos.join('; ')}.` : '')
      );
      await handleVerificarSupabase();
    } catch (err: unknown) {
      showNotification('error', `Fallo al sincronizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSincronizandoSupabase(false);
      setProgresoSync(null);
    }
  };

  // Descarga de plantillas CSV oficiales (100% sin acentos para evitar errores de codificación)
  const handleDescargarPlantilla = (tipo: 'droguerias' | 'clientes' | 'productos' | 'historico' | 'historico_resumen') => {
    let contenido = '';
    let nombreArchivoDescarga = '';

    if (tipo === 'droguerias') {
      contenido = `ID_NUMERO;NOMBRE_DROGUERIA;CODIGO_DROGUERIA;PAGINA_WEB;DELIMITADOR_CSV;EMAIL_PEDIDOS;TELEFONO
1;BLV;DROG-BLV;https://www.drogueriablv.com;;pedidos@blv.com.ve;0212-2345678
2;COBECA;DROG-COBECA;https://www.grupocobeca.com;;teletransferencias@cobeca.com;0261-7501000
3;DROBIENCA;DROG-DROBIENCA;https://www.drobienca.com;;pedidos@drobienca.com;0243-2471122
4;DROGUERIA 365;DROG-365;https://www.drogueria365.com;,;ventas@drogueria365.com;0212-9876543
5;DROMARKO;DROG-DROMARKO;https://www.dromarko.com;;operaciones@dromarko.com;0241-8712345
6;NENA;DROG-NENA;https://www.droguerianena.com;,;transfers@droguerianena.com;0212-9051111
7;DROPHARMA;DROG-DROPHARMA;https://www.dropharma.com;;pedidos@dropharma.com;0251-4456789
8;DROVENCENTRO;DROG-DROVENCENTRO;https://www.drovencentro.com;|;transferencias@drovencentro.com;0243-5567890
9;FARMACEUTICA 24;DROG-FARMA24;https://www.farmaceutica24.com;;ordenes@farmaceutica24.com;0212-7654321
10;INSUAMINCA;DROG-INSUAMINCA;https://www.insuaminca.com;;ventas@insuaminca.com;0281-2876543
11;ITS;DROG-ITS;https://www.itsfarma.com;;pedidos@itsfarma.com;0212-3456789
12;MEGA;DROG-MEGA;https://www.drogueriamega.com;;despachos@drogueriamega.com;0261-7890123
13;PHARMA MEDIC;DROG-PHARMAMEDIC;https://www.pharmamedic.com;;contacto@pharmamedic.com;0241-8654321
14;SAN GREGORIO;DROG-SANGREGORIO;https://www.sangregorio.com;;pedidos@sangregorio.com;0276-3456789
15;SANTO REMEDIO;DROG-SANTOREMEDIO;https://www.santoremedio.com;;ventas@santoremedio.com;0251-7890123
16;VITAL;DROG-VITAL;https://www.drogueriavital.com;;ordenes@drogueriavital.com;0212-9871234
17;ZAKIPHARMA;DROG-ZAKIPHARMA;https://www.zakipharma.com;;pedidos@zakipharma.com;0261-7123456`;
      nombreArchivoDescarga = 'plantilla_dim_droguerias_ventas_al_dia.csv';
    } else if (tipo === 'clientes') {
      // 11 Campos exactos solicitados por el usuario, con ident01 como Primary Key unico
      contenido = `razon social;nombre de fantasia;brick;municipio/ ciudad/ alcaldia;estado;rif;frecuencia;bandera;ident01;local_gps_lat;local_gps_lon
Farmacias Unidas C.A.;Farmatodo Las Mercedes;CCS-BARUTA-01;Baruta / Caracas;Miranda;J-30129845-1;Semanal;Farmatodo;CLI-1001;10.4806;-66.8611
Drogueria y Farmacia La Paz S.R.L.;Farmacia La Paz Chacao;CCS-CHACAO-02;Chacao / Caracas;Miranda;J-30489218-4;Quincenal;Independiente;CLI-1002;10.4925;-66.8533
Inversiones FarmaSalud 2020 C.A.;Farmacia San Rafael;ANZ-BARCELONA-01;Simon Bolivar / Barcelona;Anzoategui;J-31002941-8;Mensual;Farmahorro;CLI-1003;10.1340;-64.6860
Botiqueria El Valle C.A.;Botiqueria El Valle;CCS-LIBERTADOR-04;Libertador / Caracas;Distrito Capital;J-40112879-0;Quincenal;Botiqueria;CLI-1004;10.4680;-66.9080
Farmacia y Miscelaneas Maracaibo C.A.;FarmaBella Maracaibo;ZUL-MARACAIBO-03;Maracaibo / Maracaibo;Zulia;J-40998811-2;Semanal;Farmacias Saas;CLI-1005;10.6666;-71.6125`;
      nombreArchivoDescarga = 'plantilla_dim_clientes_11_campos.csv';
    } else if (tipo === 'productos') {
      // 12 Campos exactos solicitados por el usuario, sin acentos en encabezados ni datos de muestra
      contenido = `Codigo;Descripcion;Unidad de Negocio;Clase Terapeutica;Sistemas;Clasificacion Portafolio;Product Code;Product;Pack Code;Pack;Concatenate Molecule (Spanish);Estado
SKU-LOS-50;Losartan Potasico 50mg x 30 Tabletas;La Sante;Antihipertensivo;Cardiovascular;Estrategico;PRD-LOS-50;Losartan;PCK-LOS-30;Caja x 30 Tabletas;Losartan Potasico;Activo
SKU-ATO-20;Atorvastatina 20mg x 30 Tabletas;La Sante;Hipolipemiante;Cardiovascular;Estrategico;PRD-ATO-20;Atorvastatina;PCK-ATO-30;Caja x 30 Tabletas;Atorvastatina Calcica;Activo
SKU-AMX-500;Amoxicilina + Ac. Clavulanico 500/125mg;Comercial;Antibiotico;Infeccioso;Lanzamiento;PRD-AMX-500;Clavumox;PCK-AMX-14;Caja x 14 Tabletas;Amoxicilina + Acido Clavulanico;Activo
SKU-ATA-500;Atamel 500mg x 20 Tabletas;OTC;Analgesico Antipiretico;Nervioso Central;Maduros;PRD-ATA-500;Atamel;PCK-ATA-20;Caja x 20 Tabletas;Acetaminofen (Paracetamol);Activo
SKU-OME-20;Omeprazol 20mg x 28 Capsulas;La Sante;Antiulceroso;Gastrointestinal;Estrategico;PRD-OME-20;Omeprazol;PCK-OME-28;Caja x 28 Capsulas;Omeprazol Magnesico;Activo
SKU-MET-850;Diaformin 850mg x 30 Tabletas;Comercial;Antidiabetico Oral;Endocrino;Clave;PRD-MET-850;Diaformin;PCK-MET-30;Caja x 30 Tabletas;Metformina Clorhidrato;Activo`;
      nombreArchivoDescarga = 'plantilla_dim_productos_12_campos.csv';
    } else if (tipo === 'historico_resumen') {
      // Plantilla de Pre-Agregación Mensual (Compresión 95% para +1.000.000 de filas con las 8 columnas del usuario)
      contenido = `Fecha;Cod Cliente;Nombre_cliente;Drogueria;Codigo Producto;Nombre Producto;Unidades;Cod Sap
2026-02;COB-1001;Farmatodo Las Mercedes;COBECA;COB-LOS-50;Losartan Potasico 50mg x 30 Tab;120;SKU-LOS-50
2026-02;NEN-4410;Farmatodo Las Mercedes;NENA;NEN-ATO-20;Atorvastatina 20mg x 30 Tab;90;SKU-ATO-20
2026-02;DROB-882;Farmacia La Paz Chacao;DROBIENCA;DRO-AMX-500;Clavumox 500/125mg;60;SKU-AMX-500
2026-02;COB-2041;Farmacia San Rafael;COBECA;COB-ATA-500;Atamel 500mg x 20 Tab;150;SKU-ATA-500
2026-02;NEN-5512;Botiqueria El Valle;NENA;NEN-OME-20;Omeprazol 20mg x 28 Cap;110;SKU-OME-20
2026-02;BLV-991;FarmaBella Maracaibo;BLV;BLV-MET-850;Diaformin 850mg x 30 Tab;80;SKU-MET-850
2026-01;COB-1001;Farmatodo Las Mercedes;COBECA;COB-LOS-50;Losartan Potasico 50mg x 30 Tab;110;SKU-LOS-50
2026-01;NEN-4410;Farmatodo Las Mercedes;NENA;NEN-ATO-20;Atorvastatina 20mg x 30 Tab;85;SKU-ATO-20`;
      nombreArchivoDescarga = 'plantilla_historico_resumen_mensual_8_columnas.csv';
    } else {
      // Plantilla Diaria por factura con las 8 columnas exactas del usuario
      contenido = `Fecha;Cod Cliente;Nombre_cliente;Drogueria;Codigo Producto;Nombre Producto;Unidades;Cod Sap
2026-02-15;COB-1001;Farmatodo Las Mercedes;COBECA;COB-LOS-50;Losartan Potasico 50mg x 30 Tab;60;SKU-LOS-50
2026-02-18;NEN-4410;Farmatodo Las Mercedes;NENA;NEN-ATO-20;Atorvastatina 20mg x 30 Tab;45;SKU-ATO-20
2026-02-20;DROB-882;Farmacia La Paz Chacao;DROBIENCA;DRO-AMX-500;Clavumox 500/125mg;30;SKU-AMX-500
2026-02-22;COB-2041;Farmacia San Rafael;COBECA;COB-ATA-500;Atamel 500mg x 20 Tab;80;SKU-ATA-500
2026-02-25;NEN-5512;Botiqueria El Valle;NENA;NEN-OME-20;Omeprazol 20mg x 28 Cap;70;SKU-OME-20
2026-02-28;BLV-991;FarmaBella Maracaibo;BLV;BLV-MET-850;Diaformin 850mg x 30 Tab;50;SKU-MET-850`;
      nombreArchivoDescarga = 'plantilla_historico_ventas_8_columnas.csv';
    }

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivoDescarga;
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('exito', `Plantilla ${nombreArchivoDescarga} descargada con exito.`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNombreArchivo(file.name);
    const mesDetectado = detectarMesDeNombreArchivo(file.name);
    if (mesDetectado) {
      setInfoMesDetectado(mesDetectado);
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setArchivoTexto(text);
    };
    reader.readAsText(file);
  };

  // Parser interactivo
  const filasParseadas = useMemo(() => {
    if (!archivoTexto.trim()) return [];
    const lineas = archivoTexto.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lineas.length <= 1) return [];

    const delimitador = lineas[0].includes(';') ? ';' : lineas[0].includes('\t') ? '\t' : ',';
    const encabezados = lineas[0].split(delimitador).map((h) => h.replace(/["']/g, '').trim());

    const filas: any[] = [];
    for (let i = 1; i < lineas.length; i++) {
      const c = lineas[i].split(delimitador).map((val) => val.replace(/["']/g, '').trim());
      if (c.length < 2) continue;

      const filaObj: Record<string, string> = {};
      encabezados.forEach((h, idx) => {
        filaObj[h] = c[idx] || '';
      });
      filas.push(filaObj);
    }
    return filas;
  }, [archivoTexto]);

  const cacheSimilitud = useRef<{
    clientes: Cliente[];
    preparados: { fantasia: NombrePreparado; razon: NombrePreparado }[];
    mejor: Map<string, { cliente: Cliente | undefined; similitud: number }>;
  } | null>(null);

  // Lector de columnas tolerante a variaciones; el índice de encabezados se arma una vez por archivo.
  const getCol = useMemo(() => crearLectorColumnas(filasParseadas[0]), [filasParseadas]);

  // Diagnóstico en tiempo real del archivo mensual cargado (Cod SAP y Homologación de Farmacias).
  // Se indexan diccionarios, vademécum y farmacias UNA vez; cada fila cuesta O(1) en lugar de recorrer catálogos completos.
  const diagnosticoVentasMes = useMemo(() => {
    const vacio = {
      productosSinSap: [] as ProductoPendiente[],
      farmaciasSinHomologar: [] as FarmaciaPendiente[],
      totalFilas: 0,
      totalUnidades: 0,
      tieneColumnaSap: false,
    };
    if (subTab !== 'historico' || filasParseadas.length === 0) return vacio;

    const mapeoKeys = new Set(mapeosProductosDrogueria.map((m) => `${norm(m.drogueria)}|${norm(m.codigo_producto_drogueria)}`));
    const codigosProducto = new Set<string>();
    productos.forEach((p) => {
      codigosProducto.add(norm(p.sku));
      if (p.codigo) codigosProducto.add(norm(p.codigo));
    });
    const aliasPorCodigo = new Set<string>();
    const aliasPorNombre = new Set<string>();
    aliasesFarmacias.forEach((a) => {
      const d = norm(a.drogueria);
      if (a.cod_cliente_drogueria) aliasPorCodigo.add(`${d}|${a.cod_cliente_drogueria}`);
      aliasPorNombre.add(`${d}|${norm(a.nombre_cliente_drogueria)}`);
    });
    const clientesConocidos = new Set<string>();
    clientes.forEach((c) => {
      [c.ident01, c.codigo_cliente, c.nombre_fantasia, c.razon_social].forEach((v) => v && clientesConocidos.add(norm(v)));
    });

    // Caché de similitudes: sobrevive a cada "Aceptar" (que recalcula el diagnóstico) mientras no cambie el maestro de farmacias.
    let cache = cacheSimilitud.current;
    if (!cache || cache.clientes !== clientes) {
      cache = {
        clientes,
        preparados: clientes.map((c) => ({
          fantasia: prepararNombre(c.nombre_fantasia),
          razon: prepararNombre(c.razon_social),
        })),
        mejor: new Map(),
      };
      cacheSimilitud.current = cache;
    }
    const { preparados: clientesPreparados, mejor: mejorCoincidencia } = cache;

    const tieneColumnaSap = filasParseadas.some((f) => Boolean(getCol(f, ['Cod Sap', 'Cod_Sap', 'COD_SAP', 'COD SAP', 'CodSap'])));
    let totalUds = 0;
    const productosSinSap = new Map<string, ProductoPendiente>();
    const farmaciasSinHomologar = new Map<string, FarmaciaPendiente>();

    for (const f of filasParseadas) {
      const drogRaw = getCol(f, ['Drogueria', 'DROGUERIA', 'drogueria', 'Droguería', 'NOMBRE_DROGUERIA', 'Drog']).trim() || 'COBECA';
      const codigoProd = getCol(f, ['Codigo Producto', 'Codigo_Producto', 'CODIGO_PRODUCTO', 'COD PRODUCTO', 'codigo producto', 'CodigoProducto', 'COD_ARTICULO']).trim();
      const nombreProd = getCol(f, ['Nombre Producto', 'Nombre_Producto', 'NOMBRE_PRODUCTO', 'nombre producto', 'PRODUCTO', 'Descripcion']).trim();
      const rawSap = getCol(f, ['Cod Sap', 'Cod_Sap', 'COD_SAP', 'COD SAP', 'CodSap', 'CODSAP']).trim();
      const unidades = parseInt(getCol(f, ['Unidades', 'UNIDADES', 'unidades', 'Cantidad', 'CANTIDAD']).trim(), 10) || 0;
      const codCliente = getCol(f, ['Cod Cliente', 'Cod_Cliente', 'COD_CLIENTE', 'COD CLIENTE', 'cod cliente', 'Codigo_Cliente']).trim();
      const nombreCliente = getCol(f, ['Nombre_cliente', 'Nombre_Cliente', 'NOMBRE_CLIENTE', 'Nombre Cliente', 'nombre_cliente', 'Farmacia', 'FARMACIA']).trim();
      const drogKey = norm(drogRaw);

      totalUds += unidades;

      // 1. ¿El producto tiene Cod SAP resuelto?
      if (codigoProd && !rawSap && !mapeoKeys.has(`${drogKey}|${norm(codigoProd)}`) && !codigosProducto.has(norm(codigoProd))) {
        const key = `${drogRaw}__${codigoProd}`;
        const item = productosSinSap.get(key) ?? { drogueria: drogRaw, codigo_producto: codigoProd, nombre_producto: nombreProd, totalUnidades: 0, count: 0 };
        item.totalUnidades += unidades;
        item.count += 1;
        productosSinSap.set(key, item);
      }

      // 2. ¿La farmacia está homologada?
      if (!nombreCliente) continue;
      const tieneAlias =
        (codCliente !== '' && aliasPorCodigo.has(`${drogKey}|${codCliente}`)) || aliasPorNombre.has(`${drogKey}|${norm(nombreCliente)}`);
      if (tieneAlias || clientesConocidos.has(norm(codCliente)) || clientesConocidos.has(norm(nombreCliente))) continue;

      const key = `${drogRaw}__${nombreCliente}`;
      const existente = farmaciasSinHomologar.get(key);
      if (existente) {
        existente.totalUnidades += unidades;
        existente.count += 1;
        continue;
      }

      // Mejor coincidencia en dim_clientes: una sola vez por nombre distinto (no por fila ni por droguería),
      // con los nombres de las farmacias normalizados y tokenizados de antemano.
      const nombreKey = norm(nombreCliente);
      let mejor = mejorCoincidencia.get(nombreKey);
      if (!mejor) {
        const preparado = prepararNombre(nombreCliente);
        let mejorSim = 0;
        let mejorCli = clientes[0];
        for (let i = 0; i < clientes.length; i++) {
          const maxSim = Math.max(similitudPreparada(preparado, clientesPreparados[i].fantasia), similitudPreparada(preparado, clientesPreparados[i].razon));
          if (maxSim > mejorSim) {
            mejorSim = maxSim;
            mejorCli = clientes[i];
          }
        }
        mejor = { cliente: mejorCli, similitud: mejorSim };
        mejorCoincidencia.set(nombreKey, mejor);
      }
      const { cliente: mejorCli, similitud: mejorSim } = mejor;
      farmaciasSinHomologar.set(key, {
        drogueria: drogRaw,
        cod_cliente: codCliente,
        nombre_cliente: nombreCliente,
        totalUnidades: unidades,
        count: 1,
        sugerenciaIdent01: mejorCli?.ident01 || clientes[0]?.ident01 || 'CLI-1001',
        sugerenciaNombre: mejorCli?.nombre_fantasia || mejorCli?.razon_social || 'Farmacia',
        similitud: mejorSim,
      });
    }

    return {
      productosSinSap: Array.from(productosSinSap.values()).sort((a, b) => b.totalUnidades - a.totalUnidades),
      farmaciasSinHomologar: Array.from(farmaciasSinHomologar.values()).sort((a, b) => b.similitud - a.similitud || b.totalUnidades - a.totalUnidades),
      totalFilas: filasParseadas.length,
      totalUnidades: totalUds,
      tieneColumnaSap,
    };
  }, [filasParseadas, subTab, mapeosProductosDrogueria, aliasesFarmacias, productos, clientes, getCol]);

  const handleProcesarCarga = async () => {
    if (filasParseadas.length === 0) {
      showNotification('error', 'No hay registros validos para procesar.');
      return;
    }

    const supabase = getSupabaseClient();

    if (subTab === 'clientes') {
      const nuevosClientes: Cliente[] = filasParseadas.map((f, i) => {
        const ident01 = getCol(f, ['ident01', 'IDENT01', 'Ident01', 'ident_01', 'codigo_cliente', 'CODIGO_CLIENTE', 'CODIGO', 'Codigo', 'ID']) || `CLI-${Date.now().toString().slice(-4)}${i + 1}`;
        const razonSocial = getCol(f, ['razon social', 'razón social', 'RAZON SOCIAL', 'RAZON_SOCIAL', 'Razon Social', 'Razon social', 'NOMBRE']) || 'Farmacia C.A.';
        const nombreFantasia = getCol(f, ['nombre de fantasia', 'nombre de fantasía', 'NOMBRE DE FANTASIA', 'NOMBRE_FANTASIA', 'Nombre Fantasia', 'nombre comercial', 'NOMBRE_COMERCIAL', 'Farmacia']) || razonSocial;
        const brick = getCol(f, ['brick', 'BRICK', 'Brick', 'ZONA', 'Zona', 'SECTOR']) || 'CCS-CENTRO-01';
        const munCiudad = getCol(f, ['municipio/ ciudad/ alcaldia', 'municipio/ciudad/alcaldia', 'municipio / ciudad / alcaldia', 'municipio', 'ciudad', 'MUNICIPIO', 'CIUDAD', 'Municipio', 'Ciudad']) || 'Caracas';
        const estado = getCol(f, ['estado', 'ESTADO', 'Estado']) || 'Miranda';
        const rif = getCol(f, ['rif', 'RIF', 'Rif']) || 'J-00000000-0';
        const frecuencia = getCol(f, ['frecuencia', 'FRECUENCIA', 'Frecuencia']) || 'Semanal';
        const bandera = getCol(f, ['bandera', 'BANDERA', 'Bandera', 'CADENA', 'Cadena']) || 'Independiente';
        const lat = parseFloat(getCol(f, ['local_gps_lat', 'LOCAL_GPS_LAT', 'lat', 'LAT', 'latitud'])?.replace(',', '.')) || 10.4800;
        const lon = parseFloat(getCol(f, ['local_gps_lon', 'LOCAL_GPS_LON', 'lon', 'LON', 'longitud'])?.replace(',', '.')) || -66.8600;

        return {
          id: ident01,
          ident01,
          codigo_cliente: ident01,
          rif,
          razon_social: razonSocial,
          nombre_fantasia: nombreFantasia,
          nombre_comercial: nombreFantasia,
          brick,
          municipio_ciudad: munCiudad,
          ciudad: munCiudad,
          direccion: `${munCiudad}, ${estado}`,
          estado,
          frecuencia,
          bandera,
          local_gps_lat: lat,
          local_gps_lon: lon,
          clasificacion_abc: 'B',
          cupo_credito: 5000,
          dias_credito: 15,
          telefono: '',
          email_contacto: '',
          activo: true,
          created_at: new Date().toISOString(),
        };
      });

      let avisoNube = '';
      if (supabase) {
        try {
          await importarCatalogoClientes(supabase, nuevosClientes);
        } catch (err: unknown) {
          avisoNube = ` Guardadas en este navegador, pero no se pudieron subir a Supabase: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      onImportarClientes(nuevosClientes);
      showNotification(avisoNube ? 'error' : 'exito', `Se han cargado e incorporado ${nuevosClientes.length} farmacias (código interno = ident01).${avisoNube}`);
    } else if (subTab === 'productos') {
      // 12 Campos exactos (tolerante con o sin acentos al leer del CSV, pero persistiendo sin tildes)
      const nuevosProductos: Producto[] = filasParseadas.map((f, i) => {
        const codigo = getCol(f, ['Codigo', 'CODIGO', 'Product Code', 'PRODUCT_CODE', 'SKU']) || `SKU-${i+1}`;
        const descripcion = getCol(f, ['Descripcion', 'DESCRIPCION', 'Descripción', 'Product', 'PRODUCT', 'NOMBRE_COMERCIAL']) || `Medicamento ${i+1}`;
        const unidadNegocio = getCol(f, ['Unidad de Negocio', 'UNIDAD_DE_NEGOCIO', 'UNIDAD DE NEGOCIO', 'LABORATORIO']) || 'La Sante';
        const claseTerapeutica = getCol(f, ['Clase Terapeutica', 'CLASE_TERAPEUTICA', 'CLASE TERAPEUTICA', 'Clase Terapéutica']) || '';
        const sistemas = getCol(f, ['Sistemas', 'SISTEMAS']) || '';
        const clasifPortafolio = getCol(f, ['Clasificacion Portafolio', 'CLASIFICACION_PORTAFOLIO', 'Clasificación Portafolio']) || '';
        const productCode = getCol(f, ['Product Code', 'PRODUCT_CODE', 'PRODUCT CODE']) || '';
        const product = getCol(f, ['Product', 'PRODUCT']) || descripcion;
        const packCode = getCol(f, ['Pack Code', 'PACK_CODE', 'PACK CODE', 'CODIGO_EAN13']) || `759${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        const pack = getCol(f, ['Pack', 'PACK', 'PRESENTACION']) || 'Caja x 30';
        const molecula = getCol(f, ['Concatenate Molecule (Spanish)', 'CONCATENATE MOLECULE (SPANISH)', 'Molecula', 'Molécula', 'PRINCIPIO_ACTIVO']) || 'Principio Activo';
        const estadoRaw = getCol(f, ['Estado', 'ESTADO']) || 'Activo';

        const esActivo = !estadoRaw || 
          estadoRaw.toLowerCase().includes('activo') || 
          estadoRaw.toLowerCase() === 'a' || 
          estadoRaw === '1' || 
          estadoRaw.toLowerCase() === 'true';

        const esPrioritario = 
          clasifPortafolio.toLowerCase().includes('estrat') ||
          clasifPortafolio.toLowerCase().includes('lanz') ||
          clasifPortafolio.toLowerCase().includes('prio') ||
          clasifPortafolio.toLowerCase().includes('clave');

        const equipoAsignado: 'La Sante' | 'Comercial' | 'OTC' = 
          unidadNegocio.toLowerCase().includes('comercial') ? 'Comercial' :
          unidadNegocio.toLowerCase().includes('otc') ? 'OTC' : 'La Sante';

        return {
          id: `prod-imp-${Date.now()}-${i}`,
          sku: codigo,
          codigo_barras_ean13: packCode,
          principio_activo: molecula,
          nombre_comercial: product || descripcion,
          presentacion: pack,
          laboratorio: unidadNegocio,
          precio_lista: parseFloat(getCol(f, ['PRECIO_LISTA', 'Precio Lista'])?.replace(',', '.')) || 0,
          descuento_maximo_porc: parseFloat(getCol(f, ['DSCTO_MAX_PORC', 'Descuento'])?.replace(',', '.')) || 15.0,
          es_prioritario: esPrioritario,
          factor_prioridad: esPrioritario ? 1.30 : 1.00,
          empaque_minimo: parseInt(getCol(f, ['EMPAQUE_MINIMO', 'EMPAQUE'])) || 10,
          stock_disponible: parseInt(getCol(f, ['STOCK_DISPONIBLE', 'STOCK'])) || 500,
          equipo_asignado: equipoAsignado,
          activo: esActivo,
          created_at: new Date().toISOString(),

          // 12 Campos de la dimension
          codigo,
          descripcion,
          unidad_negocio: unidadNegocio,
          clase_terapeutica: claseTerapeutica,
          sistemas,
          clasificacion_portafolio: clasifPortafolio,
          product_code: productCode,
          product,
          pack_code: packCode,
          pack,
          molecula,
          estado_texto: estadoRaw,
        };
      });

      let avisoNube = '';
      if (supabase) {
        try {
          await importarCatalogoProductos(supabase, nuevosProductos);
        } catch (err: unknown) {
          avisoNube = ` Guardados en este navegador, pero no se pudieron subir a Supabase: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      onImportarProductos(nuevosProductos);
      showNotification(avisoNube ? 'error' : 'exito', `Se han cargado e incorporado ${nuevosProductos.length} medicamentos a dim_productos.${avisoNube}`);
    } else if (subTab === 'droguerias') {
      const nuevasDroguerias: Drogueria[] = filasParseadas.map((f, i) => {
        const nombre = getCol(f, ['NOMBRE_DROGUERIA', 'NOMBRE', 'DROGUERIA', 'Nombre']) || `Drogueria ${i+1}`;
        const codigo = getCol(f, ['CODIGO_DROGUERIA', 'CODIGO', 'Codigo']) || `DROG-${nombre.replace(/\s+/g, '').toUpperCase()}`;
        const paginaWeb = getCol(f, ['PAGINA_WEB', 'Pagina Web', 'PORTAL', 'URL']) || `https://www.${nombre.toLowerCase().replace(/\s+/g, '')}.com`;
        const delim = (getCol(f, ['DELIMITADOR_CSV', 'DELIMITADOR', 'Delimitador']) || ';') as ';' | ',' | '|' | '\t';
        const idNum = parseInt(getCol(f, ['ID_NUMERO', 'ID', 'Id'])) || (droguerias.length + i + 1);

        return {
          id: `drog-${codigo.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          id_numero: idNum,
          codigo_drogueria: codigo,
          rif: getCol(f, ['RIF', 'Rif']) || 'J-00000000-0',
          nombre_drogueria: nombre,
          email_pedidos: getCol(f, ['EMAIL_PEDIDOS', 'EMAIL', 'Email']) || `pedidos@${nombre.toLowerCase().replace(/\s+/g, '')}.com`,
          pagina_web: paginaWeb,
          telefono: getCol(f, ['TELEFONO', 'Telefono']) || '',
          tiempo_entrega_promedio_dias: parseInt(getCol(f, ['DIAS_ENTREGA', 'TIEMPO_ENTREGA'])) || 2,
          activo: true,
          created_at: new Date().toISOString(),
          formato_csv_config: {
            delimitador: delim,
            incluir_encabezados: true,
            entrecomillado: delim === ',' ? 'siempre' : 'solo_texto',
            codificacion: 'UTF-8',
            salto_linea: '\r\n',
            formato_decimal: delim === ';' ? 'coma' : 'punto',
            columnas: [
              { campo_origen: 'codigo_cliente', nombre_encabezado: 'COD_CLIENTE', orden: 1, formato: 'texto' },
              { campo_origen: 'rif_cliente', nombre_encabezado: 'RIF_FARMACIA', orden: 2, formato: 'texto' },
              { campo_origen: 'sku', nombre_encabezado: 'SKU_PRODUCTO', orden: 3, formato: 'texto' },
              { campo_origen: 'cantidad_confirmada', nombre_encabezado: 'CANTIDAD', orden: 4, formato: 'entero' },
              { campo_origen: 'descuento_porcentaje', nombre_encabezado: 'DESCUENTO', orden: 5, formato: delim === ';' ? 'decimal_coma' : 'decimal_punto' },
              { campo_origen: 'numero_pedido', nombre_encabezado: 'NUMERO_ORDEN', orden: 6, formato: 'texto' },
            ]
          }
        };
      });

      if (onImportarDroguerias) {
        onImportarDroguerias(nuevasDroguerias);
      }
      showNotification('exito', `Se han cargado e incorporado ${nuevasDroguerias.length} droguerias a dim_droguerias.`);
    } else if (subTab === 'historico') {
      const mesPeriodo = infoMesDetectado?.periodo || new Date().toISOString().slice(0, 7);
      const nuevosMapeosAprendidos: ProductoDrogueriaMapeo[] = [];
      const mapeosConocidos = new Set(mapeosProductosDrogueria.map((m) => `${norm(m.drogueria)}|${norm(m.codigo_producto_drogueria)}`));

      // Las resoluciones de producto, farmacia y droguería dependen solo de textos que se repiten miles de veces
      // en un reporte mensual: se calculan una vez por combinación distinta (antes, una vez por fila contra todo el catálogo).
      const cacheProductos = new Map<string, { codSapResuelto: string; prodMatch: Producto | undefined }>();
      const cacheClientes = new Map<string, { cliMatch: Cliente | undefined; ident01Homologado: string | undefined }>();
      const cacheDroguerias = new Map<string, Drogueria | undefined>();

      const resolverProducto = (drogRaw: string, codigoProdDrog: string, nombreProdRaw: string, codSap: string) => {
        const clave = [drogRaw, codigoProdDrog, nombreProdRaw, codSap].join('\u0001');
        const enCache = cacheProductos.get(clave);
        if (enCache) return enCache;

        let codSapResuelto = codSap;
        // A. Diccionario de mapeos aprendidos
        if (!codSapResuelto && codigoProdDrog) {
          const mapMatch = mapeosProductosDrogueria.find(
            (m) => norm(m.drogueria) === norm(drogRaw) && norm(m.codigo_producto_drogueria) === norm(codigoProdDrog)
          );
          if (mapMatch) codSapResuelto = mapMatch.cod_sap;
        }

        // B. Match de producto en el vademécum por Cod SAP
        const sapLow = norm(codSapResuelto);
        let prodMatch = codSapResuelto
          ? productos.find(
              (p) =>
                (p.codigo && norm(p.codigo) === sapLow) ||
                (p.sku && norm(p.sku) === sapLow) ||
                (p.product_code && norm(p.product_code) === sapLow) ||
                norm(p.id) === sapLow
            )
          : undefined;

        // C. Por código de producto de la droguería si coincide con SKU o código de barras
        if (!prodMatch && codigoProdDrog) {
          const codLow = norm(codigoProdDrog);
          prodMatch = productos.find((p) => (p.sku && norm(p.sku) === codLow) || (p.pack_code && norm(p.pack_code) === codLow));
          if (prodMatch) codSapResuelto = prodMatch.sku;
        }

        // D. Por nombre del medicamento
        if (!prodMatch && nombreProdRaw) {
          const nLow = norm(nombreProdRaw);
          prodMatch = productos.find(
            (p) =>
              (p.nombre_comercial && norm(p.nombre_comercial) === nLow) ||
              (p.product && norm(p.product) === nLow) ||
              (p.descripcion && norm(p.descripcion) === nLow) ||
              (p.nombre_comercial && (norm(p.nombre_comercial).includes(nLow) || nLow.includes(norm(p.nombre_comercial))))
          );
          if (prodMatch) codSapResuelto = prodMatch.sku;
        }

        // E. Si el reporte traía Cod SAP manual, se aprende la regla una sola vez para los meses siguientes
        if (codSap && codigoProdDrog) {
          const claveMapeo = `${norm(drogRaw)}|${norm(codigoProdDrog)}`;
          if (!mapeosConocidos.has(claveMapeo)) {
            mapeosConocidos.add(claveMapeo);
            nuevosMapeosAprendidos.push({
              id: `map-${Date.now()}-${nuevosMapeosAprendidos.length}`,
              cod_sap: codSap,
              drogueria: drogRaw,
              codigo_producto_drogueria: codigoProdDrog,
              nombre_producto_drogueria: nombreProdRaw,
              created_at: new Date().toISOString(),
            });
          }
        }

        const resultado = { codSapResuelto, prodMatch };
        cacheProductos.set(clave, resultado);
        return resultado;
      };

      const resolverCliente = (drogRaw: string, codClienteDrog: string, nombreCliRaw: string) => {
        const clave = [drogRaw, codClienteDrog, nombreCliRaw].join('\u0001');
        const enCache = cacheClientes.get(clave);
        if (enCache) return enCache;

        let cliMatch: Cliente | undefined;
        let ident01Homologado: string | undefined;

        // A. Tabla de alias registrados
        const aliasMatch = aliasesFarmacias.find(
          (a) =>
            norm(a.drogueria) === norm(drogRaw) &&
            ((a.cod_cliente_drogueria && a.cod_cliente_drogueria === codClienteDrog) ||
              norm(a.nombre_cliente_drogueria) === norm(nombreCliRaw))
        );
        if (aliasMatch) {
          ident01Homologado = aliasMatch.cliente_ident01;
          cliMatch = clientes.find((c) => c.ident01 === aliasMatch.cliente_ident01);
        }

        // B. Match directo por ident01, código o RIF
        if (!cliMatch && codClienteDrog) {
          const cLow = norm(codClienteDrog);
          cliMatch = clientes.find(
            (c) =>
              (c.ident01 && norm(c.ident01) === cLow) ||
              (c.codigo_cliente && norm(c.codigo_cliente) === cLow) ||
              (c.rif && norm(c.rif) === cLow) ||
              norm(c.id) === cLow
          );
          if (cliMatch) ident01Homologado = cliMatch.ident01;
        }

        // C. Por nombre comercial o razón social
        if (!cliMatch && nombreCliRaw) {
          const nLow = norm(nombreCliRaw);
          cliMatch = clientes.find(
            (c) =>
              (c.nombre_fantasia && norm(c.nombre_fantasia) === nLow) ||
              (c.razon_social && norm(c.razon_social) === nLow) ||
              (c.nombre_comercial && norm(c.nombre_comercial) === nLow) ||
              (c.nombre_fantasia && (norm(c.nombre_fantasia).includes(nLow) || nLow.includes(norm(c.nombre_fantasia))))
          );
          if (cliMatch) ident01Homologado = cliMatch.ident01;
        }

        const resultado = { cliMatch, ident01Homologado };
        cacheClientes.set(clave, resultado);
        return resultado;
      };

      const resolverDrogueria = (drogRaw: string) => {
        if (cacheDroguerias.has(drogRaw)) return cacheDroguerias.get(drogRaw);
        const dLow = norm(drogRaw);
        const encontrada = drogRaw
          ? droguerias.find(
              (d) =>
                norm(d.nombre_drogueria) === dLow ||
                norm(d.nombre_drogueria).includes(dLow) ||
                norm(d.codigo_drogueria) === dLow ||
                dLow.includes(norm(d.nombre_drogueria))
            )
          : undefined;
        cacheDroguerias.set(drogRaw, encontrada);
        return encontrada;
      };

      const nuevoHistorico: HistoricoPedidoPrevio[] = filasParseadas.map((f, i) => {
        // 1. Columnas oficiales del usuario:
        // Fecha | Cod Cliente | Nombre_cliente | Drogueria | Codigo Producto | Nombre Producto | Unidades | Cod Sap
        const fechaRaw = getCol(f, ['Fecha', 'FECHA', 'fecha', 'FECHA_PEDIDO', 'ANIO_MES', 'AÑO_MES', 'MES', 'PERIODO', 'DIA', 'Dia']).trim();
        const codClienteDrog = getCol(f, ['Cod Cliente', 'Cod_Cliente', 'COD_CLIENTE', 'COD CLIENTE', 'cod cliente', 'CodCliente', 'CODIGO_CLIENTE', 'ident01', 'IDENT01']).trim();
        const nombreCliRaw = getCol(f, ['Nombre_cliente', 'Nombre_Cliente', 'NOMBRE_CLIENTE', 'Nombre Cliente', 'nombre_cliente', 'CLIENTE', 'Farmacia', 'FARMACIA']).trim();
        const drogRaw = getCol(f, ['Drogueria', 'DROGUERIA', 'drogueria', 'Droguería', 'NOMBRE_DROGUERIA', 'Drog']).trim() || 'COBECA';
        const codigoProdDrog = getCol(f, ['Codigo Producto', 'Codigo_Producto', 'CODIGO_PRODUCTO', 'COD PRODUCTO', 'codigo producto', 'CodigoProducto', 'COD_ARTICULO']).trim();
        const nombreProdRaw = getCol(f, ['Nombre Producto', 'Nombre_Producto', 'NOMBRE_PRODUCTO', 'Nombre Producto', 'nombre producto', 'PRODUCTO', 'Descripcion', 'DESCRIPCION']).trim();
        const unidadesRaw = getCol(f, ['Unidades', 'UNIDADES', 'unidades', 'Cantidad', 'CANTIDAD', 'CANTIDAD_TOTAL', 'TOTAL_UNIDADES']).trim();
        const codSap = getCol(f, ['Cod Sap', 'Cod_Sap', 'COD_SAP', 'COD SAP', 'CodSap', 'CODSAP', 'SKU', 'Codigo', 'CODIGO']).trim();

        // 2. Normalización de Fecha Diaria (admite DD/MM/AAAA exacto, DD-MM-AAAA, YYYY-MM-DD, con/sin hora)
        let fecha = '';
        const fechaSinHora = (fechaRaw || '').trim().split(/\s+/)[0]; // Quitar timestamp tipo '00:00:00'
        const fechaLimpia = fechaSinHora.replace(/\./g, '/');

        if (fechaLimpia) {
          if (fechaLimpia.includes('/')) {
            const partes = fechaLimpia.split('/');
            if (partes.length === 3) {
              if (partes[0].length === 4) {
                // Formato YYYY/MM/DD
                fecha = `${partes[0]}-${partes[1].padStart(2, '0')}-${partes[2].padStart(2, '0')}`;
              } else {
                // Formato oficial del usuario: DD/MM/AAAA o DD/MM/AA
                const dia = partes[0].padStart(2, '0');
                const mes = partes[1].padStart(2, '0');
                const anioCompleto = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
                fecha = `${anioCompleto}-${mes}-${dia}`;
              }
            } else if (partes.length === 2) {
              // DD/MM -> adjuntar año actual o intuido del archivo
              const anio = infoMesDetectado?.anio || '2026';
              fecha = `${anio}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
            }
          } else if (fechaLimpia.includes('-')) {
            const partes = fechaLimpia.split('-');
            if (partes.length === 3) {
              if (partes[0].length === 4) {
                // YYYY-MM-DD
                fecha = `${partes[0]}-${partes[1].padStart(2, '0')}-${partes[2].padStart(2, '0')}`;
              } else {
                // DD-MM-YYYY
                const dia = partes[0].padStart(2, '0');
                const mes = partes[1].padStart(2, '0');
                const anioCompleto = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
                fecha = `${anioCompleto}-${mes}-${dia}`;
              }
            } else if (partes.length === 2 && partes[0].length === 4) {
              fecha = `${fechaLimpia}-15`; // YYYY-MM
            }
          } else if (/^\d{1,2}$/.test(fechaLimpia)) {
            // Si el archivo solo trae el número del día (1..31) y el mes viene en el nombre del archivo
            const diaNum = fechaLimpia.padStart(2, '0');
            fecha = `${mesPeriodo}-${diaNum}`;
          } else {
            fecha = fechaLimpia;
          }
        }
        if (!fecha || fecha.length < 8) {
          fecha = `${mesPeriodo}-15`;
        }

        // Deducir el período exacto YYYY-MM a partir de la fecha real de la fila (ej: '2026-06')
        const mesPeriodoFila = (fecha.includes('-') && fecha.length >= 7) ? fecha.slice(0, 7) : mesPeriodo;

        // 3. Resolución de Cod SAP y producto (memoizada por combinación distinta)
        const { codSapResuelto, prodMatch } = resolverProducto(drogRaw, codigoProdDrog, nombreProdRaw, codSap);

        const prodId = prodMatch ? prodMatch.id : (codSapResuelto || codigoProdDrog || productos[0]?.id || `prod-${i}`);
        const prodNombre = prodMatch?.nombre_comercial || prodMatch?.product || nombreProdRaw || 'Medicamento General';

        // 4. Deducción de Equipo Comercial:
        let equipo: EquipoVentas = 'La Sante';
        if (prodMatch) {
          const un = (prodMatch.unidad_negocio || prodMatch.laboratorio || prodMatch.equipo_asignado || '').toUpperCase();
          if (un.includes('COMERCIAL') || un === 'B') equipo = 'Comercial';
          else if (un.includes('OTC')) equipo = 'OTC';
          else equipo = 'La Sante';
        } else {
          const rawEq = (getCol(f, ['EQUIPO_VENTAS', 'EQUIPO', 'UNIDAD_NEGOCIO', 'LABORATORIO']) || '').toUpperCase();
          if (rawEq.includes('COMERCIAL') || rawEq === 'B') equipo = 'Comercial';
          else if (rawEq.includes('OTC')) equipo = 'OTC';
          else equipo = 'La Sante';
        }

        // 5. Match y homologación de cliente / farmacia (multi-nombre entre droguerías)
        const { cliMatch, ident01Homologado } = resolverCliente(drogRaw, codClienteDrog, nombreCliRaw);

        const cliId = ident01Homologado || (cliMatch ? (cliMatch.ident01 || cliMatch.id) : (codClienteDrog || clientes[0]?.ident01 || `cli-${i}`));
        const cliNombre = cliMatch?.nombre_fantasia || cliMatch?.razon_social || nombreCliRaw || 'Farmacia';

        // 6. Match de droguería
        const drogMatch = resolverDrogueria(drogRaw);

        const drogId = drogMatch ? drogMatch.id : (droguerias[0]?.id || 'drog-001');
        const drogNombre = drogMatch ? drogMatch.nombre_drogueria : (drogRaw || 'Drogueria General');

        // 7. Cantidad y Precio:
        const unidades = parseInt(unidadesRaw) || 10;
        const precio = prodMatch?.precio_lista || 5.0;
        const desc = parseFloat(getCol(f, ['DESCUENTO_PROMEDIO', 'DESCUENTO_PORC', 'DESCUENTO', 'Descuento'])?.replace(',', '.')) || (prodMatch?.descuento_maximo_porc ? Math.min(12.0, prodMatch.descuento_maximo_porc) : 10.0);

        return {
          id: `hist-imp-${Date.now()}-${i}`,
          cliente_id: cliId,
          drogueria_id: drogId,
          producto_id: prodId,
          fecha_pedido: fecha,
          equipo_origen: equipo,
          numero_factura_origen: getCol(f, ['NUMERO_FACTURA', 'FACTURA']) || `FAC-${Date.now().toString().slice(-6)}-${i+1}`,
          cantidad_solicitada: unidades,
          cantidad_facturada: unidades,
          precio_unitario: precio,
          descuento_porcentaje: desc,

          // Campos específicos de las 8 columnas del usuario
          cod_sap: codSapResuelto,
          codigo_producto_drogueria: codigoProdDrog,
          nombre_producto: prodNombre,
          cod_cliente_drogueria: codClienteDrog,
          nombre_cliente: cliNombre,
          nombre_drogueria: drogNombre,
          mes_periodo: mesPeriodoFila,
          archivo_origen: nombreArchivo || `ventas_${mesPeriodoFila}.csv`,
          cliente_ident01: ident01Homologado,
        };
      });

      // Guardar nuevos mapeos aprendidos
      if (nuevosMapeosAprendidos.length > 0) {
        setMapeosProductosDrogueria(prev => [...prev, ...nuevosMapeosAprendidos]);
        void sincronizarMapeos(nuevosMapeosAprendidos);
      }

      // Sincronizar con Supabase si está disponible: el servidor recibe los códigos y nombres de la droguería tal cual
      // y los enlaza con la farmacia y el producto (lo que no reconoce queda pendiente de homologar).
      let avisoNube = '';
      if (supabase) {
        try {
          await guardarDroguerias(supabase, droguerias);
          const r = await importarVentas(supabase, nuevoHistorico);
          if (r.droguerias_desconocidas.length > 0) avisoNube = ` En Supabase no se reconocieron las droguerías: ${r.droguerias_desconocidas.join(', ')}.`;
        } catch (err: unknown) {
          avisoNube = ` Guardado en este navegador, pero no se pudo subir a Supabase: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      onImportarHistorico(nuevoHistorico);
      showNotification(avisoNube ? 'error' : 'exito', `Se han procesado e incorporado ${nuevoHistorico.length} registros historicos (${mesPeriodo}) con resolución de Cod SAP y Farmacias.${avisoNube}`);
    }

    setArchivoTexto('');
    setNombreArchivo('');
  };

  // Homologación de farmacias y diccionario Cod SAP: se guardan localmente y, si hay Supabase, se sincronizan por clave natural
  // (droguería + ident01/SKU + los códigos que ESA droguería usa). Lo que el servidor no puede resolver se avisa.
  const sincronizarHomologacion = async (entrada: { alias?: ClienteDrogueriaAlias[]; mapeos?: ProductoDrogueriaMapeo[] }) => {
    const supabase = getSupabaseClient();
    if (!supabase || ((entrada.alias?.length ?? 0) === 0 && (entrada.mapeos?.length ?? 0) === 0)) return;
    try {
      const r = await importarHomologacion(supabase, entrada);
      if (r.omitidos.length > 0) {
        showNotification('error', `${r.omitidos.length} homologación(es) no se subieron a Supabase (droguería, farmacia o SKU inexistente, o código ya asignado a otro). Revisa que los catálogos estén cargados en la nube.`);
      }
    } catch (err: unknown) {
      console.warn('No se pudo sincronizar la homologación con Supabase:', err instanceof Error ? err.message : err);
    }
  };
  const sincronizarAliases = (alias: ClienteDrogueriaAlias[]) => sincronizarHomologacion({ alias });
  const sincronizarMapeos = (mapeos: ProductoDrogueriaMapeo[]) => sincronizarHomologacion({ mapeos });

  const agregarAliases = (nuevos: ClienteDrogueriaAlias[]) => {
    const claves = new Set(nuevos.map((a) => `${norm(a.drogueria)}|${norm(a.nombre_cliente_drogueria)}`));
    setAliasesFarmacias((prev) => [
      ...prev.filter((a) => !claves.has(`${norm(a.drogueria)}|${norm(a.nombre_cliente_drogueria)}`)),
      ...nuevos,
    ]);
    void sincronizarAliases(nuevos);
  };

  const crearAlias = (drogueria: string, codCliente: string, nombreCliente: string, ident01: string): ClienteDrogueriaAlias => ({
    id: `alias-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cliente_ident01: ident01,
    drogueria,
    cod_cliente_drogueria: codCliente,
    nombre_cliente_drogueria: nombreCliente,
    verificado: true,
    created_at: new Date().toISOString(),
  });

  const handleConfirmarHomologacion = (drogueria: string, codClienteDrog: string, nombreClienteDrog: string, ident01: string) => {
    agregarAliases([crearAlias(drogueria, codClienteDrog, nombreClienteDrog, ident01)]);
    showNotification('exito', `Homologación guardada: "${nombreClienteDrog}" (${drogueria}) enlazada a ${ident01}.`);
  };

  const handleConfirmarHomologacionLote = (items: FarmaciaPendiente[]) => {
    agregarAliases(items.map((p) => crearAlias(p.drogueria, p.cod_cliente, p.nombre_cliente, p.sugerenciaIdent01)));
    showNotification('exito', `${items.length} farmacias homologadas con la sugerencia automática.`);
  };

  const handleEliminarAlias = (id: string) => {
    setAliasesFarmacias((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAsignarMapeoSap = (drogueria: string, codigoProducto: string, nombreProducto: string, codSap: string) => {
    const nuevoMapeo: ProductoDrogueriaMapeo = {
      id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cod_sap: codSap,
      drogueria,
      codigo_producto_drogueria: codigoProducto,
      nombre_producto_drogueria: nombreProducto,
      created_at: new Date().toISOString(),
    };
    setMapeosProductosDrogueria((prev) => [
      ...prev.filter((m) => !(norm(m.drogueria) === norm(drogueria) && norm(m.codigo_producto_drogueria) === norm(codigoProducto))),
      nuevoMapeo,
    ]);
    void sincronizarMapeos([nuevoMapeo]);
    showNotification('exito', `Cod SAP ${codSap} asignado a producto ${codigoProducto} (${drogueria}).`);
  };

  const handleEliminarMapeo = (id: string) => {
    setMapeosProductosDrogueria((prev) => prev.filter((m) => m.id !== id));
  };

  // Manejo de Modales Droguería
  const handleAbrirEditarDrogueria = (drog: Drogueria) => {
    setDrogueriaAEditar({ ...drog });
    setModalDrogueriaEditarAbierto(true);
  };

  const handleGuardarEdicionDrogueria = (e: React.FormEvent) => {
    e.preventDefault();
    if (!drogueriaAEditar) return;
    if (onEditarDrogueria) {
      onEditarDrogueria(drogueriaAEditar);
    }
    setModalDrogueriaEditarAbierto(false);
    setDrogueriaAEditar(null);
    showNotification('exito', `Drogueria ${drogueriaAEditar.nombre_drogueria} actualizada con exito.`);
  };

  const handleEliminarDrogueriaClick = (drog: Drogueria) => {
    const confirm = window.confirm(`¿Estas seguro de eliminar permanentemente la drogueria "${drog.nombre_drogueria}" (${drog.codigo_drogueria}) de la dimension dim_droguerias?`);
    if (confirm && onEliminarDrogueria) {
      onEliminarDrogueria(drog.id);
      showNotification('exito', `Drogueria ${drog.nombre_drogueria} eliminada.`);
    }
  };

  const handleCrearDrogueriaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDrogueriaNueva.nombre_drogueria.trim()) return;

    const nextIdNum = droguerias.reduce((max, d) => Math.max(max, d.id_numero || 0), 0) + 1;
    const codigo = formDrogueriaNueva.codigo_drogueria.trim() || `DROG-${formDrogueriaNueva.nombre_drogueria.replace(/\s+/g, '').toUpperCase()}`;

    const nueva: Drogueria = {
      id: `drog-${codigo.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      id_numero: nextIdNum,
      codigo_drogueria: codigo,
      nombre_drogueria: formDrogueriaNueva.nombre_drogueria.trim(),
      pagina_web: formDrogueriaNueva.pagina_web.trim(),
      email_pedidos: formDrogueriaNueva.email_pedidos.trim() || `pedidos@${formDrogueriaNueva.nombre_drogueria.toLowerCase().replace(/\s+/g, '')}.com`,
      telefono: formDrogueriaNueva.telefono.trim(),
      tiempo_entrega_promedio_dias: Number(formDrogueriaNueva.tiempo_entrega_promedio_dias) || 2,
      activo: formDrogueriaNueva.activo,
      created_at: new Date().toISOString(),
      formato_csv_config: {
        delimitador: formDrogueriaNueva.delimitador,
        incluir_encabezados: true,
        entrecomillado: formDrogueriaNueva.delimitador === ',' ? 'siempre' : 'solo_texto',
        codificacion: 'UTF-8',
        salto_linea: '\r\n',
        formato_decimal: formDrogueriaNueva.delimitador === ';' ? 'coma' : 'punto',
        columnas: [
          { campo_origen: 'codigo_cliente', nombre_encabezado: 'COD_CLIENTE', orden: 1, formato: 'texto' },
          { campo_origen: 'sku', nombre_encabezado: 'SKU_PRODUCTO', orden: 2, formato: 'texto' },
          { campo_origen: 'cantidad_confirmada', nombre_encabezado: 'CANTIDAD', orden: 3, formato: 'entero' },
          { campo_origen: 'descuento_porcentaje', nombre_encabezado: 'DESCUENTO', orden: 4, formato: formDrogueriaNueva.delimitador === ';' ? 'decimal_coma' : 'decimal_punto' },
          { campo_origen: 'numero_pedido', nombre_encabezado: 'NUMERO_ORDEN', orden: 5, formato: 'texto' },
        ],
      },
    };

    if (onCrearDrogueria) {
      onCrearDrogueria(nueva);
    }
    setModalDrogueriaNuevaAbierto(false);
    setFormDrogueriaNueva({
      nombre_drogueria: '',
      codigo_drogueria: '',
      pagina_web: '',
      delimitador: ';',
      email_pedidos: '',
      telefono: '',
      tiempo_entrega_promedio_dias: 2,
      activo: true,
    });
    showNotification('exito', `Drogueria ${nueva.nombre_drogueria} registrada.`);
  };

  // Manejo de Modales Producto
  const handleAbrirEditarProducto = (prod: Producto) => {
    setProductoAEditar({ ...prod });
    setModalProductoEditarAbierto(true);
  };

  const handleGuardarEdicionProducto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoAEditar) return;
    if (onEditarProducto) {
      onEditarProducto({
        ...productoAEditar,
        sku: productoAEditar.codigo || productoAEditar.sku,
        nombre_comercial: productoAEditar.product || productoAEditar.nombre_comercial,
        principio_activo: productoAEditar.molecula || productoAEditar.principio_activo,
        presentacion: productoAEditar.pack || productoAEditar.presentacion,
        laboratorio: productoAEditar.unidad_negocio || productoAEditar.laboratorio,
      });
    }
    setModalProductoEditarAbierto(false);
    setProductoAEditar(null);
    showNotification('exito', `Medicamento ${productoAEditar.product || productoAEditar.nombre_comercial} actualizado.`);
  };

  const handleEliminarProductoClick = (prod: Producto) => {
    const confirm = window.confirm(`¿Estas seguro de eliminar permanentemente el medicamento "${prod.product || prod.nombre_comercial}" (${prod.codigo || prod.sku}) de dim_productos?`);
    if (confirm && onEliminarProducto) {
      onEliminarProducto(prod.id);
      showNotification('exito', `Medicamento ${prod.product || prod.nombre_comercial} eliminado.`);
    }
  };

  const handleCrearProductoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProductoNuevo.codigo.trim() || !formProductoNuevo.product.trim()) {
      alert('Por favor completa al menos los campos Codigo y Product.');
      return;
    }

    if (onCrearProducto) {
      onCrearProducto({
        sku: formProductoNuevo.codigo.trim(),
        codigo_barras_ean13: formProductoNuevo.pack_code.trim() || `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        principio_activo: formProductoNuevo.molecula.trim() || 'Principio Activo',
        nombre_comercial: formProductoNuevo.product.trim(),
        presentacion: formProductoNuevo.pack.trim() || formProductoNuevo.descripcion.trim() || 'Caja x 30',
        laboratorio: formProductoNuevo.unidad_negocio.trim(),
        precio_lista: Number(formProductoNuevo.precio_lista) || 0,
        descuento_maximo_porc: Number(formProductoNuevo.descuento_maximo_porc) || 15.0,
        es_prioritario: formProductoNuevo.clasificacion_portafolio.toLowerCase().includes('estrat') || formProductoNuevo.clasificacion_portafolio.toLowerCase().includes('prio'),
        factor_prioridad: 1.30,
        empaque_minimo: Number(formProductoNuevo.empaque_minimo) || 10,
        stock_disponible: Number(formProductoNuevo.stock_disponible) || 0,
        activo: formProductoNuevo.activo,
        equipo_asignado: formProductoNuevo.unidad_negocio.toLowerCase().includes('comercial') ? 'Comercial' : formProductoNuevo.unidad_negocio.toLowerCase().includes('otc') ? 'OTC' : 'La Sante',

        // 12 Campos sin acentos
        codigo: formProductoNuevo.codigo.trim(),
        descripcion: formProductoNuevo.descripcion.trim() || formProductoNuevo.product.trim(),
        unidad_negocio: formProductoNuevo.unidad_negocio.trim(),
        clase_terapeutica: formProductoNuevo.clase_terapeutica.trim(),
        sistemas: formProductoNuevo.sistemas.trim(),
        clasificacion_portafolio: formProductoNuevo.clasificacion_portafolio.trim(),
        product_code: formProductoNuevo.product_code.trim() || formProductoNuevo.codigo.trim(),
        product: formProductoNuevo.product.trim(),
        pack_code: formProductoNuevo.pack_code.trim(),
        pack: formProductoNuevo.pack.trim() || 'Caja x 30',
        molecula: formProductoNuevo.molecula.trim() || 'Principio Activo',
        estado_texto: formProductoNuevo.activo ? 'Activo' : 'Inactivo',
      });
    }

    setModalProductoNuevoAbierto(false);
    setFormProductoNuevo(initialFormProducto);
    showNotification('exito', `Medicamento ${formProductoNuevo.product} registrado en dim_productos.`);
  };

  // Manejo de Modales Cliente (11 Campos con ident01 como Primary Key)
  const handleAbrirEditarCliente = (cli: Cliente) => {
    setClienteAEditar({ ...cli });
    setModalClienteEditarAbierto(true);
  };

  const handleGuardarEdicionCliente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteAEditar) return;
    if (onEditarCliente) {
      onEditarCliente({
        ...clienteAEditar,
        codigo_cliente: clienteAEditar.ident01,
        nombre_comercial: clienteAEditar.nombre_fantasia,
        ciudad: clienteAEditar.municipio_ciudad || clienteAEditar.ciudad,
        direccion: `${clienteAEditar.municipio_ciudad || ''}, ${clienteAEditar.estado}`,
      });
    }
    setModalClienteEditarAbierto(false);
    setClienteAEditar(null);
    showNotification('exito', `Farmacia ${clienteAEditar.nombre_fantasia || clienteAEditar.razon_social} actualizada.`);
  };

  const handleEliminarClienteClick = (cli: Cliente) => {
    const confirm = window.confirm(`¿Estas seguro de eliminar permanentemente a la farmacia "${cli.nombre_fantasia || cli.razon_social}" (ID: ${cli.ident01}) de dim_clientes?`);
    if (confirm && onEliminarCliente) {
      onEliminarCliente(cli.ident01 || cli.id);
      showNotification('exito', `Farmacia ${cli.nombre_fantasia || cli.razon_social} eliminada.`);
    }
  };

  const handleCrearClienteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClienteNuevo.ident01.trim() || !formClienteNuevo.razon_social.trim() || !formClienteNuevo.nombre_fantasia.trim()) {
      alert('Por favor completa al menos los campos ident01, Razon Social y Nombre de Fantasia.');
      return;
    }

    if (onCrearCliente) {
      onCrearCliente({
        id: formClienteNuevo.ident01.trim(),
        ident01: formClienteNuevo.ident01.trim(),
        codigo_cliente: formClienteNuevo.ident01.trim(),
        rif: formClienteNuevo.rif.trim() || 'J-00000000-0',
        razon_social: formClienteNuevo.razon_social.trim(),
        nombre_fantasia: formClienteNuevo.nombre_fantasia.trim(),
        nombre_comercial: formClienteNuevo.nombre_fantasia.trim(),
        brick: formClienteNuevo.brick.trim() || 'CCS-CENTRO-01',
        municipio_ciudad: formClienteNuevo.municipio_ciudad.trim() || 'Caracas',
        ciudad: formClienteNuevo.municipio_ciudad.trim() || 'Caracas',
        direccion: `${formClienteNuevo.municipio_ciudad.trim()}, ${formClienteNuevo.estado.trim()}`,
        estado: formClienteNuevo.estado.trim() || 'Miranda',
        frecuencia: formClienteNuevo.frecuencia.trim() || 'Semanal',
        bandera: formClienteNuevo.bandera.trim() || 'Independiente',
        local_gps_lat: Number(formClienteNuevo.local_gps_lat) || 10.4800,
        local_gps_lon: Number(formClienteNuevo.local_gps_lon) || -66.8600,
        clasificacion_abc: 'B',
        cupo_credito: 5000,
        dias_credito: 15,
        telefono: '',
        email_contacto: '',
        activo: formClienteNuevo.activo,
        created_at: new Date().toISOString(),
      });
    }

    setModalClienteNuevoAbierto(false);
    setFormClienteNuevo(initialFormCliente);
    showNotification('exito', `Farmacia ${formClienteNuevo.nombre_fantasia} registrada en dim_clientes.`);
  };

  const clientesFiltrados = useMemo(() => {
    if (!filtroBusquedaCliente.trim()) return clientes;
    const q = filtroBusquedaCliente.toLowerCase().trim();
    return clientes.filter((c) =>
      (c.ident01 || '').toLowerCase().includes(q) ||
      (c.codigo_cliente || '').toLowerCase().includes(q) ||
      (c.rif || '').toLowerCase().includes(q) ||
      (c.razon_social || '').toLowerCase().includes(q) ||
      (c.nombre_fantasia || '').toLowerCase().includes(q) ||
      (c.nombre_comercial || '').toLowerCase().includes(q) ||
      (c.brick || '').toLowerCase().includes(q) ||
      (c.municipio_ciudad || '').toLowerCase().includes(q) ||
      (c.estado || '').toLowerCase().includes(q) ||
      (c.bandera || '').toLowerCase().includes(q)
    );
  }, [clientes, filtroBusquedaCliente]);

  // Solo se calcula mientras se mira la tabla del histórico acumulado; la búsqueda usa un valor diferido
  // para no bloquear el teclado y los cruces con clientes/productos usan índices (antes, un .find por fila).
  const viendoAcumulado = subTab === 'historico' && seccionHistoricoActiva === 'acumulado';
  const filtroHistoricoDiferido = useDeferredValue(filtroHistorico);

  const historicoFiltrado = useMemo(() => {
    if (!viendoAcumulado) return [];
    if (!filtroHistoricoDiferido.trim()) return historicoPrevio;
    const q = norm(filtroHistoricoDiferido).trim();
    const clientesPorId = new Map<string, Cliente>();
    clientes.forEach((c) => {
      clientesPorId.set(c.id, c);
      clientesPorId.set(c.ident01, c);
    });
    const productosPorId = new Map<string, Producto>();
    productos.forEach((p) => {
      productosPorId.set(p.id, p);
      productosPorId.set(p.sku, p);
    });
    const contiene = (v: string | undefined) => !!v && norm(v).includes(q);
    return historicoPrevio.filter((h) => {
      const cli = clientesPorId.get(h.cliente_id);
      const prod = productosPorId.get(h.producto_id);
      return (
        contiene(h.cliente_id) ||
        contiene(h.producto_id) ||
        contiene(h.cod_sap) ||
        contiene(h.codigo_producto_drogueria) ||
        contiene(h.nombre_producto) ||
        contiene(h.cod_cliente_drogueria) ||
        contiene(h.nombre_cliente) ||
        contiene(h.nombre_drogueria) ||
        contiene(cli?.nombre_fantasia) ||
        contiene(cli?.razon_social) ||
        contiene(prod?.nombre_comercial) ||
        contiene(prod?.sku) ||
        contiene(h.numero_factura_origen)
      );
    });
  }, [viendoAcumulado, historicoPrevio, filtroHistoricoDiferido, clientes, productos]);

  const metricasHistorico = useMemo(() => {
    if (!viendoAcumulado) return { udsTotal: 0, udsA: 0, udsB: 0, udsOTC: 0 };
    let udsTotal = 0;
    let udsA = 0;
    let udsB = 0;
    let udsOTC = 0;
    historicoPrevio.forEach((h) => {
      const cant = h.cantidad_facturada || 0;
      udsTotal += cant;
      const eq = (h.equipo_origen || '').toUpperCase();
      if (eq.includes('SANTE') || eq === 'A') udsA += cant;
      else if (eq.includes('COMERCIAL') || eq === 'B') udsB += cant;
      else if (eq.includes('OTC')) udsOTC += cant;
    });
    return { udsTotal, udsA, udsB, udsOTC };
  }, [viendoAcumulado, historicoPrevio]);

  return (
    <div className="space-y-6">

      {/* Notificación Toast */}
      {notificacion && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
          notificacion.tipo === 'exito'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {notificacion.tipo === 'exito' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="font-semibold">{notificacion.texto}</span>
          </div>
          <button onClick={() => setNotificacion(null)} className="opacity-80 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {/* Barra de Sub-Pestañas */}
      <div className={`flex flex-nowrap sm:flex-wrap overflow-x-auto scrollbar-none gap-2 p-1.5 rounded-2xl border [&>button]:shrink-0 [&>button]:whitespace-nowrap ${
        esClaro ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
      }`}>
        <button
          onClick={() => { setSubTab('droguerias'); setArchivoTexto(''); setNombreArchivo(''); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            subTab === 'droguerias'
              ? 'bg-teal-600 text-white shadow-sm'
              : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Droguerías ({droguerias.length})</span>
        </button>

        <button
          onClick={() => { setSubTab('productos'); setArchivoTexto(''); setNombreArchivo(''); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            subTab === 'productos'
              ? 'bg-teal-600 text-white shadow-sm'
              : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Productos ({productos.length})</span>
        </button>

        <button
          onClick={() => { setSubTab('clientes'); setArchivoTexto(''); setNombreArchivo(''); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            subTab === 'clientes'
              ? 'bg-teal-600 text-white shadow-sm'
              : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Farmacias ({clientes.length})</span>
        </button>

        <button
          onClick={() => { setSubTab('historico'); setArchivoTexto(''); setNombreArchivo(''); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            subTab === 'historico'
              ? 'bg-teal-600 text-white shadow-sm'
              : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Ventas históricas ({historicoPrevio.length})</span>
        </button>

      </div>

      {(
        <div className="space-y-6">

          {/* Tarjeta de Importación CSV */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                  <span>
                    Importacion Masiva para:{' '}
                    <strong className="text-teal-600">
                      {subTab === 'droguerias' ? 'dim_droguerias' : subTab === 'productos' ? 'dim_productos (12 Campos)' : subTab === 'clientes' ? 'dim_clientes' : 'fact_ventas_drogueria (ventas de las droguerías)'}
                    </strong>
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Descarga la plantilla CSV oficial (sin acentos en encabezados) o sube tu archivo para procesarlo.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {subTab === 'historico' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDescargarPlantilla('historico_resumen')}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all min-h-[44px]"
                      title="Estructura comprimida al 95% ideal para 1.000.000 de filas en Supabase Gratuito"
                    >
                      <Zap className="w-4 h-4 text-amber-300" />
                      <span>Plantilla Resumen Mensual (1M+)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDescargarPlantilla('historico')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700 min-h-[44px]"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-600" />
                      <span>Plantilla Diaria</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDescargarPlantilla(subTab as any)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700 min-h-[44px]"
                  >
                    <Download className="w-4 h-4 text-teal-600" />
                    <span>Descargar Plantilla CSV</span>
                  </button>
                )}
              </div>
            </div>

            {/* Zona de Drop / Archivo */}
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-teal-500 transition-colors">
              <input
                type="file"
                accept=".csv,.txt"
                id="file-upload"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer space-y-2 block">
                <UploadCloud className="w-8 h-8 mx-auto text-teal-600 dark:text-teal-400" />
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {nombreArchivo ? `Archivo seleccionado: ${nombreArchivo}` : 'Haz clic para seleccionar tu archivo CSV o arrastralo aqui'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Formatos soportados: CSV con delimitador punto y coma (;), coma (,) o tabulacion (\t).
                </div>
              </label>
            </div>
          </div>

          {/* Vista Previa de Filas Parseadas */}
          {filasParseadas.length > 0 && (
            <div className={`p-5 rounded-2xl border space-y-4 ${
              esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
            }`}>
              {/* Tarjeta de Detección Automática de Mes para Histórico */}
              {subTab === 'historico' && (
                <div className="space-y-3">
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    esClaro ? 'bg-teal-50/80 border-teal-200 text-teal-950' : 'bg-teal-950/40 border-teal-800/80 text-teal-200'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            Mes Intuido del Archivo:
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-teal-600 text-white font-mono font-extrabold text-xs">
                            {infoMesDetectado?.mesTexto || 'Período Mensual'} {infoMesDetectado?.anio || '2026'} ({infoMesDetectado?.periodo || '2026-01'})
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-teal-200/60 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200 text-[10px] font-bold">
                            Venta Diaria Automática
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Archivo: <b>{nombreArchivo}</b> • {filasParseadas.length.toLocaleString()} líneas detectadas.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-500 font-medium">Ajustar mes:</span>
                      <select
                        value={infoMesDetectado?.periodo || '2026-01'}
                        onChange={(e) => {
                          const [y, m] = e.target.value.split('-');
                          const nombresMes = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                          setInfoMesDetectado({
                            mesNum: m,
                            mesTexto: nombresMes[parseInt(m)] || 'Mes',
                            anio: y,
                            periodo: e.target.value
                          });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                          esClaro ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                        }`}
                      >
                        <option value="2026-01">2026-01 (Enero 2026)</option>
                        <option value="2026-02">2026-02 (Febrero 2026)</option>
                        <option value="2026-03">2026-03 (Marzo 2026)</option>
                        <option value="2026-04">2026-04 (Abril 2026)</option>
                        <option value="2026-05">2026-05 (Mayo 2026)</option>
                        <option value="2026-06">2026-06 (Junio 2026)</option>
                        <option value="2026-07">2026-07 (Julio 2026)</option>
                        <option value="2026-08">2026-08 (Agosto 2026)</option>
                        <option value="2026-09">2026-09 (Septiembre 2026)</option>
                        <option value="2026-10">2026-10 (Octubre 2026)</option>
                        <option value="2026-11">2026-11 (Noviembre 2026)</option>
                        <option value="2026-12">2026-12 (Diciembre 2026)</option>
                      </select>
                    </div>
                  </div>

                  {/* Alerta de Cod SAP Faltante */}
                  {diagnosticoVentasMes.productosSinSap.length > 0 && (
                    <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      esClaro ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-amber-950/30 border-amber-800/60 text-amber-200'
                    }`}>
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold">
                            ⚡ {diagnosticoVentasMes.productosSinSap.length} productos sin Cod SAP en este reporte ({diagnosticoVentasMes.productosSinSap.reduce((acc, p) => acc + p.totalUnidades, 0).toLocaleString()} unidades)
                          </div>
                          <p className="text-[11px] text-amber-800 dark:text-amber-300">
                            Como el Cod SAP no viene en los reportes de las droguerías, al asociarlo aquí el sistema lo memoriza para los meses siguientes.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => irASeccionHistorico('mapeo_sap')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-sm"
                      >
                        Asignar Cod SAP faltantes
                      </button>
                    </div>
                  )}

                  {/* Alerta de Farmacias Multi-Nombre (Homologación) */}
                  {diagnosticoVentasMes.farmaciasSinHomologar.length > 0 && (
                    <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      esClaro ? 'bg-indigo-50 border-indigo-200 text-indigo-950' : 'bg-indigo-950/30 border-indigo-800/60 text-indigo-200'
                    }`}>
                      <div className="flex items-start gap-2.5">
                        <Users className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold">
                            🏷️ {diagnosticoVentasMes.farmaciasSinHomologar.length} nombres de farmacias reportados con variantes por las droguerías
                          </div>
                          <p className="text-[11px] text-indigo-800 dark:text-indigo-300">
                            Ej: Droguerías con nombres como &quot;FARMATODO SAN LUIS&quot; o &quot;FTO SAN LUIS&quot;. Revisa o confirma las sugerencias automáticas.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => irASeccionHistorico('homologar')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 shadow-sm"
                      >
                        Homologar farmacias
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Vista Previa de Datos a Importar ({filasParseadas.length} filas detectadas)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verifica que las columnas correspondan al destino antes de procesar e incorporar.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleProcesarCarga}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all min-h-[44px]"
                >
                  <Check className="w-4 h-4" />
                  <span>Procesar e Incorporar a la Base de Datos</span>
                </button>
              </div>

              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase border-b">
                    <tr>
                      {Object.keys(filasParseadas[0] || {}).map((col) => (
                        <th key={col} className="p-2.5">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    {filasParseadas.slice(0, 8).map((f, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        {Object.values(f).map((val: any, j) => (
                          <td key={j} className="p-2.5 truncate max-w-40">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filasParseadas.length > 8 && (
                <div className="text-[11px] text-slate-400 text-center pt-1">
                  Mostrando las primeras 8 filas de {filasParseadas.length} registros.
                </div>
              )}
            </div>
          )}

          {/* PESTAÑA 1: Listado y Gestion de Droguerias */}
          {subTab === 'droguerias' && (
            <div className={`p-5 rounded-2xl border space-y-4 ${
              esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
            }`}>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-teal-600" />
                    <span>Droguerías ({droguerias.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Las distribuidoras con las que trabajas y el formato de su archivo de pedido.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModalDrogueriaNuevaAbierto(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all min-h-[44px]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nueva droguería</span>
                  </button>
                </div>
              </div>

              {/* Tabla de Droguerías con ID numérico y Acciones */}
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase border-b">
                    <tr>
                      <th className="p-2.5 font-bold text-center">ID (PK)</th>
                      <th className="p-2.5 font-bold">Nombre (Ventas al Dia)</th>
                      <th className="p-2.5 font-bold">Codigo Drogueria</th>
                      <th className="p-2.5 font-bold">Pagina Web / Portal B2B</th>
                      <th className="p-2.5 font-bold text-center">Delimitador CSV</th>
                      <th className="p-2.5 font-bold">Email de Pedidos</th>
                      <th className="p-2.5 font-bold text-center">Estado</th>
                      <th className="p-2.5 font-bold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    {droguerias.map((drog, idx) => (
                      <tr key={drog.id || idx} className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors">
                        
                        {/* ID Numérico Primary Key */}
                        <td className="p-2.5 text-center">
                          <span className="inline-flex items-center justify-center font-mono font-extrabold text-xs px-2.5 py-1 rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                            #{drog.id_numero || idx + 1}
                          </span>
                        </td>

                        {/* Nombre Ventas al Día */}
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0"></span>
                          <span>{drog.nombre_drogueria}</span>
                        </td>

                        {/* Código Droguería */}
                        <td className="p-2.5 font-mono font-semibold text-teal-700 dark:text-teal-400">
                          {drog.codigo_drogueria}
                        </td>

                        {/* Página Web / Portal B2B */}
                        <td className="p-2.5">
                          {drog.pagina_web ? (
                            <a
                              href={drog.pagina_web}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:underline font-medium text-[11px]"
                            >
                              <Globe className="w-3 h-3" />
                              <span>{drog.pagina_web.replace('https://', '').replace('http://', '').replace('www.', '')}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Sin portal</span>
                          )}
                        </td>

                        {/* Delimitador CSV */}
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                            {drog.formato_csv_config?.delimitador === '\t' ? 'TAB' : `"${drog.formato_csv_config?.delimitador || ';'}"`}
                          </span>
                        </td>

                        {/* Email Pedidos */}
                        <td className="p-2.5 text-slate-500 truncate max-w-44">{drog.email_pedidos}</td>

                        {/* Estado */}
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            drog.activo 
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' 
                              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                          }`}>
                            {drog.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>

                        {/* Botones de Modificar / Eliminar */}
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleAbrirEditarDrogueria(drog)}
                              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                              title="Editar Drogueria"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEliminarDrogueriaClick(drog)}
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                              title="Eliminar Drogueria"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: Listado y Gestion de Productos (12 Campos sin acentos) */}
          {subTab === 'productos' && (
            <div className={`p-5 rounded-2xl border space-y-4 ${
              esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
            }`}>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Pill className="w-4 h-4 text-teal-600" />
                    <span>Catalogo de Medicamentos en dim_productos ({productos.length} Registros)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Estructura normalizada en 12 campos (sin acentos) con capacidad de edicion y eliminacion inmediata.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModalProductoNuevoAbierto(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all min-h-[44px]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar Medicamento</span>
                  </button>
                </div>
              </div>

              {/* Tabla de Productos */}
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase border-b">
                    <tr>
                      <th className="p-2.5 font-bold">#</th>
                      <th className="p-2.5 font-bold">Codigo</th>
                      <th className="p-2.5 font-bold">Product (Nombre Comercial)</th>
                      <th className="p-2.5 font-bold">Molecula</th>
                      <th className="p-2.5 font-bold">Unidad de Negocio</th>
                      <th className="p-2.5 font-bold">Clase Terapeutica</th>
                      <th className="p-2.5 font-bold">Sistemas</th>
                      <th className="p-2.5 font-bold">Clasificacion Portafolio</th>
                      <th className="p-2.5 font-bold">Pack Code</th>
                      <th className="p-2.5 font-bold">Pack</th>
                      <th className="p-2.5 font-bold text-center">Estado</th>
                      <th className="p-2.5 font-bold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    {productos.slice(0, 50).map((prod, idx) => (
                      <tr key={prod.id || idx} className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors">
                        <td className="p-2.5 text-slate-400 font-semibold">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-teal-700 dark:text-teal-400">
                          {prod.codigo || prod.sku}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-white">
                          {prod.product || prod.nombre_comercial}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">
                          {prod.molecula || prod.principio_activo}
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {prod.unidad_negocio || prod.laboratorio}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500">{prod.clase_terapeutica || '—'}</td>
                        <td className="p-2.5 text-slate-500">{prod.sistemas || '—'}</td>
                        <td className="p-2.5 text-slate-500 font-mono text-[10px]">{prod.clasificacion_portafolio || '—'}</td>
                        <td className="p-2.5 font-mono text-slate-500">{prod.pack_code || prod.codigo_barras_ean13 || '—'}</td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400">{prod.pack || prod.presentacion || '—'}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            prod.activo 
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' 
                              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                          }`}>
                            {prod.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleAbrirEditarProducto(prod)}
                              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                              title="Editar Medicamento"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEliminarProductoClick(prod)}
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                              title="Eliminar Medicamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {productos.length > 50 && (
                <div className="text-[11px] text-slate-400 text-center pt-1 font-sans">
                  Mostrando los primeros 50 medicamentos de {productos.length} registrados en dim_productos.
                </div>
              )}
            </div>
          )}

          {/* PESTAÑA 3: Listado de Clientes con los 11 Campos (ident01 como Primary Key) */}
          {subTab === 'clientes' && (
            <div className={`p-5 rounded-2xl border space-y-4 ${
              esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
            }`}>
              
              {/* Tarjetas Arquitectónicas: Solución a Farmacias Coincidentes y Códigos por Droguería */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                
                {/* Solución 1: Representantes vs Farmacias */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  esClaro ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950' : 'bg-indigo-950/30 border-indigo-800/60 text-indigo-200'
                }`}>
                  <Network className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <h4 className="font-bold flex items-center gap-1.5">
                      <span>1. Farmacias coincidentes entre Representantes</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-200 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100 font-mono">rel_cliente_vendedor</span>
                    </h4>
                    <p className="leading-relaxed opacity-90 text-[11px]">
                      Una misma farmacia (<code className="font-bold font-mono">ident01</code>) puede ser atendida por varios representantes simultaneamente (ej: Rep La Sante + Rep Comercial/OTC, o titular/suplente). La tabla puente <code className="font-bold font-mono">rel_cliente_vendedor</code> asocia <code className="font-mono">cliente_id (ident01)</code> con <code className="font-mono">vendedor_id</code> y su <code className="font-mono">linea_equipo</code>, permitiendo consolidar el historico global sin duplicar la farmacia.
                    </p>
                  </div>
                </div>

                {/* Solución 2: Farmacias vs Droguerías */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  esClaro ? 'bg-teal-50/70 border-teal-200 text-teal-950' : 'bg-teal-950/30 border-teal-800/60 text-teal-200'
                }`}>
                  <Link2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <h4 className="font-bold flex items-center gap-1.5">
                      <span>2. Codigo Unico de Farmacia por cada Drogueria</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-teal-200 dark:bg-teal-800 text-teal-900 dark:text-teal-100 font-mono">rel_cliente_drogueria_codigos</span>
                    </h4>
                    <p className="leading-relaxed opacity-90 text-[11px]">
                      Cada distribuidora (Cobeca, Nena, Drobienca, etc.) exige su propio codigo interno de cliente. La tabla puente <code className="font-bold font-mono">rel_cliente_drogueria_codigos</code> vincula <code className="font-mono">cliente_id (ident01)</code> con <code className="font-mono">drogueria_id_numero</code> y su <code className="font-mono">codigo_cliente_drogueria</code> oficial. Al exportar el CSV, Nova reemplaza dinamicamente el codigo sin tocar el maestro.
                    </p>
                  </div>
                </div>

              </div>

              {/* Toolbar con Contador, Buscador y Botón de Registro */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-600" />
                    <span>Cartera de Farmacias en dim_clientes ({clientesFiltrados.length} de {clientes.length} Registros)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cada farmacia se identifica por su código (ident01).
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Buscador en tiempo real */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por ident01, RIF, nombre, brick..."
                      value={filtroBusquedaCliente}
                      onChange={(e) => setFiltroBusquedaCliente(e.target.value)}
                      className={`pl-8 pr-3 py-1.5 rounded-xl text-xs border transition-colors w-52 sm:w-64 ${
                        esClaro 
                          ? 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-teal-500' 
                          : 'bg-slate-950 border-slate-800 text-white focus:border-teal-500'
                      }`}
                    />
                    {filtroBusquedaCliente && (
                      <button
                        onClick={() => setFiltroBusquedaCliente('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setModalClienteNuevoAbierto(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all shrink-0 min-h-[44px]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar Farmacia</span>
                  </button>
                </div>
              </div>

              {/* Tabla de Farmacias (11 Campos) */}
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase border-b sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="p-2.5 font-bold text-center">#</th>
                      <th className="p-2.5 font-bold text-center">ident01 (PK)</th>
                      <th className="p-2.5 font-bold">Razon Social</th>
                      <th className="p-2.5 font-bold">Nombre de Fantasia</th>
                      <th className="p-2.5 font-bold">RIF</th>
                      <th className="p-2.5 font-bold">Brick (IMS)</th>
                      <th className="p-2.5 font-bold">Municipio / Ciudad</th>
                      <th className="p-2.5 font-bold">Estado</th>
                      <th className="p-2.5 font-bold text-center">Frecuencia</th>
                      <th className="p-2.5 font-bold text-center">Bandera</th>
                      <th className="p-2.5 font-bold text-center">GPS</th>
                      <th className="p-2.5 font-bold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    {clientesFiltrados.map((cli, idx) => (
                      <tr key={cli.ident01 || cli.id || idx} className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors">
                        
                        {/* Numeral */}
                        <td className="p-2.5 text-center text-slate-400 font-semibold">{idx + 1}</td>

                        {/* ident01 Primary Key */}
                        <td className="p-2.5 text-center">
                          <span className="inline-flex items-center justify-center font-mono font-extrabold text-xs px-2.5 py-1 rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                            #{cli.ident01 || cli.codigo_cliente || cli.id}
                          </span>
                        </td>

                        {/* Razon Social */}
                        <td className="p-2.5 font-medium text-slate-900 dark:text-white max-w-44 truncate">
                          {cli.razon_social}
                        </td>

                        {/* Nombre de Fantasia */}
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></span>
                            <span>{cli.nombre_fantasia || cli.nombre_comercial}</span>
                          </div>
                        </td>

                        {/* RIF */}
                        <td className="p-2.5 font-mono font-semibold text-slate-600 dark:text-slate-300">
                          {cli.rif}
                        </td>

                        {/* Brick IMS */}
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            {cli.brick || '—'}
                          </span>
                        </td>

                        {/* Municipio / Ciudad / Alcaldía */}
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">
                          {cli.municipio_ciudad || cli.ciudad || '—'}
                        </td>

                        {/* Estado */}
                        <td className="p-2.5 font-medium text-slate-700 dark:text-slate-200">
                          {cli.estado}
                        </td>

                        {/* Frecuencia */}
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {cli.frecuencia || 'Semanal'}
                          </span>
                        </td>

                        {/* Bandera */}
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            {cli.bandera || 'Independiente'}
                          </span>
                        </td>

                        {/* Coordenadas GPS */}
                        <td className="p-2.5 text-center">
                          {cli.local_gps_lat && cli.local_gps_lon ? (
                            <span 
                              title={`Lat: ${cli.local_gps_lat}, Lon: ${cli.local_gps_lon}`}
                              className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            >
                              <MapPin className="w-3 h-3 text-red-500" />
                              <span>{Number(cli.local_gps_lat).toFixed(2)}, {Number(cli.local_gps_lon).toFixed(2)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Sin GPS</span>
                          )}
                        </td>

                        {/* Acciones: Editar y Eliminar */}
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleAbrirEditarCliente(cli)}
                              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                              title="Editar Farmacia"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEliminarClienteClick(cli)}
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                              title="Eliminar Farmacia"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {clientesFiltrados.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  No se encontraron farmacias que coincidan con &quot;{filtroBusquedaCliente}&quot;.
                </div>
              )}
            </div>
          )}

          {/* PESTAÑA 4: Historico de Ventas y Solución +1.000.000 de Filas */}
          {subTab === 'historico' && (
            <div className="space-y-6">

              {/* Subnavegador de Histórico Comercial */}
              <div id="historico-secciones" className={`scroll-mt-20 p-2 rounded-2xl border flex flex-nowrap md:flex-wrap overflow-x-auto scrollbar-none items-center justify-between gap-2 [&_button]:shrink-0 [&_button]:whitespace-nowrap ${
                esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-sm'
              }`}>
                <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSeccionHistoricoActiva('cargar')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      seccionHistoricoActiva === 'cargar'
                        ? 'bg-teal-600 text-white shadow-sm'
                        : esClaro ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>1. Cargar Mes a Mes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeccionHistoricoActiva('homologar')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      seccionHistoricoActiva === 'homologar'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : esClaro ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>2. Homologar Farmacias ({aliasesFarmacias.length})</span>
                    {diagnosticoVentasMes.farmaciasSinHomologar.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                        {diagnosticoVentasMes.farmaciasSinHomologar.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeccionHistoricoActiva('mapeo_sap')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      seccionHistoricoActiva === 'mapeo_sap'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : esClaro ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Tag className="w-4 h-4" />
                    <span>3. Diccionario Cod SAP ({mapeosProductosDrogueria.length})</span>
                    {diagnosticoVentasMes.productosSinSap.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                        {diagnosticoVentasMes.productosSinSap.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeccionHistoricoActiva('acumulado')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      seccionHistoricoActiva === 'acumulado'
                        ? 'bg-teal-600 text-white shadow-sm'
                        : esClaro ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <History className="w-4 h-4" />
                    <span>4. Histórico Acumulado ({historicoPrevio.length})</span>
                  </button>
                </div>


              </div>

              {seccionHistoricoActiva === 'homologar' && (
                <PanelHomologarFarmacias
                  pendientes={diagnosticoVentasMes.farmaciasSinHomologar}
                  hayArchivo={filasParseadas.length > 0}
                  aliases={aliasesFarmacias}
                  clientes={clientes}
                  onConfirmar={handleConfirmarHomologacion}
                  onConfirmarLote={handleConfirmarHomologacionLote}
                  onEliminarAlias={handleEliminarAlias}
                />
              )}

              {seccionHistoricoActiva === 'mapeo_sap' && (
                <PanelMapeoSap
                  pendientes={diagnosticoVentasMes.productosSinSap}
                  hayArchivo={filasParseadas.length > 0}
                  mapeos={mapeosProductosDrogueria}
                  productos={productos}
                  onAsignar={handleAsignarMapeoSap}
                  onEliminar={handleEliminarMapeo}
                />
              )}

              {seccionHistoricoActiva === 'cargar' && (
<>
              {/* 1. BANNER: ¿QUÉ SIGUE DESPUÉS DE CARGAR PRODUCTOS, DROGUERÍAS Y CLIENTES? */}
              <div className={`p-5 rounded-2xl border ${
                esClaro ? 'bg-gradient-to-r from-teal-50 via-indigo-50/40 to-slate-50 border-teal-200 shadow-sm' : 'bg-gradient-to-r from-teal-950/40 via-indigo-950/20 to-slate-900 border-teal-800/60 shadow-lg'
              }`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                      ¿Ya cargaste Productos, Droguerias y Farmacias? Esta es la Ruta Paso a Paso:
                    </h3>
                    <p className="text-xs text-slate-500">
                      Sigue estos 5 pasos ordenados para poner el sistema en produccion comercial y teletransferencias automaticas.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
                  {/* Paso 1 */}
                  <div className={`p-3.5 rounded-xl border relative ${
                    esClaro ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                        PASO 1
                      </span>
                      <Link2 className="w-3.5 h-3.5 text-teal-600" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Mapeo B2B Drogueria
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Asocia el codigo que cada drogueria (Cobeca, Nena, etc.) asigna a cada farmacia (<code className="font-mono text-[10px]">rel_cliente_drogueria_codigos</code>).
                    </p>
                  </div>

                  {/* Paso 2 */}
                  <div className={`p-3.5 rounded-xl border relative ${
                    esClaro ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                        PASO 2
                      </span>
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Asignar Vendedores
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Vincula que vendedores de La Sante (Equipo A) y Comercial/OTC (Equipo B) visitan cada farmacia (<code className="font-mono text-[10px]">rel_cliente_vendedor</code>).
                    </p>
                  </div>

                  {/* Paso 3 */}
                  <div className={`p-3.5 rounded-xl border relative ring-2 ring-teal-500/50 ${
                    esClaro ? 'bg-teal-50/50 border-teal-300' : 'bg-teal-950/40 border-teal-700'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-600 text-white">
                        PASO 3 (ACTUAL)
                      </span>
                      <History className="w-3.5 h-3.5 text-teal-600" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Cargar Historico Ventas
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug font-medium">
                      Sube el acumulado de compras 30/60/90 dias aplicando la pre-agregacion mensual para comprimir 1M+ filas a 40k.
                    </p>
                  </div>

                  {/* Paso 4 */}
                  <div className={`p-3.5 rounded-xl border relative ${
                    esClaro ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300">
                        PASO 4
                      </span>
                      <Calculator className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Motor de Sugeridos
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Entra a la pestaña <b>Pedido Sugerido</b> para verificar el algoritmo de reposicion con empaque minimo y SKUs prioritarios.
                    </p>
                  </div>

                  {/* Paso 5 */}
                  <div className={`p-3.5 rounded-xl border relative ${
                    esClaro ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        PASO 5
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Teletransferencias CSV
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Toma pedidos en campo por voz o camara y exporta el CSV dinamico adaptado al layout de cada drogueria.
                    </p>
                  </div>
                </div>
              </div>

</>
              )}


              {seccionHistoricoActiva === 'acumulado' && (
<>
              {/* 4. MÉTRICAS Y TABLA DE HISTÓRICO CARGADO (8 COLUMNAS EXACTAS) */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
              }`}>
                {/* Métricas Resumen */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`p-3.5 rounded-xl border ${esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Registros Cargados</div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">{historicoPrevio.length.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500">Filas indexadas</div>
                  </div>

                  <div className={`p-3.5 rounded-xl border ${esClaro ? 'bg-teal-50 border-teal-200' : 'bg-teal-950/40 border-teal-800'}`}>
                    <div className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase">Unidades Totales</div>
                    <div className="text-lg font-extrabold text-teal-700 dark:text-teal-300">{metricasHistorico.udsTotal.toLocaleString()}</div>
                    <div className="text-[10px] text-teal-600">Uds vendidas / facturadas</div>
                  </div>

                  <div className={`p-3.5 rounded-xl border ${esClaro ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-950/40 border-indigo-800'}`}>
                    <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase">Equipo A (La Sante)</div>
                    <div className="text-lg font-extrabold text-indigo-700 dark:text-indigo-300">{metricasHistorico.udsA.toLocaleString()} uds</div>
                    <div className="text-[10px] text-indigo-600">Portafolio La Sante</div>
                  </div>

                  <div className={`p-3.5 rounded-xl border ${esClaro ? 'bg-purple-50 border-purple-200' : 'bg-purple-950/40 border-purple-800'}`}>
                    <div className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase">Equipo B (Comercial / OTC)</div>
                    <div className="text-lg font-extrabold text-purple-700 dark:text-purple-300">{(metricasHistorico.udsB + metricasHistorico.udsOTC).toLocaleString()} uds</div>
                    <div className="text-[10px] text-purple-600">Portafolio Comercial</div>
                  </div>
                </div>

                {/* Panel de Estado y Sincronización Supabase Cloud */}
                <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Sincronización Supabase Cloud:
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          filasEnSupabase !== null
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                        }`}>
                          {filasEnSupabase !== null
                            ? `${filasEnSupabase.toLocaleString()} filas en la nube`
                            : 'Estado sin verificar'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Memoria local / IndexedDB: <strong>{historicoPrevio.length.toLocaleString()} filas</strong>.
                        {filasEnSupabase !== null && filasEnSupabase >= historicoPrevio.length
                          ? ' ¡Todo el histórico está respaldado en Supabase!'
                          : ' Puedes sincronizar para que no dependa solo de este navegador.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={handleVerificarSupabase}
                      disabled={verificandoSupabase}
                      className="min-h-11 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                    >
                      {verificandoSupabase ? <RefreshCw className="w-4 h-4 animate-spin text-teal-600" /> : <Database className="w-4 h-4 text-teal-600" />}
                      <span>{verificandoSupabase ? 'Consultando...' : 'Verificar en Supabase'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSincronizarTodoASupabase}
                      disabled={sincronizandoSupabase || historicoPrevio.length === 0}
                      className="min-h-11 inline-flex items-center gap-1.5 px-4 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                      {sincronizandoSupabase ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                      <span>
                        {progresoSync
                          ? `Subiendo ${progresoSync.insertadas.toLocaleString()} de ${progresoSync.total.toLocaleString()}...`
                          : sincronizandoSupabase
                          ? 'Iniciando subida...'
                          : 'Subir a Supabase Ahora'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Toolbar de Búsqueda */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-teal-600" />
                      <span>Registros en Memoria ({historicoFiltrado.length} de {historicoPrevio.length})</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mapeo directo de tus 8 columnas: <b>Fecha, Cod Cliente, Nombre_cliente, Drogueria, Codigo Producto, Nombre Producto, Unidades, Cod Sap</b>.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por Cod Sap, Farmacia, Drogueria, SKU..."
                      value={filtroHistorico}
                      onChange={(e) => setFiltroHistorico(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border ${
                        esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    />
                  </div>
                </div>

                {/* Tabla de Registros con las 8 Columnas */}
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase border-b sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 font-bold">#</th>
                        <th className="p-2.5 font-bold">Fecha</th>
                        <th className="p-2.5 font-bold">Cod Cliente / Farmacia</th>
                        <th className="p-2.5 font-bold">Drogueria</th>
                        <th className="p-2.5 font-bold">Cod Sap (SKU Interno)</th>
                        <th className="p-2.5 font-bold">Cod Prod Drogueria</th>
                        <th className="p-2.5 font-bold">Nombre Producto</th>
                        <th className="p-2.5 font-bold text-right">Unidades</th>
                        <th className="p-2.5 font-bold text-center">Equipo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                      {historicoFiltrado.slice(0, 50).map((h, idx) => {
                        const cli = clientes.find((c) => c.id === h.cliente_id || c.ident01 === h.cliente_id);
                        const prod = productos.find((p) => p.id === h.producto_id || p.sku === h.producto_id);

                        return (
                          <tr key={h.id || idx} className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors">
                            <td className="p-2.5 text-slate-400 font-semibold">{idx + 1}</td>
                            
                            {/* Fecha */}
                            <td className="p-2.5 font-mono text-slate-700 dark:text-slate-300 font-medium">
                              {h.fecha_pedido}
                            </td>

                            {/* Cod Cliente & Farmacia */}
                            <td className="p-2.5">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {h.nombre_cliente || cli?.nombre_fantasia || cli?.razon_social || h.cliente_id}
                              </div>
                              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  Cod Drog: {h.cod_cliente_drogueria || h.cliente_id}
                                </span>
                                {cli?.ident01 && (
                                  <span className="text-teal-700 dark:text-teal-400 font-bold">
                                    ident01: {cli.ident01}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Drogueria */}
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {h.nombre_drogueria || h.drogueria_id}
                              </span>
                            </td>

                            {/* Cod Sap (SKU Maestro) */}
                            <td className="p-2.5">
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                                {h.cod_sap || prod?.codigo || prod?.sku || '—'}
                              </span>
                            </td>

                            {/* Codigo Producto Drogueria */}
                            <td className="p-2.5 font-mono text-slate-500">
                              {h.codigo_producto_drogueria || '—'}
                            </td>

                            {/* Nombre Producto */}
                            <td className="p-2.5">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {h.nombre_producto || prod?.nombre_comercial || prod?.product || h.producto_id}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">
                                {prod?.presentacion || prod?.pack || ''}
                              </div>
                            </td>

                            {/* Unidades */}
                            <td className="p-2.5 text-right font-mono font-extrabold text-sm text-teal-700 dark:text-teal-400">
                              {h.cantidad_facturada.toLocaleString()}
                            </td>

                            {/* Equipo */}
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                h.equipo_origen === 'La Sante' || h.equipo_origen === 'A'
                                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                  : h.equipo_origen === 'Comercial' || h.equipo_origen === 'B'
                                  ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                  : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              }`}>
                                {h.equipo_origen}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {historicoFiltrado.length > 50 && (
                  <div className="text-[11px] text-slate-400 text-center pt-2">
                    Mostrando los primeros 50 registros de {historicoFiltrado.length} coincidencias.
                  </div>
                )}

                {historicoFiltrado.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No se encontraron ordenes que coincidan con &quot;{filtroHistorico}&quot;.
                  </div>
                )}
              </div>
</>
              )}

            </div>
          )}

        </div>
      )}

      {/* MODAL 1: Editar Droguería */}
      {modalDrogueriaEditarAbierto && drogueriaAEditar && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-lg w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">
                  Editar Drogueria: {drogueriaAEditar.nombre_drogueria}
                </h3>
              </div>
              <button
                onClick={() => setModalDrogueriaEditarAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarEdicionDrogueria} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Número de droguería *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={drogueriaAEditar.id_numero || 1}
                    onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, id_numero: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Codigo Drogueria *</label>
                  <input
                    type="text"
                    required
                    value={drogueriaAEditar.codigo_drogueria}
                    onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, codigo_drogueria: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Nombre (Nomenclatura Ventas al Dia) *</label>
                <input
                  type="text"
                  required
                  value={drogueriaAEditar.nombre_drogueria}
                  onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, nombre_drogueria: e.target.value })}
                  className={`w-full rounded-lg p-2 border font-bold ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Pagina Web / Portal B2B</label>
                  <input
                    type="url"
                    placeholder="https://www.drogueria.com"
                    value={drogueriaAEditar.pagina_web || ''}
                    onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, pagina_web: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Delimitador CSV</label>
                  <select
                    value={drogueriaAEditar.formato_csv_config?.delimitador || ';'}
                    onChange={(e) => setDrogueriaAEditar({
                      ...drogueriaAEditar,
                      formato_csv_config: {
                        ...drogueriaAEditar.formato_csv_config,
                        delimitador: e.target.value as any
                      }
                    })}
                    className={`w-full rounded-lg p-2 border font-mono font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value=";">Punto y coma (;)</option>
                    <option value=",">Coma (,)</option>
                    <option value="|">Barra vertical (|)</option>
                    <option value="&#9;">Tabulacion (\t)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Email de Pedidos</label>
                  <input
                    type="email"
                    value={drogueriaAEditar.email_pedidos || ''}
                    onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, email_pedidos: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Telefono</label>
                  <input
                    type="text"
                    value={drogueriaAEditar.telefono || ''}
                    onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, telefono: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={drogueriaAEditar.activo}
                    onChange={(e) => setDrogueriaAEditar({ ...drogueriaAEditar, activo: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-600"
                  />
                  <span className="font-bold">Drogueria Activa para Teletransferencias</span>
                </label>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalDrogueriaEditarAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Actualizar Drogueria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Nueva Droguería */}
      {modalDrogueriaNuevaAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-lg w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">
                  Registrar Nueva Drogueria (dim_droguerias)
                </h3>
              </div>
              <button
                onClick={() => setModalDrogueriaNuevaAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCrearDrogueriaSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold mb-1">Nombre (Nomenclatura Ventas al Dia) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: DISFARMICA"
                  value={formDrogueriaNueva.nombre_drogueria}
                  onChange={(e) => setFormDrogueriaNueva({ ...formDrogueriaNueva, nombre_drogueria: e.target.value })}
                  className={`w-full rounded-lg p-2 border font-bold ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Codigo Drogueria</label>
                  <input
                    type="text"
                    placeholder="Ej: DROG-DISFARMICA"
                    value={formDrogueriaNueva.codigo_drogueria}
                    onChange={(e) => setFormDrogueriaNueva({ ...formDrogueriaNueva, codigo_drogueria: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Delimitador CSV</label>
                  <select
                    value={formDrogueriaNueva.delimitador}
                    onChange={(e) => setFormDrogueriaNueva({ ...formDrogueriaNueva, delimitador: e.target.value as any })}
                    className={`w-full rounded-lg p-2 border font-mono font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value=";">Punto y coma (;)</option>
                    <option value=",">Coma (,)</option>
                    <option value="|">Barra vertical (|)</option>
                    <option value="&#9;">Tabulacion (\t)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Pagina Web / Portal B2B</label>
                <input
                  type="url"
                  placeholder="https://www.disfarmica.com"
                  value={formDrogueriaNueva.pagina_web}
                  onChange={(e) => setFormDrogueriaNueva({ ...formDrogueriaNueva, pagina_web: e.target.value })}
                  className={`w-full rounded-lg p-2 border font-mono ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Email de Pedidos</label>
                  <input
                    type="email"
                    placeholder="pedidos@disfarmica.com"
                    value={formDrogueriaNueva.email_pedidos}
                    onChange={(e) => setFormDrogueriaNueva({ ...formDrogueriaNueva, email_pedidos: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Telefono</label>
                  <input
                    type="text"
                    placeholder="0212-0000000"
                    value={formDrogueriaNueva.telefono}
                    onChange={(e) => setFormDrogueriaNueva({ ...formDrogueriaNueva, telefono: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalDrogueriaNuevaAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Guardar Drogueria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Editar Producto (12 Campos sin acentos) */}
      {modalProductoEditarAbierto && productoAEditar && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold">
                  Editar Medicamento (12 Campos): {productoAEditar.product || productoAEditar.nombre_comercial}
                </h3>
              </div>
              <button
                onClick={() => setModalProductoEditarAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarEdicionProducto} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Codigo (SKU Interno) *</label>
                  <input
                    type="text"
                    required
                    value={productoAEditar.codigo || productoAEditar.sku}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, codigo: e.target.value, sku: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Product (Nombre Comercial) *</label>
                  <input
                    type="text"
                    required
                    value={productoAEditar.product || productoAEditar.nombre_comercial}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, product: e.target.value, nombre_comercial: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Descripcion</label>
                  <input
                    type="text"
                    value={productoAEditar.descripcion || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, descripcion: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Concatenate Molecule (Spanish) / Molecula</label>
                  <input
                    type="text"
                    value={productoAEditar.molecula || productoAEditar.principio_activo}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, molecula: e.target.value, principio_activo: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Unidad de Negocio</label>
                  <input
                    type="text"
                    value={productoAEditar.unidad_negocio || productoAEditar.laboratorio}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, unidad_negocio: e.target.value, laboratorio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clase Terapeutica</label>
                  <input
                    type="text"
                    value={productoAEditar.clase_terapeutica || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, clase_terapeutica: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Sistemas</label>
                  <input
                    type="text"
                    value={productoAEditar.sistemas || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, sistemas: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clasificacion Portafolio</label>
                  <input
                    type="text"
                    value={productoAEditar.clasificacion_portafolio || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, clasificacion_portafolio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Product Code</label>
                  <input
                    type="text"
                    value={productoAEditar.product_code || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, product_code: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Pack Code (EAN13)</label>
                  <input
                    type="text"
                    value={productoAEditar.pack_code || productoAEditar.codigo_barras_ean13}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, pack_code: e.target.value, codigo_barras_ean13: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Pack (Presentacion)</label>
                  <input
                    type="text"
                    value={productoAEditar.pack || productoAEditar.presentacion}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, pack: e.target.value, presentacion: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Estado</label>
                  <select
                    value={productoAEditar.activo ? 'Activo' : 'Inactivo'}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, activo: e.target.value === 'Activo' })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalProductoEditarAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm min-h-[44px]"
                >
                  Actualizar Medicamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Nuevo Producto (12 Campos sin acentos) */}
      {modalProductoNuevoAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Pill className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">
                  Registrar Medicamento en dim_productos (12 Campos)
                </h3>
              </div>
              <button
                onClick={() => setModalProductoNuevoAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCrearProductoSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Codigo (SKU) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: SKU-LOS-50"
                    value={formProductoNuevo.codigo}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, codigo: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Product (Nombre Comercial) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Losartan"
                    value={formProductoNuevo.product}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, product: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Descripcion</label>
                  <input
                    type="text"
                    placeholder="Ej: Losartan Potasico 50mg x 30 Tabletas"
                    value={formProductoNuevo.descripcion}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, descripcion: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Concatenate Molecule (Spanish) / Molecula</label>
                  <input
                    type="text"
                    placeholder="Ej: Losartan Potasico"
                    value={formProductoNuevo.molecula}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, molecula: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Unidad de Negocio</label>
                  <input
                    type="text"
                    placeholder="Ej: La Sante, Comercial, OTC"
                    value={formProductoNuevo.unidad_negocio}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, unidad_negocio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clase Terapeutica</label>
                  <input
                    type="text"
                    placeholder="Ej: Antihipertensivo"
                    value={formProductoNuevo.clase_terapeutica}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, clase_terapeutica: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Sistemas</label>
                  <input
                    type="text"
                    placeholder="Ej: Cardiovascular"
                    value={formProductoNuevo.sistemas}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, sistemas: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clasificacion Portafolio</label>
                  <input
                    type="text"
                    placeholder="Ej: Estrategico"
                    value={formProductoNuevo.clasificacion_portafolio}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, clasificacion_portafolio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Product Code</label>
                  <input
                    type="text"
                    placeholder="Ej: PRD-LOS-50"
                    value={formProductoNuevo.product_code}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, product_code: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Pack Code (EAN13)</label>
                  <input
                    type="text"
                    placeholder="Ej: PCK-LOS-30"
                    value={formProductoNuevo.pack_code}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, pack_code: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Pack (Presentacion)</label>
                  <input
                    type="text"
                    placeholder="Ej: Caja x 30 Tabletas"
                    value={formProductoNuevo.pack}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, pack: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Estado</label>
                  <select
                    value={formProductoNuevo.activo ? 'Activo' : 'Inactivo'}
                    onChange={(e) => setFormProductoNuevo({ ...formProductoNuevo, activo: e.target.value === 'Activo' })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalProductoNuevoAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Guardar Medicamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Editar Farmacia / Cliente (11 Campos con ident01 como Primary Key) */}
      {modalClienteEditarAbierto && clienteAEditar && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">
                  Editar Farmacia: {clienteAEditar.nombre_fantasia || clienteAEditar.razon_social}
                </h3>
              </div>
              <button
                onClick={() => setModalClienteEditarAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarEdicionCliente} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Código de la farmacia (ident01) *</label>
                  <input
                    type="text"
                    required
                    value={clienteAEditar.ident01 || clienteAEditar.codigo_cliente || ''}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, ident01: e.target.value, codigo_cliente: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">RIF Fiscal *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: J-30489218-4"
                    value={clienteAEditar.rif}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, rif: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Razon Social *</label>
                  <input
                    type="text"
                    required
                    value={clienteAEditar.razon_social}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, razon_social: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Nombre de Fantasia *</label>
                  <input
                    type="text"
                    required
                    value={clienteAEditar.nombre_fantasia || clienteAEditar.nombre_comercial || ''}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, nombre_fantasia: e.target.value, nombre_comercial: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Brick (IMS / Zona Territorial)</label>
                  <input
                    type="text"
                    placeholder="Ej: CCS-CHACAO-02"
                    value={clienteAEditar.brick || ''}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, brick: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Municipio / Ciudad / Alcaldia *</label>
                  <input
                    type="text"
                    required
                    value={clienteAEditar.municipio_ciudad || clienteAEditar.ciudad || ''}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, municipio_ciudad: e.target.value, ciudad: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">Estado *</label>
                  <input
                    type="text"
                    required
                    value={clienteAEditar.estado}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, estado: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Frecuencia</label>
                  <input
                    type="text"
                    placeholder="Ej: Semanal (F1), Quincenal"
                    value={clienteAEditar.frecuencia || 'Semanal'}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, frecuencia: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Bandera / Cadena</label>
                  <input
                    type="text"
                    placeholder="Ej: Farmatodo, Independiente"
                    value={clienteAEditar.bandera || 'Independiente'}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, bandera: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Latitud GPS (local_gps_lat)</label>
                  <input
                    type="number"
                    step="0.0000001"
                    placeholder="Ej: 10.4925"
                    value={clienteAEditar.local_gps_lat ?? ''}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, local_gps_lat: parseFloat(e.target.value) || 0 })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Longitud GPS (local_gps_lon)</label>
                  <input
                    type="number"
                    step="0.0000001"
                    placeholder="Ej: -66.8533"
                    value={clienteAEditar.local_gps_lon ?? ''}
                    onChange={(e) => setClienteAEditar({ ...clienteAEditar, local_gps_lon: parseFloat(e.target.value) || 0 })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalClienteEditarAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Actualizar Farmacia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: Registrar Nueva Farmacia / Cliente (11 Campos) */}
      {modalClienteNuevoAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">
                  Registrar Farmacia en dim_clientes (11 Campos)
                </h3>
              </div>
              <button
                onClick={() => setModalClienteNuevoAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCrearClienteSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Código de la farmacia (ident01) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: CLI-1006"
                    value={formClienteNuevo.ident01}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, ident01: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">RIF Fiscal *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: J-30489218-4"
                    value={formClienteNuevo.rif}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, rif: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Razon Social *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Farmacia Los Andes C.A."
                    value={formClienteNuevo.razon_social}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, razon_social: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Nombre de Fantasia *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Farmacia Los Andes Merida"
                    value={formClienteNuevo.nombre_fantasia}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, nombre_fantasia: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-bold ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Brick (IMS / Zona Territorial)</label>
                  <input
                    type="text"
                    placeholder="Ej: MER-CENTRO-01"
                    value={formClienteNuevo.brick}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, brick: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Municipio / Ciudad / Alcaldia *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Libertador / Merida"
                    value={formClienteNuevo.municipio_ciudad}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, municipio_ciudad: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">Estado *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Merida"
                    value={formClienteNuevo.estado}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, estado: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Frecuencia</label>
                  <input
                    type="text"
                    placeholder="Ej: Semanal, Quincenal"
                    value={formClienteNuevo.frecuencia}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, frecuencia: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Bandera / Cadena</label>
                  <input
                    type="text"
                    placeholder="Ej: Farmatodo, Independiente"
                    value={formClienteNuevo.bandera}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, bandera: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Latitud GPS (local_gps_lat)</label>
                  <input
                    type="number"
                    step="0.0000001"
                    placeholder="Ej: 8.5983"
                    value={formClienteNuevo.local_gps_lat}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, local_gps_lat: parseFloat(e.target.value) || 0 })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Longitud GPS (local_gps_lon)</label>
                  <input
                    type="number"
                    step="0.0000001"
                    placeholder="Ej: -71.1449"
                    value={formClienteNuevo.local_gps_lon}
                    onChange={(e) => setFormClienteNuevo({ ...formClienteNuevo, local_gps_lon: parseFloat(e.target.value) || 0 })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalClienteNuevoAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Guardar Farmacia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
