// Helpers de data compartilhados entre a agenda e o calendário.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do dia de hoje (00:00 local) em epoch ms. */
export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Chave YYYY-MM-DD no fuso local, usada para agrupar eventos por dia. */
export function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Mesmo que `dayKey`, mas a partir de um ISO (retorna '' se inválido). */
export function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayKey(d);
}

/**
 * Matriz de semanas (cada uma com 7 datas) cobrindo o mês de `cursor`,
 * começando no domingo e completando as bordas com dias dos meses vizinhos.
 */
export function monthMatrix(cursor: Date): Date[][] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // recua até o domingo
  const weeks: Date[][] = [];
  const day = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(day));
      day.setTime(day.getTime() + DAY_MS);
    }
    weeks.push(week);
    // para se a última semana já passou do mês e não tem dias do mês atual
    if (week[6].getMonth() !== cursor.getMonth() && w >= 4) break;
  }
  return weeks;
}
