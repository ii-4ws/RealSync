import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketContext';
import { authFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

/** #17: Shared AudioContext — reused across alerts to prevent resource exhaustion. */
let _sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new AudioContext();
  }
  return _sharedAudioCtx;
}

/** Play a short alert tone using Web Audio API (no file needed). */
function playAlertSound(severity: 'high' | 'critical') {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Critical: two-tone urgent beep; High: single tone
    osc.frequency.value = severity === 'critical' ? 880 : 660;
    gain.gain.value = 0.18;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.35);

    if (severity === 'critical') {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1100;
      gain2.gain.value = 0.18;
      osc2.start(ctx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.55);
    }
  } catch {
    // AudioContext may not be available in all environments
  }
}

export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AppNotification {
  id: string;
  sessionId: string;
  severity: NotificationSeverity;
  category: string;
  title: string;
  message: string;
  recommendation?: string | null;
  ts: string;
  read: boolean;
}

type DesktopPermission = NotificationPermission | 'unsupported';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (alertIds: string[]) => void;
  markAllRead: () => void;
  requestDesktopPermission: () => Promise<void>;
  desktopPermission: DesktopPermission;
  desktopEnabled: boolean;
  setDesktopEnabled: (enabled: boolean) => void;
  desktopSeverityFilter: NotificationSeverity[];
  setDesktopSeverityFilter: (filter: NotificationSeverity[]) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STORAGE_KEY_DESKTOP_ENABLED = 'realsync-desktop-notifications-enabled';
const STORAGE_KEY_SEVERITY_FILTER = 'realsync-desktop-severity-filter';
const DEFAULT_SEVERITY_FILTER: NotificationSeverity[] = ['high', 'critical'];

function getStoredDesktopEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_DESKTOP_ENABLED) !== 'false';
  } catch {
    return true;
  }
}

const VALID_SEVERITIES: NotificationSeverity[] = ['low', 'medium', 'high', 'critical'];

function getStoredSeverityFilter(): NotificationSeverity[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SEVERITY_FILTER);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((s: unknown) => VALID_SEVERITIES.includes(s as NotificationSeverity))) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_SEVERITY_FILTER;
}

