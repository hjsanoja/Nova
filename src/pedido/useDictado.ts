import { useCallback, useEffect, useRef, useState } from 'react';
import { sinRepeticiones, unirTrozos } from './transcripcion';

/*
 * Dictado con el reconocimiento de voz del navegador (Chrome y Edge en Android y PC; Safari en iPhone con Siri
 * activado). Donde no existe, la pantalla ofrece escribir la frase: el intérprete es el mismo.
 *
 * Se escucha SOLO mientras se mantiene presionado el micrófono ("presionar para hablar"): al soltarlo se detiene,
 * llegan las últimas palabras y se pasa a la vista previa con `alTerminar`. Así siempre se sabe cuándo está escuchando.
 */
interface AlternativaVoz { transcript: string }
interface ResultadoVoz { isFinal: boolean; length: number; [k: number]: AlternativaVoz }
interface EventoVoz { resultIndex: number; results: ArrayLike<ResultadoVoz> }
interface ReconocedorVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type ConstructorVoz = new () => ReconocedorVoz;

const Reconocedor = (): ConstructorVoz | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: ConstructorVoz; webkitSpeechRecognition?: ConstructorVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const MENSAJES: Record<string, string> = {
  'not-allowed': 'Permite el uso del micrófono para dictar (candado junto a la dirección de la página).',
  'service-not-allowed': 'El navegador no permite el dictado aquí. Escribe el pedido en el cuadro.',
  'no-speech': 'No se escuchó nada. Mantén presionado el micrófono y habla cerca del teléfono.',
  network: 'El dictado necesita internet en este navegador. Escribe el pedido o vuelve a intentar con conexión.',
  'audio-capture': 'No se encontró un micrófono.',
};

/** Un toque más corto que esto no es dictar: se explica que hay que mantenerlo presionado. */
export const TOQUE_CORTO_MS = 400;
/** Tope de seguridad: si algo impide soltar (p. ej. la pantalla se bloquea), se deja de escuchar. */
const MAXIMO_MS = 90_000;
/** Tras la última palabra se considera que la persona sigue hablando este tiempo (para la onda). */
const HABLANDO_MS = 700;

export interface OpcionesDictado {
  alTerminar?: (texto: string) => void;
  /** Elige entre las versiones que da el reconocimiento (la que más se parece al catálogo). */
  elegir?: (alternativas: string[]) => string;
}

export function useDictado(opciones: OpcionesDictado = {}) {
  const disponible = !!Reconocedor();
  const [escuchando, setEscuchando] = useState(false);
  const [hablando, setHablando] = useState(false);
  const [texto, setTextoEstado] = useState('');
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const rec = useRef<ReconocedorVoz | null>(null);
  const textoRef = useRef('');
  /** Texto antes de esta pulsación (cada reinicio del reconocimiento continúa desde aquí). */
  const base = useRef('');
  const presionado = useRef(false);
  const desde = useRef(0);
  const oyo = useRef(false);
  const tope = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const silencio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const op = useRef(opciones);
  op.current = opciones;

  const setTexto = useCallback((t: string) => {
    textoRef.current = t;
    setTextoEstado(t);
  }, []);

  const arrancar = useCallback(() => {
    const C = Reconocedor();
    if (!C) return setError('Este navegador no permite dictar. Escribe el pedido en el cuadro.');
    const r = new C();
    r.lang = 'es-VE';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 5;
    const inicio = textoRef.current;
    r.onresult = (e) => {
      // Se rehace la frase con TODOS los resultados de esta sesión (no solo los nuevos): así los resultados acumulados o
      // repetidos de Android no duplican palabras. De cada frase final se toma la versión que mejor encaja con el catálogo.
      const finales: string[] = [];
      let provisional = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const alternativas = Array.from({ length: res.length }, (_, k) => res[k]?.transcript ?? '').filter(Boolean);
          finales.push(op.current.elegir && alternativas.length > 1 ? op.current.elegir(alternativas) : alternativas[0] ?? '');
        } else provisional = res[0].transcript;
      }
      const t = sinRepeticiones(unirTrozos(finales, inicio));
      if (t !== textoRef.current) setTexto(t);
      setParcial(provisional && !t.toLowerCase().endsWith(provisional.trim().toLowerCase()) ? provisional : '');
      oyo.current = true;
      setHablando(true);
      clearTimeout(silencio.current);
      silencio.current = setTimeout(() => setHablando(false), HABLANDO_MS);
    };
    r.onspeechstart = () => setHablando(true);
    r.onerror = (e) => {
      if (e.error === 'aborted' || (e.error === 'no-speech' && presionado.current)) return;
      setError(MENSAJES[e.error] ?? `No se pudo dictar (${e.error}).`);
    };
    r.onend = () => {
      // Algunos navegadores cortan solos tras una pausa: si el dedo sigue en el botón, se sigue escuchando.
      if (presionado.current && rec.current === r) {
        try {
          arrancar();
          return;
        } catch {
          /* se termina abajo */
        }
      }
      if (rec.current !== r) return;
      rec.current = null;
      clearTimeout(tope.current);
      clearTimeout(silencio.current);
      setEscuchando(false);
      setHablando(false);
      setParcial('');
      if (!presionado.current && oyo.current && textoRef.current.trim() && textoRef.current.trim() !== base.current.trim()) op.current.alTerminar?.(textoRef.current);
    };
    rec.current = r;
    r.start();
  }, [setTexto]);

  /** Se presionó el micrófono: empieza a escuchar. */
  const presionar = useCallback(() => {
    if (presionado.current) return;
    setError('');
    setAviso('');
    setParcial('');
    presionado.current = true;
    desde.current = Date.now();
    oyo.current = false;
    base.current = textoRef.current;
    try {
      arrancar();
      setEscuchando(true);
      tope.current = setTimeout(() => soltarRef.current(), MAXIMO_MS);
    } catch {
      presionado.current = false;
      setError('No se pudo iniciar el micrófono.');
    }
  }, [arrancar]);

  /** Se soltó el micrófono: deja de escuchar (las últimas palabras llegan y se pasa a la vista previa). */
  const soltar = useCallback(() => {
    if (!presionado.current) return;
    presionado.current = false;
    clearTimeout(tope.current);
    const r = rec.current;
    if (!r) return setEscuchando(false);
    if (Date.now() - desde.current < TOQUE_CORTO_MS && !oyo.current) {
      r.abort();
      setAviso('Mantén presionado el micrófono mientras hablas y suéltalo al terminar.');
      return;
    }
    r.stop();
  }, []);
  const soltarRef = useRef(soltar);
  soltarRef.current = soltar;

  /** Cancela sin pasar a la vista previa (al cerrar la hoja). */
  const detener = useCallback(() => {
    presionado.current = false;
    clearTimeout(tope.current);
    const r = rec.current;
    rec.current = null;
    r?.abort();
    setEscuchando(false);
    setHablando(false);
    setParcial('');
  }, []);

  useEffect(() => () => { presionado.current = false; clearTimeout(tope.current); clearTimeout(silencio.current); rec.current?.abort(); }, []);

  return { disponible, escuchando, hablando, texto, setTexto, parcial, error, aviso, presionar, soltar, detener };
}
