import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Upload, User } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setFormError('Image must be less than 2MB.');
      return;
    }

    if (!file.type.match(/image\/(jpg|jpeg|png|gif|webp)/)) {
      setFormError('Please upload a JPG, PNG, GIF, or WebP image.');
      return;
    }

    setFormError(null);
    setAvatarFile(file);

    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First name and last name are required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      let avatarUrl: string | null = null;

      // Upload avatar if provided
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'png';
        const filePath = `avatars/${userId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadError) {
          console.error('Avatar upload failed:', uploadError);
          // Non-fatal — continue without avatar
        } else {
          const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          avatarUrl = urlData.publicUrl;
        }
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const username = fullName; // Use full name as the display name

      const updates: Record<string, unknown> = {
        id: userId,
        username,
        full_name: fullName,
        job_title: jobTitle.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (avatarUrl) {
        updates.avatar_url = avatarUrl;
      }

      // Use upsert so it works even if the trigger didn't create
      // a profile row (e.g. user existed before the trigger was added).
      const { data, error } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' })
        .select('id, username, full_name, avatar_url, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          setFormError('That name is already taken.');
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
          Set up your profile to finish onboarding{initialEmail ? ` for ${initialEmail}` : ''}.
        </p>

        <div className="space-y-5">
          {/* Avatar preview + upload */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-500">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : initials.length > 0 ? (
                <span className="text-white text-3xl font-semibold">{initials || <User className="w-10 h-10 text-white/60" />}</span>
              ) : (
                <User className="w-10 h-10 text-white/60" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Photo
            </Button>
            <p className="text-gray-500 text-xs">JPG, PNG, GIF or WebP. Max 2MB.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* First Name */}
          <div>
            <label className="text-gray-300 text-sm mb-2 block">First Name</label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="text-gray-300 text-sm mb-2 block">Last Name</label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12"
            />
          </div>

          {/* Job Title */}
          <div>
            <label className="text-gray-300 text-sm mb-2 block">Job Title <span className="text-gray-500">(optional)</span></label>
            <Input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Security Analyst"
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
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </div>
    </div>
  );
}
