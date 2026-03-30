import { useEffect, useId, useMemo, useState, useCallback, useRef } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { ParticipantList } from '../dashboard/ParticipantList';
import type { ParticipantEntry } from '../dashboard/ParticipantList';
import { AlertTriangle, AlertCircle, PhoneOff, Loader2 } from 'lucide-react';
import { authFetch } from '../../lib/api';
import { useWebSocket, useWsMessages } from '../../contexts/WebSocketContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface DashboardScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  onEndSession?: () => void;
  onBotConnected?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
  sessionId?: string | null;
  meetingTitle?: string | null;
  meetingType?: MeetingType | null;
  onNewSession?: () => void;
}

type EmotionLabel = 'Happy' | 'Neutral' | 'Angry' | 'Fear' | 'Surprise' | 'Sad';
type RiskLevel = 'low' | 'medium' | 'high';
type MeetingType = 'official' | 'business' | 'friends';

type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

type AlertEvent = {
  alertId: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  message: string;
  recommendation?: string | null;
  source?: { model: string; confidence: number };
  ts: string;
  sessionId?: string;
  faceId?: number | null;
  participantName?: string | null;
};

type BotStatus = 'idle' | 'joining' | 'connected' | 'degraded' | 'disconnected';

type BotStreams = {
  audio: boolean;
  video: boolean;
  captions: boolean;
};

type Metrics = {
  timestamp: string;
  source: 'simulated' | 'external';
  emotion: {
    label: EmotionLabel;
    confidence: number;
    scores: Record<EmotionLabel, number>;
  };
  deepfake: {
    authenticityScore: number;
    model: string;
    riskLevel: RiskLevel;
  };
  trustScore: number;
  confidenceLayers: {
    audio: number | null;
    video: number | null;
    behavior: number | null;
  };
  cameraOff?: boolean;
  faceCount?: number;
  analyzedParticipant?: string | null;
};

// H16: Function instead of constant so timestamp is always fresh
const getFallbackMetrics = (): Metrics => ({
  timestamp: new Date().toISOString(),
  source: 'simulated',
  emotion: {
    label: 'Happy',
    confidence: 0.92,
    scores: {
      Happy: 0.92,
      Neutral: 0.04,
      Angry: 0.01,
      Fear: 0.01,
      Surprise: 0.01,
      Sad: 0.01,
    },
  },
  deepfake: {
    authenticityScore: 0.96,
    model: 'XceptionNet + EfficientNet',
    riskLevel: 'low',
  },
  trustScore: 0.98,
  confidenceLayers: {
    audio: null,
    video: 0.97,
    behavior: 0.82,
  },
});

const toPercent = (v: number | null | undefined): number => {
  if (v == null) return 0;
  const pct = v > 1.5 ? v : v * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
};

const getRiskColor = (risk: RiskLevel) => {
  if (risk === 'high') return 'text-red-400';
  if (risk === 'medium') return 'text-yellow-400';
  return 'text-green-400';
};

const TRUST_CIRCLE_RADIUS = 88;

