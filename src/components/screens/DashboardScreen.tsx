import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Progress } from '../ui/progress';
import { AlertTriangle, AlertCircle } from 'lucide-react';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings';

interface DashboardScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
}

export function DashboardScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail }: DashboardScreenProps) {
  const alerts = [
    {
      type: 'error',
      message: 'Anomalous facial micro-expression identified.',
      time: '2 minutes ago',
    },
    {
      type: 'warning',
      message: 'Unusual audio signature detected.',
      time: '5 minutes ago',
    },
    {
      type: 'warning',
      message: 'Unexpected shift in behavioral patterns.',
      time: '8 minutes ago',
    },
  ];

  const confidenceScores = [
    { label: 'Audio', value: 99, color: 'bg-cyan-400' },
    { label: 'Video', value: 97, color: 'bg-cyan-400' },
    { label: 'Behavior', value: 82, color: 'bg-orange-400' },
  ];



  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="dashboard" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Dashboard" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} />
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-3 gap-6">
            {/* Live Trust Score */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-gray-400 text-sm mb-6">Live Trust Score</h3>
              
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-48 h-48">
                  {/* Circular progress */}
                  <svg className="w-48 h-48 transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="#2a2a3e"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 88 * 0.98} ${2 * Math.PI * 88}`}
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-6xl text-white mb-1">98%</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-center text-gray-400 text-sm">Real-time Authenticity</p>
              
              <div className="mt-4 h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                <div className="h-full w-[98%] bg-gradient-to-r from-cyan-400 to-blue-500"></div>
              </div>
            </div>

            {/* Meeting Summary */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-6">Meeting Summary</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Title:</span>
                  <span className="text-white">Q3 Financial Review</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Duration:</span>
                  <span className="text-white">00:42:15</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Participants:</span>
                  <span className="text-white">12</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Average Trust Score:</span>
                  <span className="text-cyan-400">96%</span>
                </div>
              </div>
            </div>

            {/* Live Alerts */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-6">Live Alerts</h3>
              
              <div className="space-y-4">
                {alerts.map((alert, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {alert.type === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-orange-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm mb-1">{alert.message}</p>
                      <p className="text-gray-500 text-xs">{alert.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Confidence Layer Scores */}
            <div className="col-span-3 bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-2">Confidence Layer Scores</h3>
              <p className="text-gray-400 text-sm mb-6">Live data from AI detection modules</p>
              
              <div className="space-y-5">
                {confidenceScores.map((score) => (
                  <div key={score.label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300">{score.label}</span>
                      <span className="text-white">{score.value}%</span>
                    </div>
                    <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${score.color} rounded-full`}
                        style={{ width: `${score.value}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}