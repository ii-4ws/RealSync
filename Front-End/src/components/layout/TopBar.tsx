import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { LogOut, User, Plus, PhoneOff } from 'lucide-react';
import { Button } from '../ui/button';
import { NotificationBell } from './NotificationBell';

interface TopBarProps {
  title: string;
  onSignOut?: () => void;
  onNavigate?: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
  isConnected?: boolean;
  activeSessionId?: string | null;
  onNewSession?: () => void;
  onEndSession?: () => void;
}

export function TopBar({ title, onSignOut, onNavigate, profilePhoto, userName, userEmail, isConnected = false, activeSessionId, onNewSession, onEndSession }: TopBarProps) {
  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <div className="h-20 bg-[#1a1a2e] border-b border-gray-800 px-8 flex items-center justify-between">
      <h1 className="text-white text-2xl">{title}</h1>

      <div className="flex items-center gap-4">
        {/* New / End Session */}
        {activeSessionId ? (
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2"
            onClick={onEndSession}
          >
            <PhoneOff className="w-4 h-4 mr-2" />
            End Session
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-cyan-400 hover:bg-cyan-500 text-black px-4 py-2"
            onClick={onNewSession}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Session
          </Button>
        )}

        {/* System Status */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#2a2a3e] rounded-lg">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? 'System Online' : 'System Offline'}
          </span>
        </div>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none">
            <Avatar className="w-10 h-10 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all">
              {profilePhoto ? (
                <img src={profilePhoto} alt="Profile" className="w-full h-full rounded-full object-cover" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-blue-500 text-white">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#1a1a2e] border border-gray-800 w-64" align="end">
            <DropdownMenuLabel className="text-gray-400 px-4 py-2">
              <div className="flex flex-col gap-1">
                <p className="text-white">{userName || 'User'}</p>
                <p className="text-sm text-gray-400">{userEmail || ''}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-800" />
            <DropdownMenuItem 
              className="text-gray-400 hover:bg-gray-800 hover:text-white cursor-pointer px-4 py-2"
              onClick={() => onNavigate?.('settings')}
            >
              <User className="w-4 h-4 mr-2" />
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-800" />
            <DropdownMenuItem className="text-red-400 hover:bg-gray-800 hover:text-red-300 cursor-pointer px-4 py-2" onClick={onSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}