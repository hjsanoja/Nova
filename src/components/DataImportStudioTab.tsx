import React, { useState, useMemo, useEffect } from 'react';
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
import { 
  UploadCloud, 
  Download, 
  FileSpreadsheet, 
  Check, 
  AlertCircle, 
  Database, 
  FileText, 
  Copy, 
  Users, 
  Pill, 
  History,
  Building2,
  Table,
  ArrowRight,
  ExternalLink,
  Globe,
  HelpCircle,
  Pencil,
  Trash2,
  Plus,
  X,
  MapPin,
  Search,
  Link2,
  Network,
  Zap,
  CheckCircle2,
  Terminal,
  Code2,
  Sparkles,
  Calculator,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Calendar,
  Tag,
  Sliders,
  Layers,
  Filter
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Algoritmo de similitud de nombres de farmacias (Token Dice-Sørensen + Substring)
export function calcularSimilitudNombres(nombreA: string, nombreB: string): number {
  if (!nombreA || !nombreB) return 0;
  const a = nombreA.toLowerCase().trim().replace(/[.,\-_/]/g, ' ');
  const b = nombreB.toLowerCase().trim().replace(/[.,\-_/]/g, ' ');
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 85;

  const palabrasStop = new Set(['farmacia', 'farmacias', 'botica', 'drogueria', 'c.a', 'ca', 's.a', 'sa', 's.r.l', 'srl', 'de', 'la', 'el', 'los', 'las', 'y']);
  const tokensA = a.split(/\s+/).filter(t => t.length > 1 && !palabrasStop.has(t));
  const tokensB = b.split(/\s+/).filter(t => t.length > 1 && !palabrasStop.has(t));

  if (tokensA.length === 0 || tokensB.length === 0) {
    return a.slice(0, 4) === b.slice(0, 4) ? 60 : 0;
  }

  let coincidencias = 0;
  for (const tA of tokensA) {
    if (tokensB.some(tB => tB === tA || (tA.length > 3 && tB.includes(tA)) || (tB.length > 3 && tA.includes(tB)))) {
      coincidencias++;
    }
  }

  const score = Math.round((2 * coincidencias / (tokensA.length + tokensB.length)) * 100);
  return Math.min(100, Math.max(0, score));
}

// Detección automática del mes desde el nombre del archivo (ej: ventas_enero, ventas_febrero)
export function detectarMesDeNombreArchivo(nombre: string): { mesNum: string; mesTexto: string; anio: string; periodo: string } | null {
  if (!nombre) return null;
  const nom = nombre.toLowerCase();
  const meses = [
    { regex: /enero|ene|january|jan/i, num: '01', texto: 'Enero' },
    { regex: /febrero|feb|february/i, num: '02', texto: 'Febrero' },
    { regex: /marzo|mar|march/i, num: '03', texto: 'Marzo' },
    { regex: /abril|abr|april/i, num: '04', texto: 'Abril' },
    { regex: /mayo|may/i, num: '05', texto: 'Mayo' },
    { regex: /junio|jun|june/i, num: '06', texto: 'Junio' },
    { regex: /julio|jul|july/i, num: '07', texto: 'Julio' },
    { regex: /agosto|ago|august|aug/i, num: '08', texto: 'Agosto' },
    { regex: /septiembre|setiembre|sep|sept|september/i, num: '09', texto: 'Septiembre' },
    { regex: /octubre|oct|october/i, num: '10', texto: 'Octubre' },
    { regex: /noviembre|nov|november/i, num: '11', texto: 'Noviembre' },
    { regex: /diciembre|dic|december/i, num: '12', texto: 'Diciembre' },
  ];
  const anioMatch = nom.match(/202[4-9]/);
  const anio = anioMatch ? anioMatch[0] : new Date().getFullYear().toString();

  for (const m of meses) {
    if (m.regex.test(nom)) {
      return {
        mesNum: m.num,
        mesTexto: m.texto,
        anio,
        periodo: `${anio}-${m.num}`
      };
    }
  }
  return null;
}

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
  const [subTab, setSubTab] = useState<'droguerias' | 'clientes' | 'productos' | 'historico' | 'sql_generator'>('droguerias');
  const [archivoTexto, setArchivoTexto] = useState('');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [notificacion, setNotificacion] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [copiadoSql, setCopiadoSql] = useState(false);

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
  const [estrategia1M, setEstrategia1M] = useState<'agregada' | 'ventana90' | 'copy_cli'>('agregada');
  const [lenguajeScript1M, setLenguajeScript1M] = useState<'sql' | 'python'>('sql');
  const [filtroHistorico, setFiltroHistorico] = useState('');
  const [copiadoScript1M, setCopiadoScript1M] = useState(false);

  // Estados para Homologación de Farmacias (Alias Droguería) y Mapeo Cod SAP
  const [aliasesFarmacias, setAliasesFarmacias] = useState<ClienteDrogueriaAlias[]>(() => {
    const guardado = localStorage.getItem('PHARMA_CLIENTE_ALIAS');
    if (guardado) {
      try { return JSON.parse(guardado); } catch { /* ignore */ }
    }
    return [
      {
        id: 'alias-001',
        cliente_ident01: 'CLI-1001',
        drogueria: 'COBECA',
        cod_cliente_drogueria: 'COB-1001',
        nombre_cliente_drogueria: 'FARMATODO LAS MERCEDES CARACAS',
        verificado: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'alias-002',
        cliente_ident01: 'CLI-1001',
        drogueria: 'NENA',
        cod_cliente_drogueria: 'NEN-4410',
        nombre_cliente_drogueria: 'FTO LAS MERCEDES AV PPAL',
        verificado: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'alias-003',
        cliente_ident01: 'CLI-1002',
        drogueria: 'DROBIENCA',
        cod_cliente_drogueria: 'DROB-882',
        nombre_cliente_drogueria: 'DROG Y FARM LA PAZ CHACAO',
        verificado: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'alias-004',
        cliente_ident01: 'CLI-1003',
        drogueria: 'COBECA',
        cod_cliente_drogueria: 'COB-2041',
        nombre_cliente_drogueria: 'FARMACIA SAN RAFAEL BARCELONA',
        verificado: true,
        created_at: new Date().toISOString(),
      },
    ];
  });

  const [mapeosProductosDrogueria, setMapeosProductosDrogueria] = useState<ProductoDrogueriaMapeo[]>(() => {
    const guardado = localStorage.getItem('PHARMA_PRODUCTO_MAPEO');
    if (guardado) {
      try { return JSON.parse(guardado); } catch { /* ignore */ }
    }
    return [
      {
        id: 'map-001',
        cod_sap: 'SKU-LOS-50',
        drogueria: 'COBECA',
        codigo_producto_drogueria: 'COB-LOS-50',
        nombre_producto_drogueria: 'Losartan Potasico 50mg x 30 Tab',
        created_at: new Date().toISOString(),
      },
      {
        id: 'map-002',
        cod_sap: 'SKU-ATO-20',
        drogueria: 'NENA',
        codigo_producto_drogueria: 'NEN-ATO-20',
        nombre_producto_drogueria: 'Atorvastatina 20mg x 30 Tab',
        created_at: new Date().toISOString(),
      },
      {
        id: 'map-003',
        cod_sap: 'SKU-AMX-500',
        drogueria: 'DROBIENCA',
        codigo_producto_drogueria: 'DRO-AMX-500',
        nombre_producto_drogueria: 'Clavumox 500/125mg',
        created_at: new Date().toISOString(),
      },
      {
        id: 'map-004',
        cod_sap: 'SKU-ATA-500',
        drogueria: 'COBECA',
        codigo_producto_drogueria: 'COB-ATA-500',
        nombre_producto_drogueria: 'Atamel 500mg x 20 Tab',
        created_at: new Date().toISOString(),
      },
      {
        id: 'map-005',
        cod_sap: 'SKU-OME-20',
        drogueria: 'NENA',
        codigo_producto_drogueria: 'NEN-OME-20',
        nombre_producto_drogueria: 'Omeprazol 20mg x 28 Cap',
        created_at: new Date().toISOString(),
      },
    ];
  });

  const [infoMesDetectado, setInfoMesDetectado] = useState<{ mesNum: string; mesTexto: string; anio: string; periodo: string } | null>(null);
  const [seccionHistoricoActiva, setSeccionHistoricoActiva] = useState<'cargar' | 'homologar' | 'mapeo_sap' | 'acumulado' | 'guia'>('cargar');
  const [modalHomologarAbierto, setModalHomologarAbierto] = useState(false);
  const [itemHomologarSeleccionado, setItemHomologarSeleccionado] = useState<{
    drogueria: string;
    cod_cliente_drogueria: string;
    nombre_cliente_drogueria: string;
    sugerenciaIdent01: string;
    ident01Elegido: string;
  } | null>(null);

  const [modalMapeoSapAbierto, setModalMapeoSapAbierto] = useState(false);
  const [itemMapeoSapSeleccionado, setItemMapeoSapSeleccionado] = useState<{
    drogueria: string;
    codigo_producto: string;
    nombre_producto: string;
    codSapElegido: string;
  } | null>(null);

  // Persistir Aliases y Mapeos
  useEffect(() => {
    localStorage.setItem('PHARMA_CLIENTE_ALIAS', JSON.stringify(aliasesFarmacias));
  }, [aliasesFarmacias]);

  useEffect(() => {
    localStorage.setItem('PHARMA_PRODUCTO_MAPEO', JSON.stringify(mapeosProductosDrogueria));
  }, [mapeosProductosDrogueria]);

  const showNotification = (tipo: 'exito' | 'error', texto: string) => {
    setNotificacion({ tipo, texto });
    setTimeout(() => setNotificacion(null), 4000);
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

  // Helper flexible para obtener valores de columnas tolerando acentos y variaciones
  const getCol = (row: Record<string, string>, targets: string[]): string => {
    for (const target of targets) {
      if (row[target] !== undefined) return row[target];
      const match = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === target.toLowerCase()
      );
      if (match && row[match] !== undefined) return row[match];
    }
    return '';
  };

  // Diagnóstico en tiempo real del archivo mensual cargado (Cod SAP y Homologación de Farmacias)
  const diagnosticoVentasMes = useMemo(() => {
    if (subTab !== 'historico' || filasParseadas.length === 0) {
      return {
        productosSinSap: [] as { drogueria: string; codigo_producto: string; nombre_producto: string; totalUnidades: number; count: number }[],
        farmaciasSinHomologar: [] as { drogueria: string; cod_cliente: string; nombre_cliente: string; totalUnidades: number; count: number; sugerenciaIdent01: string; sugerenciaNombre: string; similitud: number }[],
        totalFilas: 0,
        totalUnidades: 0,
        tieneColumnaSap: false,
      };
    }

    const tieneColumnaSap = filasParseadas.some(f => Boolean(getCol(f, ['Cod Sap', 'Cod_Sap', 'COD_SAP', 'COD SAP', 'CodSap'])));
    let totalUds = 0;
    const mapaProdSinSap = new Map<string, { drogueria: string; codigo_producto: string; nombre_producto: string; totalUnidades: number; count: number }>();
    const mapaFarmaciasSinHomologar = new Map<string, { drogueria: string; cod_cliente: string; nombre_cliente: string; totalUnidades: number; count: number; sugerenciaIdent01: string; sugerenciaNombre: string; similitud: number }>();

    filasParseadas.forEach(f => {
      const drogRaw = getCol(f, ['Drogueria', 'DROGUERIA', 'drogueria', 'Droguería', 'NOMBRE_DROGUERIA', 'Drog']).trim() || 'COBECA';
      const codigoProd = getCol(f, ['Codigo Producto', 'Codigo_Producto', 'CODIGO_PRODUCTO', 'COD PRODUCTO', 'codigo producto', 'CodigoProducto', 'COD_ARTICULO']).trim();
      const nombreProd = getCol(f, ['Nombre Producto', 'Nombre_Producto', 'NOMBRE_PRODUCTO', 'Nombre Producto', 'nombre producto', 'PRODUCTO', 'Descripcion']).trim();
      const rawSap = getCol(f, ['Cod Sap', 'Cod_Sap', 'COD_SAP', 'COD SAP', 'CodSap', 'CODSAP']).trim();
      const unidades = parseInt(getCol(f, ['Unidades', 'UNIDADES', 'unidades', 'Cantidad', 'CANTIDAD']).trim()) || 0;
      const codCliente = getCol(f, ['Cod Cliente', 'Cod_Cliente', 'COD_CLIENTE', 'COD CLIENTE', 'cod cliente', 'Codigo_Cliente']).trim();
      const nombreCliente = getCol(f, ['Nombre_cliente', 'Nombre_Cliente', 'NOMBRE_CLIENTE', 'Nombre Cliente', 'nombre_cliente', 'Farmacia', 'FARMACIA']).trim();

      totalUds += unidades;

      // 1. Revisar si tiene Cod SAP resuelto
      const tieneSap = rawSap || mapeosProductosDrogueria.some(m => 
        m.drogueria.toLowerCase() === drogRaw.toLowerCase() && m.codigo_producto_drogueria.toLowerCase() === codigoProd.toLowerCase()
      ) || productos.some(p => p.sku.toLowerCase() === codigoProd.toLowerCase() || (p.codigo && p.codigo.toLowerCase() === codigoProd.toLowerCase()));

      if (!tieneSap && codigoProd) {
        const key = `${drogRaw}__${codigoProd}`;
        const item = mapaProdSinSap.get(key) || { drogueria: drogRaw, codigo_producto: codigoProd, nombre_producto: nombreProd, totalUnidades: 0, count: 0 };
        item.totalUnidades += unidades;
        item.count += 1;
        mapaProdSinSap.set(key, item);
      }

      // 2. Revisar si tiene Farmacia Homologada
      const tieneAlias = aliasesFarmacias.some(a => 
        a.drogueria.toLowerCase() === drogRaw.toLowerCase() && (
          (a.cod_cliente_drogueria && a.cod_cliente_drogueria === codCliente) ||
          a.nombre_cliente_drogueria.toLowerCase() === nombreCliente.toLowerCase()
        )
      );

      const matchDirecto = clientes.some(c => 
        c.ident01.toLowerCase() === codCliente.toLowerCase() ||
        (c.codigo_cliente && c.codigo_cliente.toLowerCase() === codCliente.toLowerCase()) ||
        c.nombre_fantasia.toLowerCase() === nombreCliente.toLowerCase() ||
        c.razon_social.toLowerCase() === nombreCliente.toLowerCase()
      );

      if (!tieneAlias && !matchDirecto && nombreCliente) {
        const key = `${drogRaw}__${nombreCliente}`;
        if (!mapaFarmaciasSinHomologar.has(key)) {
          // Encontrar mejor coincidencia en dim_clientes
          let mejorSim = 0;
          let mejorCli = clientes[0];
          clientes.forEach(c => {
            const sim1 = calcularSimilitudNombres(nombreCliente, c.nombre_fantasia);
            const sim2 = calcularSimilitudNombres(nombreCliente, c.razon_social);
            const maxSim = Math.max(sim1, sim2);
            if (maxSim > mejorSim) {
              mejorSim = maxSim;
              mejorCli = c;
            }
          });

          mapaFarmaciasSinHomologar.set(key, {
            drogueria: drogRaw,
            cod_cliente: codCliente,
            nombre_cliente: nombreCliente,
            totalUnidades: unidades,
            count: 1,
            sugerenciaIdent01: mejorCli?.ident01 || clientes[0]?.ident01 || 'CLI-1001',
            sugerenciaNombre: mejorCli?.nombre_fantasia || mejorCli?.razon_social || 'Farmacia',
            similitud: mejorSim,
          });
        } else {
          const item = mapaFarmaciasSinHomologar.get(key)!;
          item.totalUnidades += unidades;
          item.count += 1;
        }
      }
    });

    return {
      productosSinSap: Array.from(mapaProdSinSap.values()),
      farmaciasSinHomologar: Array.from(mapaFarmaciasSinHomologar.values()),
      totalFilas: filasParseadas.length,
      totalUnidades: totalUds,
      tieneColumnaSap,
    };
  }, [filasParseadas, subTab, mapeosProductosDrogueria, aliasesFarmacias, productos, clientes]);

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

      if (supabase) {
        try {
          await supabase.from('dim_clientes').upsert(
            nuevosClientes.map((c) => ({
              ident01: c.ident01,
              codigo_cliente: c.codigo_cliente,
              rif: c.rif,
              razon_social: c.razon_social,
              nombre_fantasia: c.nombre_fantasia,
              nombre_comercial: c.nombre_comercial,
              brick: c.brick,
              municipio_ciudad: c.municipio_ciudad,
              direccion: c.direccion,
              estado: c.estado,
              ciudad: c.ciudad,
              frecuencia: c.frecuencia,
              bandera: c.bandera,
              local_gps_lat: c.local_gps_lat,
              local_gps_lon: c.local_gps_lon,
              clasificacion_abc: c.clasificacion_abc,
              cupo_credito: c.cupo_credito,
              dias_credito: c.dias_credito,
              activo: c.activo,
            })),
            { onConflict: 'ident01' }
          );
        } catch (err: any) {
          console.warn('Error al guardar en Supabase:', err.message);
        }
      }

      onImportarClientes(nuevosClientes);
      showNotification('exito', `Se han cargado e incorporado ${nuevosClientes.length} farmacias a dim_clientes con ident01 como Primary Key.`);
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

      if (supabase) {
        try {
          await supabase.from('dim_productos').upsert(
            nuevosProductos.map((p) => ({
              sku: p.sku,
              codigo_barras_ean13: p.codigo_barras_ean13,
              principio_activo: p.principio_activo,
              nombre_comercial: p.nombre_comercial,
              presentacion: p.presentacion,
              laboratorio: p.laboratorio,
              precio_lista: p.precio_lista,
              descuento_maximo_porc: p.descuento_maximo_porc,
              es_prioritario: p.es_prioritario,
              factor_prioridad: p.factor_prioridad,
              empaque_minimo: p.empaque_minimo,
              stock_disponible: p.stock_disponible,
              unidad_negocio: p.unidad_negocio,
              clase_terapeutica: p.clase_terapeutica,
              sistemas: p.sistemas,
              clasificacion_portafolio: p.clasificacion_portafolio,
              product_code: p.product_code,
              pack_code: p.pack_code,
              activo: p.activo,
            })),
            { onConflict: 'sku' }
          );
        } catch (err: any) {
          console.warn('Error al guardar en Supabase:', err.message);
        }
      }

      onImportarProductos(nuevosProductos);
      showNotification('exito', `Se han cargado e incorporado ${nuevosProductos.length} medicamentos a dim_productos.`);
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

        // 3. Resolución de Cod SAP (Crucial: si el usuario no lo anexó en Excel)
        let codSapResuelto = codSap;

        // A. Buscar en el diccionario de mapeos aprendidos
        if (!codSapResuelto && codigoProdDrog) {
          const mapMatch = mapeosProductosDrogueria.find((m) => 
            m.drogueria.toLowerCase() === drogRaw.toLowerCase() &&
            m.codigo_producto_drogueria.toLowerCase() === codigoProdDrog.toLowerCase()
          );
          if (mapMatch) {
            codSapResuelto = mapMatch.cod_sap;
          }
        }

        // B. Match de Producto en el Vademécum
        let prodMatch = codSapResuelto ? productos.find((p) => 
          (p.codigo && p.codigo.toLowerCase() === codSapResuelto.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase() === codSapResuelto.toLowerCase()) ||
          (p.product_code && p.product_code.toLowerCase() === codSapResuelto.toLowerCase()) ||
          p.id.toLowerCase() === codSapResuelto.toLowerCase()
        ) : undefined;

        // C. Por Código de Producto de Droguería si coincide con SKU
        if (!prodMatch && codigoProdDrog) {
          prodMatch = productos.find((p) => 
            (p.sku && p.sku.toLowerCase() === codigoProdDrog.toLowerCase()) ||
            (p.pack_code && p.pack_code.toLowerCase() === codigoProdDrog.toLowerCase())
          );
          if (prodMatch) {
            codSapResuelto = prodMatch.sku;
          }
        }

        // D. Por Nombre del Medicamento
        if (!prodMatch && nombreProdRaw) {
          const nLow = nombreProdRaw.toLowerCase();
          prodMatch = productos.find((p) => 
            (p.nombre_comercial && p.nombre_comercial.toLowerCase() === nLow) ||
            (p.product && p.product.toLowerCase() === nLow) ||
            (p.descripcion && p.descripcion.toLowerCase() === nLow) ||
            (p.nombre_comercial && (p.nombre_comercial.toLowerCase().includes(nLow) || nLow.includes(p.nombre_comercial.toLowerCase())))
          );
          if (prodMatch) {
            codSapResuelto = prodMatch.sku;
          }
        }

        // E. Si el reporte traía Cod SAP manual, aprender la regla para futuros meses
        if (codSap && codigoProdDrog) {
          const existe = mapeosProductosDrogueria.some(m => 
            m.drogueria.toLowerCase() === drogRaw.toLowerCase() && 
            m.codigo_producto_drogueria.toLowerCase() === codigoProdDrog.toLowerCase()
          );
          if (!existe) {
            nuevosMapeosAprendidos.push({
              id: `map-${Date.now()}-${i}`,
              cod_sap: codSap,
              drogueria: drogRaw,
              codigo_producto_drogueria: codigoProdDrog,
              nombre_producto_drogueria: nombreProdRaw,
              created_at: new Date().toISOString(),
            });
          }
        }

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

        // 5. Match y Homologación de Cliente / Farmacia (Multi-nombre entre droguerías):
        let cliMatch: Cliente | undefined;
        let ident01Homologado: string | undefined;

        // A. Buscar en la tabla de alias registrados
        const aliasMatch = aliasesFarmacias.find(a => 
          a.drogueria.toLowerCase() === drogRaw.toLowerCase() && (
            (a.cod_cliente_drogueria && a.cod_cliente_drogueria === codClienteDrog) ||
            a.nombre_cliente_drogueria.toLowerCase() === nombreCliRaw.toLowerCase()
          )
        );

        if (aliasMatch) {
          ident01Homologado = aliasMatch.cliente_ident01;
          cliMatch = clientes.find(c => c.ident01 === aliasMatch.cliente_ident01);
        }

        // B. Si no hay alias, buscar match directo por ident01, codigo o RIF
        if (!cliMatch && codClienteDrog) {
          const cLow = codClienteDrog.toLowerCase();
          cliMatch = clientes.find((c) => 
            (c.ident01 && c.ident01.toLowerCase() === cLow) ||
            (c.codigo_cliente && c.codigo_cliente.toLowerCase() === cLow) ||
            (c.rif && c.rif.toLowerCase() === cLow) ||
            c.id.toLowerCase() === cLow
          );
          if (cliMatch) {
            ident01Homologado = cliMatch.ident01;
          }
        }

        // C. Por Nombre comercial o Razón Social
        if (!cliMatch && nombreCliRaw) {
          cliMatch = clientes.find((c) => 
            (c.nombre_fantasia && c.nombre_fantasia.toLowerCase() === nombreCliRaw.toLowerCase()) ||
            (c.razon_social && c.razon_social.toLowerCase() === nombreCliRaw.toLowerCase()) ||
            (c.nombre_comercial && c.nombre_comercial.toLowerCase() === nombreCliRaw.toLowerCase()) ||
            (c.nombre_fantasia && (c.nombre_fantasia.toLowerCase().includes(nombreCliRaw.toLowerCase()) || nombreCliRaw.toLowerCase().includes(c.nombre_fantasia.toLowerCase())))
          );
          if (cliMatch) {
            ident01Homologado = cliMatch.ident01;
          }
        }

        const cliId = ident01Homologado || (cliMatch ? (cliMatch.ident01 || cliMatch.id) : (codClienteDrog || clientes[0]?.ident01 || `cli-${i}`));
        const cliNombre = cliMatch?.nombre_fantasia || cliMatch?.razon_social || nombreCliRaw || 'Farmacia';

        // 6. Match de Droguería:
        const drogMatch = drogRaw ? droguerias.find((d) => 
          d.nombre_drogueria.toLowerCase() === drogRaw.toLowerCase() ||
          d.nombre_drogueria.toLowerCase().includes(drogRaw.toLowerCase()) ||
          d.codigo_drogueria.toLowerCase() === drogRaw.toLowerCase() ||
          drogRaw.toLowerCase().includes(d.nombre_drogueria.toLowerCase())
        ) : undefined;

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
      }

      // Sincronizar con Supabase si está disponible
      if (supabase) {
        try {
          await supabase.from('fact_historico_ventas').insert(
            nuevoHistorico.map((h) => ({
              fecha: h.fecha_pedido,
              mes_periodo: h.mes_periodo || mesPeriodo,
              archivo_origen: h.archivo_origen || nombreArchivo,
              cod_cliente: h.cod_cliente_drogueria || h.cliente_id,
              nombre_cliente: h.nombre_cliente || 'Farmacia',
              drogueria: h.nombre_drogueria || 'Drogueria',
              codigo_producto: h.codigo_producto_drogueria || h.producto_id,
              nombre_producto: h.nombre_producto || 'Medicamento',
              unidades: h.cantidad_facturada,
              cod_sap: h.cod_sap || null,
              cliente_ident01: h.cliente_ident01 || null,
            }))
          );
        } catch (err: any) {
          console.warn('Error al guardar en Supabase fact_historico_ventas:', err.message);
        }
      }

      onImportarHistorico(nuevoHistorico);
      showNotification('exito', `Se han procesado e incorporado ${nuevoHistorico.length} registros historicos (${mesPeriodo}) con resolución de Cod SAP y Farmacias.`);
    }

    setArchivoTexto('');
    setNombreArchivo('');
  };

  // Funciones de Homologación Rápida y Mapeo Cod SAP
  const handleConfirmarHomologacion = (drogueria: string, codClienteDrog: string, nombreClienteDrog: string, ident01: string) => {
    const nuevoAlias: ClienteDrogueriaAlias = {
      id: `alias-${Date.now()}`,
      cliente_ident01: ident01,
      drogueria,
      cod_cliente_drogueria: codClienteDrog,
      nombre_cliente_drogueria: nombreClienteDrog,
      verificado: true,
      created_at: new Date().toISOString(),
    };
    setAliasesFarmacias(prev => [...prev.filter(a => !(a.drogueria.toLowerCase() === drogueria.toLowerCase() && a.nombre_cliente_drogueria.toLowerCase() === nombreClienteDrog.toLowerCase())), nuevoAlias]);
    showNotification('exito', `Homologación guardada: "${nombreClienteDrog}" (${drogueria}) enlazada a ${ident01}.`);
  };

  const handleAsignarMapeoSap = (drogueria: string, codigoProducto: string, nombreProducto: string, codSap: string) => {
    const nuevoMapeo: ProductoDrogueriaMapeo = {
      id: `map-${Date.now()}`,
      cod_sap: codSap,
      drogueria,
      codigo_producto_drogueria: codigoProducto,
      nombre_producto_drogueria: nombreProducto,
      created_at: new Date().toISOString(),
    };
    setMapeosProductosDrogueria(prev => [...prev.filter(m => !(m.drogueria.toLowerCase() === drogueria.toLowerCase() && m.codigo_producto_drogueria.toLowerCase() === codigoProducto.toLowerCase())), nuevoMapeo]);
    showNotification('exito', `Cod SAP ${codSap} asignado a producto ${codigoProducto} (${drogueria}).`);
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

  // SQL Script Generator para Supabase SQL Editor
  const sqlGenerado = useMemo(() => {
    const lines: string[] = [
      '-- SCRIPT DE CARGA DIRECTA PARA SUPABASE SQL EDITOR',
      '-- Generado automaticamente desde Nova PharmaTransfer Studio',
      'BEGIN;',
      '',
      '-- 1. CARGA DE DROGUERIAS (dim_droguerias con ID numerico Primary Key)',
    ];

    droguerias.forEach((d) => {
      const cfg = JSON.stringify(d.formato_csv_config || {}).replace(/'/g, "''");
      const nom = (d.nombre_drogueria || '').replace(/'/g, "''");
      const cod = (d.codigo_drogueria || '').replace(/'/g, "''");
      const rif = (d.rif || 'J-00000000-0').replace(/'/g, "''");
      const web = (d.pagina_web || '').replace(/'/g, "''");
      const email = (d.email_pedidos || '').replace(/'/g, "''");
      const tel = (d.telefono || '').replace(/'/g, "''");
      lines.push(
        `INSERT INTO dim_droguerias (id_numero, codigo_drogueria, rif, nombre_drogueria, email_pedidos, pagina_web, telefono, tiempo_entrega_promedio_dias, formato_csv_config, activo) ` +
        `VALUES (${d.id_numero || 1}, '${cod}', '${rif}', '${nom}', '${email}', '${web}', '${tel}', ${d.tiempo_entrega_promedio_dias || 2}, '${cfg}'::jsonb, ${d.activo ? 'true' : 'false'}) ` +
        `ON CONFLICT (codigo_drogueria) DO UPDATE SET id_numero = EXCLUDED.id_numero, pagina_web = EXCLUDED.pagina_web, formato_csv_config = EXCLUDED.formato_csv_config;`
      );
    });

    lines.push('', '-- 2. CARGA DE PRODUCTOS (dim_productos - 12 Campos)');
    productos.forEach((p) => {
      const sku = (p.codigo || p.sku || '').replace(/'/g, "''");
      const packCode = (p.pack_code || p.codigo_barras_ean13 || '').replace(/'/g, "''");
      const molecula = (p.molecula || p.principio_activo || '').replace(/'/g, "''");
      const nombre = (p.product || p.nombre_comercial || '').replace(/'/g, "''");
      const presentacion = (p.pack || p.presentacion || '').replace(/'/g, "''");
      const lab = (p.unidad_negocio || p.laboratorio || '').replace(/'/g, "''");
      const clase = (p.clase_terapeutica || '').replace(/'/g, "''");
      const sistemas = (p.sistemas || '').replace(/'/g, "''");
      const portafolio = (p.clasificacion_portafolio || '').replace(/'/g, "''");
      const prodCode = (p.product_code || '').replace(/'/g, "''");

      lines.push(
        `INSERT INTO dim_productos (sku, codigo_barras_ean13, principio_activo, nombre_comercial, presentacion, laboratorio, precio_lista, descuento_maximo_porc, es_prioritario, factor_prioridad, empaque_minimo, stock_disponible, unidad_negocio, clase_terapeutica, sistemas, clasificacion_portafolio, product_code, pack_code, activo) ` +
        `VALUES ('${sku}', '${packCode}', '${molecula}', '${nombre}', '${presentacion}', '${lab}', ${p.precio_lista || 0}, ${p.descuento_maximo_porc || 15}, ${p.es_prioritario ? 'true' : 'false'}, ${p.factor_prioridad || 1.3}, ${p.empaque_minimo || 10}, ${p.stock_disponible || 500}, '${lab}', '${clase}', '${sistemas}', '${portafolio}', '${prodCode}', '${packCode}', ${p.activo ? 'true' : 'false'}) ` +
        `ON CONFLICT (sku) DO NOTHING;`
      );
    });

    lines.push('', '-- 3. CARGA DE CLIENTES (dim_clientes - 11 Campos con ident01 como Primary Key)');
    clientes.forEach((c) => {
      const id01 = (c.ident01 || c.codigo_cliente || c.id || '').replace(/'/g, "''");
      const rif = (c.rif || 'J-00000000-0').replace(/'/g, "''");
      const razon = (c.razon_social || '').replace(/'/g, "''");
      const fantasia = (c.nombre_fantasia || c.nombre_comercial || '').replace(/'/g, "''");
      const brick = (c.brick || '').replace(/'/g, "''");
      const mun = (c.municipio_ciudad || c.ciudad || '').replace(/'/g, "''");
      const est = (c.estado || '').replace(/'/g, "''");
      const frec = (c.frecuencia || 'Semanal').replace(/'/g, "''");
      const bandera = (c.bandera || 'Independiente').replace(/'/g, "''");
      const lat = c.local_gps_lat !== undefined && !isNaN(Number(c.local_gps_lat)) ? Number(c.local_gps_lat) : 10.4800;
      const lon = c.local_gps_lon !== undefined && !isNaN(Number(c.local_gps_lon)) ? Number(c.local_gps_lon) : -66.8600;

      lines.push(
        `INSERT INTO dim_clientes (ident01, codigo_cliente, rif, razon_social, nombre_fantasia, nombre_comercial, brick, municipio_ciudad, direccion, estado, ciudad, frecuencia, bandera, local_gps_lat, local_gps_lon, activo) ` +
        `VALUES ('${id01}', '${id01}', '${rif}', '${razon}', '${fantasia}', '${fantasia}', '${brick}', '${mun}', '${mun}, ${est}', '${est}', '${mun}', '${frec}', '${bandera}', ${lat}, ${lon}, ${c.activo ? 'true' : 'false'}) ` +
        `ON CONFLICT (ident01) DO UPDATE SET razon_social = EXCLUDED.razon_social, nombre_fantasia = EXCLUDED.nombre_fantasia, brick = EXCLUDED.brick, estado = EXCLUDED.estado, local_gps_lat = EXCLUDED.local_gps_lat, local_gps_lon = EXCLUDED.local_gps_lon;`
      );
    });

    if (historicoPrevio.length > 0) {
      lines.push('', '-- 4. HISTORICO DE VENTAS (8 Columnas Oficiales)');
      historicoPrevio.slice(0, 40).forEach((h) => {
        const fec = (h.fecha_pedido || '2026-02-15').replace(/'/g, "''");
        const codCli = (h.cod_cliente_drogueria || h.cliente_id || '').replace(/'/g, "''");
        const nomCli = (h.nombre_cliente || '').replace(/'/g, "''");
        const drog = (h.nombre_drogueria || h.drogueria_id || '').replace(/'/g, "''");
        const codProdDrog = (h.codigo_producto_drogueria || '').replace(/'/g, "''");
        const nomProd = (h.nombre_producto || '').replace(/'/g, "''");
        const uds = h.cantidad_facturada || 0;
        const codSap = (h.cod_sap || h.producto_id || '').replace(/'/g, "''");
        lines.push(
          `INSERT INTO fact_historico_ventas (fecha, cod_cliente, nombre_cliente, drogueria, codigo_producto, nombre_producto, unidades, cod_sap) ` +
          `VALUES ('${fec}', '${codCli}', '${nomCli}', '${drog}', '${codProdDrog}', '${nomProd}', ${uds}, '${codSap}');`
        );
      });
    }

    lines.push('', 'COMMIT;');
    return lines.join('\n');
  }, [droguerias, productos, clientes, historicoPrevio]);

  const handleCopiarSql = () => {
    navigator.clipboard.writeText(sqlGenerado);
    setCopiadoSql(true);
    showNotification('exito', 'Sentencias SQL copiadas al portapapeles.');
    setTimeout(() => setCopiadoSql(false), 3000);
  };

  const script1MContenido = useMemo(() => {
    if (estrategia1M === 'agregada') {
      if (lenguajeScript1M === 'sql') {
        return `-- ==============================================================================
-- TABLA HISTÓRICA PARA SUPABASE CON TUS 8 COLUMNAS EXACTAS
-- Fecha | Cod Cliente | Nombre_cliente | Drogueria | Codigo Producto | Nombre Producto | Unidades | Cod Sap
-- ==============================================================================

CREATE TABLE IF NOT EXISTS fact_historico_ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL,
    cod_cliente VARCHAR(100) NOT NULL,         -- Código de la farmacia en la droguería
    nombre_cliente VARCHAR(255) NOT NULL,      -- Razón social / nombre de la farmacia
    drogueria VARCHAR(150) NOT NULL,           -- Droguería distribuidora (Cobeca, Nena, etc.)
    codigo_producto VARCHAR(100) NOT NULL,     -- Código del producto en esa droguería
    nombre_producto VARCHAR(255) NOT NULL,     -- Descripción comercial del medicamento
    unidades INT NOT NULL CHECK (unidades >= 0),
    cod_sap VARCHAR(100) NOT NULL,             -- Tu código interno maestro (SKU Vademécum)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de alta velocidad para el Motor de Sugeridos
CREATE INDEX IF NOT EXISTS idx_hist_cod_sap ON fact_historico_ventas(cod_sap);
CREATE INDEX IF NOT EXISTS idx_hist_cod_cliente ON fact_historico_ventas(cod_cliente);
CREATE INDEX IF NOT EXISTS idx_hist_drogueria ON fact_historico_ventas(drogueria);
CREATE INDEX IF NOT EXISTS idx_hist_fecha ON fact_historico_ventas(fecha DESC);

-- Agrupación mensual en PostgreSQL si tienes una tabla staging con 1M filas:
-- SELECT 
--     TO_CHAR(fecha, 'YYYY-MM') AS fecha_mes,
--     cod_cliente,
--     nombre_cliente,
--     drogueria,
--     codigo_producto,
--     nombre_producto,
--     SUM(unidades) AS total_unidades,
--     cod_sap
-- FROM staging_ventas_brutas
-- GROUP BY TO_CHAR(fecha, 'YYYY-MM'), cod_cliente, nombre_cliente, drogueria, codigo_producto, nombre_producto, cod_sap;`;
      } else {
        return `# ==============================================================================
# SCRIPT PYTHON: CONDENSAR TUS 8 COLUMNAS Y 1.000.000 DE FILAS EN < 4 SEGUNDOS
# Columnas: Fecha | Cod Cliente | Nombre_cliente | Drogueria | Codigo Producto | Nombre Producto | Unidades | Cod Sap
# Requiere: pip install pandas
# ==============================================================================
import pandas as pd

print("Leyendo archivo de ventas brutas (1.000.000+ filas)...")
# 1. Leer archivo (ajusta delimitador ';' o ',')
df = pd.read_csv("historico_ventas_1M.csv", sep=";", dtype=str)

# 2. Extraer Año-Mes de la columna Fecha (ej: '2026-02-15' -> '2026-02')
df['Fecha_Mes'] = df['Fecha'].astype(str).str.slice(0, 7)
df['Unidades'] = pd.to_numeric(df['Unidades'], errors='coerce').fillna(0).astype(int)

# 3. Agrupación por Mes manteniendo la integridad de tus 8 columnas
resumen = df.groupby([
    'Fecha_Mes', 'Cod Cliente', 'Nombre_cliente', 'Drogueria',
    'Codigo Producto', 'Nombre Producto', 'Cod Sap'
]).agg(
    Unidades=('Unidades', 'sum')
).reset_index()

resumen.rename(columns={'Fecha_Mes': 'Fecha'}, inplace=True)

# 4. Guardar archivo condensado (< 5 MB listo para subir al sistema)
resumen.to_csv("historico_resumen_mensual_8col.csv", sep=";", index=False)
print(f"¡Listo! Se redujo de {len(df):,} filas diarias a {len(resumen):,} filas mensuales agrupadas.")`;
      }
    } else if (estrategia1M === 'ventana90') {
      return `-- ==============================================================================
-- ESTRATEGIA VENTANA MÓVIL 90 DÍAS CON TUS 8 COLUMNAS
-- ==============================================================================
-- Filtra en tu base de datos o Excel solo las ventas de los últimos 90 días:
SELECT 
    fecha,
    cod_cliente,
    nombre_cliente,
    drogueria,
    codigo_producto,
    nombre_producto,
    unidades,
    cod_sap
FROM fact_historico_ventas
WHERE fecha >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY fecha DESC;`;
    } else {
      return `# ==============================================================================
# CARGA MASIVA DIRECTA POR CLI POSTGRESQL (1.000.000 FILAS EN ~40 SEGUNDOS)
# ==============================================================================
psql "postgresql://postgres:[TU_CLAVE]@db.[TU_PROYECTO].supabase.co:5432/postgres" \\
  -c "\\COPY fact_historico_ventas(fecha, cod_cliente, nombre_cliente, drogueria, codigo_producto, nombre_producto, unidades, cod_sap) FROM 'historico_1M.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';');"`;
    }
  }, [estrategia1M, lenguajeScript1M]);

  const handleCopiarScript1M = () => {
    navigator.clipboard.writeText(script1MContenido);
    setCopiadoScript1M(true);
    showNotification('exito', 'Script copiado al portapapeles.');
    setTimeout(() => setCopiadoScript1M(false), 3000);
  };

  const historicoFiltrado = useMemo(() => {
    if (!filtroHistorico.trim()) return historicoPrevio;
    const q = filtroHistorico.toLowerCase().trim();
    return historicoPrevio.filter((h) => {
      const cli = clientes.find((c) => c.id === h.cliente_id || c.ident01 === h.cliente_id);
      const prod = productos.find((p) => p.id === h.producto_id || p.sku === h.producto_id);
      return (
        (h.cliente_id && h.cliente_id.toLowerCase().includes(q)) ||
        (h.producto_id && h.producto_id.toLowerCase().includes(q)) ||
        (h.cod_sap && h.cod_sap.toLowerCase().includes(q)) ||
        (h.codigo_producto_drogueria && h.codigo_producto_drogueria.toLowerCase().includes(q)) ||
        (h.nombre_producto && h.nombre_producto.toLowerCase().includes(q)) ||
        (h.cod_cliente_drogueria && h.cod_cliente_drogueria.toLowerCase().includes(q)) ||
        (h.nombre_cliente && h.nombre_cliente.toLowerCase().includes(q)) ||
        (h.nombre_drogueria && h.nombre_drogueria.toLowerCase().includes(q)) ||
        (cli?.nombre_fantasia && cli.nombre_fantasia.toLowerCase().includes(q)) ||
        (cli?.razon_social && cli.razon_social.toLowerCase().includes(q)) ||
        (prod?.nombre_comercial && prod.nombre_comercial.toLowerCase().includes(q)) ||
        (prod?.sku && prod.sku.toLowerCase().includes(q)) ||
        (h.numero_factura_origen && h.numero_factura_origen.toLowerCase().includes(q))
      );
    });
  }, [historicoPrevio, filtroHistorico, clientes, productos]);

  const metricasHistorico = useMemo(() => {
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
  }, [historicoPrevio]);

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

      {/* Cabecera Principal */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Carga y Gestion de Dimensiones (Paso 5)
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Modulo de administracion dimensional: Droguerias con ID numerico, Productos de 12 campos (sin acentos) y Clientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold border border-teal-500/20">
            Tablas Dimensionales
          </span>
        </div>
      </div>

      {/* Barra de Sub-Pestañas */}
      <div className={`flex flex-wrap gap-2 p-1.5 rounded-2xl border ${
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
          <span>1. Droguerias ({droguerias.length})</span>
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
          <span>2. Productos ({productos.length})</span>
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
          <span>3. Clientes ({clientes.length})</span>
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
          <span>4. Historico Ventas ({historicoPrevio.length})</span>
        </button>

        <button
          onClick={() => setSubTab('sql_generator')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            subTab === 'sql_generator'
              ? 'bg-indigo-600 text-white shadow-sm'
              : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Generador SQL Supabase</span>
        </button>
      </div>

      {subTab !== 'sql_generator' ? (
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
                      {subTab === 'droguerias' ? 'dim_droguerias' : subTab === 'productos' ? 'dim_productos (12 Campos)' : subTab === 'clientes' ? 'dim_clientes' : 'historico_pedidos_previos'}
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
                        onClick={() => {
                          const primerProd = diagnosticoVentasMes.productosSinSap[0];
                          if (primerProd) {
                            setItemMapeoSapSeleccionado({
                              drogueria: primerProd.drogueria,
                              codigo_producto: primerProd.codigo_producto,
                              nombre_producto: primerProd.nombre_producto,
                              codSapElegido: productos[0]?.sku || 'SKU-LOS-50',
                            });
                            setModalMapeoSapAbierto(true);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-sm"
                      >
                        Asignar Cod SAP Faltantes
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
                        onClick={() => {
                          const primeraFarm = diagnosticoVentasMes.farmaciasSinHomologar[0];
                          if (primeraFarm) {
                            setItemHomologarSeleccionado({
                              drogueria: primeraFarm.drogueria,
                              cod_cliente_drogueria: primeraFarm.cod_cliente,
                              nombre_cliente_drogueria: primeraFarm.nombre_cliente,
                              sugerenciaIdent01: primeraFarm.sugerenciaIdent01,
                              ident01Elegido: primeraFarm.sugerenciaIdent01,
                            });
                            setModalHomologarAbierto(true);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 shadow-sm"
                      >
                        Homologar Nombres de Farmacias
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
              {/* Explicacion del Delimitador CSV */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                esClaro ? 'bg-teal-50/70 border-teal-200 text-teal-900' : 'bg-teal-950/30 border-teal-800/60 text-teal-300'
              }`}>
                <HelpCircle className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold">¿Que es el Delimitador CSV y por que es clave para el Teletransferencista?</h4>
                  <p className="leading-relaxed opacity-90">
                    El <b>delimitador</b> es el caracter de separacion (punto y coma <code className="font-bold font-mono px-1 py-0.2 rounded bg-black/10">;</code>, coma <code className="font-bold font-mono px-1 py-0.2 rounded bg-black/10">,</code>, o barra <code className="font-bold font-mono px-1 py-0.2 rounded bg-black/10">|</code>) que divide las columnas en un archivo CSV. Cada drogueria (COBECA, NENA, DROVENCENTRO, etc.) tiene un sistema receptor distinto. Nova exporta automaticamente con el delimitador y orden exacto que exige cada distribuidora, permitiendo al teletransferencista hacer clic en su portal web y cargar el archivo sin ediciones manuales.
                  </p>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-teal-600" />
                    <span>Droguerias Activas en dim_droguerias ({droguerias.length} Distribuidoras)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nomenclatura oficial <b>Ventas al Dia</b> con ID numerico (Primary Key), portales B2B y soporte de edicion/eliminacion.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModalDrogueriaNuevaAbierto(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all min-h-[44px]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar Drogueria</span>
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
                    Estructura oficial de 11 campos con <b>ident01</b> como Primary Key unico, brick IMS, frecuencia y GPS.
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
              <div className={`p-2 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
                esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-sm'
              }`}>
                <div className="flex flex-wrap items-center gap-1.5">
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

                <button
                  type="button"
                  onClick={() => setSeccionHistoricoActiva('guia')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    seccionHistoricoActiva === 'guia'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : esClaro ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200' : 'text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800'
                  }`}
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Guía: ¿Qué hacer y qué sigue?</span>
                </button>
              </div>

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

              {/* 2. SOLUCIÓN TÉCNICA: ¿CÓMO CARGAR +1.000.000 DE FILAS EN SUPABASE GRATUITO? */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-teal-600" />
                      <span>Estrategia de Carga para +1.000.000 de Filas en Supabase (Gratuito y Sostenible)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Supabase Free incluye <strong>500 MB</strong> de base de datos. Analicemos como mantener coste cero y maximo rendimiento.
                    </p>
                  </div>

                  {/* Selector de Estrategia */}
                  <div className={`flex p-1 rounded-xl border ${
                    esClaro ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setEstrategia1M('agregada')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        estrategia1M === 'agregada'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ★ 1. Pre-Agregada (Recomendada)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstrategia1M('ventana90')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        estrategia1M === 'ventana90'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      2. Ventana 90 Dias
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstrategia1M('copy_cli')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        estrategia1M === 'copy_cli'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      3. CLI \COPY (1M Bruto)
                    </button>
                  </div>
                </div>

                {/* Contenido según Estrategia Seleccionada */}
                {estrategia1M === 'agregada' && (
                  <div className="space-y-4">
                    {/* Cuadro Comparativo */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                      <div className={`p-3 rounded-xl border ${esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Registros Brutos</div>
                        <div className="text-sm font-extrabold text-slate-500 line-through">1.000.000</div>
                        <div className="text-[10px] text-slate-400">Facturas diarias</div>
                      </div>

                      <div className={`p-3 rounded-xl border ${esClaro ? 'bg-teal-50 border-teal-200' : 'bg-teal-950/40 border-teal-800'}`}>
                        <div className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase">Registros Agrupados</div>
                        <div className="text-base font-extrabold text-teal-700 dark:text-teal-300">~38.000</div>
                        <div className="text-[10px] text-teal-600">Reduccion del 96%</div>
                      </div>

                      <div className={`p-3 rounded-xl border ${esClaro ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/40 border-emerald-800'}`}>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">Espacio en Supabase</div>
                        <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">&lt; 12 MB</div>
                        <div className="text-[10px] text-emerald-600">Usa solo el 2.4% de 500MB</div>
                      </div>

                      <div className={`p-3 rounded-xl border ${esClaro ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-950/40 border-indigo-800'}`}>
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase">Velocidad Sugeridos</div>
                        <div className="text-base font-extrabold text-indigo-700 dark:text-indigo-300">15 ms</div>
                        <div className="text-[10px] text-indigo-600">Ultra rapido en movil</div>
                      </div>

                      <div className={`p-3 rounded-xl border ${esClaro ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/40 border-amber-800'}`}>
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">Coste de Servidor</div>
                        <div className="text-base font-extrabold text-amber-700 dark:text-amber-300">$0.00 / mes</div>
                        <div className="text-[10px] text-amber-600">100% Gratuito garantizado</div>
                      </div>
                    </div>

                    {/* Explicación Farmacéutica */}
                    <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}>
                      <p>
                        <strong>¿Por que esta es la mejor practica en la industria farmaceutica?</strong> Para calcular la reposicion de anaquel y pedido sugerido a 30, 60 y 90 dias, el sistema comercial no necesita saber la hora o numero de cada factura diaria; necesita saber:{' '}
                        <code className="font-mono font-bold text-teal-700 dark:text-teal-300">
                          (Farmacia ident01, Medicamento SKU, Año-Mes, Cantidad Total, Frecuencia de Compra, Descuento Promedio)
                        </code>.
                      </p>
                      <p>
                        Al agrupar tus 1.000.000 de filas mensuales, caben comodamente tanto en <b>Supabase Gratuito</b> como en el almacenamiento local del navegador, evitando cuelgues o desconexiones de red en zonas con baja senal celular.
                      </p>
                    </div>

                    {/* Selector de Código: SQL vs Python */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Script de Condensacion de Datos:
                          </span>
                          <button
                            type="button"
                            onClick={() => setLenguajeScript1M('sql')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                              lenguajeScript1M === 'sql'
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            SQL (Supabase / Postgres)
                          </button>
                          <button
                            type="button"
                            onClick={() => setLenguajeScript1M('python')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                              lenguajeScript1M === 'python'
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            Python / Pandas (En tu PC)
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleCopiarScript1M}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                        >
                          {copiadoScript1M ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-teal-600" />}
                          <span>{copiadoScript1M ? 'Copiado' : 'Copiar Script'}</span>
                        </button>
                      </div>

                      <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-64 leading-relaxed border border-slate-800">
                        {script1MContenido}
                      </pre>
                    </div>
                  </div>
                )}

                {estrategia1M === 'ventana90' && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        Estrategia de Ventana Activa 90 / 180 Dias
                      </h4>
                      <p>
                        En la dinamica comercial farmaceutica venezolana e internacional, los pedidos de hace 1 o 2 anos ya no reflejan la velocidad de rotacion real debido a la inflacion, cambios de vademecum, quiebres temporales de distribuidores o rotacion de precios.
                      </p>
                      <p>
                        Si filtras tu archivo de ventas para conservar unicamente los <b>ultimos 90 o 180 dias</b>, el volumen bajara de 1.000.000 a aproximadamente <b>100.000 - 150.000 filas</b> (~35 MB), las cuales caben perfectamente en el nivel gratuito de Supabase.
                      </p>
                    </div>

                    <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-64 leading-relaxed border border-slate-800">
                      {script1MContenido}
                    </pre>
                  </div>
                )}

                {estrategia1M === 'copy_cli' && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                      esClaro ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-800/60 text-amber-300'
                    }`}>
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-amber-600" />
                        <span>Carga Bruta de 1.000.000 de Filas por Terminal (Sin Pasar por el Navegador)</span>
                      </h4>
                      <p>
                        <b>Importante:</b> NUNCA intentes cargar un archivo CSV de 1.000.000 de lineas (&gt;150 MB) arrastrandolo en la interfaz web del navegador. El navegador se congelara y la peticion HTTP se caera por Timeout a los 60 segundos.
                      </p>
                      <p>
                        Para cargar 1M en bruto, debes usar la conexion directa de PostgreSQL mediante el comando nativo <code className="font-bold font-mono px-1 py-0.5 rounded bg-black/10">\COPY</code>. Este comando procesa mas de 25.000 filas por segundo y completa la carga en unos 40 segundos.
                      </p>
                    </div>

                    <pre className="p-4 rounded-xl bg-slate-950 text-amber-400 font-mono text-xs overflow-x-auto max-h-64 leading-relaxed border border-slate-800">
                      {script1MContenido}
                    </pre>
                  </div>
                )}
              </div>

              {/* 3. GUÍA: ¿CARGAR MES A MES O TODOS LOS MESES JUNTOS? */}
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                esClaro ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950' : 'bg-indigo-950/30 border-indigo-800/60 text-indigo-300'
              }`}>
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span>¿Debo cargar el historico mes a mes o todos los meses juntos?</span>
                  </h4>
                  <p className="leading-relaxed opacity-95">
                    <strong>Respuesta:</strong> Si tienes 1.000.000 de filas en bruto, <strong>NO subas el archivo crudo de 1M todo junto</strong> porque el navegador colapsara por memoria. Aplica una de estas dos opciones:
                  </p>
                  <ul className="list-disc list-inside space-y-1 mt-1 text-[11px] opacity-90">
                    <li>
                      <strong>Opcion A (Todos los meses juntos - Recomendada):</strong> Usa el script de Python o SQL para condensar tus 8 columnas agrupando por mes. Obtendras <strong>un solo archivo de ~40.000 filas (4 MB)</strong> con todos los meses consolidados (2025-2026), el cual subes de una sola vez en 2 segundos.
                    </li>
                    <li>
                      <strong>Opcion B (Mes a mes):</strong> Si ya tienes tus archivos separados por mes (ej. Enero.csv, Febrero.csv), puedes subirlos uno a uno. El sistema los acumulara progresivamente en la base de datos.
                    </li>
                    <li>
                      <strong>Tip para Fase de Prueba:</strong> Para calibrar el Motor de Sugeridos solo necesitas los <strong>ultimos 3 meses (90 dias)</strong>, ya que el algoritmo evalua ventanas de 30/60/90 dias.
                    </li>
                  </ul>
                </div>
              </div>

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

            </div>
          )}

        </div>
      ) : (
        /* Generador SQL Directo para Supabase */
        <div className={`p-5 rounded-2xl border space-y-4 ${
          esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-teal-600" />
                <span>Sentencias SQL de Insercion para Supabase SQL Editor</span>
              </h3>
              <p className="text-xs text-slate-500">
                Copia este bloque y pegalo directamente en la consola SQL de tu proyecto Supabase para sembrar las dimensiones con IDs numericos.
              </p>
            </div>

            <button
              onClick={handleCopiarSql}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all min-h-[44px]"
            >
              {copiadoSql ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              <span>{copiadoSql ? 'Copiado al Portapapeles' : 'Copiar Sentencias SQL'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-96 leading-relaxed">
            {sqlGenerado}
          </pre>
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
                  <label className="block font-bold mb-1">ID (Primary Key Numerico) *</label>
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
                  <label className="block font-bold mb-1">ident01 (ID Unico Primary Key) *</label>
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
                  <label className="block font-bold mb-1">ident01 (ID Unico Primary Key) *</label>
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
