import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { User, Lock, SlidersHorizontal, Cloud, Bell, Upload, ShieldCheck, Loader2, X, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications, type NotificationSeverity } from '../../contexts/NotificationContext';
import { authFetch } from '../../lib/api';
import { useWebSocket } from '../../contexts/WebSocketContext';

type SettingsTab = 'general' | 'privacy' | 'detection' | 'storage' | 'notifications';

interface SettingsScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  onSaveProfilePhoto?: (photo: string | null) => void;
  userName?: string;
  onSaveUserName?: (name: string) => void;
  userEmail?: string;
  onSaveUserEmail?: (email: string) => void;
  activeSessionId?: string | null;
  onNewSession?: () => void;
  onEndSession?: () => void;
}

export function SettingsScreen({ onNavigate, onSignOut, profilePhoto, onSaveProfilePhoto, userName, onSaveUserName, userEmail, onSaveUserEmail, activeSessionId, onNewSession, onEndSession }: SettingsScreenProps) {
  const { isConnected: wsConnected } = useWebSocket();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs = [
    { id: 'general' as SettingsTab, icon: User, label: 'General Settings' },
    { id: 'privacy' as SettingsTab, icon: Lock, label: 'Privacy & Security' },
    { id: 'detection' as SettingsTab, icon: SlidersHorizontal, label: 'Detection Settings' },
    { id: 'storage' as SettingsTab, icon: Cloud, label: 'Cloud Storage' },
    { id: 'notifications' as SettingsTab, icon: Bell, label: 'Notifications' },
  ];

  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="settings" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Settings" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} isConnected={wsConnected} activeSessionId={activeSessionId} onNewSession={onNewSession} onEndSession={onEndSession} />
        
        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            {/* Settings Sidebar */}
            <div className="w-64 bg-[#1a1a2e] border-r border-gray-800 p-4 min-h-full">
              <div className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings Content */}
            <div className="flex-1 p-8">
              {activeTab === 'general' && <GeneralSettings profilePhoto={profilePhoto} onSaveProfilePhoto={onSaveProfilePhoto} userName={userName} onSaveUserName={onSaveUserName} userEmail={userEmail} onSaveUserEmail={onSaveUserEmail} />}
              {activeTab === 'privacy' && <PrivacySettings />}
              {activeTab === 'detection' && <DetectionSettings />}
              {activeTab === 'storage' && <StorageSettings />}
              {activeTab === 'notifications' && <NotificationSettings />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings({ profilePhoto, onSaveProfilePhoto, userName, onSaveUserName, userEmail, onSaveUserEmail }: { profilePhoto?: string | null, onSaveProfilePhoto?: (photo: string | null) => void, userName?: string, onSaveUserName?: (name: string) => void, userEmail?: string, onSaveUserEmail?: (email: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameInput, setNameInput] = useState(userName || '');
  const [emailInput, setEmailInput] = useState(userEmail || '');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Sync local state when props change (e.g. after profile load)
  useEffect(() => { setNameInput(userName || ''); }, [userName]);
  useEffect(() => { setEmailInput(userEmail || ''); }, [userEmail]);

  // Clean up object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (2MB max)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('File size must be less than 2MB');
        return;
      }

      // Check file type
      if (!file.type.match(/image\/(jpg|jpeg|png|gif|webp)/)) {
        toast.error('Please upload a JPG, PNG, GIF, or WebP image');
        return;
      }

      // Store file for upload on save; show preview via object URL
      setPendingFile(file);
      const objUrl = URL.createObjectURL(file);
      setPreviewUrl(objUrl);
      toast.info('Photo selected — click Save Changes to apply.');
    }
  };

  /** Upload avatar to Supabase Storage, return the public URL */
  const uploadAvatar = async (userId: string, file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error('Failed to upload photo: ' + uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    return urlData?.publicUrl || null;
  };

  const handleSaveChanges = async () => {
    if (nameInput.trim().length > 100) {
      toast.error('Name must be 100 characters or less.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailInput.trim() && !emailRegex.test(emailInput.trim())) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated.');
        return;
      }

      // Upload avatar to Supabase Storage if a new file was selected
      let avatarUrl = profilePhoto || null;
      if (pendingFile) {
        const url = await uploadAvatar(user.id, pendingFile);
        if (url) {
          avatarUrl = url;
          setPendingFile(null);
          setPreviewUrl(null);
        } else {
          return; // Upload failed — don't save
        }
      }

      // Persist to Supabase profiles table (store URL, not base64)
      const { error } = await supabase
        .from('profiles')
        .update({
          username: nameInput.trim() || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        toast.error('Failed to save profile to server.');
        return;
      }

      // H17: Persist email change via Supabase Auth (triggers confirmation email)
      if (emailInput && emailInput.trim() !== userEmail) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: emailInput.trim() });
        if (emailErr) {
          toast.error('Failed to update email: ' + emailErr.message);
          return;
        }
      }

      // Update local state only AFTER server write succeeds
      if (onSaveProfilePhoto) onSaveProfilePhoto(avatarUrl);
      if (onSaveUserName) onSaveUserName(nameInput);
      if (onSaveUserEmail && emailInput) onSaveUserEmail(emailInput);

      toast.success('Settings saved successfully!');
    } catch {
      toast.error('Failed to save profile to server.');
    } finally {
      setIsSaving(false);
    }
  };

  // Display photo: pending preview > existing profile photo (URL or legacy base64)
  const displayPhoto = previewUrl || profilePhoto;

  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">General Settings</h2>
      
      <div className="grid md:grid-cols-2 gap-8">
        {/* Profile Information */}
        <div className="space-y-6">
          <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
            <h3 className="text-white text-lg mb-4">Profile Information</h3>
            
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300 mb-2">Full Name</Label>
                <Input
                  value={nameInput}
                  className="bg-[#2a2a3e] border-gray-700 text-white"
                  maxLength={100}
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </div>
              
              <div>
                <Label className="text-gray-300 mb-2">Email Address</Label>
                <Input
                  type="email"
                  value={emailInput}
                  className="bg-[#2a2a3e] border-gray-700 text-white"
                  maxLength={254}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>
              
            </div>
          </div>

          {/* Regional Settings */}
          <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
            <h3 className="text-white text-lg mb-4">Regional Settings</h3>

            <div className="space-y-4">
              <div>
                <Label className="text-gray-300 mb-2">Time Zone</Label>
                <Select defaultValue="pst">
                  <SelectTrigger className="bg-[#2a2a3e] border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a3e] border-gray-700">
                    <SelectItem value="pst">Pacific Time (PST)</SelectItem>
                    <SelectItem value="est">Eastern Time (EST)</SelectItem>
                    <SelectItem value="gmt">GMT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-300 mb-2">Date Format</Label>
                <Select defaultValue="mdy">
                  <SelectTrigger className="bg-[#2a2a3e] border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a3e] border-gray-700">
                    <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                    <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                    <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
            <h3 className="text-white text-lg mb-4">Appearance</h3>
            <div>
              <Label className="text-gray-300 mb-3 block">Theme</Label>
              <ThemeSelector />
            </div>
          </div>
        </div>

        {/* Profile Photo */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 h-fit">
          <h3 className="text-white text-lg mb-4">Profile Photo</h3>
          
          <div className="flex flex-col items-center">
            <div className="w-32 h-32 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center mb-4">
              {displayPhoto ? (
                <img src={displayPhoto} alt="Profile" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-white text-4xl">
                  {(nameInput || userName || '')
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || '??'}
                </span>
              )}
            </div>
            
            <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300 mb-2" onClick={handleUploadClick}>
              <Upload className="w-4 h-4 mr-2" />
              Upload New Photo
            </Button>

            {(displayPhoto) && (
              <Button
                variant="outline"
                className="bg-transparent border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300 mb-2"
                onClick={() => {
                  setPendingFile(null);
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                  if (onSaveProfilePhoto) {
                    onSaveProfilePhoto(null);
                    toast.success('Profile photo removed');
                  }
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Remove Photo
              </Button>
            )}

            <p className="text-gray-400 text-xs text-center">
              JPG, PNG or GIF. Max size 2MB.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/gif"
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300" onClick={() => {
          setNameInput(userName || '');
          setEmailInput(userEmail || '');
          setPendingFile(null);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
          toast.info('Changes discarded');
        }}>
          Cancel
        </Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black" onClick={handleSaveChanges} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function PrivacySettings() {
  // -- 2FA State --
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [qrUri, setQrUri] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [disabling2FA, setDisabling2FA] = useState(false);

  // Check if 2FA is already enabled
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.mfa.listFactors();
        const verified = data?.totp?.filter((f: { status: string }) => f.status === 'verified') ?? [];
        setMfaEnabled(verified.length > 0);
      } catch {
        // ignore
      } finally {
        setMfaLoading(false);
      }
    })();
  }, []);

  // Start enrollment
  const handleEnroll = async () => {
    setEnrolling(true);
    setEnrollError(null);
    try {
      // Clean up any previous unverified factors first
      const { data: existingFactors } = await supabase.auth.mfa.listFactors();
      const unverified = existingFactors?.totp?.filter((f: { status: string }) => f.status === 'unverified') ?? [];
      for (const factor of unverified) {
        try {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        } catch {
          // ignore unenroll errors for stale factors
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `RealSync-${Date.now()}`,
      });
      if (error) throw error;
      setQrUri(data.totp.uri);
      setFactorId(data.id);
      setShowEnrollModal(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to start 2FA enrollment');
    } finally {
      setEnrolling(false);
    }
  };

  // Verify TOTP code to complete enrollment
  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setEnrollError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setVerifying(true);
    setEnrollError(null);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      setMfaEnabled(true);
      setShowEnrollModal(false);
      setVerifyCode('');
      toast.success('Two-factor authentication enabled!');
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // Disable 2FA (unenroll all factors)
  const handleDisable2FA = async () => {
    if (disabling2FA) return;
    if (!window.confirm('Are you sure you want to disable two-factor authentication?')) return;
    setDisabling2FA(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factors = data?.totp ?? [];
      for (const factor of factors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      setMfaEnabled(false);
      toast.success('Two-factor authentication disabled.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setDisabling2FA(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">Privacy & Security</h2>

      <div className="space-y-6">
        {/* Privacy Controls */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Privacy Controls</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Data Sharing & Anonymization</p>
                <p className="text-gray-400 text-sm">
                  Allow anonymized data to improve AI models
                </p>
              </div>
              <Switch />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white mb-1">Facial Data Collection</p>
                <p className="text-gray-400 text-sm">
                  Enable facial recognition for deepfake detection
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        {/* Account Security -- 2FA */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Account Security</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white mb-1">Two-Factor Authentication</p>
                <p className="text-gray-400 text-sm">
                  {mfaEnabled
                    ? 'Your account is protected with 2FA via an authenticator app.'
                    : 'Add an extra layer of security to your account'}
                </p>
              </div>
              {mfaLoading ? (
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              ) : mfaEnabled ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-green-400 text-sm">
                    <ShieldCheck className="w-4 h-4" />
                    Enabled
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={handleDisable2FA}
                    disabled={disabling2FA}
                  >
                    {disabling2FA ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Disabling...
                      </>
                    ) : (
                      'Disable'
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  className="bg-cyan-400 hover:bg-cyan-500 text-black"
                  onClick={handleEnroll}
                  disabled={enrolling}
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    'Enable 2FA'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Info Panel */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
          <h4 className="text-blue-400 mb-2">Privacy Information</h4>
          <p className="text-gray-300 text-sm">
            Your privacy is important to us. All biometric data is encrypted and stored securely.
            You have full control over what data is collected and how it's used.
          </p>
        </div>
      </div>

      {/* -- 2FA Enrollment Modal (portal to body to escape overflow clipping) -- */}
      {showEnrollModal && createPortal(
        <MfaEnrollModal
          qrUri={qrUri}
          verifyCode={verifyCode}
          setVerifyCode={setVerifyCode}
          enrollError={enrollError}
          setEnrollError={setEnrollError}
          verifying={verifying}
          onVerify={handleVerify}
          onClose={() => { setShowEnrollModal(false); setVerifyCode(''); setEnrollError(null); }}
        />,
        document.body
      )}
    </div>
  );
}

/* -- 2FA Enrollment Modal (compact, with 6 individual digit boxes) -- */
function MfaEnrollModal({
  qrUri,
  verifyCode,
  setVerifyCode,
  enrollError,
  setEnrollError,
  verifying,
  onVerify,
  onClose,
}: {
  qrUri: string;
  verifyCode: string;
  setVerifyCode: (v: string) => void;
  enrollError: string | null;
  setEnrollError: (v: string | null) => void;
  verifying: boolean;
  onVerify: () => void;
  onClose: () => void;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Array-based digit tracking: each position is independent, so clearing a
  // mid-string digit does not shift remaining digits.
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));

  // Sync parent verifyCode string whenever digits change
  useEffect(() => {
    setVerifyCode(otpDigits.join(''));
  }, [otpDigits, setVerifyCode]);

  // Reset internal digits when parent clears verifyCode (e.g. on modal close)
  useEffect(() => {
    if (verifyCode === '') {
      setOtpDigits(Array(6).fill(''));
    }
  }, [verifyCode]);

  const focusInput = useCallback((idx: number) => {
    inputRefs.current[idx]?.focus();
  }, []);

  // Auto-focus first box on mount
  useEffect(() => { focusInput(0); }, [focusInput]);

  const handleDigitChange = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1); // only last digit typed
    setOtpDigits((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    setEnrollError(null);
    // Auto-advance to next box
    if (digit && idx < 5) focusInput(idx + 1);
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otpDigits[idx] !== '') {
        setOtpDigits((prev) => {
          const next = [...prev];
          next[idx] = '';
          return next;
        });
      } else if (idx > 0) {
        focusInput(idx - 1);
        setOtpDigits((prev) => {
          const next = [...prev];
          next[idx - 1] = '';
          return next;
        });
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      focusInput(idx - 1);
    } else if (e.key === 'ArrowRight' && idx < 5) {
      focusInput(idx + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);
    setEnrollError(null);
    focusInput(Math.min(pasted.length, 5));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60"
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Modal card */}
      <div
        className="fixed z-[9999]"
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '380px', maxWidth: 'calc(100vw - 32px)' }}
      >
        <div className="bg-[#1a1a2e] rounded-2xl border border-gray-700 shadow-2xl p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <h3 className="text-white text-lg font-semibold leading-tight">Set Up 2FA</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors -mt-0.5">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center mb-5">
            <p className="text-gray-400 text-sm mb-3 text-center">
              Scan with your authenticator app
            </p>
            <div className="bg-white p-3 rounded-xl inline-block">
              <QRCodeSVG value={qrUri} size={180} />
            </div>
          </div>

          {/* 6-digit code input boxes */}
          <div className="mb-4">
            <Label className="text-gray-300 text-sm mb-2 block">Enter the 6-digit code</Label>
            <div className="flex items-center justify-center gap-2" onPaste={handlePaste}>
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpDigits[i]}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="flex-shrink-0 w-10 h-12 bg-[#0f0f1e] border border-gray-700 rounded-lg text-white text-center text-xl font-mono focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-colors"
                />
              ))}
              <span className="text-gray-500 text-lg font-bold flex-shrink-0">&mdash;</span>
              {[3, 4, 5].map((i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpDigits[i]}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="flex-shrink-0 w-10 h-12 bg-[#0f0f1e] border border-gray-700 rounded-lg text-white text-center text-xl font-mono focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-colors"
                />
              ))}
            </div>
          </div>

          {enrollError && (
            <p className="text-red-400 text-sm text-center mb-3">{enrollError}</p>
          )}

          <Button
            className="w-full h-11 bg-cyan-400 hover:bg-cyan-500 text-black font-medium"
            onClick={onVerify}
            disabled={verifying || verifyCode.length !== 6}
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify & Enable'
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

