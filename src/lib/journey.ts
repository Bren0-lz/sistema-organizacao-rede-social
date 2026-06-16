import {
  itemStage,
  itemType,
  NETWORKS,
  NETWORK_LABELS,
  STAGE_ORDER,
  type ContentItem,
  type Network,
  type Stage,
} from '../types';

export type NodeState = 'done' | 'current' | 'pending';

export interface TrailStep {
  key: 'raw' | 'edited' | 'ready' | 'publish' | 'complete' | 'images';
  stage: Stage; // estágio "dono" da cor (publish→scheduled, complete→posted)
  state: NodeState;
  title: string; // "Vídeo bruto recebido"
  detail?: string; // "Enviado em 12/06 às 14:30"
  timestamp?: string; // ISO p/ <time dateTime>
  warning?: boolean; // estágio avançou mas falta o arquivo
}

export interface BranchStep {
  key: 'scheduled' | 'posted';
  state: NodeState;
  title: string;
  timestamp?: string;
  url?: string;
}

export interface TrailBranch {
  network: Network;
  label: string;
  state: NodeState;
  steps: [BranchStep, BranchStep];
  statusLine: string; // frase única p/ tooltip/aria
}

export interface Journey {
  stage: Stage;
  progress: number; // STAGE_ORDER[stage] — alimenta a mini-trilha
  steps: TrailStep[]; // tronco: raw, edited, ready, publish, complete
  branches: TrailBranch[]; // só redes assigned
  unassigned: boolean; // nenhuma rede atribuída → mostra dica
  ariaSummary: string;
}

export const STAGE_LABELS: Record<Stage, string> = {
  raw: 'Vídeo bruto',
  edited: 'Editado',
  ready: 'Pronto p/ publicar',
  scheduled: 'Programado',
  posted: 'Publicado',
};

export const STAGE_COLORS: Record<Stage, string> = {
  raw: 'var(--st-raw)',
  edited: 'var(--st-edited)',
  ready: 'var(--st-ready)',
  scheduled: 'var(--st-scheduled)',
  posted: 'var(--st-posted)',
};

/** "15/06 às 09:00" via toLocaleString('pt-BR'). */
export function formatWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

export function miniTrail(item: ContentItem): { stage: Stage; state: NodeState }[] {
  const current = STAGE_ORDER[itemStage(item)];
  // Carrossel pula o estágio "editado": 4 segmentos em vez de 5.
  const seq: Stage[] =
    itemType(item) === 'carousel'
      ? ['raw', 'ready', 'scheduled', 'posted']
      : ['raw', 'edited', 'ready', 'scheduled', 'posted'];
  return seq.map((stage) => {
    const o = STAGE_ORDER[stage];
    const state: NodeState = o < current ? 'done' : o === current ? 'current' : 'pending';
    return { stage, state };
  });
}

