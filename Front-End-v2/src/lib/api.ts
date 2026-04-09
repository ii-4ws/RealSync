import { supabase } from './supabaseClient';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? '';

export const buildApiUrl = (path: string) => `${API_BASE_URL}${path}`;

export const buildWsUrl = (path: string) => {
  if (WS_BASE_URL) {
    return `${WS_BASE_URL}${path}`;
  }

  if (API_BASE_URL) {
    const apiUrl = new URL(API_BASE_URL, window.location.origin);
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${apiUrl.origin}${path}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
};

/**
 * Retrieve the current Supabase access token, or null if not authenticated.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch wrapper. Automatically attaches the Supabase JWT
 * as a Bearer token to every request to the RealSync backend.
 *
 * Falls back to a normal fetch when no session exists (prototype mode).
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  const url = buildApiUrl(path);

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...init, headers });
}
