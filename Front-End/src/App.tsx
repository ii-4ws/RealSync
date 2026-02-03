import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LoginScreen } from './components/screens/LoginScreen';
import { CompleteProfileScreen } from './components/screens/CompleteProfileScreen';
import { DashboardScreen } from './components/screens/DashboardScreen';
import { SessionsScreen } from './components/screens/SessionsScreen';
import { ReportsScreen } from './components/screens/ReportsScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { FAQScreen } from './components/screens/FAQScreen';
import { supabase } from './lib/supabaseClient';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';
type MeetingType = 'official' | 'business' | 'friends';

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function App() {
  console.log('App component mounted');

  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | undefined>('Demo User');
  const [userEmail, setUserEmail] = useState<string | undefined>('demo@realsync.com');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeMeetingTitle, setActiveMeetingTitle] = useState<string | null>(null);
  const [activeMeetingType, setActiveMeetingType] = useState<MeetingType | null>(null);

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
          .select('id, username, avatar_url, created_at, updated_at')
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
    setUserEmail(session?.user?.email ?? undefined);
  }, [session?.user?.email]);

  useEffect(() => {
    setUserName(profile?.username ?? undefined);
    setProfilePhoto(profile?.avatar_url ?? null);
  }, [profile]);

  const handleSignOut = async () => {
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
    console.log('Showing login screen');
    return <LoginScreen />;
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

  const handleStartSession = (sessionId: string, title: string, meetingType: MeetingType) => {
    setActiveSessionId(sessionId);
    setActiveMeetingTitle(title);
    setActiveMeetingType(meetingType);
    setCurrentScreen('dashboard');
  };

  return (
    <>
      {currentScreen === 'dashboard' && (
        <DashboardScreen
          onNavigate={navigateTo}
          onSignOut={handleSignOut}
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
