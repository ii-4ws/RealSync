import { useEffect, useState } from 'react';
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
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

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
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { resolvedTheme } = useTheme();
  console.log('App component mounted');

  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | undefined>('Demo User');
  const [userEmail, setUserEmail] = useState<string | undefined>('demo@realsync.com');
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

  // Final release behavior: real auth by default. If Supabase env vars are missing (common in local dev),
  // fall back to prototype mode so the UI can still render.
  const prototypeModeEnabled =
    import.meta.env.VITE_PROTOTYPE_MODE === '1' ||
    !import.meta.env.VITE_SUPABASE_URL ||
    !import.meta.env.VITE_SUPABASE_ANON_KEY;

  console.log('Current state:', { currentScreen, prototypeMode: prototypeModeEnabled, loadingAuth, loadingProfile });

  useEffect(() => {
    // Skip authentication in prototype mode
    if (prototypeModeEnabled) {
      setLoadingAuth(false);
      return;
    }

    let isMounted = true;

    const initializeSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Failed to get session', error);
        }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // ── OAuth domain guard ──────────────────────────────────────
      // Block personal email domains (gmail, yahoo, etc.) even when
      // the user authenticates via Google/Microsoft OAuth.
      if (event === 'SIGNED_IN' && nextSession?.user?.email) {
        if (isBlockedDomain(nextSession.user.email)) {
          supabase.auth.signOut();
          setOauthError(
            'Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please sign in with your corporate or institutional email.'
          );
          return;
        }
      }

      setSession(nextSession ?? null);
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
        const { data, error, status } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, created_at, updated_at')
          .eq('id', userId)
          .single();

        console.debug('Profile fetch response', { data, error, status });

        if (error) {
          console.error('Failed to fetch profile', error);
          if (isMounted) {
            setProfile(null);
          }
          return;
        }

        if (isMounted) {
          setProfile(data);
        }
      } catch (err) {
        console.error('Unexpected profile fetch error', err);
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
    if (!prototypeModeEnabled) {
      setUserEmail(session?.user?.email ?? undefined);
    }
  }, [session?.user?.email, prototypeModeEnabled]);

  useEffect(() => {
    if (!prototypeModeEnabled) {
      setUserName(profile?.full_name ?? profile?.username ?? undefined);
      setProfilePhoto(profile?.avatar_url ?? null);
    }
  }, [profile, prototypeModeEnabled]);

  const handleSignOut = async () => {
    if (prototypeModeEnabled) {
      // In prototype mode, just go back to login screen
      setSession(null);
      setCurrentScreen('dashboard');
      setAuthView('login');
      window.location.reload();
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Failed to sign out', error);
    }
    setCurrentScreen('dashboard');
  };

  const navigateTo = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleProfileComplete = (updatedProfile: Profile) => {
    setProfile(updatedProfile);
  };

  const needsOnboarding = !!session?.user?.id && profile?.username == null;

  // Auto-dismiss the connecting screen after 15s if bot never reports connected
  useEffect(() => {
    if (!botConnecting) return;
    const timer = setTimeout(() => setBotConnecting(false), 15000);
    return () => clearTimeout(timer);
  }, [botConnecting]);

  const handleStartSession = (sessionId: string, title: string, meetingType: MeetingType) => {
    setActiveSessionId(sessionId);
    setActiveMeetingTitle(title);
    setActiveMeetingType(meetingType);
    setConnectingTitle(title);
    setBotConnecting(true);
    setCurrentScreen('dashboard');
  };

  const handleEndSession = () => {
    setActiveSessionId(null);
    setActiveMeetingTitle(null);
    setActiveMeetingType(null);
  };

  // Safety timeout: if loading takes more than 5s, stop waiting
  useEffect(() => {
    if (loadingAuth || loadingProfile) {
      const timeout = setTimeout(() => {
        console.warn('Loading timeout — forcing load complete');
        setLoadingAuth(false);
        setLoadingProfile(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [loadingAuth, loadingProfile]);

  if (loadingAuth || (session?.user?.id && loadingProfile)) {
    console.log('Showing loading screen');
    return (
      <div className="min-h-screen bg-[#0f0f1e] flex items-center justify-center text-gray-300">
        Loading...
      </div>
    );
  }

  // In prototype mode, skip authentication
  if (!prototypeModeEnabled && !session) {
    if (authView === 'signup') {
      console.log('Showing signup screen');
      return <SignUpScreen onSwitchToLogin={() => setAuthView('login')} />;
    }
    console.log('Showing login screen');
    return <LoginScreen onSwitchToSignUp={() => setAuthView('signup')} oauthError={oauthError} onClearOAuthError={() => setOauthError(null)} />;
  }

  if (!prototypeModeEnabled && needsOnboarding) {
    console.log('Showing onboarding');
    return (
      <CompleteProfileScreen
        userId={session.user.id}
        initialEmail={session.user.email ?? undefined}
        onComplete={handleProfileComplete}
      />
    );
  }

  console.log('Rendering main app, screen:', currentScreen);

  return (
    <>
      <Toaster position="top-right" theme={resolvedTheme} richColors />

      {/* Bot Connecting Loading Screen */}
      {botConnecting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0a14]/95 backdrop-blur-sm">
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
                This may take a few seconds…
              </p>
            </div>

            {/* Animated progress dots */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-gray-400">Creating session</span>
              </div>
              <div className="w-6 h-px bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400/50 animate-pulse [animation-delay:0.5s]" />
                <span className="text-gray-500">Bot joining</span>
              </div>
              <div className="w-6 h-px bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-600" />
                <span className="text-gray-600">Streaming</span>
              </div>
            </div>

            {/* Skip button */}
            <button
              onClick={() => setBotConnecting(false)}
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
          onBotConnected={() => setBotConnecting(false)}
          profilePhoto={profilePhoto}
          userName={userName}
          userEmail={userEmail}
          sessionId={activeSessionId}
          meetingTitle={activeMeetingTitle}
          meetingType={activeMeetingType}
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
        />
      )}
      {currentScreen === 'reports' && <ReportsScreen onNavigate={navigateTo} onSignOut={handleSignOut} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />}
      {currentScreen === 'settings' && <SettingsScreen onNavigate={navigateTo} onSignOut={handleSignOut} profilePhoto={profilePhoto} onSaveProfilePhoto={setProfilePhoto} userName={userName} onSaveUserName={setUserName} userEmail={userEmail} onSaveUserEmail={setUserEmail} />}
      {currentScreen === 'faq' && <FAQScreen onNavigate={navigateTo} onSignOut={handleSignOut} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />}
    </>
  );
}