export function buildJourney(item: ContentItem): Journey {
  const stage = itemStage(item);
  const p = STAGE_ORDER[stage];
  const assigned = NETWORKS.filter((n) => item.networks[n].assigned);
  const unassigned = assigned.length === 0;

  // ----- nó raw -----
  const rawStep: TrailStep = (() => {
    if (p > 0) {
      if (item.rawVideoFileId) {
        const ts = item.rawUploadedAt ?? item.createdAt;
        return {
          key: 'raw',
          stage: 'raw',
          state: 'done',
          title: 'Vídeo bruto recebido',
          detail: 'Enviado em',
          timestamp: ts,
        };
      }
      return {
        key: 'raw',
        stage: 'raw',
        state: 'done',
        title: 'Vídeo bruto recebido',
        detail: 'sem arquivo do bruto',
        warning: true,
      };
    }
    // stage === 'raw'
    if (item.rawVideoFileId) {
      return {
        key: 'raw',
        stage: 'raw',
        state: 'current',
        title: 'Vídeo bruto recebido',
        detail: 'Enviado em',
        timestamp: item.rawUploadedAt ?? item.createdAt,
      };
    }
    return {
      key: 'raw',
      stage: 'raw',
      state: 'current',
      title: 'Aguardando vídeo bruto',
      detail: 'Arraste o arquivo na seção abaixo',
    };
  })();

  // ----- nó images (só carrossel) -----
  const imagesStep: TrailStep = (() => {
    const count = item.carouselFileIds?.length ?? 0;
    if (count > 0) {
      return {
        key: 'images',
        stage: 'raw',
        state: p > 0 ? 'done' : 'current',
        title: `${count} ${count === 1 ? 'imagem recebida' : 'imagens recebidas'}`,
      };
    }
    return {
      key: 'images',
      stage: 'raw',
      state: 'current',
      title: 'Aguardando imagens',
      detail: 'Adicione as imagens do carrossel na seção abaixo',
    };
  })();

  // ----- nó edited -----
  const editedStep: TrailStep = (() => {
    if (p > 1) {
      return {
        key: 'edited',
        stage: 'edited',
        state: 'done',
        title: 'Edição concluída',
        detail: item.editedUploadedAt ? 'Versão final anexada em' : 'Versão final anexada',
        timestamp: item.editedUploadedAt,
      };
    }
    if (stage === 'edited') {
      return {
        key: 'edited',
        stage: 'edited',
        state: 'current',
        title: 'Edição concluída',
        detail: item.editedUploadedAt ? 'Versão final anexada em' : 'Versão final anexada',
        timestamp: item.editedUploadedAt,
      };
    }
    return {
      key: 'edited',
      stage: 'edited',
      state: 'pending',
      title: 'Aguardando edição',
    };
  })();

  // ----- nó ready -----
  const readyStep: TrailStep = (() => {
    if (p > 2) {
      return { key: 'ready', stage: 'ready', state: 'done', title: 'Redes definidas' };
    }
    if (stage === 'ready') {
      return {
        key: 'ready',
        stage: 'ready',
        state: 'current',
        title: 'Pronto para publicar',
        detail: 'Escolha as redes e a data de cada uma',
      };
    }
    return { key: 'ready', stage: 'ready', state: 'pending', title: 'Escolher redes' };
  })();

  // ----- ramos por rede -----
  const branches: TrailBranch[] = assigned.map((network) => {
    const ns = item.networks[network];
    let scheduledStep: BranchStep;
    let postedStep: BranchStep;
    let branchState: NodeState;

    if (ns.status === 'posted') {
      branchState = 'done';
      scheduledStep = { key: 'scheduled', state: 'done', title: 'Programado' };
      const when = formatWhen(ns.postedAt);
      postedStep = {
        key: 'posted',
        state: 'current',
        title: when ? `Publicado em ${when}` : 'Publicado',
        timestamp: ns.postedAt,
        url: ns.postUrl,
      };
    } else if (ns.status === 'scheduled') {
      branchState = 'current';
      const when = formatWhen(ns.scheduledAt);
      scheduledStep = {
        key: 'scheduled',
        state: 'current',
        title: when ? `Programado para ${when}` : 'Programado — defina a data',
        timestamp: ns.scheduledAt,
      };
      postedStep = { key: 'posted', state: 'pending', title: 'Aguardando publicação' };
    } else {
      branchState = 'pending';
      scheduledStep = { key: 'scheduled', state: 'pending', title: 'Aguardando programação' };
      postedStep = { key: 'posted', state: 'pending', title: 'Aguardando publicação' };
    }

    const current = [scheduledStep, postedStep].find((s) => s.state === 'current');
    return {
      network,
      label: NETWORK_LABELS[network],
      state: branchState,
      steps: [scheduledStep, postedStep],
      statusLine: `${NETWORK_LABELS[network]}: ${(current ?? scheduledStep).title}`,
    };
  });

  // ----- nó publish (agregado das redes) -----
  const postedCount = assigned.filter((n) => item.networks[n].status === 'posted').length;
  const publishStep: TrailStep = (() => {
    let detail: string;
    if (unassigned) detail = 'Nenhuma rede selecionada ainda';
    else if (stage === 'posted') detail = `${postedCount} de ${assigned.length} redes publicadas`;
    else if (postedCount > 0) detail = `${postedCount} de ${assigned.length} redes publicadas`;
    else detail = `Programado em ${assigned.length} ${assigned.length === 1 ? 'rede' : 'redes'}`;

    return {
      key: 'publish',
      stage: 'scheduled',
      state: stage === 'posted' ? 'done' : stage === 'scheduled' ? 'current' : 'pending',
      title: 'Publicação nas redes',
      detail,
    };
  })();

  // ----- nó complete -----
  const lastPostedAt = assigned
    .map((n) => item.networks[n].postedAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
  const completeStep: TrailStep = {
    key: 'complete',
    stage: 'posted',
    state: stage === 'posted' ? 'current' : 'pending',
    title:
      stage === 'posted'
        ? 'Jornada concluída — publicado em todas as redes 🎉'
        : 'Jornada concluída',
    timestamp: stage === 'posted' ? lastPostedAt : undefined,
    detail: stage === 'posted' && lastPostedAt ? 'Última publicação em' : undefined,
  };

  const steps: TrailStep[] =
    itemType(item) === 'carousel'
      ? [imagesStep, readyStep, publishStep, completeStep]
      : [rawStep, editedStep, readyStep, publishStep, completeStep];

  return {
    stage,
    progress: p,
    steps,
    branches,
    unassigned,
    ariaSummary: buildAriaSummary(stage, p, branches),
  };
}

function buildAriaSummary(stage: Stage, p: number, branches: TrailBranch[]): string {
  const base = `Etapa ${p + 1} de 5: ${STAGE_LABELS[stage]}`;
  if (branches.length === 0) return base;
  const parts = branches.map((b) => {
    const word =
      b.state === 'done' ? 'publicado' : b.state === 'current' ? 'programado' : 'pendente';
    return `${word} no ${b.label}`;
  });
  return `${base} — ${parts.join(' e ')}`;
}
