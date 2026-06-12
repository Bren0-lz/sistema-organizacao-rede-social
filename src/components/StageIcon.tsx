import type { Stage } from '../types';

/** Ícones SVG por estágio (currentColor) — emojis variam por SO e não aceitam cor. */
export function StageIcon({ stage }: { stage: Stage | 'check' | 'flag' }) {
  switch (stage) {
    case 'raw': // claquete
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 9V7.2a2 2 0 0 1 1.5-1.94l13-3.2a2 2 0 0 1 2.45 1.47l.43 1.75L3 9Zm.05 1.5L21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5ZM6.7 4.43 5.1 8.2l2.9-.5 1.6-3.77-2.9.5Zm5 -1.04L10.1 7.15l2.9-.5 1.6-3.76-2.9.5Zm5-1.03-1.6 3.76 2.9-.5 1.6-3.76-2.9.5Z" />
        </svg>
      );
    case 'edited': // tesoura
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M9.5 7.5a3 3 0 1 0-1.7 2.7l2.3 1.8-2.3 1.8a3 3 0 1 0 .9 1.2l9-7a1 1 0 0 0-.6-1.8l-5.2.4-2.1-1.6A3 3 0 0 0 9.5 7.5Zm-3 1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6.5-4.8 4 3.1a1 1 0 0 0 1.2 0l.4-.3-4.9-3.8-.7.5v.5Z" />
        </svg>
      );
    case 'ready': // caixa
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2.2 3 6.6v10.8L12 21.8l9-4.4V6.6L12 2.2Zm0 2.2 6.3 3.1L12 10.6 5.7 7.5 12 4.4Zm-7 5 6 2.95v6.5l-6-2.95V9.4Zm14 0v6.5l-6 2.95v-6.5l6-2.95Z" />
        </svg>
      );
    case 'scheduled': // calendário
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1ZM5 9v10h14V9H5Zm2 3h4v4H7v-4Z" />
        </svg>
      );
    case 'posted': // foguete
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M14.5 2.4c2.6.4 4.7 2.5 5.1 5.1.5 3.2-1 6.4-3.8 8.7l.2 2.6a1 1 0 0 1-.5.95l-2.9 1.7a1 1 0 0 1-1.48-.7l-.4-2.1-2.3-2.3-2.1-.4a1 1 0 0 1-.7-1.48l1.7-2.9a1 1 0 0 1 .95-.5l2.6.2c2.3-2.8 5.5-4.3 8.7-3.8Zm-.8 4.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM5.6 17.2c-1 1-1.3 3.6-1.3 3.6s2.6-.3 3.6-1.3a1.65 1.65 0 0 0-2.3-2.3Z" />
        </svg>
      );
    case 'flag': // bandeira de chegada
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5 2a1 1 0 0 1 1 1v.6l2.6-.5a5 5 0 0 1 3.1.4 3 3 0 0 0 2.4.1L19 2.4a1 1 0 0 1 1.3.95v9a1 1 0 0 1-.7.95l-4.6 1.5a5 5 0 0 1-3.4-.1 3 3 0 0 0-1.9-.13L6 15v6a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Z" />
        </svg>
      );
    case 'check':
    default: // check simples
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M9.55 17.6 4.4 12.45a1 1 0 0 1 1.4-1.42l3.75 3.74 8.25-8.25a1 1 0 1 1 1.4 1.42l-9.65 9.66a1 1 0 0 1-1.4 0Z" />
        </svg>
      );
  }
}