interface DetectionSettingsState {
  facialAnalysis: boolean;
  voicePattern: boolean;
  emotionDetection: boolean;
}

const DETECTION_DEFAULTS: DetectionSettingsState = {
  facialAnalysis: true,
  voicePattern: true,
  emotionDetection: true,
};

function DetectionSettings() {
  const [settings, setSettings] = useState<DetectionSettingsState>(DETECTION_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings({
            facialAnalysis: data.facialAnalysis ?? true,
            voicePattern: data.voicePattern ?? true,
            emotionDetection: data.emotionDetection ?? true,
          });
        }
      } catch {
        // Use defaults on failure
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Detection settings saved');
    } catch {
      toast.error('Failed to save detection settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSettings(DETECTION_DEFAULTS);
    setSaving(true);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DETECTION_DEFAULTS),
      });
      if (!res.ok) throw new Error('Failed to reset');
      toast.success('Detection settings reset to defaults');
    } catch {
      toast.error('Failed to reset detection settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">Detection Settings</h2>

      <div className="space-y-6">
        {/* Detection Modes */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Detection Modes</h3>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              <span className="ml-2 text-gray-400 text-sm">Loading settings...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-800">
                <div>
                  <p className="text-white mb-1">Facial Analysis</p>
                  <p className="text-gray-400 text-sm">
                    Detect facial anomalies and micro-expressions
                  </p>
                </div>
                <Switch
                  checked={settings.facialAnalysis}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, facialAnalysis: checked }))}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-800">
                <div>
                  <p className="text-white mb-1">Voice Pattern Detection</p>
                  <p className="text-gray-400 text-sm">
                    Analyze audio for synthetic voice patterns
                  </p>
                </div>
                <Switch
                  checked={settings.voicePattern}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, voicePattern: checked }))}
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-white mb-1">Emotion Detection</p>
                  <p className="text-gray-400 text-sm">
                    Monitor emotional states and micro-expressions
                  </p>
                </div>
                <Switch
                  checked={settings.emotionDetection}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, emotionDetection: checked }))}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300" onClick={handleReset} disabled={saving}>
          Reset to Default
        </Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function StorageSettings() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">Cloud Storage</h2>
      
      <div className="space-y-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Storage Usage</h3>
          
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-gray-300">245 GB used of 500 GB <span className="text-gray-500 text-xs">(sample data)</span></span>
              <span className="text-cyan-400 font-mono">49%</span>
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-blue-400" style={{ width: '36%' }}></div>
              <div className="h-full bg-cyan-400" style={{ width: '9%' }}></div>
              <div className="h-full bg-purple-400" style={{ width: '4%' }}></div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-400 rounded"></div>
                <span className="text-gray-300">Meeting Recordings</span>
              </div>
              <span className="text-white font-mono">180 GB <span className="text-gray-500 text-xs font-sans">(sample data)</span></span>
            </div>
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-cyan-400 rounded"></div>
                <span className="text-gray-300">Analysis Data</span>
              </div>
              <span className="text-white font-mono">45 GB <span className="text-gray-500 text-xs font-sans">(sample data)</span></span>
            </div>
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-purple-400 rounded"></div>
                <span className="text-gray-300">Other Files</span>
              </div>
              <span className="text-white font-mono">20 GB <span className="text-gray-500 text-xs font-sans">(sample data)</span></span>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Backup Settings</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Automatic Backup</p>
                <p className="text-gray-400 text-sm">Automatically backup all meeting data</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div>
              <Label className="text-gray-300 mb-2">Backup Frequency</Label>
              <Select defaultValue="daily">
                <SelectTrigger className="bg-[#2a2a3e] border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a3e] border-gray-700">
                  <SelectItem value="realtime">Real-time</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300" onClick={() => toast.info('Settings reset to defaults')}>Manage Storage</Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black" onClick={() => toast.info('Settings saved')}>Save Changes</Button>
      </div>
    </div>
  );
}

