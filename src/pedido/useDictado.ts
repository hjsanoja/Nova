import { useCallback, useEffect, useRef, useState } from 'react';
import { sinRepeticiones, unirTrozos } from './transcripcion';

/*
 * Dictado con el reconocimiento de voz del navegador (Chrome y Edge en Android y PC; Safari en iPhone con Siri
 * activado). Donde no existe, la pantalla ofrece escribir la frase: el intérprete es el mismo.
 * Se detiene solo tras una pausa (SILENCIO_MS) y avisa con `alTerminar` para pasar a la vista previa.
 */
interface ResultadoVoz { isFinal: boolean; 0: { transcript: string } }
interface EventoVoz { resultIndex: number; results: ArrayLike<ResultadoVoz> }
interface ReconocedorVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
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
  'no-speech': 'No se escuchó nada. Toca el micrófono y habla cerca del teléfono.',
  network: 'El dictado necesita internet en este navegador. Escribe el pedido o vuelve a intentar con conexión.',
  'audio-capture': 'No se encontró un micrófono.',
};

/** Pausa que se toma como "terminé de hablar". */
const SILENCIO_MS = 2200;

export function useDictado(alTerminar?: (texto: string) => void) {
  const disponible = !!Reconocedor();
  const [escuchando, setEscuchando] = useState(false);
  const [texto, setTextoEstado] = useState('');
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<ReconocedorVoz | null>(null);
  const silencio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textoRef = useRef('');
  const oyo = useRef(false);
  const terminar = useRef(alTerminar);
  terminar.current = alTerminar;

  const setTexto = useCallback((t: string) => {
    textoRef.current = t;
    setTextoEstado(t);
  }, []);

  const detener = useCallback(() => {
    clearTimeout(silencio.current);
    rec.current?.stop();
  }, []);

  const iniciar = useCallback(() => {
    const C = Reconocedor();
    if (!C) return setError('Este navegador no permite dictar. Escribe el pedido en el cuadro.');
    setError('');
    setParcial('');
    oyo.current = false;
    const base = textoRef.current;
    const r = new C();
    r.lang = 'es-VE';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      // Se rehace la frase con TODOS los resultados de esta sesión (no solo los nuevos): así los resultados acumulados o
      // repetidos de Android no duplican palabras.
      const finales: string[] = [];
      let provisional = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finales.push(res[0].transcript);
        else provisional = res[0].transcript;
      }
      const t = sinRepeticiones(unirTrozos(finales, base));
      if (t !== textoRef.current) setTexto(t);
      setParcial(provisional && !t.toLowerCase().endsWith(provisional.trim().toLowerCase()) ? provisional : '');
      oyo.current = true;
      clearTimeout(silencio.current);
      silencio.current = setTimeout(() => r.stop(), SILENCIO_MS);
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(MENSAJES[e.error] ?? `No se pudo dictar (${e.error}).`);
    };
    r.onend = () => {
      clearTimeout(silencio.current);
      setEscuchando(false);
      setParcial('');
      if (oyo.current && textoRef.current.trim()) terminar.current?.(textoRef.current);
    };
    rec.current = r;
    try {
      r.start();
      setEscuchando(true);
      // Si no se dice nada en 8 s, se apaga el micrófono.
      silencio.current = setTimeout(() => r.stop(), 8000);
    } catch {
      setError('No se pudo iniciar el micrófono.');
    }
  }, [setTexto]);

  useEffect(() => () => { clearTimeout(silencio.current); rec.current?.stop(); }, []);

  return { disponible, escuchando, texto, setTexto, parcial, error, iniciar, detener };
}
