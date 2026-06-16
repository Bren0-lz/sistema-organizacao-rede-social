import { memo } from 'react';

/**
 * Ícones SVG monocromáticos (currentColor) usados na interface — substituem
 * emojis, que variam de desenho por sistema operacional e não aceitam cor.
 * Mesmo traço/grid (24×24) de StageIcon e NetworkIcon. Por padrão ocupam 1em,
 * então herdam o tamanho do texto onde antes ficava o emoji.
 */
export type IconName =
  | 'video' // claquete
  | 'carousel' // pilha de fotos
  | 'scissors' // editado
  | 'check'
  | 'calendar'
  | 'none' // sem data (quadro vazio)
  | 'hourglass' // carregando
  | 'trash'
  | 'settings'
  | 'upload'
  | 'download'
  | 'sparkles' // novo conteúdo
  | 'restore'
  | 'warning';

const PATHS: Record<IconName, { d: string; evenOdd?: boolean }> = {
  video: {
    d: 'M3 9V7.2a2 2 0 0 1 1.5-1.94l13-3.2a2 2 0 0 1 2.45 1.47l.43 1.75L3 9Zm.05 1.5L21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5ZM6.7 4.43 5.1 8.2l2.9-.5 1.6-3.77-2.9.5Zm5 -1.04L10.1 7.15l2.9-.5 1.6-3.76-2.9.5Zm5-1.03-1.6 3.76 2.9-.5 1.6-3.76-2.9.5Z',
  },
  carousel: {
    d: 'M8 4h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h11v-9H8Zm2.5 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 14l2.5-3 1.8 2.2L15.5 10l2.5 4H9ZM4 8a1 1 0 0 1 1 1v9h9a1 1 0 1 1 0 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z',
  },
  scissors: {
    d: 'M9.5 7.5a3 3 0 1 0-1.7 2.7l2.3 1.8-2.3 1.8a3 3 0 1 0 .9 1.2l9-7a1 1 0 0 0-.6-1.8l-5.2.4-2.1-1.6A3 3 0 0 0 9.5 7.5Zm-3 1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6.5-4.8 4 3.1a1 1 0 0 0 1.2 0l.4-.3-4.9-3.8-.7.5v.5Z',
  },
  check: {
    d: 'M9.55 17.6 4.4 12.45a1 1 0 0 1 1.4-1.42l3.75 3.74 8.25-8.25a1 1 0 1 1 1.4 1.42l-9.65 9.66a1 1 0 0 1-1.4 0Z',
  },
  calendar: {
    d: 'M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1ZM5 9v10h14V9H5Zm2 3h4v4H7v-4Z',
  },
  none: {
    d: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H6Z',
    evenOdd: true,
  },
  hourglass: {
    d: 'M6 2h12a1 1 0 1 1 0 2h-1v2.2a5 5 0 0 1-1.9 3.93L12.8 12l2.3 1.87A5 5 0 0 1 17 17.8V20h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-2.2a5 5 0 0 1 1.9-3.93L11.2 12 8.9 10.13A5 5 0 0 1 7 6.2V4H6a1 1 0 0 1 0-2Zm3 2v2.2a3 3 0 0 0 1.14 2.36L12 9.96l1.86-1.4A3 3 0 0 0 15 6.2V4H9Z',
  },
  trash: {
    d: 'M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1.06l-.86 12.07A2 2 0 0 1 16.09 21H7.9a2 2 0 0 1-2-1.93L5.06 7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4Zm-.9 4a1 1 0 0 1 1 .96l.3 7a1 1 0 1 1-2 .08l-.3-7A1 1 0 0 1 9.1 9Zm5.8 0a1 1 0 0 1 .96 1.04l-.3 7a1 1 0 1 1-2-.08l.3-7A1 1 0 0 1 14.9 9Z',
  },
  settings: {
    d: 'M10.3 2.3a1 1 0 0 0-.96.73l-.36 1.27c-.53.22-1.03.52-1.5.87l-1.25-.4a1 1 0 0 0-1.18.46l-1.7 2.94a1 1 0 0 0 .22 1.25l1 .86a7.7 7.7 0 0 0 0 1.74l-1 .86a1 1 0 0 0-.22 1.25l1.7 2.94a1 1 0 0 0 1.18.46l1.25-.4c.47.35.97.65 1.5.87l.36 1.27a1 1 0 0 0 .96.73h3.4a1 1 0 0 0 .96-.73l.36-1.27c.53-.22 1.03-.52 1.5-.87l1.25.4a1 1 0 0 0 1.18-.46l1.7-2.94a1 1 0 0 0-.22-1.25l-1-.86a7.7 7.7 0 0 0 0-1.74l1-.86a1 1 0 0 0 .22-1.25l-1.7-2.94a1 1 0 0 0-1.18-.46l-1.25.4a7.6 7.6 0 0 0-1.5-.87l-.36-1.27a1 1 0 0 0-.96-.73h-3.4ZM12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z',
    evenOdd: true,
  },
  upload: {
    d: 'M12 3a1 1 0 0 1 .7.3l4 4a1 1 0 1 1-1.4 1.4L13 6.4V15a1 1 0 1 1-2 0V6.4L8.7 8.7a1 1 0 0 1-1.4-1.4l4-4A1 1 0 0 1 12 3ZM5 14a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3a1 1 0 1 1 2 0v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-3a1 1 0 0 1 1-1Z',
  },
  download: {
    d: 'M12 3a1 1 0 0 1 1 1v8.6l2.3-2.3a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.4l2.3 2.3V4a1 1 0 0 1 1-1ZM5 14a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3a1 1 0 1 1 2 0v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-3a1 1 0 0 1 1-1Z',
  },
  sparkles: {
    d: 'M12 2.5l1.6 4.3 4.3 1.6-4.3 1.6L12 14.3l-1.6-4.3L6.1 8.4l4.3-1.6L12 2.5Zm6.5 9.3.78 2.12 2.12.78-2.12.78-.78 2.12-.78-2.12-2.12-.78 2.12-.78.78-2.12ZM5.5 13l.66 1.84L8 15.5l-1.84.66L5.5 18l-.66-1.84L3 15.5l1.84-.66L5.5 13Z',
  },
  restore: {
    d: 'M12 5c1.86 0 3.55.73 4.8 1.92L18 5.65a.5.5 0 0 1 .85.35V10a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.35-.85l1.36-1.36A5 5 0 1 0 17 13a1 1 0 0 1 1.98.3A7 7 0 1 1 12 5Z',
  },
  warning: {
    d: 'M12 3a1 1 0 0 1 .87.5l8.5 14.7A1 1 0 0 1 20.5 20H3.5a1 1 0 0 1-.87-1.5l8.5-14.7A1 1 0 0 1 12 3Zm0 5a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm0 8.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z',
  },
};

export const Icon = memo(function Icon({
  name,
  size,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const { d, evenOdd } = PATHS[name];
  return (
    <svg
      className={className}
      width={size ?? '1em'}
      height={size ?? '1em'}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ verticalAlign: '-0.125em', flex: 'none' }}
    >
      <path d={d} fillRule={evenOdd ? 'evenodd' : undefined} clipRule={evenOdd ? 'evenodd' : undefined} />
    </svg>
  );
});
