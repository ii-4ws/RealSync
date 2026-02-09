import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Eye, EyeOff, Lock, Mail, UserPlus, ScanFace, AlertTriangle, CheckCircle2, MailCheck, LogIn, RefreshCw } from 'lucide-react';
import logo from 'figma:asset/4401d6799dc4e6061a79080f8825d69ae920f198.png';
import { supabase } from '../../lib/supabaseClient';
import { isBlockedDomain } from '../../lib/blockedDomains';

// ── Password strength calculator ─────────────────────────────────────
function getPasswordStrength(pw: string): { score: number; label: string; barHex: string; textColor: string } {
  if (!pw) return { score: 0, label: '', barHex: '#374151', textColor: 'text-gray-500' };

  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: 'Weak', barHex: '#ef4444', textColor: 'text-red-400' };
  if (score === 2) return { score: 2, label: 'Fair', barHex: '#f97316', textColor: 'text-orange-400' };
  if (score === 3) return { score: 3, label: 'Good', barHex: '#eab308', textColor: 'text-yellow-400' };
  return { score: 4, label: 'Strong', barHex: '#4ade80', textColor: 'text-green-400' };
}

interface SignUpScreenProps {
  onSwitchToLogin: () => void;
}

export function SignUpScreen({ onSwitchToLogin }: SignUpScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const handleSignUp = async () => {
    setFormError(null);

    if (!email.trim() || !password || !confirmPassword) {
      setFormError('All fields are required.');
      return;
    }

    if (isBlockedDomain(email.trim())) {
      setFormError(
        'Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please use your corporate or institutional email address.'
      );
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setRegisteredEmail(email.trim());
    setSignupComplete(true);
  };

  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up resend cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  }, []);

  const handleResendEmail = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);

    await supabase.auth.resend({ type: 'signup', email: registeredEmail });

    setResending(false);
    setResendCooldown(60);

    // Clear any previous interval
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);

    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
          resendIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const strength = getPasswordStrength(password);

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-8 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a2e_1px,transparent_1px),linear-gradient(to_bottom,#1a1a2e_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left Side — Branding */}
        <div className="hidden lg:block space-y-8">
          <div className="mb-8">
            <img src={logo} alt="RealSync Logo" className="w-64 h-auto" />
          </div>

          <div>
            <h1 className="text-white text-4xl mb-4">
              Join RealSync
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Create your account to start protecting your meetings with AI-powered deepfake detection and real-time security analytics.
            </p>
          </div>

          {/* Domain notice */}
          <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-orange-500/10 to-transparent rounded-lg border border-orange-500/20">
            <div className="bg-orange-500/20 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-white mb-1">Corporate Email Required</h3>
              <p className="text-gray-400 text-sm">
                Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted.
                Please use your corporate or institutional email address to register.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side */}
        <div className="w-full">
          <div className="bg-[#1a1a2e]/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-800/50 shadow-2xl">
            {/* Mobile Logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src={logo} alt="RealSync Logo" className="w-48 h-auto" />
            </div>

            {signupComplete ? (
              /* ── Success Screen ─────────────────────────────────────── */
              <div className="text-center space-y-6 py-4">
                {/* Icon */}
                <div className="flex justify-center">
                  <div className="relative inline-block">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}>
                      <MailCheck className="w-8 h-8 text-white" strokeWidth={1.8} />
                    </div>
                    <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10b981', boxShadow: '0 0 0 3px #1a1a2e' }}>
                      <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>

                {/* Heading */}
                <h2 className="text-white text-3xl font-bold">Account created!</h2>

                {/* Success message box */}
                <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
                  Account created! Check your inbox for a confirmation email, then sign in.
                </div>

                {/* Subtitle */}
                <p className="text-gray-400 text-sm leading-relaxed px-4">
                  We've sent a verification link to your registered corporate email. Please verify your identity to unlock real-time deepfake protection.
                </p>

                {/* Back to Sign In button */}
                <Button
                  onClick={onSwitchToLogin}
                  className="w-full h-12 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/25 uppercase tracking-wider font-semibold"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>

                {/* Resend link */}
                <div className="space-y-1">
                  <p className="text-gray-500 text-sm">Didn't receive the email?</p>
                  <button
                    onClick={handleResendEmail}
                    disabled={resendCooldown > 0 || resending}
                    className={`text-sm font-semibold uppercase tracking-wider transition-colors ${
                      resendCooldown > 0 || resending
                        ? 'text-white/70 cursor-not-allowed'
                        : 'text-cyan-400 hover:text-cyan-300 underline underline-offset-2'
                    }`}
                  >
                    {resending ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Sending...
                      </span>
                    ) : resendCooldown > 0 ? (
                      `Resend in ${resendCooldown}s`
                    ) : (
                      'Resend Verification Email'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Sign Up Form ───────────────────────────────────────── */
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl mb-4">
                    <ScanFace className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-white text-2xl mb-2">Create Account</h2>
                  <p className="text-gray-400">
                    Sign up with your corporate email
                  </p>
                </div>

                {/* Form */}
                <div className="space-y-5">
                  {/* Email */}
                  <div>
                    <label className="text-gray-300 text-sm mb-2 block">Corporate Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12 pl-10 focus:border-cyan-400 focus:ring-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-gray-300 text-sm mb-2 block">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12 pl-10 pr-12 focus:border-cyan-400 focus:ring-cyan-400"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Password Strength Bar — continuous fill */}
                  {password && (
                    <div className="space-y-1.5 -mt-2">
                      <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.barHex }}
                        />
                      </div>
                      <p className={`text-xs ${strength.textColor}`}>
                        {strength.label}
                      </p>
                    </div>
                  )}

                  {/* Confirm Password */}
                  <div>
                    <label className="text-gray-300 text-sm mb-2 block">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-[#0f0f1e] border-gray-700 text-white placeholder:text-gray-500 h-12 pl-10 pr-12 focus:border-cyan-400 focus:ring-cyan-400"
                      />
                      <button
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                      >
                        {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Domain restriction notice (mobile) */}
                  <div className="lg:hidden text-xs text-gray-500 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <span>Personal emails (Gmail, Yahoo, etc.) not accepted</span>
                  </div>

                  {/* Sign Up Button */}
                  <Button
                    onClick={handleSignUp}
                    disabled={isSubmitting}
                    className="w-full h-12 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/25"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    {isSubmitting ? 'Creating Account...' : 'Create Account'}
                  </Button>

                  {/* Error */}
                  {formError && (
                    <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      {formError}
                    </div>
                  )}
                </div>

                {/* Footer — switch to login */}
                <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                  <p className="text-gray-400 text-sm">
                    Already have an account?{' '}
                    <button
                      onClick={onSwitchToLogin}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Sign In
                    </button>
                  </p>
                </div>

                {/* Trust Badge */}
                <div className="mt-6 flex items-center justify-center gap-2 text-gray-500 text-xs">
                  <Lock className="w-3 h-3" />
                  <span>Protected by 256-bit SSL encryption</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
