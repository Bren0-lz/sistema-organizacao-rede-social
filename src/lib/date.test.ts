import { describe, it, expect } from 'vitest';
import { dayKey, dayKeyFromIso, monthMatrix, startOfToday } from './date';

describe('dayKey', () => {
  it('formata como YYYY-MM-DD no fuso local com zero à esquerda', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('preenche mês e dia de dois dígitos sem zero à esquerda', () => {
    expect(dayKey(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('dayKeyFromIso', () => {
  it('extrai a chave do dia de um ISO local válido', () => {
    expect(dayKeyFromIso('2026-06-15T09:30:00')).toBe('2026-06-15');
  });

  it('retorna string vazia para ISO inválido', () => {
    expect(dayKeyFromIso('não é data')).toBe('');
    expect(dayKeyFromIso('')).toBe('');
  });
});

describe('startOfToday', () => {
  it('zera horas, minutos, segundos e milissegundos', () => {
    const d = new Date(startOfToday());
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it('corresponde ao dia de hoje e não está no futuro', () => {
    expect(startOfToday()).toBeLessThanOrEqual(Date.now());
    expect(dayKey(new Date(startOfToday()))).toBe(dayKey(new Date()));
  });
});

describe('monthMatrix', () => {
  it('toda semana tem 7 dias e começa no domingo', () => {
    const weeks = monthMatrix(new Date(2026, 4, 1)); // maio/2026
    expect(weeks[0][0].getDay()).toBe(0); // domingo
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
  });

  it('dias são consecutivos (cada um é um dia depois do anterior)', () => {
    const flat = monthMatrix(new Date(2026, 4, 1)).flat();
    for (let i = 1; i < flat.length; i++) {
      const diff = flat[i].getTime() - flat[i - 1].getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('contém o primeiro e o último dia do mês', () => {
    const weeks = monthMatrix(new Date(2026, 1, 1)); // fevereiro/2026 (28 dias)
    const keys = weeks.flat().map(dayKey);
    expect(keys).toContain('2026-02-01');
    expect(keys).toContain('2026-02-28');
  });

  it('usa 5 semanas quando o mês cabe nelas (fevereiro/2026)', () => {
    // 1º/fev/2026 é domingo e tem 28 dias → encaixa sem precisar da 6ª linha.
    expect(monthMatrix(new Date(2026, 1, 1))).toHaveLength(5);
  });

  it('usa 6 semanas quando o mês transborda (maio/2026)', () => {
    // 1º/mai/2026 é sexta e tem 31 dias → precisa da 6ª linha.
    expect(monthMatrix(new Date(2026, 4, 1))).toHaveLength(6);
  });
});
