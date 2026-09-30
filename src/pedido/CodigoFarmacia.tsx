import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Boton, estiloInput } from '../components/ui/kit';

/**
 * Falta el código de la farmacia en la droguería elegida: se pide una sola vez y queda guardado para los próximos pedidos.
 * Sin él la droguería no reconoce al cliente, por eso el pedido no se puede enviar.
 */
export function CodigoFarmacia({ farmacia, drogueria, onGuardar }: { farmacia: string; drogueria: string; onGuardar: (codigo: string) => Promise<void> }) {
  const [codigo, setCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await onGuardar(codigo);
      setCodigo('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <p className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Falta el código de {farmacia} en {drogueria}
      </p>
      <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">Es su número de cliente en esa droguería. Escríbelo una sola vez: queda guardado para los próximos pedidos.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder={`Código en ${drogueria}`} aria-label={`Código de ${farmacia} en ${drogueria}`} className={`${estiloInput} flex-1`} />
        <Boton type="submit" variante="primario" disabled={guardando || !codigo.trim()}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
      </form>
      {error && <p role="alert" className="mt-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
}
