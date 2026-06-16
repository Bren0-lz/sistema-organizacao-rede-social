// Autenticação via Google Identity Services (GIS) — token client implícito no navegador.
// Escopo drive.file: o app só enxerga arquivos/pastas que ele mesmo criou ou que o
// usuário abriu pelo app — o mínimo necessário.

const SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
].join(' ');
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const TOKEN_KEY = 'org-social:token:v3';

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
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

function readStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as StoredToken;
    // margem de 60s para não usar token prestes a expirar no meio de um upload
    if (token.expiresAt - 60_000 < Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

export function hasValidToken(): boolean {
  return readStoredToken() !== null;
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Obtém um access token válido. Com o token client do GIS, a primeira chamada
 * abre o popup do Google; renovações na mesma sessão do navegador costumam
 * resolver sem nova interação (prompt: ''). Se `interactive` for false e não há
 * token guardado, rejeita para a UI mostrar a tela de login.
 */
export async function getAccessToken(interactive = false): Promise<string> {
  const stored = readStoredToken();
  if (stored) return stored.accessToken;
  if (!interactive) throw new Error('Sessão expirada — faça login novamente.');

  if (!CLIENT_ID) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID não configurado. Copie .env.example para .env.local e preencha (veja SETUP.md).',
    );
  }

  await loadGis();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Login cancelado'));
          return;
        }
        const token: StoredToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        resolve(token.accessToken);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function signIn(): Promise<string> {
  return getAccessToken(true);
}

export function signOut(): void {
  clearToken();
}
