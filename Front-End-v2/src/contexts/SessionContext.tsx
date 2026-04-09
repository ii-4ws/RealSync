import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { authFetch } from '../lib/api';

type MeetingType = 'official' | 'business' | 'friends';

interface ActiveSession {
  sessionId: string;
  title: string;
  meetingType: MeetingType;
}

export interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SessionContextType {
  supabaseSession: Session | null;
  loadingAuth: boolean;
  profile: UserProfile | null;
  loadingProfile: boolean;
  needsOnboarding: boolean;
  activeSession: ActiveSession | null;
  setActiveSession: (s: ActiveSession | null) => void;
  handleSignOut: () => Promise<void>;
  handleStartSession: (sessionId: string, title: string, meetingType: MeetingType) => void;
  handleEndSession: () => Promise<void>;
  setProfile: (p: UserProfile | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const activeSessionRef = useRef(activeSession);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  // Track current user ID to avoid re-loading profile for same user on tab switch
  const currentUserIdRef = useRef<string | null>(null);
  useEffect(() => { currentUserIdRef.current = supabaseSession?.user?.id ?? null; }, [supabaseSession?.user?.id]);

  const prototypeModeEnabled =
    import.meta.env.VITE_PROTOTYPE_MODE === '1' ||
    !import.meta.env.VITE_SUPABASE_URL ||
    !import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Auth initialization + listener
  useEffect(() => {
    if (prototypeModeEnabled) {
      setLoadingAuth(false);
      return;
    }

    let isMounted = true;
    let initialSessionHandled = false;

    const initializeSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (isMounted) {
          setSupabaseSession(data.session ?? null);
          if (data.session?.user?.id) {
            setLoadingProfile(true);
          }
        }
      } finally {
        if (isMounted) setLoadingAuth(false);
      }
    };

    initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      setSupabaseSession(session ?? null);

      if (event === 'INITIAL_SESSION') {
        if (initialSessionHandled) return;
        initialSessionHandled = true;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        const newId = session?.user?.id;
        if (newId && newId !== currentUserIdRef.current) {
          setLoadingProfile(true);
        }
      }

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoadingProfile(false);
        setActiveSession(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [prototypeModeEnabled]);

  // Profile fetch whenever user ID changes
  useEffect(() => {
    if (prototypeModeEnabled) return;

    const userId = supabaseSession?.user?.id;
    if (!userId) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    let isMounted = true;

    const fetchProfile = async () => {
      setLoadingProfile(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, job_title, created_at, updated_at')
          .eq('id', userId)
          .single();

        if (error) {
          if (isMounted) setProfile(null);
          return;
        }

        if (isMounted) setProfile(data);
      } catch {
        if (isMounted) setProfile(null);
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    fetchProfile();

    return () => { isMounted = false; };
  }, [supabaseSession?.user?.id, prototypeModeEnabled]);

  // Safety: auto-clear loadingProfile after 5s to prevent stuck loading screen
  useEffect(() => {
    if (!loadingProfile) return;
    const timer = setTimeout(() => setLoadingProfile(false), 5000);
    return () => clearTimeout(timer);
  }, [loadingProfile]);

  const needsOnboarding = !prototypeModeEnabled && !!supabaseSession?.user?.id && !loadingProfile && profile?.username == null;

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setActiveSession(null);
    setProfile(null);
  }, []);

  const handleStartSession = useCallback((sessionId: string, title: string, meetingType: MeetingType) => {
    setActiveSession({ sessionId, title, meetingType });
  }, []);

  const handleEndSession = useCallback(async () => {
    const current = activeSessionRef.current;
    if (current) {
      try {
        await authFetch(`/api/sessions/${current.sessionId}/leave`, { method: 'POST' }).catch(() => {});
        await authFetch(`/api/sessions/${current.sessionId}/stop`, { method: 'POST' });
      } catch {
        // Best-effort
      }
    }
    setActiveSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{
      supabaseSession,
      loadingAuth,
      profile,
      loadingProfile,
      needsOnboarding,
      activeSession,
      setActiveSession,
      handleSignOut,
      handleStartSession,
      handleEndSession,
      setProfile,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSessionContext must be used within SessionProvider');
  return context;
}
