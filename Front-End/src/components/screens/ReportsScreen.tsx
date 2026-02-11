import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Search, FileText, ArrowLeft, AlertTriangle, Clock, ShieldCheck, ShieldAlert, MessageSquare, Loader2, Download } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { buildApiUrl } from '../../lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportsScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
}

/** Session summary from GET /api/sessions */
interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  endedAt: string | null;
  meetingType: string;
  botStatus?: string;
}

/** Report data from GET /api/sessions/:id/report */
interface SessionReport {
  summary: {
    sessionId: string;
    title: string;
    meetingType: string;
    createdAt: string;
    endedAt: string | null;
    totalAlerts: number;
    totalTranscriptLines: number;
    severityBreakdown: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
    generatedAt: string;
  };
}

/** Alert from GET /api/sessions/:id/alerts */
interface AlertItem {
  alertId: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  ts: string;
}

/** Transcript line from GET /api/sessions/:id/transcript */
interface TranscriptLine {
  text: string;
  speaker?: string;
  ts: string;
  confidence?: number;
}

const getRiskBadge = (risk: string) => {
  const styles: Record<string, string> = {
    low: 'bg-green-500/20 text-green-400 hover:bg-green-500/20',
    medium: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20',
    high: 'bg-red-500/20 text-red-400 hover:bg-red-500/20',
    critical: 'bg-red-700/30 text-red-300 hover:bg-red-700/30',
  };
  return styles[risk] || styles.low;
};

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'In progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getOverallRisk(breakdown: SessionReport['summary']['severityBreakdown']): string {
  if (breakdown.critical > 0) return 'critical';
  if (breakdown.high > 0) return 'high';
  if (breakdown.medium > 0) return 'medium';
  return 'low';
}

