import { memo, Fragment } from 'react';
import { NETWORKS, NETWORK_LABELS, type ContentItem } from '../types';
import { NetworkIcon } from './NetworkIcon';

/** "15/06 · 12:10" — formato curto p/ a pílula da lista (sem o "às"). */
function shortWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

type PillKind = 'scheduled' | 'posted' | 'warning' | 'pending';

/**
 * Progresso da linha na lista: uma pílula de data por rede atribuída. O estágio
 * geral fica na coluna "Estágio"; aqui o foco é a data/hora de cada rede, com o
 * estado sinalizado pela cor (programado = âmbar, publicado = verde).
 */
export const RowTrail = memo(function RowTrail({ item }: { item: ContentItem }) {
  const assigned = NETWORKS.filter((n) => item.networks[n].assigned);

  if (assigned.length === 0) {
    return (
      <div className="row-trail">
        <span className="row-branch-empty">sem redes definidas</span>
      </div>
    );
  }

  return (
    <div className="row-trail">
      <div className="row-branches">
        {assigned.map((n) => {
          const ns = item.networks[n];
          let kind: PillKind;
          let text: string;
          let tip: string;

          if (ns.status === 'posted') {
            const when = shortWhen(ns.postedAt);
            kind = 'posted';
            text = when ?? 'publicado';
            tip = when ? `Publicado em ${when}` : 'Publicado';
          } else if (ns.status === 'scheduled') {
            const when = shortWhen(ns.scheduledAt);
            kind = when ? 'scheduled' : 'warning';
            text = when ?? 'definir data';
            tip = when ? `Programado para ${when}` : 'Programado — defina a data';
          } else {
            kind = 'pending';
            text = 'aguardando data';
            tip = 'Aguardando programação';
          }

          return (
            <Fragment key={n}>
              <span className="row-net-ico" title={NETWORK_LABELS[n]}>
                <NetworkIcon network={n} />
              </span>
              <span className="row-net-pill" data-kind={kind} title={`${NETWORK_LABELS[n]}: ${tip}`}>
                {text}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
});
