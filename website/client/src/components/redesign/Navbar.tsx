import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import logo from '@/assets/realsync-logo.png';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
];

function smoothScroll(href: string) {
  const el = document.querySelector(href);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('#hero');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy: track which section is in view
  useEffect(() => {
    const sectionIds = ['#hero', '#threat', '#demo', '#features', '#how-it-works', '#proof', '#cta'];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(`#${entry.target.id}`);
          }
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );

    sectionIds.forEach((id) => {
      const el = document.querySelector(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    smoothScroll(href);
  };

  const isActive = (href: string) => {
    if (href === '#features') return activeSection === '#features' || activeSection === '#threat' || activeSection === '#demo';
    return activeSection === href;
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#07090E]/90 backdrop-blur-md border-b border-white/[0.06] shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <a
          href="#hero"
          onClick={(e) => handleNavClick(e, '#hero')}
          className="flex items-center gap-3"
        >
          <img src={logo} alt="RealSync" className="h-10 w-10 object-contain" />
          <span className="font-headline font-bold text-lg text-[#E6EDF3] tracking-tight">
            RealSync
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className={`text-sm transition-colors font-medium ${
                isActive(link.href)
                  ? 'text-[#E6EDF3]'
                  : 'text-[#8B949E] hover:text-[#E6EDF3]'
              }`}
            >
              {link.label}
              {isActive(link.href) && (
                <span className="block h-0.5 mt-0.5 bg-[#3B82F6] rounded-full" />
              )}
            </a>
          ))}
          <a
            href="#cta"
            onClick={(e) => handleNavClick(e, '#cta')}
            className="text-sm font-medium px-4 py-2 rounded-full bg-[#3B82F6] hover:bg-blue-600 text-white transition-colors glow-blue"
          >
            Join Waitlist
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0D1117]/95 backdrop-blur-md border-t border-white/[0.06]">
          <nav className="flex flex-col p-4 gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={`px-4 py-3 text-sm rounded-lg transition-colors font-medium ${
                  isActive(link.href)
                    ? 'text-[#E6EDF3] bg-white/[0.06]'
                    : 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-white/[0.04]'
                }`}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#cta"
              onClick={(e) => handleNavClick(e, '#cta')}
              className="mt-2 text-center text-sm font-medium px-4 py-3 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white transition-colors"
            >
              Join Waitlist
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
