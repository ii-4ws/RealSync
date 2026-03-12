import { useState, useEffect, useMemo } from 'react';
import { Bell, AlertCircle, AlertTriangle, Info, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { useNotifications, type NotificationSeverity } from '../../contexts/NotificationContext';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'deepfake', label: 'Deepfake' },
  { key: 'emotion', label: 'Emotion' },
  { key: 'altercation', label: 'Threat' },
  { key: 'fraud', label: 'Fraud' },
  { key: 'scam', label: 'Scam' },
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]['key'];

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
    case 'high':
      return <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />;
    case 'medium':
      return <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
    case 'low':
      return <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />;
  }
}

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllRead,
    requestDesktopPermission,
    desktopPermission,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');

  // M23: Force re-render every 60s while open to refresh relative timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [open]);

  // Reset filter when popover closes
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setActiveFilter('all');
  };

  // Per-category unread counts
  const categoryUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      if (!n.read) {
        counts[n.category] = (counts[n.category] || 0) + 1;
      }
    }
    return counts;
  }, [notifications]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    return notifications.filter((n) => n.category === activeFilter);
  }, [notifications, activeFilter]);

  // Display label for empty state
  const filterLabel = CATEGORY_FILTERS.find((f) => f.key === activeFilter)?.label ?? activeFilter;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg bg-[#2a2a3e] hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
          style={{ overflow: 'visible' }}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="w-5 h-5 text-gray-300" />
          {unreadCount > 0 && (
            <span
              className="min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 pointer-events-none"
              style={{ position: 'absolute', top: '-4px', right: '-4px' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-0 bg-[#1a1a2e] border-gray-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-white text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Category filter pills */}
        <div className="px-3 py-2 border-b border-gray-800 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORY_FILTERS.map((filter) => {
              const isActive = activeFilter === filter.key;
              const badge = filter.key === 'all' ? unreadCount : (categoryUnreadCounts[filter.key] || 0);
              return (
                <button
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                  }`}
                >
                  {filter.label}
                  {badge > 0 && (
                    <span className={`min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                      isActive ? 'bg-cyan-800 text-cyan-200' : 'bg-gray-700 text-gray-300'
                    }`}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop permission banner */}
        {desktopPermission === 'default' && (
          <div className="px-4 py-2.5 bg-cyan-950/30 border-b border-gray-800">
            <p className="text-xs text-gray-400 mb-1.5">Enable desktop notifications to get alerts when this tab is in the background.</p>
            <Button
              size="sm"
              className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={requestDesktopPermission}
            >
              Enable Desktop Notifications
            </Button>
          </div>
        )}

        {/* Notification list */}
        <ScrollArea className="max-h-[400px]">
          {filteredNotifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">
                {activeFilter === 'all' ? 'No notifications yet' : `No ${filterLabel.toLowerCase()} alerts`}
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {activeFilter === 'all'
                  ? 'Alerts will appear here during active sessions'
                  : 'Try selecting a different category'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {filteredNotifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-800/40 transition-colors ${
                    !notification.read ? 'bg-cyan-950/10' : ''
                  }`}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead([notification.id]);
                    }
                  }}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5">
                      <SeverityIcon severity={notification.severity} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium truncate">{notification.title}</p>
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{notification.message}</p>
                      {notification.recommendation && (
                        <p className="text-cyan-400/80 text-xs mt-1 italic line-clamp-2">
                          Recommended: {notification.recommendation}
                        </p>
                      )}
                      <p className="text-gray-600 text-[10px] mt-1">{formatRelativeTime(notification.ts)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
