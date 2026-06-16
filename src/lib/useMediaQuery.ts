import { useEffect, useState } from 'react';

/**
 * Assina uma media query e retorna se ela casa no momento. Reage a mudanças de
 * tamanho/orientação. Útil para alternar comportamento (ex.: drawer lateral no
 * desktop vs. bottom-sheet no mobile) que o CSS sozinho não resolve.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
