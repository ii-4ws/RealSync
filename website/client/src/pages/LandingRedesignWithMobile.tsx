import Navbar from '@/components/redesign/Navbar';
import ScrollProgress from '@/components/redesign/ScrollProgress';
import HeroSection from '@/components/redesign/HeroSection';
import ThreatSection from '@/components/redesign/ThreatSection';
import DetectionDemo from '@/components/redesign/DetectionDemo';
import FeaturesSection from '@/components/redesign/FeaturesSection';
import HowItWorksSection from '@/components/redesign/HowItWorksSection';
import SocialProofSection from '@/components/redesign/SocialProofSection';
import MobileAppSection from '@/components/redesign/MobileAppSection';
import CtaSection from '@/components/redesign/CtaSection';
import FooterSection from '@/components/redesign/FooterSection';

export default function LandingRedesign() {
  return (
    <div className="dark font-body bg-[#07090E] min-h-screen text-[#E6EDF3]">
      <ScrollProgress />
      <Navbar />

      <HeroSection />
      <ThreatSection />
      <DetectionDemo />
      <FeaturesSection />
      <HowItWorksSection />
      <SocialProofSection />
      <MobileAppSection />
      <CtaSection />

      <FooterSection />
    </div>
  );
}
