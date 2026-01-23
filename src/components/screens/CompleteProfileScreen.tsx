import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { supabase } from '../../lib/supabaseClient';

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

interface CompleteProfileScreenProps {
  userId: string;
  onComplete: (profile: Profile) => void;
  initialEmail?: string;
}

export function CompleteProfileScreen({ userId, onComplete, initialEmail }: CompleteProfileScreenProps) {
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!username.trim()) {
      setFormError('Username is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const updates = {
        username: username.trim(),
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('id, username, avatar_url, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          setFormError('That username is already taken.');
          return;
        }
        setFormError(error.message);
        return;
      }

      if (data) {
        onComplete(data);
      } else {
        setFormError('Profile update returned no data.');
      }
    } catch (err) {
      setFormError('Unexpected error while updating profile.');
      console.error('Profile update failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f1e] flex items-center justify-center p-8">
      <div className="w-full max-w-lg bg-[#1a1a2e] rounded-2xl p-8 border border-gray-800/50 shadow-2xl">
        <h1 className="text-white text-2xl mb-2">Complete your profile</h1>
        <p className="text-gray-400 mb-6">
          Set a username to finish onboarding{initialEmail ? ` for ${initialEmail}` : ''}.
        </p>

        <div className="space-y-5">
          <div>
            <label className="text-gray-300 text-sm mb-2 block">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-handle"
              className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12"
            />
          </div>

          <div>
            <label className="text-gray-300 text-sm mb-2 block">Avatar URL (optional)</label>
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
              className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12"
            />
          </div>

          {formError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={isSubmitting}
            className="w-full h-12 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/25"
          >
            {isSubmitting ? 'Saving...' : 'Save profile'}
          </Button>
        </div>
      </div>
    </div>
  );
}
