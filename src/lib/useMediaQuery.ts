import { useCallback, useSyncExternalStore } from 'react';

/**
 * Assina uma media query e retorna se ela casa no momento. Reage a mudanças de
 * tamanho/orientação. Útil para alternar comportamento (ex.: drawer lateral no
 * desktop vs. bottom-sheet no mobile) que o CSS sozinho não resolve.
 *
 * Usa `useSyncExternalStore` (API canônica para assinar uma fonte externa), que
 * lê o snapshot atual de forma consistente sem precisar espelhar o valor em
 * estado dentro de um efeito.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
