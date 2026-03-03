import { useEffect, useMemo, useState, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Toaster } from 'sonner';
import { LoginScreen } from './components/screens/LoginScreen';
import { SignUpScreen } from './components/screens/SignUpScreen';
import { CompleteProfileScreen } from './components/screens/CompleteProfileScreen';
import { DashboardScreen } from './components/screens/DashboardScreen';
import { SessionsScreen } from './components/screens/SessionsScreen';
import { ReportsScreen } from './components/screens/ReportsScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { FAQScreen } from './components/screens/FAQScreen';
import { supabase } from './lib/supabaseClient';
import { isBlockedDomain } from './lib/blockedDomains';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { NotificationProvider } from './contexts/NotificationContext';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';
type MeetingType = 'official' | 'business' | 'friends';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeMeetingTitle, setActiveMeetingTitle] = useState<string | null>(null);
  const [activeMeetingType, setActiveMeetingType] = useState<MeetingType | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [botConnecting, setBotConnecting] = useState(false);
  const [connectingTitle, setConnectingTitle] = useState<string>('');
  const [botProgress, setBotProgress] = useState<'creating' | 'joining' | 'streaming' | null>(null);
  const botProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openNewSessionFlag, setOpenNewSessionFlag] = useState(0);

  // Final release behavior: real auth by default. If Supabase env vars are missing (common in local dev),
  // fall back to prototype mode so the UI can still render.
  const prototypeModeEnabled = useMemo(() =>
    import.meta.env.VITE_PROTOTYPE_MODE === '1' ||
    !import.meta.env.VITE_SUPABASE_URL ||
    !import.meta.env.VITE_SUPABASE_ANON_KEY
  , []);

  useEffect(() => {
    // Skip authentication in prototype mode
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
          setSession(data.session ?? null);
          setLoadingProfile(!!data.session?.user?.id);
        }
      } finally {
        if (isMounted) {
          setLoadingAuth(false);
        }
      }
    };

    initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      // -- OAuth domain guard --
      // Block personal email domains (gmail, yahoo, etc.) even when
      // the user authenticates via Google/Microsoft OAuth.
      if (event === 'SIGNED_IN' && nextSession?.user?.email) {
        if (isBlockedDomain(nextSession.user.email)) {
          await supabase.auth.signOut();
          setOauthError(
            'Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please sign in with your corporate or institutional email.'
          );
          return;
        }
      }

      setSession(nextSession ?? null);
      if (event === 'INITIAL_SESSION') {
        if (initialSessionHandled) return;
        initialSessionHandled = true;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        setLoadingProfile(!!nextSession?.user?.id);
      }
      if (event === 'SIGNED_OUT') {
        setLoadingProfile(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [prototypeModeEnabled]);

  useEffect(() => {
    // Skip profile fetching in prototype mode
    if (prototypeModeEnabled) {
      return;
    }

    const userId = session?.user?.id;
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
          .select('id, username, full_name, avatar_url, created_at, updated_at')
          .eq('id', userId)
          .single();

        if (error) {
          if (isMounted) {
            setProfile(null);
          }
          return;
        }

        if (isMounted) {
          setProfile(data);
        }
      } catch {
        if (isMounted) {
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, prototypeModeEnabled]);

  useEffect(() => {
    setUserEmail(session?.user?.email ?? undefined);
  }, [session?.user?.email]);

  useEffect(() => {
    setUserName(profile?.full_name ?? profile?.username ?? undefined);
    setProfilePhoto(profile?.avatar_url ?? null);
  }, [profile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // M26: Don't set screen here — onAuthStateChange listener handles redirect
  };

  const navigateTo = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleProfileComplete = (updatedProfile: Profile) => {
    setProfile(updatedProfile);
  };

  const needsOnboarding = !!session?.user?.id && profile?.username == null;

  // Auto-dismiss the connecting screen: 15s hard timeout, or 1s after streaming confirmed
  useEffect(() => {
    if (!botConnecting) return;
    const timer = setTimeout(() => {
      setBotConnecting(false);
      setBotProgress(null);
    }, 15000);
    return () => {
      clearTimeout(timer);
      if (botProgressTimerRef.current) {
        clearTimeout(botProgressTimerRef.current);
        botProgressTimerRef.current = null;
      }
    };
  }, [botConnecting]);

  if (loadingAuth || (session?.user?.id && loadingProfile)) {
    return (
      <div className="min-h-screen bg-[#0f0f1e] flex items-center justify-center text-gray-300">
        Loading...
      </div>
    );
  }

  // In prototype mode, skip authentication
  if (!prototypeModeEnabled && !session) {
    if (authView === 'signup') {
      return <SignUpScreen onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginScreen onSwitchToSignUp={() => setAuthView('signup')} oauthError={oauthError} onClearOAuthError={() => setOauthError(null)} />;
  }

  if (!prototypeModeEnabled && needsOnboarding) {
    return (
      <CompleteProfileScreen
        userId={session.user.id}
        initialEmail={session.user.email ?? undefined}
        onComplete={handleProfileComplete}
      />
    );
  }

  const handleStartSession = (sessionId: string, title: string, meetingType: MeetingType) => {
    setActiveSessionId(sessionId);
    setActiveMeetingTitle(title);
    setActiveMeetingType(meetingType);
    setConnectingTitle(title);
    setBotConnecting(true);
    setBotProgress('creating');
    setCurrentScreen('dashboard');
    // Transition to 'joining' after a brief delay (session creation is near-instant)
    botProgressTimerRef.current = setTimeout(() => setBotProgress('joining'), 1500);
  };

  const handleEndSession = () => {
    if (botProgressTimerRef.current) { clearTimeout(botProgressTimerRef.current); botProgressTimerRef.current = null; }
    setActiveSessionId(null);
    setActiveMeetingTitle(null);
    setActiveMeetingType(null);
  };

  const handleNewSession = () => {
    setCurrentScreen('sessions');
    // Increment flag to trigger dialog open in SessionsScreen
    setOpenNewSessionFlag((f) => f + 1);
  };

  return (
    <WebSocketProvider sessionId={activeSessionId}>
    <NotificationProvider>
      <Toaster position="top-right" theme="dark" richColors />

      {/* Bot Connecting Loading Screen */}
      {botConnecting && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#0a0a14]/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 max-w-md text-center px-6">
            {/* Animated eye logo */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-2 border-cyan-400/30 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400 animate-spin" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-10 h-10 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            </div>

            {/* Status text */}
            <div>
              <h2 className="text-white text-xl font-semibold mb-2">Connecting to Meeting</h2>
              <p className="text-gray-400 text-sm mb-1">{connectingTitle}</p>
              <p className="text-gray-500 text-xs">
                The RealSync bot is joining your Zoom meeting.
                <br />
                This may take a few seconds...
              </p>
            </div>

            {/* Progress steps — styled based on botProgress state */}
            <div className="flex items-center gap-4 text-sm">
              {/* Step 1: Creating session */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  botProgress === 'creating' ? 'bg-cyan-400 animate-pulse' :
                  botProgress === 'joining' || botProgress === 'streaming' ? 'bg-cyan-400' :
                  'bg-gray-600'
                }`} />
                <span className={
                  botProgress === 'creating' ? 'text-cyan-300' :
                  botProgress === 'joining' || botProgress === 'streaming' ? 'text-gray-400' :
                  'text-gray-500'
                }>Creating session</span>
              </div>
              <div className={`w-6 h-px ${botProgress === 'joining' || botProgress === 'streaming' ? 'bg-cyan-400/40' : 'bg-gray-700'}`} />
              {/* Step 2: Bot joining */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  botProgress === 'joining' ? 'bg-cyan-400 animate-pulse' :
                  botProgress === 'streaming' ? 'bg-cyan-400' :
                  'bg-gray-600'
                }`} />
                <span className={
                  botProgress === 'joining' ? 'text-cyan-300' :
                  botProgress === 'streaming' ? 'text-gray-400' :
                  'text-gray-600'
                }>Bot joining</span>
              </div>
              <div className={`w-6 h-px ${botProgress === 'streaming' ? 'bg-cyan-400/40' : 'bg-gray-700'}`} />
              {/* Step 3: Streaming */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  botProgress === 'streaming' ? 'bg-cyan-400 animate-pulse' :
                  'bg-gray-600'
                }`} />
                <span className={
                  botProgress === 'streaming' ? 'text-cyan-300' :
                  'text-gray-600'
                }>Streaming</span>
              </div>
            </div>

            {/* Skip button */}
            <button
              onClick={() => { setBotConnecting(false); setBotProgress(null); }}
              className="mt-4 text-gray-500 text-xs hover:text-gray-300 transition-colors underline underline-offset-2"
            >
              Skip to Dashboard
            </button>
          </div>
        </div>
      )}

      {currentScreen === 'dashboard' && (
        <DashboardScreen
          onNavigate={navigateTo}
          onSignOut={handleSignOut}
          onEndSession={handleEndSession}
          onBotConnected={() => {
            setBotProgress('streaming');
            if (botProgressTimerRef.current) { clearTimeout(botProgressTimerRef.current); }
            botProgressTimerRef.current = setTimeout(() => {
              setBotConnecting(false);
              setBotProgress(null);
              botProgressTimerRef.current = null;
            }, 1200);
          }}
          profilePhoto={profilePhoto}
          userName={userName}
          userEmail={userEmail}
          sessionId={activeSessionId}
          meetingTitle={activeMeetingTitle}
          meetingType={activeMeetingType}
          onNewSession={handleNewSession}
        />
      )}
      {currentScreen === 'sessions' && (
        <SessionsScreen
          onNavigate={navigateTo}
          onSignOut={handleSignOut}
          profilePhoto={profilePhoto}
          userName={userName}
          userEmail={userEmail}
          onStartSession={handleStartSession}
          activeSessionId={activeSessionId}
          onNewSession={handleNewSession}
          onEndSession={handleEndSession}
          openNewSessionFlag={openNewSessionFlag}
        />
      )}
      {currentScreen === 'reports' && <ReportsScreen onNavigate={navigateTo} onSignOut={handleSignOut} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} activeSessionId={activeSessionId} onNewSession={handleNewSession} onEndSession={handleEndSession} />}
      {currentScreen === 'settings' && <SettingsScreen onNavigate={navigateTo} onSignOut={handleSignOut} profilePhoto={profilePhoto} onSaveProfilePhoto={setProfilePhoto} userName={userName} onSaveUserName={setUserName} userEmail={userEmail} onSaveUserEmail={setUserEmail} activeSessionId={activeSessionId} onNewSession={handleNewSession} onEndSession={handleEndSession} />}
      {currentScreen === 'faq' && <FAQScreen onNavigate={navigateTo} onSignOut={handleSignOut} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} activeSessionId={activeSessionId} onNewSession={handleNewSession} onEndSession={handleEndSession} />}
    </NotificationProvider>
    </WebSocketProvider>
  );
}
