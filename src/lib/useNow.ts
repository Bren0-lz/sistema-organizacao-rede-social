import { useEffect, useState } from 'react';

/**
 * "Agora" reativo: re-renderiza a cada `intervalMs` para que comparações de
 * data (ex.: gravação vencida) atualizem sozinhas, sem depender de outra
 * interação. Ler este valor no render é puro (lê estado), ao contrário de
 * chamar `Date.now()` diretamente no corpo do componente.
 */
export function useNow(intervalMs = 60_000): number {
  // passa a referência `Date.now` (não `Date.now()`) para o inicializador:
  // calcula uma vez no mount sem chamar função impura no corpo do render.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
