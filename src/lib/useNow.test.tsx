import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicia com o "agora" do mount', () => {
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(Date.parse('2026-06-23T12:00:00Z'));
  });

  it('atualiza a cada intervalo informado', () => {
    const start = Date.parse('2026-06-23T12:00:00Z');
    vi.setSystemTime(start);
    const { result } = renderHook(() => useNow(1000));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(start + 1000);
  });

  it('não atualiza antes de completar o intervalo', () => {
    const start = Date.parse('2026-06-23T12:00:00Z');
    vi.setSystemTime(start);
    const { result } = renderHook(() => useNow(60_000));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(start);
  });

  it('limpa o intervalo ao desmontar', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
