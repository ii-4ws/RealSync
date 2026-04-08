import { Linkedin, Instagram, Mail } from 'lucide-react';
import { Link } from 'wouter';
import logo from '@/assets/realsync-logo.png';

export default function FooterSection() {
  return (
    <footer className="relative border-t border-white/[0.04] bg-[#07090E]">
      {/* Gradient top border accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#3B82F6]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="RealSync" className="h-7 w-7 object-contain" />
            <span className="font-headline font-bold text-[#E6EDF3]">RealSync</span>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-4">
            <a href="https://www.linkedin.com/company/real-sync-ai/" target="_blank" rel="noopener noreferrer" className="text-[#484F58] hover:text-[#E6EDF3] transition-colors" aria-label="LinkedIn">
              <Linkedin className="w-4 h-4" />
            </a>
            <a href="https://www.instagram.com/realsync_ai" target="_blank" rel="noopener noreferrer" className="text-[#484F58] hover:text-[#E6EDF3] transition-colors" aria-label="Instagram">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="mailto:info@real-sync.app" className="text-[#484F58] hover:text-[#E6EDF3] transition-colors" aria-label="Email">
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#484F58]">
            &copy; {new Date().getFullYear()} RealSync. All rights reserved.
          </p>
          <p className="text-xs text-[#484F58] text-center">
            CSIT321 Graduation Project &mdash; University of Wollongong in Dubai
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-xs text-[#484F58] hover:text-[#E6EDF3] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-[#484F58] hover:text-[#E6EDF3] transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