export function NotificationProvider({ children }: { children: import('react').ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const [desktopPermission, setDesktopPermission] = useState<DesktopPermission>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [desktopEnabled, setDesktopEnabledState] = useState(getStoredDesktopEnabled);
  const [desktopSeverityFilter, setDesktopSeverityFilterState] = useState<NotificationSeverity[]>(getStoredSeverityFilter);

  const desktopEnabledRef = useRef(desktopEnabled);
  const desktopSeverityFilterRef = useRef(desktopSeverityFilter);
  const desktopPermRef = useRef(desktopPermission);

  const { subscribe } = useWebSocket();
  const initialFetchDone = useRef(false);

  const setDesktopEnabled = useCallback((enabled: boolean) => {
    setDesktopEnabledState(enabled);
    try { localStorage.setItem(STORAGE_KEY_DESKTOP_ENABLED, String(enabled)); } catch {}
  }, []);

  const setDesktopSeverityFilter = useCallback((filter: NotificationSeverity[]) => {
    setDesktopSeverityFilterState(filter);
    try { localStorage.setItem(STORAGE_KEY_SEVERITY_FILTER, JSON.stringify(filter)); } catch {}
  }, []);

  useEffect(() => { desktopEnabledRef.current = desktopEnabled; }, [desktopEnabled]);
  useEffect(() => { desktopSeverityFilterRef.current = desktopSeverityFilter; }, [desktopSeverityFilter]);
  useEffect(() => { desktopPermRef.current = desktopPermission; }, [desktopPermission]);

  // Fetch initial notification history
  useEffect(() => {
    if (initialFetchDone.current) return;

    const fetchNotifications = async () => {
      initialFetchDone.current = true; // Claim slot first to prevent concurrent fetches
      try {
        const res = await authFetch('/api/notifications?limit=50');
        if (!res.ok) {
          initialFetchDone.current = false; // Allow retry on failure
          return;
        }
        const data = await res.json();
        if (data.notifications) {
          setNotifications(data.notifications.map((n: Record<string, unknown>) => ({
            id: n.id as string,
            sessionId: n.sessionId as string,
            severity: n.severity as NotificationSeverity,
            category: (n.category as string) || 'unknown',
            title: n.title as string,
            message: n.message as string,
            recommendation: (n.recommendation as string) || null,
            ts: n.ts as string,
            read: n.read as boolean,
          })));
        }
        // unreadCount is now derived from notifications state via useMemo
      } catch {
        // Silently fail — notifications are non-critical
      }
    };

    fetchNotifications();
  }, []);

  // Reset notifications on sign-out and re-fetch on sign-in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setNotifications([]);
        initialFetchDone.current = false;
      }
      if (event === 'SIGNED_IN' && !initialFetchDone.current) {
        initialFetchDone.current = true;
        authFetch('/api/notifications?limit=50').then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (data.notifications) {
            setNotifications(data.notifications.map((n: Record<string, unknown>) => ({
              id: n.id as string,
              sessionId: n.sessionId as string,
              severity: n.severity as NotificationSeverity,
              category: (n.category as string) || 'unknown',
              title: n.title as string,
              message: n.message as string,
              recommendation: (n.recommendation as string) || null,
              ts: n.ts as string,
              read: n.read as boolean,
            })));
          }
        }).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);


  // Subscribe to WS alert messages
  useEffect(() => {
    return subscribe((message) => {
      if (message?.type !== 'alert' || typeof message?.title !== 'string') return;

      const newNotification: AppNotification = {
        id: (message.alertId as string) || crypto.randomUUID(),
        sessionId: (message.sessionId as string) || '',
        severity: message.severity as NotificationSeverity,
        category: (message.category as string) || 'unknown',
        title: message.title as string,
        message: String(message.message || ''),
        recommendation: (message.recommendation as string) || null,
        ts: typeof message.ts === 'string' ? message.ts : new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [newNotification, ...prev].slice(0, 200));

      // Sonner toast for in-app feedback
      const toastFn = newNotification.severity === 'critical' || newNotification.severity === 'high'
        ? toast.error
        : toast.warning;
      toastFn(`${newNotification.title}: ${newNotification.message}`);

      // Play alert sound for high/critical severity
      if (newNotification.severity === 'critical' || newNotification.severity === 'high') {
        playAlertSound(newNotification.severity);
      }

      // Desktop (OS) notification — always for high/critical, only when hidden for low/medium
      const isUrgent = newNotification.severity === 'critical' || newNotification.severity === 'high';
      if (
        desktopEnabledRef.current &&
        desktopPermRef.current === 'granted' &&
        desktopSeverityFilterRef.current.includes(newNotification.severity) &&
        (isUrgent || document.hidden)
      ) {
        try {
          const stripControl = (s: string) => s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
          const safeTitle = stripControl(`RealSync: ${newNotification.title}`).slice(0, 80);
          const safeBody = stripControl(newNotification.recommendation
              ? `Alert: ${newNotification.message}. Recommendation: ${newNotification.recommendation}`
              : newNotification.message).slice(0, 300);
          new Notification(safeTitle, {
            body: safeBody,
            icon: '/realsync-eye-only.png',
            tag: newNotification.id.slice(0, 100),
            requireInteraction: newNotification.severity === 'critical',
          });
        } catch {
          // Desktop notifications can fail in some environments
        }
      }
    });
  }, [subscribe]);

  const requestDesktopPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setDesktopPermission(result);
    } catch {
      // Permission request can fail
    }
  }, []);

  const markAsRead = useCallback((alertIds: string[]) => {
    if (alertIds.length === 0) return;

    // Optimistic update — unreadCount derives automatically via useMemo
    setNotifications((prev) =>
      prev.map((n) => (alertIds.includes(n.id) && !n.read ? { ...n, read: true } : n))
    );

    // Persist to backend
    authFetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertIds }),
    }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    // Optimistic update — unreadCount derives automatically via useMemo
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    // Persist to backend
    authFetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllRead,
        requestDesktopPermission,
        desktopPermission,
        desktopEnabled,
        setDesktopEnabled,
        desktopSeverityFilter,
        setDesktopSeverityFilter,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
