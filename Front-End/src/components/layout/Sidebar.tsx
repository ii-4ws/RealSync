import { LayoutDashboard, Video, FileText, Settings, HelpCircle, Mail } from 'lucide-react';
import logo from 'figma:asset/4401d6799dc4e6061a79080f8825d69ae920f198.png';
import logoLight from '../../assets/realsync-logo-light.png';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useTheme } from '../../contexts/ThemeContext';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';

interface SidebarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

export function Sidebar({ currentScreen, onNavigate }: SidebarProps) {
  const { resolvedTheme } = useTheme();
  const activeLogo = resolvedTheme === 'light' ? logoLight : logo;
  const menuItems = [
    { id: 'dashboard' as Screen, icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'sessions' as Screen, icon: Video, label: 'Sessions' },
    { id: 'reports' as Screen, icon: FileText, label: 'Reports' },
    { id: 'settings' as Screen, icon: Settings, label: 'Settings' },
  ];

  const handleEmailSupport = () => {
    window.location.href = 'mailto:support@realsync.ai?subject=RealSync Support Request';
  };

  return (
    <div className="w-64 bg-[#1a1a2e] h-screen flex flex-col border-r border-gray-800">
      {/* Logo */}
      <div
        className="p-6 border-b border-gray-800 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => onNavigate('dashboard')}
      >
        <div className="flex justify-center">
          <img src={activeLogo} alt="RealSync Logo" className="w-40 h-auto" />
        </div>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Help */}
      <div className="p-4 border-t border-gray-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentScreen === 'faq' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}>
              <HelpCircle className="w-5 h-5" />
              <span>Help</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#1a1a2e] border-gray-700 w-56" align="end">
            <DropdownMenuItem 
              className="text-gray-300 hover:bg-gray-800 hover:text-white cursor-pointer"
              onClick={() => onNavigate('faq')}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              FAQ
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-gray-300 hover:bg-gray-800 hover:text-white cursor-pointer"
              onClick={handleEmailSupport}
            >
              <Mail className="w-4 h-4 mr-2" />
              Email Us
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}