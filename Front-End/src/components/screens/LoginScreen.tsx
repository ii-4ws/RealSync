import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Eye, EyeOff, Shield, Lock, Mail, Check, ScanFace } from 'lucide-react';
import logo from 'figma:asset/4401d6799dc4e6061a79080f8825d69ae920f198.png';
import { supabase } from '../../lib/supabaseClient';

export function LoginScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setFormError('Email and password are required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setFormError(error.message);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-8 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a2e_1px,transparent_1px),linear-gradient(to_bottom,#1a1a2e_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left Side - Branding & Features */}
        <div className="hidden lg:block space-y-8">
          {/* Logo */}
          <div className="mb-8">
            <img src={logo} alt="RealSync Logo" className="w-64 h-auto" />
          </div>

          {/* Tagline */}
          <div>
            <h1 className="text-white text-4xl mb-4">
              AI-Powered Meeting Security
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Detect deepfakes in real-time and ensure the authenticity of your video conferences with enterprise-grade AI protection.
            </p>
          </div>

          {/* Security Features */}
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-cyan-500/10 to-transparent rounded-lg border border-cyan-500/20">
              <div className="bg-cyan-500/20 p-2 rounded-lg">
                <Check className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-white mb-1">Real-Time Detection</h3>
                <p className="text-gray-400 text-sm">
                  Advanced AI models analyze video feeds instantly
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-blue-500/10 to-transparent rounded-lg border border-blue-500/20">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Check className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white mb-1">Enterprise Security</h3>
                <p className="text-gray-400 text-sm">
                  Bank-level encryption and compliance standards
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-orange-500/10 to-transparent rounded-lg border border-orange-500/20">
              <div className="bg-orange-500/20 p-2 rounded-lg">
                <Check className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-white mb-1">Trust Scores</h3>
                <p className="text-gray-400 text-sm">
                  Live participant verification and confidence metrics
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full">
          <div className="bg-[#1a1a2e]/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-800/50 shadow-2xl">
            {/* Mobile Logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src={logo} alt="RealSync Logo" className="w-48 h-auto" />
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl mb-4">
                <ScanFace className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-white text-2xl mb-2">Welcome Back</h2>
              <p className="text-gray-400">
                Sign in to access your security dashboard
              </p>
            </div>

            {/* Login Form */}
            <div className="space-y-6">
              {/* Email Input */}
              <div>
                <label className="text-gray-300 text-sm mb-2 block">Email Address</label>
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

              {/* Password Input */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-gray-300 text-sm">Password</label>
                  <button className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors">
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
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

              {/* Sign In Button */}
              <Button
                onClick={handleSignIn}
                disabled={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/25"
              >
                <Shield className="w-4 h-4 mr-2" />
                {isSubmitting ? 'Signing In...' : 'Sign In Securely'}
              </Button>

              {formError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
                <span className="text-gray-500 text-sm">Or continue with</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
              </div>

              {/* SSO Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  className="h-11 bg-[#0f0f1e] border-gray-700 text-gray-300 hover:bg-gray-800 hover:border-gray-600 hover:text-white"
                >
                  <div className="w-5 h-5 bg-white rounded flex items-center justify-center text-xs mr-2">G</div>
                  Google
                </Button>
                <Button
                  variant="outline"
                  className="h-11 bg-[#0f0f1e] border-gray-700 text-gray-300 hover:bg-gray-800 hover:border-gray-600 hover:text-white"
                >
                  <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center text-xs text-white mr-2">M</div>
                  Microsoft
                </Button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-800 text-center">
              <p className="text-gray-400 text-sm">
                Need help getting started?{' '}
                <button className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  Contact Support
                </button>
              </p>
            </div>

            {/* Trust Badge */}
            <div className="mt-6 flex items-center justify-center gap-2 text-gray-500 text-xs">
              <Lock className="w-3 h-3" />
              <span>Protected by 256-bit SSL encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
