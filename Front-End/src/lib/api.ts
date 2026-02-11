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
