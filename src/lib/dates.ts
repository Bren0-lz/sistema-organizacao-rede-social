// Formatação de datas em pt-BR, centralizada para não duplicar as opções de
// toLocaleDateString/Time espalhadas pelas views.

/** "12/06" (sem ano) ou "12/06/25" (com ano). Retorna "—" se vazio/ inválido. */
export function formatDate(iso?: string, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: '2-digit' } : {}),
  });
}

/** "12/06 às 14:30". Retorna undefined se vazio/inválido. */
export function formatDateTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(iso)} às ${time}`;
}