export function DashboardScreen({
  onNavigate,
  onSignOut,
  onEndSession,
  onBotConnected,
  profilePhoto,
  userName,
  userEmail,
  sessionId,
  meetingTitle,
  meetingType,
  onNewSession,
}: DashboardScreenProps) {
  const gradientId = useId();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const endingSessionRef = useRef(false);

  // Alert and bot status state
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);

  const [botStatus, setBotStatus] = useState<BotStatus>('idle');
  const [botStreams, setBotStreams] = useState<BotStreams>({ audio: false, video: false, captions: false });
  const [participants, setParticipants] = useState<ParticipantEntry[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<number | null>(null);

  const { isConnected: wsConnected } = useWebSocket();

  // Reset per-session UI state when the active session changes.
  useEffect(() => {
    setMetrics(null);
    setAlertEvents([]);
    setBotStatus('idle');
    setBotStreams({ audio: false, video: false, captions: false });
    setParticipants([]);
    setSelectedFaceId(null);
  }, [sessionId]);

  // Handle WS messages via the shared context
  const handleWsMessage = useCallback((message: Record<string, unknown>) => {
    if (message?.type === 'metrics' && (message?.data as Record<string, unknown>)?.emotion) {
      const incoming = message.data as Partial<Metrics>;
      const fallback = getFallbackMetrics();
      setMetrics({
        ...fallback,
        ...incoming,
        emotion: { ...fallback.emotion, ...incoming.emotion },
        deepfake: { ...fallback.deepfake, ...incoming.deepfake },
        confidenceLayers: { ...fallback.confidenceLayers, ...incoming.confidenceLayers },
      } as Metrics);
      setMetricsError(null);
      return;
    }

    if (message?.type === 'transcript') return;

    if (message?.type === 'alert' && typeof message?.title === 'string') {
      const alertEvent: AlertEvent = {
        alertId: (message.alertId as string) || '',
        severity: message.severity as AlertSeverity,
        category: (message.category as string) || 'unknown',
        title: message.title as string,
        message: String(message.message || ''),
        recommendation: (message.recommendation as string) || null,
        source: message.source as AlertEvent['source'],
        ts: typeof message.ts === 'string' ? message.ts : new Date().toISOString(),
        sessionId: typeof message.sessionId === 'string' ? message.sessionId : sessionId ?? undefined,
        faceId: typeof message.faceId === 'number' ? message.faceId : null,
        participantName: typeof message.participantName === 'string' ? message.participantName : null,
      };
      setAlertEvents((prev) => [alertEvent, ...prev].slice(0, 100));

      return;
    }

    if (message?.type === 'participants' && Array.isArray(message?.participants)) {
      const safe = (message.participants as unknown[]).filter(
        (p): p is ParticipantEntry => {
          if (typeof p !== 'object' || p === null) return false;
          const rec = p as Record<string, unknown>;
          return (
            typeof rec.faceId === 'number' &&
            Number.isFinite(rec.faceId) &&
            rec.faceId >= 0 && rec.faceId < 20 &&
            (typeof rec.name === 'string' || rec.name === undefined)
          );
        }
      );
      setParticipants(safe);
      return;
    }

    if (message?.type === 'suggestion') {
      const title = typeof message.title === 'string' ? message.title : 'Suggestion';
      const body = typeof message.message === 'string' ? message.message : '';
      const severity = message.severity as string;
      if (severity === 'high') {
        toast.warning(`${title}: ${body}`);
      } else {
        toast.info(`${title}: ${body}`);
      }
      return;
    }

    if (message?.type === 'sourceStatus') {
      const newStatus = (message.status as BotStatus) || 'disconnected';
      setBotStatus(newStatus);
      setBotStreams((message.streams as BotStreams) || { audio: false, video: false, captions: false });
      if (newStatus === 'connected') {
        onBotConnected?.();
      }
      if (newStatus === 'disconnected' && sessionId) {
        // Session data preserved — user can view final results
        // Session auto-ended by backend, not frontend
      }
      return;
    }

    // Backwards compatibility
    const payload = (message?.data ?? message) as Record<string, unknown>;
    if (payload?.emotion) {
      setMetrics(payload as unknown as Metrics);
      setMetricsError(null);
    }
  }, [onBotConnected, onEndSession, sessionId]);

  useWsMessages(handleWsMessage);

  // HTTP polling fallback when WS is disconnected
  useEffect(() => {
    if (wsConnected || !sessionId) {
      setMetricsError(null);
      return;
    }

    const metricsPath = `/api/sessions/${sessionId}/metrics`;

    const fetchMetrics = async () => {
      try {
        const response = await authFetch(metricsPath);
        if (!response.ok) throw new Error('Failed to fetch metrics');
        const data: Metrics = await response.json();
        setMetrics(data);
        setMetricsError(null);
      } catch {
        setMetricsError('Backend offline');
      }
    };

    fetchMetrics();
    const interval = window.setInterval(fetchMetrics, 1500);
    return () => window.clearInterval(interval);
  }, [wsConnected, sessionId]);

  /** End session: leave meeting + stop session */
  const handleEndSession = useCallback(async () => {
    if (!sessionId || endingSessionRef.current) return;
    endingSessionRef.current = true;
    setEndingSession(true);
    try {
      // 1. Tell the bot to leave the meeting (best-effort, don't block session stop)
      await authFetch(`/api/sessions/${sessionId}/leave`, { method: 'POST' }).catch((err: unknown) => {
        console.warn('Bot leave request failed (continuing with stop):', err);
      });
      // 2. Stop the session (generates report)
      const res = await authFetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to stop session');
      }
      toast.success('Session ended — bot left the meeting');
      setBotStatus('disconnected');
      setBotStreams({ audio: false, video: false, captions: false });
      onEndSession?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to end session');
    } finally {
      endingSessionRef.current = false;
      setEndingSession(false);
    }
  }, [sessionId, onEndSession]);

  // Show real metrics when available; clean idle state when no session
  const hasData = metrics !== null;
  const displayMetrics = metrics ?? getFallbackMetrics();
  const trustScorePercent = hasData ? toPercent(displayMetrics.trustScore) : 0;
  const trustDash = (2 * Math.PI * TRUST_CIRCLE_RADIUS * trustScorePercent) / 100;
  const lastUpdatedLabel = hasData && displayMetrics.timestamp
    ? new Date(displayMetrics.timestamp).toLocaleTimeString()
    : '--:--';
  const sourceLabel = !hasData ? 'waiting' : displayMetrics.source === 'external' ? 'model server' : 'simulated';
  const connectionLabel = wsConnected ? 'live' : 'polling';

  const alerts = useMemo(() => {
    const items: Array<{ id: string; type: 'error' | 'warning' | 'ok'; message: string; time: string }> = [];

    // Filter by selected participant
    const filteredEvents = selectedFaceId !== null
      ? alertEvents.filter((a) => a.faceId === selectedFaceId || a.faceId == null)
      : alertEvents;

    // Prioritize real alert events from the alert fusion engine
    filteredEvents.slice(0, 5).forEach((alert) => {
      items.push({
        id: alert.alertId,
        type: alert.severity === 'critical' || alert.severity === 'high' ? 'error' : 'warning',
        message: `[${alert.category}] ${alert.title}: ${alert.message}`,
        time: new Date(alert.ts).toLocaleTimeString(),
      });
    });

    // Metric-derived alerts (only if no real alerts yet and real metrics exist)
    if (filteredEvents.length === 0 && hasData) {
      if (displayMetrics.deepfake.riskLevel !== 'low') {
        items.push({
          id: 'metric-deepfake',
          type: displayMetrics.deepfake.riskLevel === 'high' ? 'error' : 'warning',
          message: 'Potential visual manipulation detected.',
          time: 'just now',
        });
      }

      if (displayMetrics.emotion.label !== 'Neutral' && displayMetrics.emotion.confidence > 0.7) {
        items.push({
          id: 'metric-emotion',
          type: 'warning',
          message: `Elevated ${displayMetrics.emotion.label.toLowerCase()} expression detected.`,
          time: 'just now',
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: 'all-ok',
        type: 'ok',
        message: 'All systems normal.',
        time: 'just now',
      });
    }

    return items;
  }, [displayMetrics, alertEvents, selectedFaceId]);

  const confidenceScores = useMemo(() => {
    if (!hasData) return [
      { label: 'Audio', value: 0, color: 'bg-gray-600' },
      { label: 'Video', value: 0, color: 'bg-gray-600' },
      { label: 'Behavior', value: 0, color: 'bg-gray-600' },
    ];
    return [
      { label: 'Audio', value: toPercent(displayMetrics.confidenceLayers.audio ?? 0), color: displayMetrics.confidenceLayers.audio == null ? 'bg-gray-600' : 'bg-cyan-400' },
      { label: 'Video', value: displayMetrics.cameraOff ? 0 : toPercent(displayMetrics.confidenceLayers.video ?? 0), color: displayMetrics.cameraOff ? 'bg-gray-600' : 'bg-cyan-400' },
      { label: 'Behavior', value: displayMetrics.cameraOff ? 0 : toPercent(displayMetrics.confidenceLayers.behavior ?? 0), color: displayMetrics.cameraOff ? 'bg-gray-600' : 'bg-orange-400' },
    ];
  }, [displayMetrics, hasData]);

  const audioRiskLevel: RiskLevel = useMemo(() => {
    const score = displayMetrics.confidenceLayers?.audio;
    if (score == null || score >= 0.7) return 'low';
    if (score >= 0.4) return 'medium';
    return 'high';
  }, [displayMetrics.confidenceLayers?.audio]);

  return (
    <div className="flex h-screen bg-[#0f0f1e]">

      <Sidebar currentScreen="dashboard" onNavigate={onNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Dashboard" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} isConnected={wsConnected} activeSessionId={sessionId} onNewSession={onNewSession} onEndSession={handleEndSession} />

        <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a16]">
          {/* Prominent warning when metrics are simulated */}
          {hasData && displayMetrics.source !== 'external' && (
            <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-500/60 rounded-lg flex items-center gap-3">
              <span className="text-red-400 text-lg font-bold flex-shrink-0">!</span>
              <div>
                <p className="text-red-300 text-sm font-semibold">AI Service Offline — Metrics Are Simulated</p>
                <p className="text-red-400/70 text-xs">The displayed scores are NOT real analysis. Start the AI service to get real deepfake detection and emotion analysis.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Live Trust Score */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-gray-400 text-sm mb-6">Live Trust Score</h3>

              <div className="flex items-center justify-center mb-4">
                <div className="relative w-48 h-48">
                  {/* Circular progress */}
                  <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 192 192">
                    <circle
                      cx="96"
                      cy="96"
                      r={TRUST_CIRCLE_RADIUS}
                      stroke="#2a2a3e"
                      strokeWidth="12"
                      fill="none"
                    />
                    <defs>
                      <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="96"
                      cy="96"
                      r={TRUST_CIRCLE_RADIUS}
                      stroke={`url(#${gradientId})`}
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${trustDash} ${2 * Math.PI * TRUST_CIRCLE_RADIUS}`}
                      strokeLinecap="round"
                    />
                  </svg>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-6xl text-white mb-1 font-mono">{trustScorePercent}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-center text-gray-400 text-sm">Real-time Authenticity</p>
              <p className={`text-center text-xs mt-2 ${sourceLabel === 'simulated' ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                {metricsError
                  ? 'Backend offline • showing last known values'
                  : `Updated ${lastUpdatedLabel} • ${sourceLabel} • ${connectionLabel}`}
              </p>

              <div className="mt-4 h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  style={{ width: `${trustScorePercent}%` }}
                ></div>
              </div>
            </div>

            {/* Meeting Summary */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-6">Meeting Summary</h3>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Title:</span>
                  <span className="text-white">{meetingTitle ?? 'No active session'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Meeting Type:</span>
                  <span className="text-white">{meetingType ?? '--'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Session ID:</span>
                  <span className="text-white font-mono">{sessionId ? sessionId.slice(0, 8) : '--'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Bot Status:</span>
                  <span className={
                    botStatus === 'connected' ? 'text-green-400' :
                    botStatus === 'joining' ? 'text-yellow-400' :
                    botStatus === 'degraded' ? 'text-orange-400' :
                    'text-gray-300'
                  }>
                    {botStatus === 'connected' ? `Connected` : botStatus}
                    {botStatus === 'connected' && (
                      <span className="text-gray-500 text-xs ml-1 font-mono">
                        ({[
                          botStreams.audio && 'A',
                          botStreams.video && 'V',
                          botStreams.captions && 'C',
                        ].filter(Boolean).join('+') || 'no streams'})
                      </span>
                    )}
                  </span>
                </div>

                {displayMetrics.faceCount != null && displayMetrics.faceCount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Faces Detected:</span>
                    <span className={`font-mono ${displayMetrics.faceCount > 1 ? 'text-cyan-400' : 'text-white'}`}>
                      {displayMetrics.faceCount}
                    </span>
                  </div>
                )}
              </div>

              {/* End Session button */}
              {sessionId && (
                <Button
                  variant="destructive"
                  className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 cursor-pointer"
                  onClick={handleEndSession}
                  disabled={endingSession}
                >
                  {endingSession ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Ending Session...
                    </>
                  ) : (
                    <>
                      <PhoneOff className="w-4 h-4 mr-2" />
                      End Session
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Live Alerts */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-6">Live Alerts</h3>

              <div className="space-y-4">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {alert.type === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <AlertTriangle
                          className={`w-5 h-5 ${alert.type === 'ok' ? 'text-green-400' : 'text-orange-400'}`}
                        />
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

            {/* Facial Emotion Recognition */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-4">Facial Emotion Recognition</h3>
              {displayMetrics.cameraOff ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  </div>
                  <p className="text-gray-300 font-medium">Camera Off</p>
                  <p className="text-gray-500 text-sm mt-1">Audio-only analysis active</p>
                </div>
              ) : (
                <>
                  {hasData && displayMetrics.analyzedParticipant && (
                    <p className="text-cyan-400 text-xs mb-2">Analyzing: {displayMetrics.analyzedParticipant}</p>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-gray-400 text-sm">Live Emotion</p>
                      <p className="text-3xl text-white">{hasData ? (displayMetrics.emotion.confidence < 0.40 ? 'Neutral' : displayMetrics.emotion.label) : '--'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm">Confidence</p>
                      <p className="text-2xl text-cyan-400 font-mono">{hasData ? `${toPercent(displayMetrics.emotion.confidence)}%` : '--%'}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Audio Manipulation Detection */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-4">Audio Manipulation Detection</h3>
              {hasData && displayMetrics.analyzedParticipant && (
                <p className="text-cyan-400 text-xs mb-2">Analyzing: {displayMetrics.analyzedParticipant}</p>
              )}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-sm">Authenticity Score</p>
                  <p className="text-3xl text-white font-mono">
                    {hasData && displayMetrics.confidenceLayers.audio != null
                      ? `${toPercent(displayMetrics.confidenceLayers.audio)}%`
                      : '--%'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-sm">Risk</p>
                  <p className={`text-2xl ${hasData && displayMetrics.confidenceLayers.audio != null
                    ? getRiskColor(audioRiskLevel)
                    : 'text-gray-500'}`}>
                    {hasData && displayMetrics.confidenceLayers.audio != null ? audioRiskLevel : '--'}
                  </p>
                </div>
              </div>
              <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                <div
                  className={`h-full ${audioRiskLevel === 'high' ? 'bg-red-400' : audioRiskLevel === 'medium' ? 'bg-yellow-400' : 'bg-cyan-400'}`}
                  style={{ width: hasData && displayMetrics.confidenceLayers.audio != null ? `${toPercent(displayMetrics.confidenceLayers.audio)}%` : '0%' }}
                ></div>
              </div>
            </div>

            {/* Deepfake / Visual Manipulation Detection */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-4">Visual Manipulation Detection</h3>
              {hasData && !displayMetrics.cameraOff && displayMetrics.analyzedParticipant && (
                <p className="text-cyan-400 text-xs mb-2">Analyzing: {displayMetrics.analyzedParticipant}</p>
              )}
              {displayMetrics.cameraOff ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  </div>
                  <p className="text-gray-300 font-medium">Camera Off</p>
                  <p className="text-gray-500 text-sm mt-1">Audio-only analysis active</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-gray-400 text-sm">Authenticity Score</p>
                      <p className="text-3xl text-white font-mono">{hasData ? `${toPercent(displayMetrics.deepfake.authenticityScore)}%` : '--%'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm">Risk</p>
                      <p className={`text-2xl ${hasData ? getRiskColor(displayMetrics.deepfake.riskLevel) : 'text-gray-500'}`}>
                        {hasData ? displayMetrics.deepfake.riskLevel : '--'}
                      </p>
                    </div>
                  </div>
                  {hasData && displayMetrics.deepfake.model && <p className="text-gray-500 text-xs mb-3">{displayMetrics.deepfake.model}</p>}
                  <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${displayMetrics.deepfake.riskLevel === 'high' ? 'bg-red-400' : displayMetrics.deepfake.riskLevel === 'medium' ? 'bg-yellow-400' : 'bg-cyan-400'}`}
                      style={{ width: `${toPercent(displayMetrics.deepfake.authenticityScore)}%` }}
                    ></div>
                  </div>
                </>
              )}
            </div>

            {/* Participant Tracking */}
            {hasData && (participants.length > 0 || (displayMetrics.faceCount != null && displayMetrics.faceCount > 1)) && (
              <ParticipantList
                participants={participants}
                faceCount={displayMetrics.faceCount}
                selectedFaceId={selectedFaceId}
                onSelectFaceId={setSelectedFaceId}
              />
            )}

            {/* Confidence Layer Scores */}
            <div className="col-span-3 bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-2">Confidence Layer Scores</h3>
              <p className="text-gray-400 text-sm mb-6">Live data from AI detection modules</p>

              <div className="space-y-5">
                {confidenceScores.map((score) => (
                  <div key={score.label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300">{score.label}</span>
                      <span className="text-white font-mono">{score.value}%</span>
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
