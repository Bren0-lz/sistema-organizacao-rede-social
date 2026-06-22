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
const OAUTH_STATE_KEY = 'org-social:oauth-state:v1';

// Limite para o usuário concluir o login na janela do Google. Se o callback do
// GIS não disparar nesse tempo (popup bloqueado, aba descartada pelo iOS, etc.),
// rejeitamos com mensagem clara em vez de deixar a Promise pendente para sempre.
const TOKEN_REQUEST_TIMEOUT_MS = 90_000;

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface OAuthRedirectResult {
  accessToken: string;
  expiresIn: number;
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

function isIOS(): boolean {
  // iPadOS 13+ informa "Macintosh", mas mantém pontos de toque.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function createState(): string {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(36)).join('');
}

function saveToken(key: string, accessToken: string, expiresIn: number): void {
  const token: StoredToken = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  try {
    // `sessionStorage` é apagado ao fechar a aba. Mantemos apenas o token de
    // curta duração no navegador para que a próxima abertura possa renová-lo
    // silenciosamente com a sessão já existente do Google.
    localStorage.setItem(key, JSON.stringify(token));
  } catch {
    // armazenamento indisponível (ex.: modo privado): segue só em memória
  }
}

/**
 * O Safari do iPhone pode descartar a aba que abriu o popup do GIS e retornar
 * para uma página anterior. Para o login principal, usamos o retorno na mesma
 * aba: o Google volta para este endereço com o token no fragmento da URL.
 */
function startIOSRedirectSignIn(clientId: string): Promise<string> {
  const state = createState();
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
  } catch {
    return Promise.reject(new Error('O Safari bloqueou o armazenamento necessário para concluir o login.'));
  }

  const params = new URLSearchParams({
    client_id: clientId,
    // O cliente OAuth deste projeto cadastra a origem sem a barra final.
    // O Google compara o redirect_uri literalmente e rejeita `...app/` quando
    // apenas `...app` está autorizado.
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  return new Promise<string>(() => undefined);
}

/** Lê e remove o resultado do redirecionamento OAuth na inicialização do app. */
export function consumeIOSRedirectSignIn(): OAuthRedirectResult | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hash.get('access_token');
  const error = hash.get('error');
  const returnedState = hash.get('state');
  if (!accessToken && !error) return null;

  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  let expectedState: string | null = null;
  try {
    expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
  } catch {
    throw new Error('Não foi possível validar o retorno do login no Safari.');
  }
  if (!expectedState || returnedState !== expectedState) {
    throw new Error('O retorno do login não pôde ser validado. Tente novamente.');
  }
  if (error || !accessToken) throw new Error(error ?? 'Login cancelado');

  const expiresIn = Number(hash.get('expires_in') ?? '3600');
  return { accessToken, expiresIn: Number.isFinite(expiresIn) ? expiresIn : 3600 };
}

function readStoredToken(key: string): StoredToken | null {
  try {
    const raw = localStorage.getItem(key);
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
        saveToken(storageKey, response.access_token, response.expires_in ?? 3600);
        resolve(response.access_token);
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
  localStorage.removeItem(TOKEN_KEY);
}

export function clearYoutubeToken(): void {
  localStorage.removeItem(YOUTUBE_TOKEN_KEY);
}

/**
 * Restaura a sessão sem exibir o seletor de contas. Se o token salvo já venceu,
 * o Google emite outro enquanto a sessão Google do navegador continuar ativa.
 */
export async function restoreSession(): Promise<boolean> {
  if (hasValidToken()) return true;
  if (!CLIENT_ID) return false;

  try {
    await getScopedAccessToken({
      storageKey: TOKEN_KEY,
      scope: DRIVE_SCOPE,
      clientId: CLIENT_ID,
      interactive: true,
      prompt: '',
      missingSessionMessage: 'Sessao expirada - faca login novamente.',
    });
    return true;
  } catch {
    // Sem uma sessão Google válida, o login continua sendo uma ação explícita.
    return false;
  }
}

export function getAccessToken(interactive = false): Promise<string> {
  return getScopedAccessToken({
    storageKey: TOKEN_KEY,
    scope: DRIVE_SCOPE,
    clientId: CLIENT_ID,
    interactive,
    // Sempre deixa o usuário decidir qual conta será usada no Drive/Agenda,
    // em vez de reutilizar silenciosamente a última sessão do navegador.
    prompt: 'select_account',
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
  if (isIOS() && CLIENT_ID) return startIOSRedirectSignIn(CLIENT_ID);
  return getAccessToken(true);
}

export function restoreIOSRedirectSignIn(): boolean {
  const result = consumeIOSRedirectSignIn();
  if (!result) return false;
  saveToken(TOKEN_KEY, result.accessToken, result.expiresIn);
  return true;
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
