import React, { useState, useEffect } from 'react';
import { 
  RolUsuario, 
  EquipoVentas, 
  Producto, 
  Cliente, 
  Drogueria, 
  HistoricoPedidoPrevio, 
  PedidoCabecera, 
  PedidoDetalle, 
  MotivoAjuste, 
  EstadoPedido,
  Usuario 
} from './types/pharmacy';
import { 
  MOCK_USUARIOS, 
  MOCK_DROGUERIAS, 
  MOCK_PRODUCTOS, 
  MOCK_CLIENTES, 
  MOCK_HISTORICO_PREVIO, 
  MOCK_PEDIDOS_CABECERA, 
  MOCK_PEDIDOS_DETALLE 
} from './data/mockData';
import { Header } from './components/Header';
import { SqlStudioTab } from './components/SqlStudioTab';
import { SuggestedOrderTab } from './components/SuggestedOrderTab';
import { DrugstoreCsvTab } from './components/DrugstoreCsvTab';
import { InventoryCatalogTab } from './components/InventoryCatalogTab';
import { TeletransferQueueTab } from './components/TeletransferQueueTab';
import { OrderTakingTab } from './components/OrderTakingTab';
import { MyOrdersTab } from './components/MyOrdersTab';
import { RepDashboardTab } from './components/RepDashboardTab';
import { UserGuideTab } from './components/UserGuideTab';
import { AdminUsersTab } from './components/AdminUsersTab';
import { DataImportStudioTab } from './components/DataImportStudioTab';
import { DrugstoreInventoryUploadTab } from './components/DrugstoreInventoryUploadTab';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { VoiceDictationModal } from './components/VoiceDictationModal';
import { AuthModal } from './components/AuthModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { AboutModal } from './components/AboutModal';
import { getStoredSupabaseConfig } from './services/supabaseClient';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import sqlSchemaRaw from './sql/supabase_schema_fase1.sql?raw';

