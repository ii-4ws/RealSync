import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { MoreVertical, Plus, ChevronLeft, ChevronRight, Eye, Download, Archive, Video, Clock, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { authFetch } from '../../lib/api';

type MeetingType = 'official' | 'business' | 'friends';

interface ScheduledSession {
  sessionId: string;
  title: string;
  meetingType: MeetingType;
  meetingUrl: string;
  scheduledAt: string; // ISO string
  status: 'waiting' | 'joining' | 'joined';
}

interface SessionsScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
  onStartSession?: (sessionId: string, title: string, meetingType: MeetingType) => void;
}

/** Validate that a string looks like a Zoom meeting URL */
function isValidZoomUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.hostname === 'zoom.us' || parsed.hostname.endsWith('.zoom.us') ||
            parsed.hostname === 'zoom.com' || parsed.hostname.endsWith('.zoom.com')) &&
           parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Format a date string for the datetime-local input min value */
function toLocalDatetimeStr(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

/** Get a human-readable countdown string */
function getCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return 'Now';
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours > 0) return `${hours}h ${remainMins}m`;
  return `${remainMins}m`;
}

export function SessionsScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail, onStartSession }: SessionsScreenProps) {
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [meetingName, setMeetingName] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('business');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);

  // Scheduled sessions waiting to auto-join
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>([]);
  const scheduledTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Countdown ticker — re-render every 30s to update countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    if (scheduledSessions.length === 0) return;
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, [scheduledSessions.length]);

  /** Join a meeting: POST /api/sessions/:id/join */
  const joinMeeting = useCallback(
    async (sessionId: string, url: string, title: string, type: MeetingType) => {
      try {
        const joinRes = await authFetch(`/api/sessions/${sessionId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingUrl: url, displayName: 'RealSync Bot' }),
        });
        if (!joinRes.ok) {
          const err = await joinRes.json().catch(() => null);
          throw new Error(err?.error || 'Failed to join meeting');
        }
        toast.success(`Bot joining: ${title}`);
        onStartSession?.(sessionId, title, type);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to join meeting');
      }
    },
    [onStartSession],
  );

  /** Schedule a session to auto-join at the given time */
  const scheduleAutoJoin = useCallback(
    (entry: ScheduledSession) => {
      const delayMs = new Date(entry.scheduledAt).getTime() - Date.now();
      if (delayMs <= 0) {
        // Time has already passed — join now
        joinMeeting(entry.sessionId, entry.meetingUrl, entry.title, entry.meetingType);
        setScheduledSessions((prev) =>
          prev.map((s) => (s.sessionId === entry.sessionId ? { ...s, status: 'joining' as const } : s)),
        );
        return;
      }
      const timer = setTimeout(() => {
        joinMeeting(entry.sessionId, entry.meetingUrl, entry.title, entry.meetingType);
        setScheduledSessions((prev) =>
          prev.map((s) => (s.sessionId === entry.sessionId ? { ...s, status: 'joining' as const } : s)),
        );
        scheduledTimersRef.current.delete(entry.sessionId);
      }, delayMs);
      scheduledTimersRef.current.set(entry.sessionId, timer);
    },
    [joinMeeting],
  );

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      scheduledTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleCreateSession = async () => {
    if (!meetingName.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }

    // Validate Zoom URL if provided
    if (meetingUrl.trim() && !isValidZoomUrl(meetingUrl.trim())) {
      toast.error('Please enter a valid Zoom meeting URL (e.g. https://us05web.zoom.us/j/...)');
      return;
    }

    // Validate scheduled time if provided
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate.getTime() < Date.now() - 60000) {
        toast.error('Scheduled time must be in the future');
        return;
      }
    }

    setCreating(true);
    try {
      const body: Record<string, string> = {
        title: meetingName.trim(),
        meetingType,
      };
      if (meetingUrl.trim()) body.meetingUrl = meetingUrl.trim();
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();

      const response = await authFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || 'Failed to create session');
      }

      const data = (await response.json()) as { sessionId: string };

      // Determine flow based on URL + scheduled time
      const hasUrl = !!meetingUrl.trim();
      const hasSchedule = !!scheduledAt;

      if (hasUrl && hasSchedule) {
        // Scheduled meeting — add to scheduled list, auto-join at time
        const entry: ScheduledSession = {
          sessionId: data.sessionId,
          title: meetingName.trim(),
          meetingType,
          meetingUrl: meetingUrl.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          status: 'waiting',
        };
        setScheduledSessions((prev) => [...prev, entry]);
        scheduleAutoJoin(entry);
        toast.success(`Session scheduled — bot will join at ${new Date(scheduledAt).toLocaleTimeString()}`);
      } else if (hasUrl) {
        // Immediate join — create + join + navigate to dashboard
        toast.success('Session created — joining meeting...');
        await joinMeeting(data.sessionId, meetingUrl.trim(), meetingName.trim(), meetingType);
      } else {
        // No URL — just create session and go to dashboard (local mic mode)
        toast.success('Session started');
        onStartSession?.(data.sessionId, meetingName.trim(), meetingType);
      }

      // Reset form
      setMeetingName('');
      setMeetingType('business');
      setMeetingUrl('');
      setScheduledAt('');
      setIsNewSessionOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  /** Manual "Join Now" for a scheduled session */
  const handleJoinNow = (entry: ScheduledSession) => {
    // Cancel the timer
    const timer = scheduledTimersRef.current.get(entry.sessionId);
    if (timer) {
      clearTimeout(timer);
      scheduledTimersRef.current.delete(entry.sessionId);
    }
    setScheduledSessions((prev) =>
      prev.map((s) => (s.sessionId === entry.sessionId ? { ...s, status: 'joining' as const } : s)),
    );
    joinMeeting(entry.sessionId, entry.meetingUrl, entry.title, entry.meetingType);
  };

  /** Cancel a scheduled session */
  const handleCancelScheduled = (sessionId: string) => {
    const timer = scheduledTimersRef.current.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      scheduledTimersRef.current.delete(sessionId);
    }
    setScheduledSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    toast('Scheduled session cancelled');
  };

  // ── Real session history from API ──────────────────────────────────
  interface HistorySession {
    id: string;
    title: string;
    createdAt: string;
    endedAt: string | null;
    meetingType: string;
    status: string;
  }

  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;

  // Fetch sessions from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/sessions');
        if (!res.ok) throw new Error('Failed to fetch sessions');
        const data = await res.json();
        if (!cancelled) {
          // The API returns an array of session summaries
          const sessions = Array.isArray(data) ? data : (data.sessions ?? []);
          setHistorySessions(sessions);
        }
      } catch {
        // Silently fail — empty list
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Paginated slice
  const totalPages = Math.max(1, Math.ceil(historySessions.length / PAGE_SIZE));
  const paginatedSessions = historySessions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  /** Format duration from createdAt/endedAt */
  function formatDuration(createdAt: string, endedAt: string | null): string {
    if (!endedAt) return 'Active';
    const ms = new Date(endedAt).getTime() - new Date(createdAt).getTime();
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** Compute stats from real data */
  const stats = [
    { label: 'Total Sessions', value: String(historySessions.length) },
    { label: 'Active', value: String(historySessions.filter((s) => !s.endedAt).length) },
    { label: 'Completed', value: String(historySessions.filter((s) => s.endedAt).length) },
    { label: 'This Page', value: `${paginatedSessions.length} of ${historySessions.length}` },
  ];

  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="sessions" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Live Meetings / Sessions" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />
        
        <div className="flex-1 overflow-y-auto p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
                <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
                <p className="text-white text-3xl font-mono">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Sessions Table */}
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-white text-xl">Session History</h2>
              <Button className="bg-cyan-400 hover:bg-cyan-500 text-black" onClick={() => setIsNewSessionOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Session
              </Button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                <span className="ml-3 text-gray-400">Loading sessions…</span>
              </div>
            ) : historySessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Video className="w-10 h-10 mb-3 text-gray-600" />
                <p className="text-lg text-gray-400 mb-1">No sessions yet</p>
                <p className="text-sm">Create a new session to get started.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-12">
                          <Checkbox className="border-gray-600" />
                        </TableHead>
                        <TableHead className="text-gray-400">Session ID</TableHead>
                        <TableHead className="text-gray-400">Title</TableHead>
                        <TableHead className="text-gray-400">Date & Time</TableHead>
                        <TableHead className="text-gray-400">Duration</TableHead>
                        <TableHead className="text-gray-400">Type</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSessions.map((session) => {
                        const isActive = !session.endedAt;
                        const statusLabel = isActive ? 'active' : 'completed';
                        return (
                          <TableRow key={session.id} className="border-gray-800 hover:bg-[#2a2a3e]">
                            <TableCell>
                              <Checkbox className="border-gray-600" />
                            </TableCell>
                            <TableCell className="text-cyan-400 font-mono text-xs">
                              {session.id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-white">{session.title}</TableCell>
                            <TableCell className="text-gray-300 font-mono text-xs">
                              {new Date(session.createdAt).toLocaleDateString()} {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </TableCell>
                            <TableCell className="text-gray-300 font-mono">
                              {formatDuration(session.createdAt, session.endedAt)}
                            </TableCell>
                            <TableCell className="text-gray-300 capitalize">
                              {session.meetingType || '--'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  isActive
                                    ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                                    : 'bg-green-500/20 text-green-400 hover:bg-green-500/20'
                                }
                              >
                                {statusLabel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="text-gray-400 hover:text-white">
                                  <MoreVertical className="w-5 h-5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-[#1a1a2e] border border-gray-800">
                                  <DropdownMenuItem
                                    className="text-gray-400 hover:bg-gray-800"
                                    onClick={() => onNavigate('reports')}
                                  >
                                    <Eye className="w-4 h-4 mr-2" />
                                    View Report
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                                    <Archive className="w-4 h-4 mr-2" />
                                    Archive
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="p-6 border-t border-gray-800 flex justify-between items-center">
                  <p className="text-gray-400 text-sm">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, historySessions.length)} of {historySessions.length} sessions
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent border-gray-700 text-gray-400"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((pg) => (
                      <Button
                        key={pg}
                        variant="outline"
                        size="sm"
                        className={
                          pg === currentPage
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-transparent border-gray-700 text-gray-400'
                        }
                        onClick={() => setCurrentPage(pg)}
                      >
                        {pg}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent border-gray-700 text-gray-400"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Scheduled Sessions Banner */}
        {scheduledSessions.filter((s) => s.status === 'waiting').length > 0 && (
          <div className="fixed bottom-6 right-6 z-40 space-y-2" style={{ maxWidth: 380 }}>
            {scheduledSessions
              .filter((s) => s.status === 'waiting')
              .map((entry) => (
                <div
                  key={entry.sessionId}
                  className="bg-[#1a1a2e] border border-cyan-500/40 rounded-lg p-4 shadow-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span className="text-white text-sm font-medium truncate">{entry.title}</span>
                    <span className="ml-auto text-cyan-400 text-xs font-mono">
                      {getCountdown(entry.scheduledAt)}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs mb-3 truncate">{entry.meetingUrl}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-cyan-400 hover:bg-cyan-500 text-black text-xs flex-1"
                      onClick={() => handleJoinNow(entry)}
                    >
                      Join Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-600 text-gray-400 hover:text-white text-xs"
                      onClick={() => handleCancelScheduled(entry.sessionId)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* New Session Dialog */}
        <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
          <DialogContent className="bg-[#1a1a2e] rounded-xl border border-gray-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">Create New Session</DialogTitle>
              <DialogDescription className="text-gray-400 text-sm">
                Start a live session to stream transcript + trust signals in real time.
                Optionally provide a Zoom URL to have the bot join automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting Name *</Label>
                <Input
                  type="text"
                  placeholder="e.g. Q4 Financial Review"
                  value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                  className="bg-[#1a1a2e] border border-gray-800 text-gray-300 placeholder:text-gray-600"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting Type</Label>
                <Select value={meetingType} onValueChange={(value: string) => setMeetingType(value as MeetingType)}>
                  <SelectTrigger className="bg-[#1a1a2e] border border-gray-800 text-gray-400">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border border-gray-800 text-gray-400">
                    <SelectItem value="official">Official</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="friends">Friends</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Zoom Meeting URL */}
              <div className="space-y-2">
                <Label className="text-gray-400 text-sm flex items-center gap-2">
                  <Video className="w-4 h-4 text-cyan-400" />
                  Zoom Meeting URL
                  <span className="text-gray-600 text-xs">(optional)</span>
                </Label>
                <Input
                  type="url"
                  placeholder="https://us05web.zoom.us/j/1234567890"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="bg-[#1a1a2e] border border-gray-800 text-gray-300 placeholder:text-gray-600"
                />
                {meetingUrl.trim() && !isValidZoomUrl(meetingUrl.trim()) && (
                  <p className="text-red-400 text-xs">Enter a valid Zoom URL (zoom.us or zoom.com)</p>
                )}
              </div>

              {/* Scheduled Time — only shown when a Zoom URL is provided */}
              {meetingUrl.trim() && isValidZoomUrl(meetingUrl.trim()) && (
                <div className="space-y-2">
                  <Label className="text-gray-400 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    Schedule for Later
                    <span className="text-gray-600 text-xs">(optional — leave blank to join now)</span>
                  </Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    min={toLocalDatetimeStr(new Date())}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="bg-[#1a1a2e] border border-gray-800 text-gray-300 [color-scheme:dark]"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4">
              {/* Hint about what will happen */}
              <p className="text-gray-500 text-xs max-w-[200px]">
                {meetingUrl.trim() && isValidZoomUrl(meetingUrl.trim())
                  ? scheduledAt
                    ? 'Bot will auto-join at scheduled time'
                    : 'Bot will join immediately on create'
                  : 'Use your local mic for captions'}
              </p>
              <Button
                className="bg-cyan-400 hover:bg-cyan-500 text-black"
                onClick={handleCreateSession}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : meetingUrl.trim() && scheduledAt ? (
                  'Schedule Session'
                ) : (
                  'Start Session'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
