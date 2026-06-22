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
<<<<<<< HEAD
// Guarda o que estamos buscando enquanto a página está no Google (sobrevive ao
// redirecionamento porque sessionStorage é por aba e persiste na navegação).
const PENDING_KEY = 'org-social:pending-auth';
=======
const OAUTH_STATE_KEY = 'org-social:oauth-state:v1';
>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0

type AuthKind = 'drive' | 'youtube';

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

<<<<<<< HEAD
interface PendingAuth {
  kind: AuthKind;
  storageKey: string;
  state: string; // nonce anti-CSRF, conferido no retorno
=======
interface OAuthRedirectResult {
  accessToken: string;
  expiresIn: number;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string; scope?: string }): void;
>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0
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

<<<<<<< HEAD
=======
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

>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0
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
<<<<<<< HEAD
    sessionStorage.removeItem(key);
=======
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const token = JSON.parse(raw) as StoredToken;
    // margem de 60s para nao usar token prestes a expirar no meio de um upload
    if (token.expiresAt - 60_000 < Date.now()) return null;
    return token;
>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0
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

<<<<<<< HEAD
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
=======
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
>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0
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
<<<<<<< HEAD
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
=======
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
>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0
}

/** Token do YouTube já obtido. Lança se a conta do YouTube não estiver conectada. */
export async function getYoutubeAccessToken(): Promise<string> {
  const token = readStoredToken(YOUTUBE_TOKEN_KEY);
  if (!token) throw new Error('Conecte uma conta do YouTube nas configuracoes antes de publicar.');
  return token.accessToken;
}

<<<<<<< HEAD
/** Inicia o login do Drive (redireciona a página para o Google). */
export function signIn(): void {
  beginLogin('drive');
}

/** Inicia a conexão do YouTube (redireciona a página para o Google). */
export function signInYoutube(options?: { forceAccountSelection?: boolean }): void {
  beginLogin('youtube', options ?? {});
=======
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
>>>>>>> d9ac2ac84673c241a6f93dbfa74b501166b38ce0
}

export function signOut(): void {
  clearToken();
  clearYoutubeToken();
}

export function signOutYoutube(): void {
  clearYoutubeToken();
}
