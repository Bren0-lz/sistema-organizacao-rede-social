import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearToken,
  clearYoutubeToken,
  consumeIOSRedirectSignIn,
  hasValidToken,
  hasValidYoutubeToken,
  restoreIOSRedirectSignIn,
  signOut,
} from './googleAuth';

const TOKEN_KEY = 'org-social:token:v6';
const YOUTUBE_TOKEN_KEY = 'org-social:youtube-token:v1';
const OAUTH_STATE_KEY = 'org-social:oauth-state:v1';

/** Grava um token no formato que readStoredToken espera. */
function storeToken(key: string, msFromNow: number) {
  localStorage.setItem(key, JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + msFromNow }));
}

function setHash(hash: string) {
  window.history.replaceState(null, '', window.location.pathname + hash);
}

describe('googleAuth — tokens armazenados', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('hasValidToken é true para token longe de expirar e false sem token', () => {
    expect(hasValidToken()).toBe(false);
    storeToken(TOKEN_KEY, 10 * 60_000);
    expect(hasValidToken()).toBe(true);
  });

  it('trata token quase expirando (margem de 60s) como inválido', () => {
    storeToken(TOKEN_KEY, 30_000); // menos que a margem de 60s
    expect(hasValidToken()).toBe(false);
  });

  it('hasValidYoutubeToken usa a chave do YouTube', () => {
    expect(hasValidYoutubeToken()).toBe(false);
    storeToken(YOUTUBE_TOKEN_KEY, 10 * 60_000);
    expect(hasValidYoutubeToken()).toBe(true);
  });

  it('clearToken/clearYoutubeToken removem só a respectiva chave', () => {
    storeToken(TOKEN_KEY, 10 * 60_000);
    storeToken(YOUTUBE_TOKEN_KEY, 10 * 60_000);
    clearToken();
    expect(hasValidToken()).toBe(false);
    expect(hasValidYoutubeToken()).toBe(true);
    clearYoutubeToken();
    expect(hasValidYoutubeToken()).toBe(false);
  });

  it('signOut limpa as duas contas', () => {
    storeToken(TOKEN_KEY, 10 * 60_000);
    storeToken(YOUTUBE_TOKEN_KEY, 10 * 60_000);
    signOut();
    expect(hasValidToken()).toBe(false);
    expect(hasValidYoutubeToken()).toBe(false);
  });

  it('ignora JSON corrompido no armazenamento', () => {
    localStorage.setItem(TOKEN_KEY, 'não é json');
    expect(hasValidToken()).toBe(false);
  });
});

describe('googleAuth — retorno OAuth no iOS', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    setHash('');
  });

  it('retorna null quando não há token nem erro no fragmento', () => {
    setHash('');
    expect(consumeIOSRedirectSignIn()).toBeNull();
  });

  it('valida o state e devolve o token do fragmento', () => {
    sessionStorage.setItem(OAUTH_STATE_KEY, 'estado-123');
    setHash('#access_token=abc&state=estado-123&expires_in=1200');
    expect(consumeIOSRedirectSignIn()).toEqual({ accessToken: 'abc', expiresIn: 1200 });
  });

  it('lança quando o state não confere (proteção CSRF)', () => {
    sessionStorage.setItem(OAUTH_STATE_KEY, 'estado-123');
    setHash('#access_token=abc&state=outro&expires_in=1200');
    expect(() => consumeIOSRedirectSignIn()).toThrow(/não pôde ser validado/);
  });

  it('restoreIOSRedirectSignIn salva o token e passa a valer como sessão', () => {
    sessionStorage.setItem(OAUTH_STATE_KEY, 'estado-123');
    setHash('#access_token=abc&state=estado-123&expires_in=3600');
    expect(restoreIOSRedirectSignIn()).toBe(true);
    expect(hasValidToken()).toBe(true);
  });

  it('restoreIOSRedirectSignIn é false quando não há retorno', () => {
    setHash('');
    expect(restoreIOSRedirectSignIn()).toBe(false);
  });
});
