import { useState, useRef } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Progress } from '../ui/progress';
import { User, Lock, SlidersHorizontal, Cloud, Bell, Upload } from 'lucide-react';
import { toast } from 'sonner';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';
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
  const [nameInput, setNameInput] = useState(userName || 'John Doe');
  const [emailInput, setEmailInput] = useState(userEmail || 'john.doe@company.com');

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

  const handleSaveChanges = () => {
    if (onSaveUserName && nameInput) {
      onSaveUserName(nameInput);
    }
    if (onSaveUserEmail && emailInput) {
      onSaveUserEmail(emailInput);
    }
    toast.success('Settings saved successfully!');
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
                  defaultValue={userName || "John Doe"}
                  className="bg-[#2a2a3e] border-gray-700 text-white"
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </div>
              
              <div>
                <Label className="text-gray-300 mb-2">Email Address</Label>
                <Input
                  type="email"
                  defaultValue={userEmail || "john.doe@company.com"}
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
                <Label className="text-gray-300 mb-2">Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger className="bg-[#2a2a3e] border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a3e] border-gray-700">
                    <SelectItem value="en">English (US)</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
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
                <span className="text-white text-4xl">JD</span>
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
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black" onClick={handleSaveChanges}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function PrivacySettings() {
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

        {/* Account Security */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
          <h3 className="text-white text-lg mb-4">Account Security</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white mb-1">Two-Factor Authentication</p>
                <p className="text-gray-400 text-sm">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Button className="bg-cyan-400 hover:bg-cyan-500 text-black">
                Enable 2FA
              </Button>
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

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300">
          Cancel
        </Button>
        <Button className="bg-cyan-400 hover:bg-cyan-500 text-black">
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function DetectionSettings() {
  const [sensitivity, setSensitivity] = useState([75]);
  const [alertThreshold, setAlertThreshold] = useState([60]);

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
              <span className="text-cyan-400">49%</span>
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
              <span className="text-white">180 GB</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-cyan-400 rounded"></div>
                <span className="text-gray-300">Analysis Data</span>
              </div>
              <span className="text-white">45 GB</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-purple-400 rounded"></div>
                <span className="text-gray-300">Other Files</span>
              </div>
              <span className="text-white">20 GB</span>
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