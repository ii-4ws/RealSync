import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { User, Lock, SlidersHorizontal, Cloud, Bell, Upload, ShieldCheck, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';

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
}

export function SettingsScreen({ onNavigate, onSignOut, profilePhoto, onSaveProfilePhoto, userName, onSaveUserName, userEmail, onSaveUserEmail }: SettingsScreenProps) {
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
        <TopBar title="Settings" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />
        
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

  // Sync local state when props change (e.g. after profile load)
  useEffect(() => { setNameInput(userName || ''); }, [userName]);
  useEffect(() => { setEmailInput(userEmail || ''); }, [userEmail]);

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
      if (!file.type.match(/image\/(jpg|jpeg|png|gif)/)) {
        toast.error('Please upload a JPG, PNG, or GIF image');
        return;
      }

      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        if (onSaveProfilePhoto) {
          onSaveProfilePhoto(reader.result as string);
          toast.success('Profile photo updated successfully!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);

    // Update local state
    if (onSaveUserName && nameInput) {
      onSaveUserName(nameInput);
    }
    if (onSaveUserEmail && emailInput) {
      onSaveUserEmail(emailInput);
    }

    // Persist to Supabase profiles table
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .update({
            username: nameInput.trim() || null,
            avatar_url: profilePhoto || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) {
          console.error('Failed to save profile to Supabase:', error);
          toast.error('Failed to save profile to server.');
          setIsSaving(false);
          return;
        }
      }
    } catch (err) {
      console.error('Unexpected error saving profile:', err);
    }

    toast.success('Settings saved successfully!');
    setIsSaving(false);
  };

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
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </div>
              
              <div>
                <Label className="text-gray-300 mb-2">Email Address</Label>
                <Input
                  type="email"
                  value={emailInput}
                  className="bg-[#2a2a3e] border-gray-700 text-white"
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>
              
              <div>
                <Label className="text-gray-300 mb-2">Job Title</Label>
                <Input
                  defaultValue="Security Analyst"
                  className="bg-[#2a2a3e] border-gray-700 text-white"
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
        </div>

        {/* Profile Photo */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 h-fit">
          <h3 className="text-white text-lg mb-4">Profile Photo</h3>
          
          <div className="flex flex-col items-center">
            <div className="w-32 h-32 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center mb-4">
              {profilePhoto ? (
                <img src={profilePhoto} alt="Profile" className="w-full h-full rounded-full" />
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
            
            <p className="text-gray-400 text-xs text-center">
              JPG, PNG or GIF. Max size 2MB.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300">
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
  // ── 2FA State ──
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [qrUri, setQrUri] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

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
      console.error('2FA enrollment error:', err);
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

        {/* Account Security — 2FA */}
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
                  >
                    Disable
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

      {/* ── 2FA Enrollment Modal (portal to body to escape overflow clipping) ── */}
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

/* ── 2FA Enrollment Modal (compact, with 6 individual digit boxes) ── */
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
  const digits = verifyCode.padEnd(6, '').slice(0, 6).split('');

  const focusInput = useCallback((idx: number) => {
    inputRefs.current[idx]?.focus();
  }, []);

  // Auto-focus first box on mount
  useEffect(() => { focusInput(0); }, [focusInput]);

  const handleDigitChange = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1); // only last digit typed
    const arr = verifyCode.padEnd(6, ' ').split('');
    arr[idx] = digit;
    const next = arr.join('').replace(/ /g, '');
    setVerifyCode(next);
    setEnrollError(null);
    // Auto-advance to next box
    if (digit && idx < 5) focusInput(idx + 1);
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const arr = verifyCode.padEnd(6, ' ').split('');
      if (arr[idx] !== ' ' && arr[idx] !== '') {
        arr[idx] = ' ';
        setVerifyCode(arr.join('').replace(/ /g, ''));
      } else if (idx > 0) {
        focusInput(idx - 1);
        arr[idx - 1] = ' ';
        setVerifyCode(arr.join('').replace(/ /g, ''));
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
    setVerifyCode(pasted);
    setEnrollError(null);
    focusInput(Math.min(pasted.length, 5));
  };

  return (
    <>
      {/* Backdrop — separate layer, no backdrop-blur to avoid containing-block issues */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60"
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Modal card — absolutely positioned in center of viewport */}
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
                  value={digits[i]?.trim() || ''}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="flex-shrink-0 w-10 h-12 bg-[#0f0f1e] border border-gray-700 rounded-lg text-white text-center text-xl font-mono focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-colors"
                />
              ))}
              <span className="text-gray-500 text-lg font-bold flex-shrink-0">—</span>
              {[3, 4, 5].map((i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digits[i]?.trim() || ''}
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

function DetectionSettings() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">Detection Settings</h2>
      
      <div className="space-y-6">
        {/* Detection Modes */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Detection Modes</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Facial Analysis</p>
                <p className="text-gray-400 text-sm">
                  Detect facial anomalies and micro-expressions
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Voice Pattern Detection</p>
                <p className="text-gray-400 text-sm">
                  Analyze audio for synthetic voice patterns
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white mb-1">Emotion Detection</p>
                <p className="text-gray-400 text-sm">
                  Monitor emotional states and micro-expressions
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300">
          Reset to Default
        </Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black">
          Save Changes
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
        {/* Storage Usage */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Storage Usage</h3>
          
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-gray-300">245 GB used of 500 GB</span>
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
              <span className="text-white font-mono">180 GB</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-cyan-400 rounded"></div>
                <span className="text-gray-300">Analysis Data</span>
              </div>
              <span className="text-white font-mono">45 GB</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-purple-400 rounded"></div>
                <span className="text-gray-300">Other Files</span>
              </div>
              <span className="text-white font-mono">20 GB</span>
            </div>
          </div>
        </div>

        {/* Backup Settings */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Backup Settings</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Automatic Backup</p>
                <p className="text-gray-400 text-sm">
                  Automatically backup all meeting data
                </p>
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
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300">
          Manage Storage
        </Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black">
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-white text-2xl mb-6">Notifications</h2>
      
      <div className="space-y-6">
        {/* Email Notifications */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Email Notifications</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Meeting Alerts</p>
                <p className="text-gray-400 text-sm">
                  Receive emails when anomalies are detected
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Weekly Summary</p>
                <p className="text-gray-400 text-sm">
                  Get a weekly digest of all meetings
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white mb-1">Storage Warnings</p>
                <p className="text-gray-400 text-sm">
                  Alert when storage is running low
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white mb-1">Security Updates</p>
                <p className="text-gray-400 text-sm">
                  Important security announcements
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300">
          Test Notifications
        </Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black">
          Save Changes
        </Button>
      </div>
    </div>
  );
}