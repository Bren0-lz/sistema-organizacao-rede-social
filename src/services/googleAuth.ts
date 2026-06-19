// Autenticacao via Google Identity Services (GIS) usando o token client no navegador.
// Mantemos tokens separados para Drive/Agenda e YouTube, permitindo publicar com
// uma conta Google diferente da conta usada para armazenar os arquivos no Drive.

const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

const YOUTUBE_SCOPE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
].join(' ');

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Client ID OAuth dedicado ao YouTube, carregado do config.json no Drive (ver useStore).
// Vazio = cai no CLIENT_ID padrão. Permite publicar com uma conta/projeto OAuth diferente.
let youtubeClientId: string | undefined;

export function setYoutubeClientId(id?: string): void {
  youtubeClientId = id?.trim() || undefined;
}

// v5: removeu escopos do YouTube do login principal.
const TOKEN_KEY = 'org-social:token:v5';
const YOUTUBE_TOKEN_KEY = 'org-social:youtube-token:v1';

// Limite para o usuário concluir o login na janela do Google. Se o callback do
// GIS não disparar nesse tempo (popup bloqueado, aba descartada pelo iOS, etc.),
// rejeitamos com mensagem clara em vez de deixar a Promise pendente para sempre.
const TOKEN_REQUEST_TIMEOUT_MS = 90_000;

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string; scope?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope?: string;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              error?: string;
            }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let gisLoaded: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (!gisLoaded) {
    gisLoaded = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar o Google Identity Services'));
      document.head.appendChild(script);
    });
  }
  return gisLoaded;
}

/** O script do GIS já está carregado e a API de token disponível? */
function isGisReady(): boolean {
  return !!window.google?.accounts?.oauth2;
}

/**
 * Dispara o carregamento do GIS o quanto antes (ao abrir o app), sem bloquear.
 * Assim, quando o usuário tocar em "Entrar", o popup do OAuth pode abrir de forma
 * SÍNCRONA dentro do gesto — o Safari do iPhone bloqueia popups abertos após um
 * await (o script baixando consome o gesto de toque).
 */
export function preloadAuth(): void {
  void loadGis().catch(() => {
    // melhor-esforço: se falhar aqui, o fluxo de login tenta carregar de novo
  });
}

function readStoredToken(key: string): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const token = JSON.parse(raw) as StoredToken;
    // margem de 60s para nao usar token prestes a expirar no meio de um upload
    if (token.expiresAt - 60_000 < Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

async function getScopedAccessToken({
  storageKey,
  scope,
  clientId,
  interactive,
  prompt,
  missingSessionMessage,
}: {
  storageKey: string;
  scope: string;
  clientId: string | undefined;
  interactive: boolean;
  prompt: string;
  missingSessionMessage: string;
}): Promise<string> {
  const stored = readStoredToken(storageKey);
  if (stored) return stored.accessToken;
  if (!interactive) throw new Error(missingSessionMessage);

  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID nao configurado. Copie .env.example para .env.local e preencha (veja SETUP.md).',
    );
  }

  // Se o GIS ainda não carregou (preload falhou/atrasou), carregamos agora — mas
  // isso reintroduz o await que o Safari do iPhone penaliza. Por isso preferimos
  // o preload em `preloadAuth()` para que este ramo quase nunca rode.
  if (!isGisReady()) await loadGis();

  // A partir daqui não há await antes de `requestAccessToken`: o popup abre dentro
  // do gesto do usuário (requisito do Safari no iPhone).
  return requestAccessToken({ storageKey, scope, clientId, prompt });
}

/**
 * Cria o token client e dispara o popup do OAuth, encapsulado numa Promise com
 * timeout. O callback do GIS resolve/rejeita; se nada acontecer em
 * {@link TOKEN_REQUEST_TIMEOUT_MS}, rejeitamos para não travar a UI.
 * Deve ser chamada de forma síncrona dentro do gesto do usuário.
 */
function requestAccessToken({
  storageKey,
  scope,
  clientId,
  prompt,
}: {
  storageKey: string;
  scope: string;
  clientId: string;
  prompt: string;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error('Nao foi possivel concluir o login. Toque em "Entrar com Google" para tentar de novo.'),
      );
    }, TOKEN_REQUEST_TIMEOUT_MS);

    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Login cancelado'));
          return;
        }
        const token: StoredToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(token));
        } catch {
          // armazenamento indisponivel (ex.: modo privado): segue so em memoria
        }
        resolve(token.accessToken);
      },
    });
    client.requestAccessToken({ prompt });
  });
}

export function hasValidToken(): boolean {
  return readStoredToken(TOKEN_KEY) !== null;
}

export function hasValidYoutubeToken(): boolean {
  return readStoredToken(YOUTUBE_TOKEN_KEY) !== null;
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function clearYoutubeToken(): void {
  sessionStorage.removeItem(YOUTUBE_TOKEN_KEY);
}

export function getAccessToken(interactive = false): Promise<string> {
  return getScopedAccessToken({
    storageKey: TOKEN_KEY,
    scope: DRIVE_SCOPE,
    clientId: CLIENT_ID,
    interactive,
    prompt: '',
    missingSessionMessage: 'Sessao expirada - faca login novamente.',
  });
}

export function getYoutubeAccessToken(
  interactive = false,
  options: { forceAccountSelection?: boolean } = {},
): Promise<string> {
  return getScopedAccessToken({
    storageKey: YOUTUBE_TOKEN_KEY,
    scope: YOUTUBE_SCOPE,
    clientId: youtubeClientId ?? CLIENT_ID,
    interactive,
    prompt: options.forceAccountSelection ? 'select_account consent' : 'select_account',
    missingSessionMessage: 'Conecte uma conta do YouTube nas configuracoes antes de publicar.',
  });
}

export function signIn(): Promise<string> {
  return getAccessToken(true);
}

export function signInYoutube(options?: { forceAccountSelection?: boolean }): Promise<string> {
  return getYoutubeAccessToken(true, options);
}

export function signOut(): void {
  clearToken();
  clearYoutubeToken();
}

export function signOutYoutube(): void {
  clearYoutubeToken();
}
