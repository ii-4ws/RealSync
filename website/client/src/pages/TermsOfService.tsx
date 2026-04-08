import { useEffect } from 'react';
import { Link } from 'wouter';
import logo from '@/assets/realsync-logo.png';

export default function TermsOfService() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#07090E] text-[#E6EDF3]">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#07090E]/80 backdrop-blur-md border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src={logo} alt="RealSync" className="h-7 w-7 object-contain" />
            <span className="font-headline font-bold text-[#E6EDF3]">RealSync</span>
          </Link>
          <Link href="/" className="text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-32">
        <h1 className="font-headline text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-[#484F58] text-sm mb-10">Last updated: March 11, 2026</p>

        <div className="space-y-8 text-[#8B949E] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the RealSync website at real-sync.app, you agree to be
              bound by these Terms of Service. If you do not agree to these terms, please
              do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">2. Service Description</h2>
            <p>
              RealSync is a real-time meeting authenticity platform that provides deepfake
              detection, emotion analysis, and identity verification for online meetings.
              Currently, our website offers a waitlist signup and contact form. Access to the
              full platform will be provided upon launch.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">3. Waitlist</h2>
            <p>
              By joining our waitlist, you consent to receive email notifications about
              product updates and launch information. You may unsubscribe at any time by
              contacting us at{' '}
              <a href="mailto:info@real-sync.app" className="text-[#3B82F6] hover:underline">
                info@real-sync.app
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">4. User Responsibilities</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Provide accurate and truthful information when signing up</li>
              <li>Do not attempt to disrupt or compromise the website or its services</li>
              <li>Do not use automated tools to scrape or interact with the website</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">5. Intellectual Property</h2>
            <p>
              All content, trademarks, logos, and intellectual property displayed on this
              website are owned by RealSync. You may not reproduce, distribute, or create
              derivative works without our written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">6. Limitation of Liability</h2>
            <p>
              RealSync is provided "as is" without warranties of any kind. We shall not be
              liable for any indirect, incidental, or consequential damages arising from the
              use of our website or services. Our AI-powered detection tools are designed to
              assist in identifying potential threats but do not guarantee absolute accuracy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">7. Modifications</h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. Changes
              will be posted on this page with an updated revision date. Continued use of
              the website after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">8. Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with the laws
              of Australia. Any disputes shall be resolved in the courts of New South Wales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">9. Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at{' '}
              <a href="mailto:info@real-sync.app" className="text-[#3B82F6] hover:underline">
                info@real-sync.app
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
