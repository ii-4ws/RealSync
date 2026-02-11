import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Input } from '../ui/input';
import { Search, ChevronDown, ChevronUp, Mail } from 'lucide-react';
import { useState } from 'react';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';

interface FAQScreenProps {
  onNavigate: (screen: Screen) => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
}

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  {
    category: 'Getting Started',
    question: 'What is RealSync and how does it work?',
    answer: 'RealSync is an AI-powered real-time meeting security platform that detects deepfakes and provides trust scores during video meetings. It uses advanced facial analysis, voice pattern detection, and behavioral analysis to identify potential security threats in real-time.'
  },
  {
    category: 'Getting Started',
    question: 'How do I start monitoring a meeting?',
    answer: 'Simply join your video meeting as normal. RealSync runs in the background and automatically begins analyzing participants once the meeting starts. You\'ll see real-time trust scores in the Dashboard.'
  },
  {
    category: 'Detection & Security',
    question: 'What types of deepfakes can RealSync detect?',
    answer: 'RealSync can detect various types of deepfakes including face swaps, facial reenactment, lip-sync manipulations, and AI-generated synthetic faces. It also detects voice cloning and audio manipulation attempts.'
  },
  {
    category: 'Detection & Security',
    question: 'How accurate is the deepfake detection?',
    answer: 'RealSync uses state-of-the-art AI models with over 95% accuracy in detecting deepfakes. The system continuously learns and improves from new data. You can adjust sensitivity settings in Settings → Detection Settings.'
  },
  {
    category: 'Detection & Security',
    question: 'What should I do if an alert is triggered?',
    answer: 'When an alert is triggered, verify the participant\'s identity through alternative means (phone call, verification question, etc.). Review the detailed analysis in the Reports section. If confirmed as a threat, end the meeting and report the incident.'
  },
  {
    category: 'Privacy & Data',
    question: 'Is my meeting data stored or recorded?',
    answer: 'Meeting data is only stored if you enable recording in your settings. All analysis data is encrypted and stored securely in the cloud. You have full control over data retention policies in Settings → Cloud Storage.'
  },
  {
    category: 'Privacy & Data',
    question: 'Who has access to my meeting analysis?',
    answer: 'Only you and authorized team members in your organization can access meeting analysis data. All data is encrypted end-to-end and follows enterprise-grade security standards.'
  },
  {
    category: 'Privacy & Data',
    question: 'Can I delete my meeting data?',
    answer: 'Yes, you can delete individual meeting records or bulk delete data from the Sessions screen. You can also configure automatic deletion policies in Settings → Cloud Storage.'
  },
  {
    category: 'Account & Settings',
    question: 'How do I adjust detection sensitivity?',
    answer: 'Go to Settings → Detection Settings to adjust sensitivity levels. Higher sensitivity catches more potential threats but may increase false positives. We recommend starting at 75% and adjusting based on your needs.'
  },
  {
    category: 'Account & Settings',
    question: 'Can I customize alert notifications?',
    answer: 'Yes, navigate to Settings → Notifications to customize email and push notifications. You can choose to receive real-time alerts, weekly summaries, or only critical security updates.'
  },
  {
    category: 'Troubleshooting',
    question: 'Why am I not seeing trust scores for some participants?',
    answer: 'Trust scores require clear video and audio input. Participants with cameras off, poor connections, or audio-only participation may not show trust scores. Ensure good lighting and camera quality for best results.'
  },
  {
    category: 'Troubleshooting',
    question: 'The system is showing false positives. What can I do?',
    answer: 'Lower the detection sensitivity in Settings → Detection Settings. False positives can occur with poor lighting, low camera quality, or unusual backgrounds. You can also disable specific detection modes if they\'re causing issues.'
  },
];

export function FAQScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail }: FAQScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleQuestion = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(faqs.map(faq => faq.category)));

  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="faq" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Help & Support" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-white text-3xl mb-2">Frequently Asked Questions</h1>
              <p className="text-gray-400">Find answers to common questions about RealSync</p>
            </div>

            {/* Search */}
            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search FAQs..."
                className="pl-10 bg-[#1a1a2e] border-gray-700 text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Contact Support Card */}
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="bg-cyan-500/20 p-3 rounded-lg">
                  <Mail className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white text-lg mb-1">Can't find what you're looking for?</h3>
                  <p className="text-gray-300 mb-3">Our support team is here to help you with any questions.</p>
                  <a 
                    href="mailto:support@realsync.ai?subject=RealSync Support Request"
                    className="inline-flex items-center gap-2 bg-cyan-400 hover:bg-cyan-500 text-black px-4 py-2 rounded-lg transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Email Us
                  </a>
                </div>
              </div>
            </div>

            {/* FAQ Categories */}
            {categories.map((category) => {
              const categoryFaqs = filteredFaqs.filter(faq => faq.category === category);
              
              if (categoryFaqs.length === 0) return null;

              return (
                <div key={category} className="mb-8">
                  <h2 className="text-white text-xl mb-4">{category}</h2>
                  <div className="space-y-3">
                    {categoryFaqs.map((faq) => {
                      const globalIndex = faqs.indexOf(faq);
                      const isExpanded = expandedIndex === globalIndex;
                      
                      return (
                        <div
                          key={globalIndex}
                          className="bg-[#1a1a2e] border border-gray-800 rounded-lg overflow-hidden"
                        >
                          <button
                            onClick={() => toggleQuestion(globalIndex)}
                            className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
                          >
                            <span className="text-white text-left">{faq.question}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-cyan-400 flex-shrink-0 ml-4" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                            )}
                          </button>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-800">
                              <p className="text-gray-300">{faq.answer}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filteredFaqs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg mb-2">No FAQs found matching your search</p>
                <p className="text-gray-500">Try different keywords or contact support</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