function AppContent() {
  const { esClaro } = useTheme();

  // Usuario Autenticado en Supabase Auth / Local (Hernando Sanoja Dev & Admin por defecto)
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(() => {
    const saved = localStorage.getItem('PHARMA_AUTH_USER');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return MOCK_USUARIOS[0]; // Hernando Sanoja (Lead Dev & Admin)
  });

  // Lista de Usuarios del Sistema (Hernando Sanoja como Dev inicial, creador de los demás)
  const [usuarios, setUsuarios] = useState<Usuario[]>(() => {
    const guardado = localStorage.getItem('PHARMA_USUARIOS');
    if (guardado) {
      try { return JSON.parse(guardado); } catch { /* ignore */ }
    }
    return MOCK_USUARIOS;
  });

  // El Rol y el Equipo provienen estrictamente del usuario que tiene la sesión iniciada
  const rolActual: RolUsuario = usuarioActual?.rol || 'admin';
  const equipoActual: EquipoVentas = usuarioActual?.equipo || 'TODOS';
  const [tabActiva, setTabActiva] = useState<string>('dashboard');

  // Estado del Vademécum, Clientes, Droguerías y Pedidos (Persistidos y Sanitizados)
  const [productos, setProductos] = useState<Producto[]>(() => {
    const guardado = localStorage.getItem('PHARMA_PRODUCTOS');
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p: any) => ({
            ...p,
            sku: p.sku || p.codigo || `SKU-${p.id}`,
            codigo: p.codigo || p.sku || `SKU-${p.id}`,
            nombre_comercial: p.nombre_comercial || p.product || 'Medicamento',
            product: p.product || p.nombre_comercial || 'Medicamento',
            principio_activo: p.principio_activo || p.molecula || 'Principio Activo',
            molecula: p.molecula || p.principio_activo || 'Principio Activo',
            presentacion: p.presentacion || p.pack || 'Caja x 30',
            pack: p.pack || p.presentacion || 'Caja x 30',
            laboratorio: p.laboratorio || p.unidad_negocio || 'La Sante',
            unidad_negocio: p.unidad_negocio || p.laboratorio || 'La Sante',
            precio_lista: typeof p.precio_lista === 'number' ? p.precio_lista : 0,
            descuento_maximo_porc: typeof p.descuento_maximo_porc === 'number' ? p.descuento_maximo_porc : 15,
            empaque_minimo: typeof p.empaque_minimo === 'number' ? p.empaque_minimo : 10,
            stock_disponible: typeof p.stock_disponible === 'number' ? p.stock_disponible : 500,
            codigo_barras_ean13: p.codigo_barras_ean13 || p.pack_code || '7590000000000',
            pack_code: p.pack_code || p.codigo_barras_ean13 || '7590000000000',
            activo: p.activo !== false,
          }));
        }
      } catch { /* ignore */ }
    }
    return MOCK_PRODUCTOS;
  });

  const [clientes, setClientes] = useState<Cliente[]>(() => {
    const guardado = localStorage.getItem('PHARMA_CLIENTES');
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((c: any, idx: number) => {
            const ident01 = c.ident01 || c.codigo_cliente || c.id || `CLI-100${idx + 1}`;
            const nombreFantasia = c.nombre_fantasia || c.nombre_comercial || c.razon_social || `Farmacia ${idx + 1}`;
            const munCiudad = c.municipio_ciudad || c.ciudad || 'Caracas';
            return {
              ...c,
              id: c.id || ident01,
              ident01: ident01,
              codigo_cliente: c.codigo_cliente || ident01,
              razon_social: c.razon_social || nombreFantasia,
              nombre_fantasia: nombreFantasia,
              nombre_comercial: c.nombre_comercial || nombreFantasia,
              brick: c.brick || 'CCS-CENTRO-01',
              municipio_ciudad: munCiudad,
              ciudad: c.ciudad || munCiudad,
              direccion: c.direccion || `${munCiudad}, ${c.estado || 'Miranda'}`,
              estado: c.estado || 'Miranda',
              rif: c.rif || 'J-00000000-0',
              frecuencia: c.frecuencia || 'Semanal',
              bandera: c.bandera || 'Independiente',
              local_gps_lat: typeof c.local_gps_lat === 'number' ? c.local_gps_lat : 10.4800,
              local_gps_lon: typeof c.local_gps_lon === 'number' ? c.local_gps_lon : -66.8600,
              clasificacion_abc: c.clasificacion_abc || 'B',
              cupo_credito: typeof c.cupo_credito === 'number' ? c.cupo_credito : 5000,
              dias_credito: typeof c.dias_credito === 'number' ? c.dias_credito : 15,
              activo: c.activo !== false,
            };
          });
        }
      } catch { /* ignore */ }
    }
    return MOCK_CLIENTES;
  });

  const [droguerias, setDroguerias] = useState<Drogueria[]>(() => {
    const guardado = localStorage.getItem('PHARMA_DROGUERIAS_V2');
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((d: any, idx: number) => ({
            ...d,
            id: d.id || `drog-${idx + 1}`,
            id_numero: typeof d.id_numero === 'number' ? d.id_numero : (idx + 1),
            nombre_drogueria: d.nombre_drogueria || `Drogueria ${idx + 1}`,
            codigo_drogueria: d.codigo_drogueria || `DROG-${idx + 1}`,
            email_pedidos: d.email_pedidos || 'pedidos@drogueria.com',
            formato_csv_config: d.formato_csv_config || {
              delimitador: ';',
              incluir_encabezados: true,
              entrecomillado: 'solo_texto',
              codificacion: 'UTF-8',
              salto_linea: '\r\n',
              formato_decimal: 'coma',
              columnas: [
                { campo_origen: 'codigo_cliente', nombre_encabezado: 'COD_CLIENTE', orden: 1, formato: 'texto' },
                { campo_origen: 'rif_cliente', nombre_encabezado: 'RIF_FARMACIA', orden: 2, formato: 'texto' },
                { campo_origen: 'sku', nombre_encabezado: 'SKU_PRODUCTO', orden: 3, formato: 'texto' },
                { campo_origen: 'cantidad_confirmada', nombre_encabezado: 'CANTIDAD', orden: 4, formato: 'entero' },
                { campo_origen: 'descuento_porcentaje', nombre_encabezado: 'DESCUENTO', orden: 5, formato: 'decimal_coma' },
                { campo_origen: 'numero_pedido', nombre_encabezado: 'NUMERO_ORDEN', orden: 6, formato: 'texto' },
              ],
            },
            activo: d.activo !== false,
          }));
        }
      } catch { /* ignore */ }
    }
    return MOCK_DROGUERIAS;
  });

  const [historicoPrevio, setHistoricoPrevio] = useState<HistoricoPedidoPrevio[]>(() => {
    const guardado = localStorage.getItem('PHARMA_HISTORICO');
    if (guardado) {
      try { return JSON.parse(guardado); } catch { /* ignore */ }
    }
    return MOCK_HISTORICO_PREVIO;
  });
  
  const [pedidosCabecera, setPedidosCabecera] = useState<PedidoCabecera[]>(() => {
    const guardado = localStorage.getItem('PHARMA_PEDIDOS_CAB');
    if (guardado) {
      try { return JSON.parse(guardado); } catch { /* ignore */ }
    }
    return MOCK_PEDIDOS_CABECERA;
  });

  const [pedidosDetalle, setPedidosDetalle] = useState<PedidoDetalle[]>(() => {
    const guardado = localStorage.getItem('PHARMA_PEDIDOS_DET');
    if (guardado) {
      try { return JSON.parse(guardado); } catch { /* ignore */ }
    }
    return MOCK_PEDIDOS_DETALLE;
  });

  // Modales
  const [isSupabaseConectado, setIsSupabaseConectado] = useState(false);
  const [modalSupabaseAbierto, setModalSupabaseAbierto] = useState(false);
  const [modalAuthAbierto, setModalAuthAbierto] = useState(false);
  const [modalEscanerAbierto, setModalEscanerAbierto] = useState(false);
  const [modalDictadoAbierto, setModalDictadoAbierto] = useState(false);
  const [modalCreditosAbierto, setModalCreditosAbierto] = useState(false);

  // Items añadidos externamente desde Escáner o Voz al borrador de pedido
  const [itemsExternosAñadidos, setItemsExternosAñadidos] = useState<{
    producto: Producto;
    cantidad: number;
    descuento: number;
  }[]>([]);

  useEffect(() => {
    const config = getStoredSupabaseConfig();
    setIsSupabaseConectado(config.isConnected);
  }, []);

  // Persistencia local
  useEffect(() => {
    localStorage.setItem('PHARMA_PRODUCTOS', JSON.stringify(productos));
  }, [productos]);

  useEffect(() => {
    localStorage.setItem('PHARMA_CLIENTES', JSON.stringify(clientes));
  }, [clientes]);

  useEffect(() => {
    localStorage.setItem('PHARMA_DROGUERIAS_V2', JSON.stringify(droguerias));
  }, [droguerias]);

  useEffect(() => {
    localStorage.setItem('PHARMA_HISTORICO', JSON.stringify(historicoPrevio));
  }, [historicoPrevio]);

  useEffect(() => {
    localStorage.setItem('PHARMA_USUARIOS', JSON.stringify(usuarios));
  }, [usuarios]);

  useEffect(() => {
    localStorage.setItem('PHARMA_PEDIDOS_CAB', JSON.stringify(pedidosCabecera));
  }, [pedidosCabecera]);

  useEffect(() => {
    localStorage.setItem('PHARMA_PEDIDOS_DET', JSON.stringify(pedidosDetalle));
  }, [pedidosDetalle]);

  useEffect(() => {
    if (usuarioActual) {
      localStorage.setItem('PHARMA_AUTH_USER', JSON.stringify(usuarioActual));
    } else {
      localStorage.removeItem('PHARMA_AUTH_USER');
    }
  }, [usuarioActual]);

  const handleCrearUsuario = (nuevo: Omit<Usuario, 'id' | 'created_at'> & { password?: string }) => {
    const userCreado: Usuario = {
      id: `usr-custom-${Date.now()}`,
      email: nuevo.email,
      nombre_completo: nuevo.nombre_completo,
      rol: nuevo.rol,
      equipo: nuevo.equipo,
      telefono: nuevo.telefono,
      activo: nuevo.activo,
      created_at: new Date().toISOString(),
    };
    setUsuarios((prev) => [userCreado, ...prev]);
  };

  const handleActualizarUsuario = (usuarioId: string, cambios: Partial<Usuario>) => {
    setUsuarios((prev) => prev.map((u) => (u.id === usuarioId ? { ...u, ...cambios } : u)));
    if (usuarioActual?.id === usuarioId) {
      setUsuarioActual((prev) => (prev ? { ...prev, ...cambios } : null));
    }
  };

  const handleImportarClientes = (nuevos: Cliente[]) => {
    setClientes((prev) => {
      const mapa = new Map<string, Cliente>();
      prev.forEach((c) => mapa.set(c.codigo_cliente, c));
      nuevos.forEach((c) => mapa.set(c.codigo_cliente, c));
      return Array.from(mapa.values());
    });
  };

  const handleImportarProductos = (nuevos: Producto[]) => {
    setProductos((prev) => {
      const mapa = new Map<string, Producto>();
      prev.forEach((p) => mapa.set(p.sku, p));
      nuevos.forEach((p) => mapa.set(p.sku, p));
      return Array.from(mapa.values());
    });
  };

  const handleImportarHistorico = (nuevos: HistoricoPedidoPrevio[]) => {
    setHistoricoPrevio((prev) => [...nuevos, ...prev]);
  };

  const handleImportarDroguerias = (nuevas: Drogueria[]) => {
    setDroguerias((prev) => {
      const mapa = new Map<string, Drogueria>();
      prev.forEach((d) => mapa.set((d.nombre_drogueria || d.id || '').toLowerCase(), d));
      nuevas.forEach((d) => mapa.set((d.nombre_drogueria || d.id || '').toLowerCase(), d));
      return Array.from(mapa.values());
    });
  };

  const handleUsuarioAutenticado = (usuario: Usuario) => {
    setUsuarioActual(usuario);

    if (usuario.rol === 'vendedor') {
      setTabActiva('dashboard');
    } else if (usuario.rol === 'teletransferencista') {
      setTabActiva('teletransferencia');
    } else {
      setTabActiva('dashboard');
    }
  };

  const handleCerrarSesion = () => {
    setUsuarioActual(null);
    localStorage.removeItem('PHARMA_AUTH_USER');
  };

  const handleActualizarStock = (productoId: string, nuevoStock: number) => {
    setProductos((prev) =>
      prev.map((p) => (p.id === productoId ? { ...p, stock_disponible: Math.max(0, nuevoStock) } : p))
    );
  };

  const handleCrearProducto = (nuevoProd: Omit<Producto, 'id' | 'created_at'>) => {
    const id = `prod-custom-${Date.now()}`;
    const nuevo: Producto = {
      ...nuevoProd,
      id,
      created_at: new Date().toISOString(),
    };
    setProductos((prev) => [nuevo, ...prev]);
  };

  const handleEditarProducto = (productoActualizado: Producto) => {
    setProductos((prev) =>
      prev.map((p) => (p.id === productoActualizado.id ? productoActualizado : p))
    );
  };

  const handleEliminarProducto = (productoId: string) => {
    setProductos((prev) => prev.filter((p) => p.id !== productoId));
  };

  const handleCrearDrogueria = (nuevaDrog: Drogueria) => {
    setDroguerias((prev) => {
      const nextIdNum = prev.reduce((max, d) => Math.max(max, d.id_numero || 0), 0) + 1;
      return [...prev, { ...nuevaDrog, id_numero: nuevaDrog.id_numero || nextIdNum }];
    });
  };

  const handleEditarDrogueria = (drogueriaActualizada: Drogueria) => {
    setDroguerias((prev) =>
      prev.map((d) => (d.id === drogueriaActualizada.id ? drogueriaActualizada : d))
    );
  };

  const handleEliminarDrogueria = (drogueriaId: string) => {
    setDroguerias((prev) => prev.filter((d) => d.id !== drogueriaId));
  };

  const handleCrearCliente = (nuevoCliente: Cliente) => {
    setClientes((prev) => [nuevoCliente, ...prev]);
  };

  const handleEditarCliente = (clienteActualizado: Cliente) => {
    setClientes((prev) =>
      prev.map((c) =>
        c.ident01 === clienteActualizado.ident01 || c.id === clienteActualizado.id
          ? clienteActualizado
          : c
      )
    );
  };

  const handleEliminarCliente = (clienteIdent01: string) => {
    setClientes((prev) =>
      prev.filter((c) => c.ident01 !== clienteIdent01 && c.id !== clienteIdent01)
    );
  };

  const handleActualizarDetalle = (
    detalleId: string,
    cantidadConfirmada: number,
    motivoAjuste: MotivoAjuste,
    observaciones?: string
  ) => {
    setPedidosDetalle((prev) => {
      const actualizados = prev.map((d) => {
        if (d.id !== detalleId) return d;
        const subtotalConf = Number(
          (cantidadConfirmada * d.precio_unitario * (1 - d.descuento_porcentaje / 100)).toFixed(2)
        );
        return {
          ...d,
          cantidad_confirmada: cantidadConfirmada,
          subtotal_confirmado: subtotalConf,
          motivo_ajuste: motivoAjuste,
          observaciones_linea: observaciones !== undefined ? observaciones : d.observaciones_linea,
        };
      });

      const detalleModificado = actualizados.find((d) => d.id === detalleId);
      if (detalleModificado) {
        const lineasPedido = actualizados.filter((d) => d.pedido_id === detalleModificado.pedido_id);
        let sol = 0;
        let conf = 0;
        lineasPedido.forEach((l) => {
          sol += l.cantidad_solicitada;
          conf += l.cantidad_confirmada;
        });
        const fill = sol > 0 ? Number(((conf / sol) * 100).toFixed(2)) : 100;

        setPedidosCabecera((prevCab) =>
          prevCab.map((cab) =>
            cab.id === detalleModificado.pedido_id
              ? {
                  ...cab,
                  total_confirmado: conf,
                  fill_rate: fill,
                  updated_at: new Date().toISOString(),
                }
              : cab
          )
        );
      }

      return actualizados;
    });
  };

  const handleCambiarEstadoPedido = (pedidoId: string, nuevoEstado: EstadoPedido) => {
    setPedidosCabecera((prev) =>
      prev.map((p) =>
        p.id === pedidoId
          ? {
              ...p,
              estado: nuevoEstado,
              fecha_procesamiento: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : p
      )
    );
  };

  const handleGenerarPedidoDesdeSugerido = (
    clienteId: string,
    itemsSeleccionados: { producto: Producto; cantidad: number; descuento: number }[]
  ) => {
    const nuevoPedidoId = `ped-cab-${Date.now()}`;
    const fechaActual = new Date().toISOString();
    const numeroPedido = `PED-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    let totalSol = 0;
    const nuevosDetalles: PedidoDetalle[] = itemsSeleccionados.map((it, idx) => {
      const subtotal = Number((it.cantidad * it.producto.precio_lista * (1 - it.descuento / 100)).toFixed(2));
      totalSol += subtotal;

      return {
        id: `det-${nuevoPedidoId}-${idx + 1}`,
        pedido_id: nuevoPedidoId,
        producto_id: it.producto.id,
        cantidad_solicitada: it.cantidad,
        cantidad_confirmada: it.cantidad,
        precio_unitario: it.producto.precio_lista,
        descuento_porcentaje: it.descuento,
        subtotal_solicitado: subtotal,
        subtotal_confirmado: subtotal,
        motivo_ajuste: 'sin_quiebre',
        created_at: fechaActual,
      };
    });

    const nuevaCabecera: PedidoCabecera = {
      id: nuevoPedidoId,
      numero_pedido: numeroPedido,
      cliente_id: clienteId,
      vendedor_id: usuarioActual?.id || MOCK_USUARIOS[0].id,
      drogueria_id: droguerias[0].id,
      fecha_pedido: fechaActual,
      equipo_origen: equipoActual === 'AMBOS' ? 'A' : equipoActual,
      estado: 'enviado_teletransferencia',
      observaciones: 'Generado desde el Motor de Pedido Sugerido.',
      total_solicitado: totalSol,
      total_confirmado: totalSol,
      fill_rate: 100.0,
      created_at: fechaActual,
      updated_at: fechaActual,
    };

    setPedidosCabecera((prev) => [nuevaCabecera, ...prev]);
    setPedidosDetalle((prev) => [...nuevosDetalles, ...prev]);
    setTabActiva(rolActual === 'vendedor' ? 'dashboard' : 'teletransferencia');
  };

  const handleTransmitirPedido = (
    clienteId: string,
    drogueriaId: string,
    items: { producto: Producto; cantidad: number; descuento: number }[],
    observaciones: string
  ) => {
    const nuevoPedidoId = `ped-cab-${Date.now()}`;
    const fechaActual = new Date().toISOString();
    const numeroPedido = `PED-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    let totalSol = 0;
    const nuevosDetalles: PedidoDetalle[] = items.map((it, idx) => {
      const subtotal = Number((it.cantidad * it.producto.precio_lista * (1 - it.descuento / 100)).toFixed(2));
      totalSol += subtotal;

      return {
        id: `det-${nuevoPedidoId}-${idx + 1}`,
        pedido_id: nuevoPedidoId,
        producto_id: it.producto.id,
        cantidad_solicitada: it.cantidad,
        cantidad_confirmada: it.cantidad,
        precio_unitario: it.producto.precio_lista,
        descuento_porcentaje: it.descuento,
        subtotal_solicitado: subtotal,
        subtotal_confirmado: subtotal,
        motivo_ajuste: 'sin_quiebre',
        created_at: fechaActual,
      };
    });

    const nuevaCabecera: PedidoCabecera = {
      id: nuevoPedidoId,
      numero_pedido: numeroPedido,
      cliente_id: clienteId,
      vendedor_id: usuarioActual?.id || MOCK_USUARIOS[0].id,
      drogueria_id: drogueriaId,
      fecha_pedido: fechaActual,
      equipo_origen: equipoActual === 'AMBOS' ? 'A' : equipoActual,
      estado: 'enviado_teletransferencia',
      observaciones: observaciones || 'Pedido tomado en campo.',
      total_solicitado: totalSol,
      total_confirmado: totalSol,
      fill_rate: 100.0,
      created_at: fechaActual,
      updated_at: fechaActual,
    };

    setPedidosCabecera((prev) => [nuevaCabecera, ...prev]);
    setPedidosDetalle((prev) => [...nuevosDetalles, ...prev]);
    setTabActiva(rolActual === 'vendedor' ? 'dashboard' : 'teletransferencia');
  };

  const handleActualizarInventarioDrogueria = (
    drogueriaId: string,
    registros: { sku: string; stock: number; precioDrogueria?: number; codigoArticuloDrogueria?: string }[]
  ) => {
    setProductos((prev) =>
      prev.map((prod) => {
        const prodSku = (prod.sku || prod.codigo || '').toLowerCase();
        const reg = registros.find((r) => (r.sku || '').toLowerCase() === prodSku);
        if (reg) {
          return {
            ...prod,
            stock_disponible: reg.stock,
            precio_lista: reg.precioDrogueria ?? prod.precio_lista,
          };
        }
        return prod;
      })
    );
  };

  const handleProductoEscaneado = (producto: Producto, cantidad: number, descuento: number) => {
    setItemsExternosAñadidos((prev) => [...prev, { producto, cantidad, descuento }]);
  };

  const handleItemsDictados = (items: { producto: Producto; cantidad: number; descuento: number }[]) => {
    setItemsExternosAñadidos((prev) => [...prev, ...items]);
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      esClaro ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-100'
    }`}>
      
      {/* Header con Nova Branding, Sesión Autenticada y Navegación Segregada */}
      <Header
        rolActual={rolActual}
        equipoActual={equipoActual}
        isSupabaseConectado={isSupabaseConectado}
        onAbrirConfigSupabase={() => setModalSupabaseAbierto(true)}
        tabActiva={tabActiva}
        onCambiarTab={setTabActiva}
        usuarioActual={usuarioActual}
        onAbrirAuthModal={() => setModalAuthAbierto(true)}
        onAbrirCreditos={() => setModalCreditosAbierto(true)}
        onCerrarSesion={handleCerrarSesion}
      />

      {/* Contenido Principal según Pestaña Activa y Rol - Espacio inferior amplio en móvil (pb-28) para no solaparse con el Bottom Nav */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 lg:pb-8">
        
        {/* Pestaña: Dashboard de Control del Vendedor (Requerimiento #5) */}
        {tabActiva === 'dashboard' && (
          <RepDashboardTab
            pedidos={pedidosCabecera}
            detalles={pedidosDetalle}
            clientes={clientes}
            droguerias={droguerias}
            productos={productos}
            vendedorId={rolActual === 'vendedor' ? usuarioActual?.id : undefined}
          />
        )}

        {/* Pestaña: Toma de Pedido en Movilidad */}
        {tabActiva === 'nuevo_pedido' && (
          <OrderTakingTab
            clientes={clientes}
            droguerias={droguerias}
            productos={productos}
            rolActual={rolActual}
            equipoActual={equipoActual}
            onAbrirEscaner={() => setModalEscanerAbierto(true)}
            onAbrirDictadoVoz={() => setModalDictadoAbierto(true)}
            onTransmitirPedido={handleTransmitirPedido}
            onIrASugeridos={() => setTabActiva('sugerido')}
            itemsExternos={itemsExternosAñadidos}
            onConsumirItemsExternos={() => setItemsExternosAñadidos([])}
          />
        )}

        {/* Pestaña: Motor de Sugerido Global */}
        {tabActiva === 'sugerido' && (
          <SuggestedOrderTab
            clientes={clientes}
            productos={productos}
            historicoPrevio={historicoPrevio}
            pedidosCabecera={pedidosCabecera}
            pedidosDetalle={pedidosDetalle}
            onGenerarPedidoDesdeSugerido={handleGenerarPedidoDesdeSugerido}
          />
        )}

        {/* Pestaña: Mis Pedidos en Campo */}
        {tabActiva === 'mis_pedidos' && (
          <MyOrdersTab
            pedidos={pedidosCabecera}
            detalles={pedidosDetalle}
            clientes={clientes}
            droguerias={droguerias}
            productos={productos}
          />
        )}

        {/* Pestaña: Cola de Teletransferencia & Fill-Rate */}
        {tabActiva === 'teletransferencia' && (
          <TeletransferQueueTab
            pedidosCabecera={pedidosCabecera}
            pedidosDetalle={pedidosDetalle}
            clientes={clientes}
            droguerias={droguerias}
            productos={productos}
            onActualizarDetalle={handleActualizarDetalle}
            onCambiarEstadoPedido={handleCambiarEstadoPedido}
          />
        )}

        {/* Pestaña: Droguerías & Layouts CSV Dinámicos */}
        {tabActiva === 'droguerias_csv' && (
          <DrugstoreCsvTab
            droguerias={droguerias}
            pedidosCabecera={pedidosCabecera}
            pedidosDetalle={pedidosDetalle}
            clientes={clientes}
            productos={productos}
          />
        )}

        {/* Pestaña: Carga Masiva de Inventario & Precios por Droguería */}
        {tabActiva === 'carga_inventario' && (
          <DrugstoreInventoryUploadTab
            droguerias={droguerias}
            productos={productos}
            onActualizarInventarioDrogueria={handleActualizarInventarioDrogueria}
          />
        )}

        {/* Pestaña: Vademécum & Medicamentos */}
        {tabActiva === 'vademecum' && (
          <InventoryCatalogTab
            productos={productos}
            onActualizarStock={handleActualizarStock}
            onCrearProducto={handleCrearProducto}
            onEditarProducto={handleEditarProducto}
            onEliminarProducto={handleEliminarProducto}
          />
        )}

        {/* Pestaña: Gestión de Usuarios y Accesos (Solo Admin) */}
        {tabActiva === 'usuarios' && (
          <AdminUsersTab
            usuarios={usuarios}
            onCrearUsuario={handleCrearUsuario}
            onActualizarUsuario={handleActualizarUsuario}
            onSimularUsuario={handleUsuarioAutenticado}
            usuarioActual={usuarioActual}
          />
        )}

        {/* Pestaña: Carga Masiva de Dimensiones e Histórico */}
        {tabActiva === 'carga_datos' && (
          <DataImportStudioTab
            clientes={clientes}
            productos={productos}
            droguerias={droguerias}
            historicoPrevio={historicoPrevio}
            onImportarClientes={handleImportarClientes}
            onEditarCliente={handleEditarCliente}
            onEliminarCliente={handleEliminarCliente}
            onCrearCliente={handleCrearCliente}
            onImportarProductos={handleImportarProductos}
            onImportarDroguerias={handleImportarDroguerias}
            onEditarDrogueria={handleEditarDrogueria}
            onEliminarDrogueria={handleEliminarDrogueria}
            onCrearDrogueria={handleCrearDrogueria}
            onEditarProducto={handleEditarProducto}
            onEliminarProducto={handleEliminarProducto}
            onCrearProducto={handleCrearProducto}
            onImportarHistorico={handleImportarHistorico}
          />
        )}

        {/* Pestaña: Script SQL Supabase */}
        {tabActiva === 'sql_script' && (
          <SqlStudioTab sqlContent={sqlSchemaRaw} />
        )}

        {/* Pestaña: Guía de Uso & Manual Operativo (Requerimiento #4) */}
        {tabActiva === 'guia_uso' && (
          <UserGuideTab />
        )}

      </main>

      {/* Footer discreto con créditos públicos */}
      <footer className={`border-t py-4 text-xs transition-colors ${
        esClaro ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-950 border-slate-850 text-slate-400'
      }`}>
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-slate-800 dark:text-slate-100">NOVA</span>
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold border border-teal-500/20">
              v2.0.0
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>Sistema Comercial & Teletransferencias Farmacéuticas</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span>Desarrollo & Admin: <strong className="text-slate-700 dark:text-slate-200 font-semibold">Hernando Sanoja</strong></span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>Product Owner: <strong className="text-slate-700 dark:text-slate-200 font-semibold">Dubrasli Fajardo</strong></span>
            <button
              onClick={() => setModalCreditosAbierto(true)}
              className="text-teal-600 dark:text-teal-400 hover:underline font-bold ml-1"
            >
              Créditos
            </button>
          </div>
        </div>
      </footer>

      {/* Modales de Movilidad, Configuración & Créditos */}
      <AboutModal
        abierto={modalCreditosAbierto}
        onCerrar={() => setModalCreditosAbierto(false)}
      />
      <BarcodeScannerModal
        abierto={modalEscanerAbierto}
        onCerrar={() => setModalEscanerAbierto(false)}
        productos={productos}
        onProductoEscaneado={handleProductoEscaneado}
      />

      <VoiceDictationModal
        abierto={modalDictadoAbierto}
        onCerrar={() => setModalDictadoAbierto(false)}
        productos={productos}
        onAgregarItemsAlPedido={handleItemsDictados}
      />

      <AuthModal
        abierto={modalAuthAbierto}
        onCerrar={() => setModalAuthAbierto(false)}
        usuarioActual={usuarioActual}
        onUsuarioAutenticado={handleUsuarioAutenticado}
        onCerrarSesion={handleCerrarSesion}
      />

      <SupabaseConfigModal
        abierto={modalSupabaseAbierto}
        onCerrar={() => setModalSupabaseAbierto(false)}
        onConexionActualizada={() => {
          const config = getStoredSupabaseConfig();
          setIsSupabaseConectado(config.isConnected);
        }}
      />

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
