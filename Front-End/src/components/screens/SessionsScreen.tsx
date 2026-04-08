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
import { useWebSocket } from '../../contexts/WebSocketContext';
import jsPDF from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';

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
  activeSessionId?: string | null;
  onNewSession?: () => void;
  onEndSession?: () => void;
  openNewSessionFlag?: number;
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

interface HistorySession {
  id: string;
  title: string;
  createdAt: string;
  endedAt: string | null;
  meetingType: string;
  status: string;
}

const SCHEDULED_STORAGE_KEY = 'realsync_scheduled';

function saveScheduled(sessions: ScheduledSession[]): void {
  try {
    // C4: Strip Zoom password before persisting to localStorage
    const sanitized = sessions.map((s) => {
      try {
        const url = new URL(s.meetingUrl);
        url.searchParams.delete('pwd');
        return { ...s, meetingUrl: url.toString() };
      } catch {
        return s;
      }
    });
    localStorage.setItem(SCHEDULED_STORAGE_KEY, JSON.stringify(sanitized));
  } catch { /* quota exceeded — ignore */ }
}

function loadScheduled(): ScheduledSession[] {
  try {
    const raw = localStorage.getItem(SCHEDULED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out expired entries (scheduledAt in the past) and already-joining/joined
    return (parsed as ScheduledSession[]).filter(
      (s) => s.status === 'waiting' && new Date(s.scheduledAt).getTime() > Date.now(),
    ).map((s) => {
      // C4: Strip Zoom password from stored URLs
      try {
        const url = new URL(s.meetingUrl);
        url.searchParams.delete('pwd');
        return { ...s, meetingUrl: url.toString() };
      } catch {
        return s;
      }
    // #16: Re-validate Zoom URL on load to prevent injected URLs from localStorage
    }).filter((s) => isValidZoomUrl(s.meetingUrl));
  } catch {
    return [];
  }
}

export function SessionsScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail, onStartSession, activeSessionId, onEndSession, openNewSessionFlag }: SessionsScreenProps) {
  const { isConnected: wsConnected } = useWebSocket();
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);

  // I10: Track last consumed flag to prevent stale reopens
  const lastConsumedFlag = useRef(0);
  useEffect(() => {
    if (openNewSessionFlag && openNewSessionFlag > lastConsumedFlag.current) {
      lastConsumedFlag.current = openNewSessionFlag;
      setIsNewSessionOpen(true);
    }
  }, [openNewSessionFlag]);
  const [meetingName, setMeetingName] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('business');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const joiningSessionsRef = useRef<Set<string>>(new Set());

  // Scheduled sessions waiting to auto-join — restored from localStorage
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>(() => loadScheduled());
  const scheduledTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Persist scheduled sessions to localStorage on every change
  useEffect(() => {
    saveScheduled(scheduledSessions.filter((s) => s.status === 'waiting'));
  }, [scheduledSessions]);

  // Countdown ticker -- re-render every 30s to update countdowns
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
      // Prevent double-scheduling: skip if a timer already exists for this session
      if (scheduledTimersRef.current.has(entry.sessionId)) return;
      const delayMs = new Date(entry.scheduledAt).getTime() - Date.now();
      if (delayMs <= 0) {
        // Time has already passed -- join now
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

  // Re-arm timers for sessions restored from localStorage on mount
  useEffect(() => {
    scheduledSessions.forEach((entry) => {
      if (entry.status === 'waiting' && !scheduledTimersRef.current.has(entry.sessionId)) {
        scheduleAutoJoin(entry);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      scheduledTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleCreateSession = async () => {
    if (creatingRef.current) return;
    if (!meetingName.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }
    if (meetingName.trim().length > 100) {
      toast.error('Meeting title must be 100 characters or less');
      return;
    }

    // Zoom URL is required
    if (!meetingUrl.trim()) {
      toast.error('Please enter a Zoom meeting URL');
      return;
    }
    if (!isValidZoomUrl(meetingUrl.trim())) {
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

    creatingRef.current = true;
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

      // Determine flow: scheduled or immediate join
      if (scheduledAt) {
        // Scheduled meeting -- add to scheduled list, auto-join at time
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
        toast.success(`Session scheduled -- bot will join at ${new Date(scheduledAt).toLocaleTimeString()}`);
      } else {
        // Immediate join -- create + join + navigate to dashboard
        toast.success('Session created -- joining meeting...');
        await joinMeeting(data.sessionId, meetingUrl.trim(), meetingName.trim(), meetingType);
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
      creatingRef.current = false;
      setCreating(false);
    }
  };

  /** Manual "Join Now" for a scheduled session */
  const handleJoinNow = (entry: ScheduledSession) => {
    if (joiningSessionsRef.current.has(entry.sessionId)) return;
    joiningSessionsRef.current.add(entry.sessionId);
    // Cancel the timer
    const timer = scheduledTimersRef.current.get(entry.sessionId);
    if (timer) {
      clearTimeout(timer);
      scheduledTimersRef.current.delete(entry.sessionId);
    }
    setScheduledSessions((prev) =>
      prev.map((s) => (s.sessionId === entry.sessionId ? { ...s, status: 'joining' as const } : s)),
    );
    joinMeeting(entry.sessionId, entry.meetingUrl, entry.title, entry.meetingType)
      .finally(() => joiningSessionsRef.current.delete(entry.sessionId));
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

  // -- Real session history from API --
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
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
          setHistoryError(null);
        }
      } catch {
        if (!cancelled) setHistoryError('Failed to load session history');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset page when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [historySessions.length]);

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

  /** Download a PDF report for the given session */
  const handleDownload = useCallback(async (session: HistorySession) => {
    toast('Preparing report...');
    try {
      const [reportRes, alertsRes, transcriptRes] = await Promise.all([
        authFetch(`/api/sessions/${session.id}/report`),
        authFetch(`/api/sessions/${session.id}/alerts`),
        authFetch(`/api/sessions/${session.id}/transcript`),
      ]);

      if (!reportRes.ok) {
        toast.error('Failed to fetch report data');
        return;
      }

      const reportData = await reportRes.json();
      const alertsData = alertsRes.ok ? await alertsRes.json() : { alerts: [] };
      const transcriptData = transcriptRes.ok ? await transcriptRes.json() : { lines: [] };

      const s = reportData.summary;
      if (!s) {
        toast.error('Report data unavailable for this session');
        return;
      }

      const alerts: Array<{ alertId: string; severity: string; category: string; title: string; message: string; ts: string }> = alertsData.alerts || [];
      const transcript: Array<{ text: string; speaker?: string; ts: string }> = transcriptData.lines || [];

      const getSeverityBreakdown = (bd: { low: number; medium: number; high: number; critical: number }) => bd;
      const breakdown = getSeverityBreakdown(s.severityBreakdown || { low: 0, medium: 0, high: 0, critical: 0 });

      let overallRisk = 'low';
      if (breakdown.critical > 0) overallRisk = 'critical';
      else if (breakdown.high > 0) overallRisk = 'high';
      else if (breakdown.medium > 0) overallRisk = 'medium';

      const formatDur = (start: string, end: string | null) => {
        if (!end) return 'In progress';
        const ms = new Date(end).getTime() - new Date(start).getTime();
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${mins}:${String(secs).padStart(2, '0')}`;
      };

      interface JsPDFWithPlugin extends jsPDF { lastAutoTable?: { finalY: number }; }
      const doc = new jsPDF() as JsPDFWithPlugin;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const M = 14; // margin
      let y = M;

      // --- White background ---
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');

      // --- Header band (light gray) ---
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, pageW, 42, 'F');
      // Cyan top accent line
      doc.setFillColor(14, 165, 233);
      doc.rect(0, 0, pageW, 1.5, 'F');

      // Brand name
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('RealSync', M, y + 10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('AI-Powered Meeting Intelligence', M, y + 17);

      // Report type label (right)
      doc.setFillColor(224, 242, 254);
      doc.roundedRect(pageW - M - 54, 12, 54, 11, 1.5, 1.5, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(14, 165, 233);
      doc.text('SECURITY AUDIT REPORT', pageW - M - 27, 19.5, { align: 'center' });

      y = 52;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Meeting Authenticity Report', M, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(14, 165, 233);
      doc.text(s.title || session.title, M, y);
      y += 7;

      // Divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(M, y, pageW - M, y);
      y += 8;

      // Session info grid
      const infoItems: [string, string][] = [
        ['Session ID', (s.sessionId || session.id).slice(0, 8).toUpperCase()],
        ['Date', new Date(s.createdAt || session.createdAt).toLocaleDateString()],
        ['Duration', formatDur(s.createdAt || session.createdAt, s.endedAt || session.endedAt)],
        ['Meeting Type', (s.meetingType || session.meetingType || 'Standard').charAt(0).toUpperCase() + (s.meetingType || session.meetingType || 'Standard').slice(1)],
      ];
      const colW2 = (pageW - M * 2) / infoItems.length;
      infoItems.forEach(([label, val], i) => {
        const cx = M + i * colW2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(label.toUpperCase(), cx, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(val, cx, y + 6);
      });
      y += 16;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(M, y, pageW - M, y);
      y += 10;

      // Risk score + severity cards
      const riskColors2: Record<string, [number, number, number]> = {
        critical: [220, 38, 38], high: [234, 88, 12], medium: [217, 119, 6], low: [22, 163, 74],
      };
      const riskBgColors: Record<string, [number, number, number]> = {
        critical: [254, 226, 226], high: [255, 237, 213], medium: [254, 243, 199], low: [220, 252, 231],
      };
      const scoreColor2 = riskColors2[overallRisk] || riskColors2.low;
      const scoreBg2 = riskBgColors[overallRisk] || riskBgColors.low;

      // Score box
      doc.setFillColor(scoreBg2[0], scoreBg2[1], scoreBg2[2]);
      doc.setDrawColor(scoreColor2[0], scoreColor2[1], scoreColor2[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(M, y, 55, 32, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(scoreColor2[0], scoreColor2[1], scoreColor2[2]);
      doc.text('OVERALL RISK', M + 27.5, y + 7, { align: 'center' });
      doc.setFontSize(20);
      doc.text(overallRisk.toUpperCase(), M + 27.5, y + 20, { align: 'center' });

      // Severity cards
      const sevCards = [
        { label: 'Critical', count: breakdown.critical, color: riskColors2.critical },
        { label: 'High', count: breakdown.high, color: riskColors2.high },
        { label: 'Medium', count: breakdown.medium, color: riskColors2.medium },
        { label: 'Low', count: breakdown.low, color: riskColors2.low },
      ];
      const cardW2 = (pageW - M * 2 - 61) / 4;
      sevCards.forEach((card, i) => {
        const cx = M + 61 + i * (cardW2 + 2);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.rect(cx, y, cardW2, 32, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(card.label.toUpperCase(), cx + 4, y + 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(
          card.count > 0 ? card.color[0] : 100,
          card.count > 0 ? card.color[1] : 116,
          card.count > 0 ? card.color[2] : 139,
        );
        doc.text(String(card.count), cx + 4, y + 25);
      });

      y += 40;

      // Section: Severity breakdown table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Severity Breakdown', M, y);
      y += 2;
      doc.setFillColor(14, 165, 233);
      doc.rect(M, y, 3, 6, 'F');
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['Severity', 'Count']],
        body: [
          ['Critical', String(breakdown.critical)],
          ['High', String(breakdown.high)],
          ['Medium', String(breakdown.medium)],
          ['Low', String(breakdown.low)],
          ['Total', String(s.totalAlerts ?? alerts.length)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8.5, fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.3 },
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: M, right: M },
        didParseCell: (data: CellHookData) => {
          if (data.section === 'body' && data.column.index === 0) {
            const raw = data.row.raw;
            const sev = (Array.isArray(raw) ? String(raw[0] ?? '') : '').toLowerCase();
            if (sev === 'critical') data.cell.styles.textColor = [220, 38, 38];
            else if (sev === 'high') data.cell.styles.textColor = [234, 88, 12];
            else if (sev === 'medium') data.cell.styles.textColor = [217, 119, 6];
            else if (sev === 'low') data.cell.styles.textColor = [22, 163, 74];
            else data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      y = (doc.lastAutoTable?.finalY ?? y) + 12;

      if (alerts.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('Alert Timeline', M, y);
        y += 2;
        doc.setFillColor(14, 165, 233);
        doc.rect(M, y, 3, 6, 'F');
        y += 8;

        autoTable(doc, {
          startY: y,
          head: [['Time', 'Severity', 'Category', 'Title', 'Message']],
          body: alerts.map((a) => [
            new Date(a.ts).toLocaleTimeString(),
            a.severity.toUpperCase(),
            a.category,
            a.title,
            a.message.length > 60 ? a.message.slice(0, 60) + '...' : a.message,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.3 },
          styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.2 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: { 4: { cellWidth: 55 } },
          margin: { left: M, right: M },
          didParseCell: (data: CellHookData) => {
            if (data.section === 'body' && data.column.index === 1) {
              const raw = data.row.raw;
              const sev = (Array.isArray(raw) ? String(raw[1] ?? '') : '').toLowerCase();
              if (sev === 'critical') data.cell.styles.textColor = [220, 38, 38];
              else if (sev === 'high') data.cell.styles.textColor = [234, 88, 12];
              else if (sev === 'medium') data.cell.styles.textColor = [217, 119, 6];
              else data.cell.styles.textColor = [22, 163, 74];
            }
          },
        });

        y = (doc.lastAutoTable?.finalY ?? y) + 12;
      }

      if (transcript.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`Transcript (${Math.min(transcript.length, 50)} of ${transcript.length} lines)`, M, y);
        y += 2;
        doc.setFillColor(14, 165, 233);
        doc.rect(M, y, 3, 6, 'F');
        y += 8;

        autoTable(doc, {
          startY: y,
          head: [['Time', 'Speaker', 'Text']],
          body: transcript.slice(0, 50).map((line) => [
            new Date(line.ts).toLocaleTimeString(),
            line.speaker || '--',
            line.text.length > 80 ? line.text.slice(0, 80) + '...' : line.text,
          ]),
          theme: 'striped',
          headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.3 },
          styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.2 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: { 2: { cellWidth: 110 } },
          margin: { left: M, right: M },
          didParseCell: (data: CellHookData) => {
            if (data.section === 'body' && data.column.index === 1) {
              const raw = data.row.raw;
              const speaker = Array.isArray(raw) ? String(raw[1] ?? '') : '';
              if (speaker && speaker !== '--') {
                data.cell.styles.textColor = [14, 165, 233];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          },
        });
      }

      const totalPagesCount = doc.getNumberOfPages();
      for (let i = 1; i <= totalPagesCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(M, pageH - 14, pageW - M, pageH - 14);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated by RealSync  |  Confidential`, M, pageH - 8);
        doc.text(new Date().toLocaleString(), pageW / 2, pageH - 8, { align: 'center' });
        doc.text(`Page ${i} of ${totalPagesCount}`, pageW - M, pageH - 8, { align: 'right' });
      }

      const sessionIdPrefix = (s.sessionId || session.id).slice(0, 8);
      const filename = `RealSync_Report_${sessionIdPrefix}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      toast.success('Report downloaded');
    } catch {
      toast.error('Failed to download report');
    }
  }, []);

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
        <TopBar title="Live Meetings / Sessions" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} isConnected={wsConnected} activeSessionId={activeSessionId} onNewSession={() => setIsNewSessionOpen(true)} onEndSession={onEndSession} />
        
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
                <span className="ml-3 text-gray-400">Loading sessions...</span>
              </div>
            ) : historyError ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <p className="text-lg text-red-400 mb-1">{historyError}</p>
                <p className="text-sm">Check your connection and try again.</p>
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
                          <Checkbox
                            className="border-gray-600"
                            checked={paginatedSessions.length > 0 && paginatedSessions.every((s) => selectedSessions.has(s.id))}
                            onCheckedChange={(checked) => {
                              setSelectedSessions((prev) => {
                                const next = new Set(prev);
                                paginatedSessions.forEach((s) => {
                                  if (checked) next.add(s.id);
                                  else next.delete(s.id);
                                });
                                return next;
                              });
                            }}
                          />
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
                              <Checkbox
                                className="border-gray-600"
                                checked={selectedSessions.has(session.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedSessions((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(session.id);
                                    else next.delete(session.id);
                                    return next;
                                  });
                                }}
                              />
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
                                <DropdownMenuContent className="bg-[#1a1a2e] border border-gray-800 p-1">
                                  <DropdownMenuItem
                                    className="text-gray-400 hover:bg-gray-800 px-3 py-2 cursor-pointer"
                                    onClick={() => onNavigate('reports')}
                                  >
                                    <Eye className="w-4 h-4 mr-2" />
                                    View Report
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-gray-400 hover:bg-gray-800 px-3 py-2 cursor-pointer"
                                    onClick={() => handleDownload(session)}
                                  >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-gray-800" />
                                  <DropdownMenuItem className="text-gray-400 hover:bg-gray-800 px-3 py-2 cursor-pointer">
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
                    Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, historySessions.length)}--{Math.min(currentPage * PAGE_SIZE, historySessions.length)} of {historySessions.length} sessions
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
                    {(() => {
                      const maxVisible = 5;
                      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                      let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                      if (endPage - startPage + 1 < maxVisible) {
                        startPage = Math.max(1, endPage - maxVisible + 1);
                      }
                      const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
                      return pageNumbers.map((pg) => (
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
                      ));
                    })()}
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
                Provide a Zoom URL for the bot to join automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting Name *</Label>
                <Input
                  type="text"
                  placeholder="e.g. Q4 Financial Review"
                  value={meetingName}
                  maxLength={100}
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
                  Zoom Meeting URL *
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

              {/* Scheduled Time -- only shown when a Zoom URL is provided */}
              {meetingUrl.trim() && isValidZoomUrl(meetingUrl.trim()) && (
                <div className="space-y-2">
                  <Label className="text-gray-400 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    Schedule for Later
                    <span className="text-gray-600 text-xs">(optional -- leave blank to join now)</span>
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
                  : 'Enter a valid Zoom URL to continue'}
              </p>
              <Button
                className="bg-cyan-400 hover:bg-cyan-500 text-black"
                onClick={handleCreateSession}
                disabled={creating || !meetingUrl.trim() || !isValidZoomUrl(meetingUrl.trim())}
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
