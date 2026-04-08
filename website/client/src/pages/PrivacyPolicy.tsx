import { useEffect } from 'react';
import { Link } from 'wouter';
import logo from '@/assets/realsync-logo.png';

export default function PrivacyPolicy() {
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
        <h1 className="font-headline text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-[#484F58] text-sm mb-10">Last updated: March 11, 2026</p>

        <div className="space-y-8 text-[#8B949E] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">1. Introduction</h2>
            <p>
              RealSync ("we", "our", "us") is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, and safeguard your
              information when you visit our website at real-sync.app and use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following information when you interact with our platform:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-[#E6EDF3]">Waitlist signup:</strong> First name, last name, and email address</li>
              <li><strong className="text-[#E6EDF3]">Contact form:</strong> Name, email, and message content</li>
              <li><strong className="text-[#E6EDF3]">Usage data:</strong> Anonymous page views and interactions (no personal identifiers)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>To add you to our waitlist and notify you about product launches</li>
              <li>To respond to your inquiries submitted through our contact form</li>
              <li>To improve our website and services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">4. Data Storage &amp; Security</h2>
            <p>
              Your data is stored securely using <strong className="text-[#E6EDF3]">Supabase</strong> (hosted on AWS infrastructure)
              with row-level security enabled. All data is encrypted in transit (TLS) and at rest.
              We use industry-standard security measures to protect your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">5. Email Communications</h2>
            <p>
              We use <strong className="text-[#E6EDF3]">Resend</strong> as our email service provider to send
              transactional emails (waitlist confirmations, contact form replies). We will not send
              unsolicited marketing emails without your explicit consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">6. Third-Party Sharing</h2>
            <p>
              We do <strong className="text-[#E6EDF3]">not</strong> sell, trade, or share your personal
              information with third parties, except for the service providers mentioned above
              (Supabase for storage, Resend for email delivery) which are necessary to operate our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2 mt-2">
              <li>Request access to the personal data we hold about you</li>
              <li>Request correction or deletion of your personal data</li>
              <li>Withdraw from the waitlist at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes will be
              posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-3">9. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at{' '}
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
