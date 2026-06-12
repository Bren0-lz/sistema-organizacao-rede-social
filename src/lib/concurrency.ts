import { useEffect, useRef, useState } from 'react';

/**
 * Limitador de concorrência estilo `p-limit`: garante que no máximo `max`
 * tarefas assíncronas rodem ao mesmo tempo. Usado para uploads em lote e
 * para o carregamento de capas (evita disparar dezenas de requests juntos).
 */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    queue.shift()!();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(start);
      next();
    });
  };
}

/**
 * Hook de visibilidade via IntersectionObserver. Retorna `true` assim que o
 * elemento referenciado entra na viewport (e permanece `true` depois disso),
 * para carregar capas só quando o card/linha aparece na tela.
 */
export function useInView<T extends Element>(rootMargin = '200px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