export function ReportsScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail }: ReportsScreenProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Detail view state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch session list
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/sessions'));
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.sessions ?? []);
          setSessions(list);
        }
      } catch {
        // Backend offline
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  // Fetch report detail for a session
  const openReport = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setDetailLoading(true);
    setReport(null);
    setAlerts([]);
    setTranscript([]);

    try {
      const [reportRes, alertsRes, transcriptRes] = await Promise.all([
        fetch(buildApiUrl(`/api/sessions/${sessionId}/report`)),
        fetch(buildApiUrl(`/api/sessions/${sessionId}/alerts`)),
        fetch(buildApiUrl(`/api/sessions/${sessionId}/transcript`)),
      ]);

      if (reportRes.ok) {
        const reportData = await reportRes.json();
        setReport(reportData);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }

      if (transcriptRes.ok) {
        const transcriptData = await transcriptRes.json();
        setTranscript(transcriptData.lines || []);
      }
    } catch {
      // Handle errors silently
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /** Generate and download a PDF report */
  const downloadPDF = useCallback(() => {
    if (!report?.summary) return;
    const s = report.summary;
    const risk = getOverallRisk(s.severityBreakdown);

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 14;

    // ── Dark header banner (page 1 only) ──
    doc.setFillColor(15, 15, 30); // #0f0f1e
    doc.rect(0, 0, pageW, 38, 'F');

    // Cyan accent line
    doc.setFillColor(34, 211, 238);
    doc.rect(0, 38, pageW, 2, 'F');

    // Title in header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 211, 238);
    doc.text('RealSync', 14, y + 6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 175);
    doc.text('AI-Powered Meeting Intelligence', 14, y + 12);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Meeting Analysis Report', pageW - 14, y + 6, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 175);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, y + 12, { align: 'right' });

    y = 50;

    // ── Meeting Information ──
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 211, 238);
    doc.text('Meeting Information', 14, y);
    y += 2;
    doc.setFillColor(34, 211, 238);
    doc.rect(14, y, 40, 0.8, 'F');
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const info = [
      ['Title', s.title],
      ['Session ID', s.sessionId.slice(0, 8)],
      ['Date', new Date(s.createdAt).toLocaleString()],
      ['Duration', s.endedAt ? formatDuration(s.createdAt, s.endedAt) : 'In progress'],
      ['Meeting Type', (s.meetingType || '--').charAt(0).toUpperCase() + (s.meetingType || '--').slice(1)],
      ['Overall Risk', risk.toUpperCase()],
    ];
    info.forEach(([label, val]) => {
      doc.setTextColor(120, 120, 130);
      doc.text(`${label}:`, 18, y);
      if (label === 'Overall Risk') {
        const riskColors: Record<string, [number, number, number]> = {
          critical: [239, 68, 68],
          high: [249, 115, 22],
          medium: [234, 179, 8],
          low: [34, 197, 94],
        };
        const color = riskColors[risk] || [255, 255, 255];
        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(40, 40, 50);
        doc.setFont('helvetica', 'normal');
      }
      doc.text(String(val), 65, y);
      doc.setFont('helvetica', 'normal');
      y += 6.5;
    });

    y += 6;

    // ── Overall Assessment ──
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 211, 238);
    doc.text('Overall Assessment', 14, y);
    y += 2;
    doc.setFillColor(34, 211, 238);
    doc.rect(14, y, 40, 0.8, 'F');
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 90);

    let assessment: string;
    if (s.totalAlerts === 0) {
      assessment = 'This meeting showed no security concerns. All participants were verified as authentic.';
    } else if (s.severityBreakdown.critical > 0 || s.severityBreakdown.high > 0) {
      assessment = `Significant security concerns were identified during this meeting. ${s.severityBreakdown.critical} critical and ${s.severityBreakdown.high} high severity alerts were raised. Review the alert timeline below for details on potential deepfake, fraud, or identity issues.`;
    } else {
      assessment = `Minor concerns were detected during this meeting (${s.severityBreakdown.medium} medium, ${s.severityBreakdown.low} low severity), but overall the session was within acceptable parameters.`;
    }

    // Assessment box with border
    const assessmentLines = doc.splitTextToSize(assessment, pageW - 40);
    const boxH = assessmentLines.length * 5 + 8;
    doc.setDrawColor(34, 211, 238);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y - 4, pageW - 28, boxH + 4, 2, 2, 'S');
    doc.text(assessmentLines, 20, y + 2);
    y += boxH + 8;

    // ── Severity Breakdown ──
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 211, 238);
    doc.text('Severity Breakdown', 14, y);
    y += 2;
    doc.setFillColor(34, 211, 238);
    doc.rect(14, y, 40, 0.8, 'F');
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Severity', 'Count']],
      body: [
        ['Critical', String(s.severityBreakdown.critical)],
        ['High', String(s.severityBreakdown.high)],
        ['Medium', String(s.severityBreakdown.medium)],
        ['Low', String(s.severityBreakdown.low)],
        ['Total', String(s.totalAlerts)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 15, 30], textColor: [34, 211, 238], fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 18, right: 18 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 12;

    // ── Alert Timeline ──
    if (alerts.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(34, 211, 238);
      doc.text('Alert Timeline', 14, y);
      y += 2;
      doc.setFillColor(34, 211, 238);
      doc.rect(14, y, 40, 0.8, 'F');
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['Time', 'Severity', 'Category', 'Title', 'Message']],
        body: alerts.map((a) => [
          new Date(a.ts).toLocaleTimeString(),
          a.severity.toUpperCase(),
          a.category,
          a.title,
          a.message.length > 60 ? a.message.slice(0, 60) + '…' : a.message,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 15, 30], textColor: [34, 211, 238], fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5, cellWidth: 'wrap' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: { 4: { cellWidth: 55 } },
        margin: { left: 14, right: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          // Color severity column
          if (data.section === 'body' && data.column.index === 1) {
            const sev = (data.row.raw?.[1] || '').toLowerCase();
            if (sev === 'critical') data.cell.styles.textColor = [239, 68, 68];
            else if (sev === 'high') data.cell.styles.textColor = [249, 115, 22];
            else if (sev === 'medium') data.cell.styles.textColor = [234, 179, 8];
            else data.cell.styles.textColor = [34, 197, 94];
          }
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 12;
    }

    // ── Transcript ──
    if (transcript.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(34, 211, 238);
      doc.text(`Transcript (${Math.min(transcript.length, 50)} of ${transcript.length} lines)`, 14, y);
      y += 2;
      doc.setFillColor(34, 211, 238);
      doc.rect(14, y, 40, 0.8, 'F');
      y += 6;

      const transcriptRows = transcript.slice(0, 50).map((line) => [
        new Date(line.ts).toLocaleTimeString(),
        line.speaker || '--',
        line.text.length > 80 ? line.text.slice(0, 80) + '…' : line.text,
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Time', 'Speaker', 'Text']],
        body: transcriptRows,
        theme: 'grid',
        headStyles: { fillColor: [15, 15, 30], textColor: [34, 211, 238], fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: { 2: { cellWidth: 110 } },
        margin: { left: 14, right: 14 },
      });
    }

    // ── Footer on all pages ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      // Footer line
      doc.setDrawColor(34, 211, 238);
      doc.setLineWidth(0.5);
      doc.line(14, pageH - 14, pageW - 14, pageH - 14);
      // Footer text
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140, 140, 150);
      doc.text('Generated by RealSync — AI-Powered Meeting Intelligence', 14, pageH - 8);
      doc.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 8, { align: 'right' });
    }

    // Save
    const filename = `RealSync_Report_${s.sessionId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  }, [report, alerts, transcript]);

  // ─── Detail View ───
  if (selectedSessionId) {
    const sessionInfo = sessions.find((s) => s.id === selectedSessionId);
    const summary = report?.summary;
    const overallRisk = summary ? getOverallRisk(summary.severityBreakdown) : 'low';

    return (
      <div className="flex h-screen bg-[#0f0f1e]">
        <Sidebar currentScreen="reports" onNavigate={onNavigate} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar title="Report Detail" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />

          <div className="flex-1 overflow-y-auto p-8">
            {/* Back + Download buttons */}
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="outline"
                className="bg-transparent border-gray-700 text-gray-300 hover:text-white"
                onClick={() => setSelectedSessionId(null)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Reports
              </Button>
              {report && !detailLoading && (
                <Button
                  className="bg-cyan-400 hover:bg-cyan-500 text-black"
                  onClick={downloadPDF}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              )}
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="ml-3 text-gray-400">Loading report...</span>
              </div>
            ) : (
              <>
                {/* Report Header */}
                <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-white text-2xl mb-2">{sessionInfo?.title || summary?.title || 'Session Report'}</h2>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {sessionInfo?.createdAt ? new Date(sessionInfo.createdAt).toLocaleString() : '--'}
                        </span>
                        <span>Duration: {sessionInfo ? formatDuration(sessionInfo.createdAt, sessionInfo.endedAt) : '--'}</span>
                        <span>Type: {summary?.meetingType || sessionInfo?.meetingType || '--'}</span>
                      </div>
                    </div>
                    <Badge className={`text-sm font-semibold ${getRiskBadge(overallRisk)}`}>
                      {overallRisk} risk
                    </Badge>
                  </div>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-4 gap-6 mb-6">
                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5 text-orange-400" />
                      <span className="text-gray-400 text-sm">Total Alerts</span>
                    </div>
                    <p className="text-white text-4xl font-mono mt-auto">{summary?.totalAlerts ?? alerts.length}</p>
                  </div>

                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-5 h-5 text-cyan-400" />
                      <span className="text-gray-400 text-sm">Transcript Lines</span>
                    </div>
                    <p className="text-white text-4xl font-mono mt-auto">{summary?.totalTranscriptLines ?? transcript.length}</p>
                  </div>

                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-5 h-5 text-red-400" />
                      <span className="text-gray-400 text-sm">Critical / High</span>
                    </div>
                    <p className="text-white text-4xl font-mono mt-auto">
                      {summary ? summary.severityBreakdown.critical + summary.severityBreakdown.high : alerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length}
                    </p>
                  </div>

                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="w-5 h-5 text-green-400" />
                      <span className="text-gray-400 text-sm">Overall Risk</span>
                    </div>
                    <p className={`text-4xl capitalize font-mono mt-auto ${
                      overallRisk === 'critical' ? 'text-red-400' :
                      overallRisk === 'high' ? 'text-orange-400' :
                      overallRisk === 'medium' ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {overallRisk}
                    </p>
                  </div>
                </div>

                {/* Severity Breakdown Bar */}
                {summary && (
                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800 mb-6">
                    <h3 className="text-white text-lg mb-4">Severity Breakdown</h3>
                    <div className="flex gap-4 mb-3">
                      {(Object.entries(summary.severityBreakdown) as [string, number][]).map(([level, count]) => (
                        <div key={level} className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${
                            level === 'critical' ? 'bg-red-500' :
                            level === 'high' ? 'bg-orange-500' :
                            level === 'medium' ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`} />
                          <span className="text-gray-400 text-sm capitalize">{level}: {count}</span>
                        </div>
                      ))}
                    </div>
                    {/* Stacked bar */}
                    {summary.totalAlerts > 0 && (
                      <div className="h-4 rounded-full overflow-hidden flex bg-[#2a2a3e]">
                        {summary.severityBreakdown.critical > 0 && (
                          <div className="bg-red-500 h-full" style={{ width: `${(summary.severityBreakdown.critical / summary.totalAlerts) * 100}%` }} />
                        )}
                        {summary.severityBreakdown.high > 0 && (
                          <div className="bg-orange-500 h-full" style={{ width: `${(summary.severityBreakdown.high / summary.totalAlerts) * 100}%` }} />
                        )}
                        {summary.severityBreakdown.medium > 0 && (
                          <div className="bg-yellow-500 h-full" style={{ width: `${(summary.severityBreakdown.medium / summary.totalAlerts) * 100}%` }} />
                        )}
                        {summary.severityBreakdown.low > 0 && (
                          <div className="bg-green-500 h-full" style={{ width: `${(summary.severityBreakdown.low / summary.totalAlerts) * 100}%` }} />
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  {/* Alerts Timeline */}
                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
                    <h3 className="text-white text-lg mb-4">Alert Timeline</h3>
                    {alerts.length === 0 ? (
                      <div className="text-gray-500 text-sm py-4 text-center">
                        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                        No alerts recorded for this session.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {alerts.map((alert, i) => (
                          <div key={alert.alertId || i} className="flex gap-3 p-3 rounded-lg bg-[#141427] border border-gray-800">
                            <div className={`w-2 rounded-full flex-shrink-0 ${
                              alert.severity === 'critical' ? 'bg-red-500' :
                              alert.severity === 'high' ? 'bg-orange-500' :
                              alert.severity === 'medium' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-white text-sm font-medium truncate">{alert.title}</p>
                                <Badge className={`flex-shrink-0 ${getRiskBadge(alert.severity)}`}>
                                  {alert.severity}
                                </Badge>
                              </div>
                              <p className="text-gray-400 text-xs mt-1">{alert.message}</p>
                              <div className="flex items-center gap-2 mt-2 text-gray-500 text-xs">
                                <span>{alert.category}</span>
                                <span>&middot;</span>
                                <span className="font-mono">{new Date(alert.ts).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Full Transcript */}
                  <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
                    <h3 className="text-white text-lg mb-4">Full Transcript</h3>
                    {transcript.length === 0 ? (
                      <div className="text-gray-500 text-sm py-4 text-center">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                        No transcript recorded for this session.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                        {transcript.map((line, i) => (
                          <div key={`${line.ts}-${i}`} className="text-sm py-2 border-b border-gray-800/50 last:border-0">
                            <span className="text-gray-500 mr-2 text-xs font-mono">{new Date(line.ts).toLocaleTimeString()}</span>
                            {line.speaker && (
                              <span className="text-cyan-400 mr-1.5 font-semibold">{line.speaker}:</span>
                            )}
                            <span className="text-white">{line.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── List View ───
  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="reports" onNavigate={onNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Meeting Analysis Reports" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />

        <div className="flex-1 overflow-y-auto p-8">
          {/* Search Bar */}
          <div className="mb-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search sessions by title or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-[#1a1a2e] border-gray-700 text-white h-12"
                />
              </div>
            </div>
          </div>

          {/* Sessions Table */}
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-white text-xl">Session Reports</h2>
              <p className="text-gray-400 text-sm">{filteredSessions.length} session(s)</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                <span className="ml-3 text-gray-400">Loading sessions...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400">
                  {sessions.length === 0
                    ? 'No sessions yet. Create one from the Sessions screen.'
                    : 'No sessions match your search.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Session ID</TableHead>
                      <TableHead className="text-gray-400">Title</TableHead>
                      <TableHead className="text-gray-400">Date</TableHead>
                      <TableHead className="text-gray-400">Duration</TableHead>
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSessions.map((session) => (
                      <TableRow
                        key={session.id}
                        className="border-gray-800 hover:bg-[#2a2a3e] cursor-pointer"
                        onClick={() => openReport(session.id)}
                      >
                        <TableCell className="text-cyan-400 font-mono text-xs">{session.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-white">{session.title}</TableCell>
                        <TableCell className="text-gray-300 font-mono text-xs">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-gray-300 font-mono">
                          {formatDuration(session.createdAt, session.endedAt)}
                        </TableCell>
                        <TableCell className="text-gray-300 capitalize">{session.meetingType}</TableCell>
                        <TableCell>
                          <Badge className={session.endedAt
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/20'
                            : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                          }>
                            {session.endedAt ? 'completed' : 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-transparent border-gray-700 text-gray-300 hover:text-white"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              openReport(session.id);
                            }}
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
