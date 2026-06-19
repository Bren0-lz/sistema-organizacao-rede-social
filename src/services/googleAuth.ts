// Autenticacao OAuth 2.0 do Google via REDIRECIONAMENTO de página inteira
// (implicit flow, response_type=token). Não usa popup: o Safari do iPhone abre
// popups em abas em branco e o login travava. Aqui a própria página vai ao
// Google e volta com o token no fragmento (#access_token=...).
//
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

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

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
// Guarda o que estamos buscando enquanto a página está no Google (sobrevive ao
// redirecionamento porque sessionStorage é por aba e persiste na navegação).
const PENDING_KEY = 'org-social:pending-auth';

type AuthKind = 'drive' | 'youtube';

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface PendingAuth {
  kind: AuthKind;
  storageKey: string;
  state: string; // nonce anti-CSRF, conferido no retorno
}

export interface RedirectResult {
  kind: AuthKind;
}

// Fallback em memória para quando o sessionStorage não está disponível
// (ex.: modo privado do Safari): vale enquanto a página estiver carregada.
const memoryTokens: Record<string, StoredToken> = {};

function writeStoredToken(key: string, token: StoredToken): void {
  memoryTokens[key] = token;
  try {
    sessionStorage.setItem(key, JSON.stringify(token));
  } catch {
    // armazenamento indisponivel (modo privado): segue so em memoria
  }
}

function readStoredToken(key: string): StoredToken | null {
  let token: StoredToken | null = memoryTokens[key] ?? null;
  if (!token) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) token = JSON.parse(raw) as StoredToken;
    } catch {
      return null;
    }
  }
  if (!token) return null;
  // margem de 60s para nao usar token prestes a expirar no meio de um upload
  if (token.expiresAt - 60_000 < Date.now()) return null;
  return token;
}

function removeStoredToken(key: string): void {
  delete memoryTokens[key];
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** URI de retorno: precisa estar nos "Authorized redirect URIs" do client OAuth. */
function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

function randomState(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Inicia o login redirecionando a página inteira para o Google. Não retorna
 * (a navegação começa em seguida). O token volta no fragmento da URL e é
 * processado por {@link consumeRedirectResult} no próximo carregamento.
 */
function beginLogin(kind: AuthKind, options: { forceAccountSelection?: boolean } = {}): void {
  const clientId = kind === 'drive' ? CLIENT_ID : youtubeClientId ?? CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID nao configurado. Copie .env.example para .env.local e preencha (veja SETUP.md).',
    );
  }
  const scope = kind === 'drive' ? DRIVE_SCOPE : YOUTUBE_SCOPE;
  const storageKey = kind === 'drive' ? TOKEN_KEY : YOUTUBE_TOKEN_KEY;
  const state = randomState();

  const pending: PendingAuth = { kind, storageKey, state };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // sem sessionStorage não dá para validar o state no retorno, mas seguimos:
    // o login ainda funciona; apenas pulamos a checagem de CSRF.
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope,
    include_granted_scopes: 'true',
    state,
  });
  // YouTube sempre deixa escolher a conta (pode ser diferente da do Drive).
  if (kind === 'youtube') {
    params.set('prompt', options.forceAccountSelection ? 'select_account consent' : 'select_account');
  }

  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`);
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Login cancelado: você não autorizou o acesso.';
    case 'admin_policy_enforced':
      return 'O administrador da conta Google bloqueou este acesso.';
    default:
      return `Falha no login do Google (${code}). Tente novamente.`;
  }
}

function clearUrlFragment(): void {
  // remove o #access_token=... da barra de endereço sem recarregar
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

/**
 * Processa o retorno do Google logo no carregamento do app. Lê o token do
 * fragmento da URL, valida o `state`, persiste o token e limpa a URL.
 * Retorna `{ kind }` quando um login foi concluído, `{ error }` em caso de
 * falha, ou `null` quando não há retorno de auth para tratar.
 */
export function consumeRedirectResult(): RedirectResult | { error: string } | null {
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!rawHash) return null;

  const params = new URLSearchParams(rawHash);
  const accessToken = params.get('access_token');
  const errorCode = params.get('error');
  const state = params.get('state');
  if (!accessToken && !errorCode) return null; // hash não relacionado a auth

  let pending: PendingAuth | null = null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (raw) pending = JSON.parse(raw) as PendingAuth;
  } catch {
    pending = null;
  }
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }

  clearUrlFragment();

  if (errorCode) return { error: friendlyAuthError(errorCode) };
  if (!accessToken) return null;
  if (!pending) return null; // token sem pedido pendente: ignora
  // Só valida o state se conseguimos guardá-lo (sessionStorage disponível).
  if (pending.state && state !== pending.state) {
    return { error: 'Falha de segurança na autenticação (state inválido). Tente de novo.' };
  }

  const expiresIn = Number(params.get('expires_in') ?? '3600');
  writeStoredToken(pending.storageKey, {
    accessToken,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  });

  return { kind: pending.kind };
}

export function hasValidToken(): boolean {
  return readStoredToken(TOKEN_KEY) !== null;
}

export function hasValidYoutubeToken(): boolean {
  return readStoredToken(YOUTUBE_TOKEN_KEY) !== null;
}

export function clearToken(): void {
  removeStoredToken(TOKEN_KEY);
}

export function clearYoutubeToken(): void {
  removeStoredToken(YOUTUBE_TOKEN_KEY);
}

/** Token do Drive/Agenda já obtido. Lança se não houver sessão (sem redirecionar). */
export async function getAccessToken(): Promise<string> {
  const token = readStoredToken(TOKEN_KEY);
  if (!token) throw new Error('Sessao expirada - faca login novamente.');
  return token.accessToken;
}

/** Token do YouTube já obtido. Lança se a conta do YouTube não estiver conectada. */
export async function getYoutubeAccessToken(): Promise<string> {
  const token = readStoredToken(YOUTUBE_TOKEN_KEY);
  if (!token) throw new Error('Conecte uma conta do YouTube nas configuracoes antes de publicar.');
  return token.accessToken;
}

/** Inicia o login do Drive (redireciona a página para o Google). */
export function signIn(): void {
  beginLogin('drive');
}

/** Inicia a conexão do YouTube (redireciona a página para o Google). */
export function signInYoutube(options?: { forceAccountSelection?: boolean }): void {
  beginLogin('youtube', options ?? {});
}

export function signOut(): void {
  clearToken();
  clearYoutubeToken();
}

export function signOutYoutube(): void {
  clearYoutubeToken();
}