const SEVERITY_OPTIONS: { value: NotificationSeverity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'text-red-400' },
  { value: 'high', label: 'High', color: 'text-orange-400' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-400' },
  { value: 'low', label: 'Low', color: 'text-blue-400' },
];

function DesktopNotificationSettings() {
  const {
    desktopPermission,
    desktopEnabled,
    setDesktopEnabled,
    desktopSeverityFilter,
    setDesktopSeverityFilter,
    requestDesktopPermission,
  } = useNotifications();

  const permissionLabel =
    desktopPermission === 'granted' ? 'Granted' :
    desktopPermission === 'denied' ? 'Blocked by browser' :
    desktopPermission === 'unsupported' ? 'Not supported' : 'Not yet requested';

  const permissionColor =
    desktopPermission === 'granted' ? 'text-green-400' :
    desktopPermission === 'denied' ? 'text-red-400' : 'text-yellow-400';

  const handleToggle = async (checked: boolean) => {
    if (checked && desktopPermission === 'default') {
      await requestDesktopPermission();
    }
    setDesktopEnabled(checked);
  };

  const toggleSeverity = (severity: NotificationSeverity) => {
    const next = desktopSeverityFilter.includes(severity)
      ? desktopSeverityFilter.filter((s) => s !== severity)
      : [...desktopSeverityFilter, severity];
    setDesktopSeverityFilter(next);
  };

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
      <h3 className="text-white text-lg mb-4">Desktop Notifications</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b border-gray-800">
          <div>
            <p className="text-white mb-1">Enable Desktop Notifications</p>
            <p className="text-gray-400 text-sm">
              Show OS-native alerts when the browser tab is in the background
            </p>
            <p className={`text-xs mt-1 ${permissionColor}`}>
              Browser permission: {permissionLabel}
            </p>
          </div>
          <Switch
            checked={desktopEnabled}
            onCheckedChange={handleToggle}
            disabled={desktopPermission === 'denied' || desktopPermission === 'unsupported'}
          />
        </div>

        {desktopEnabled && desktopPermission === 'granted' && (
          <div className="py-3">
            <p className="text-white mb-2">Alert Severity Filter</p>
            <p className="text-gray-400 text-sm mb-3">Choose which severity levels trigger desktop notifications</p>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((opt) => {
                const active = desktopSeverityFilter.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleSeverity(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      active
                        ? `bg-gray-700 ${opt.color} ring-1 ring-gray-600`
                        : 'bg-[#2a2a3e] text-gray-500 hover:bg-gray-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {desktopPermission === 'denied' && (
          <p className="text-gray-500 text-xs">
            Desktop notifications are blocked by your browser. To enable them, click the lock icon in the address bar and allow notifications for this site.
          </p>
        )}
      </div>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">Notifications</h2>

      <div className="space-y-6">
        {/* Desktop Notifications */}
        <DesktopNotificationSettings />

        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Email Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Meeting Alerts</p>
                <p className="text-gray-400 text-sm">Receive emails when anomalies are detected</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Weekly Summary</p>
                <p className="text-gray-400 text-sm">Get a weekly digest of all meetings</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Storage Warnings</p>
                <p className="text-gray-400 text-sm">Alert when storage is running low</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white mb-1">Security Updates</p>
                <p className="text-gray-400 text-sm">Important security announcements</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300" onClick={() => toast.info('Settings reset to defaults')}>Test Notifications</Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black" onClick={() => toast.info('Settings saved')}>Save Changes</Button>
      </div>
    </div>
  );
}

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-[#2a2a3e] text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
