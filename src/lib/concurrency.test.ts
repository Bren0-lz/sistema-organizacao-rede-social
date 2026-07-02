import { describe, it, expect } from 'vitest';
import { createLimiter } from './concurrency';

describe('createLimiter', () => {
  it('nunca roda mais que "max" tarefas simultâneas', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;

    const task = () =>
      run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return 'ok';
      });

    const results = await Promise.all(Array.from({ length: 6 }, task));
    expect(peak).toBe(2);
    expect(results).toEqual(Array(6).fill('ok'));
  });

  it('resolve cada tarefa com o seu próprio valor', async () => {
    const run = createLimiter(3);
    const results = await Promise.all([1, 2, 3, 4].map((n) => run(async () => n * 10)));
    expect(results).toEqual([10, 20, 30, 40]);
  });

  it('o erro de uma tarefa rejeita só ela e libera a vaga para a próxima', async () => {
    const run = createLimiter(1);
    const ok1 = run(async () => 'a');
    const falha = run(async () => {
      throw new Error('boom');
    });
    const ok2 = run(async () => 'b');

    await expect(ok1).resolves.toBe('a');
    await expect(falha).rejects.toThrow('boom');
    await expect(ok2).resolves.toBe('b');
  });
});
