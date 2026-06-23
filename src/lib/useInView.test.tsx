import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useInView } from './concurrency';

// IntersectionObserver controlável: guardamos o callback para disparar a
// interseção manualmente e inspecionamos observe/disconnect.
let lastCallback: IntersectionObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class FakeIO {
  constructor(cb: IntersectionObserverCallback) {
    lastCallback = cb;
  }
  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
}

function Probe() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="alvo">
      {inView ? 'visível' : 'oculto'}
    </div>
  );
}

describe('useInView', () => {
  beforeEach(() => {
    lastCallback = null;
    observe.mockClear();
    disconnect.mockClear();
    vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('começa oculto e observa o elemento referenciado', () => {
    render(<Probe />);
    expect(screen.getByTestId('alvo')).toHaveTextContent('oculto');
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('fica visível quando o elemento entra na viewport e desconecta o observer', () => {
    render(<Probe />);
    act(() => {
      lastCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(screen.getByTestId('alvo')).toHaveTextContent('visível');
    expect(disconnect).toHaveBeenCalled();
  });

  it('permanece oculto enquanto não há interseção', () => {
    render(<Probe />);
    act(() => {
      lastCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(screen.getByTestId('alvo')).toHaveTextContent('oculto');
  });
});
