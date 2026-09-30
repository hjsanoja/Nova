import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Dictado con el reconocimiento de voz del navegador (Chrome y Edge en Android y PC; Safari en iPhone con Siri
 * activado). Donde no existe, la pantalla ofrece escribir la frase: el intérprete es el mismo.
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

export function useDictado() {
  const disponible = !!Reconocedor();
  const [escuchando, setEscuchando] = useState(false);
  const [texto, setTexto] = useState('');
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<ReconocedorVoz | null>(null);

  const detener = useCallback(() => {
    rec.current?.stop();
  }, []);

  const iniciar = useCallback(() => {
    const C = Reconocedor();
    if (!C) return setError('Este navegador no permite dictar. Escribe el pedido en el cuadro.');
    setError('');
    setParcial('');
    const r = new C();
    r.lang = 'es-VE';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finales = '';
      let provisional = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finales += res[0].transcript;
        else provisional += res[0].transcript;
      }
      if (finales) setTexto((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${finales.trim()}`);
      setParcial(provisional);
    };
    r.onerror = (e) => setError(MENSAJES[e.error] ?? `No se pudo dictar (${e.error}).`);
    r.onend = () => { setEscuchando(false); setParcial(''); };
    rec.current = r;
    try {
      r.start();
      setEscuchando(true);
    } catch {
      setError('No se pudo iniciar el micrófono.');
    }
  }, []);

  useEffect(() => () => rec.current?.stop(), []);

  return { disponible, escuchando, texto, setTexto, parcial, error, iniciar, detener };
}
