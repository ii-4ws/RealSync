import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { MoreVertical, Plus, ChevronLeft, ChevronRight, Eye, Download, Share2, Archive, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';

interface SessionsScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
}

export function SessionsScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail }: SessionsScreenProps) {
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [sessionType, setSessionType] = useState<'instant' | 'scheduled'>('instant');
  const [meetingName, setMeetingName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');

  const handleCreateSession = () => {
    if (!meetingName || !meetingId || !meetingLink) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (sessionType === 'scheduled' && (!meetingDate || !meetingTime)) {
      toast.error('Please select date and time for scheduled session');
      return;
    }

    if (sessionType === 'instant') {
      toast.success('Joining session...');
    } else {
      toast.success('Session scheduled successfully');
    }

    // Reset form
    setMeetingName('');
    setMeetingId('');
    setMeetingLink('');
    setMeetingPassword('');
    setMeetingDate('');
    setMeetingTime('');
    setIsNewSessionOpen(false);
  };

  const stats = [
    { label: 'Total Sessions', value: '1,247' },
    { label: 'Active Today', value: '23' },
    { label: 'Avg Duration', value: '42 min' },
    { label: 'Avg Trust Score', value: '94%' },
  ];

  const sessions = [
    {
      id: 'SES-001',
      title: 'Q3 Financial Review',
      date: 'Nov 16, 2025',
      time: '10:00 AM',
      duration: '42:15',
      participants: 12,
      trustScore: 98,
      status: 'completed',
    },
    {
      id: 'SES-002',
      title: 'Product Strategy Meeting',
      date: 'Nov 16, 2025',
      time: '2:30 PM',
      duration: '35:20',
      participants: 8,
      trustScore: 96,
      status: 'completed',
    },
    {
      id: 'SES-003',
      title: 'Client Onboarding Call',
      date: 'Nov 15, 2025',
      time: '11:15 AM',
      duration: '28:45',
      participants: 5,
      trustScore: 92,
      status: 'completed',
    },
    {
      id: 'SES-004',
      title: 'Team Standup',
      date: 'Nov 15, 2025',
      time: '9:00 AM',
      duration: '15:30',
      participants: 15,
      trustScore: 99,
      status: 'completed',
    },
    {
      id: 'SES-005',
      title: 'Investor Pitch',
      date: 'Nov 14, 2025',
      time: '3:00 PM',
      duration: '55:10',
      participants: 6,
      trustScore: 85,
      status: 'flagged',
    },
  ];

  const getTrustScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-400';
    if (score >= 85) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="sessions" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Live Meetings / Sessions" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} />
        
        <div className="flex-1 overflow-y-auto p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
                <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
                <p className="text-white text-3xl">{stat.value}</p>
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
                    <TableHead className="text-gray-400">Participants</TableHead>
                    <TableHead className="text-gray-400">Trust Score</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id} className="border-gray-800 hover:bg-[#2a2a3e]">
                      <TableCell>
                        <Checkbox className="border-gray-600" />
                      </TableCell>
                      <TableCell className="text-cyan-400">{session.id}</TableCell>
                      <TableCell className="text-white">{session.title}</TableCell>
                      <TableCell className="text-gray-300">
                        {session.date} {session.time}
                      </TableCell>
                      <TableCell className="text-gray-300">{session.duration}</TableCell>
                      <TableCell className="text-gray-300">{session.participants}</TableCell>
                      <TableCell className={getTrustScoreColor(session.trustScore)}>
                        {session.trustScore}%
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            session.status === 'completed'
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/20'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/20'
                          }
                        >
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="text-gray-400 hover:text-white">
                            <MoreVertical className="w-5 h-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-[#1a1a2e] border border-gray-800">
                            <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                              <Share2 className="w-4 h-4 mr-2" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-gray-400 hover:bg-gray-800">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-6 border-t border-gray-800 flex justify-between items-center">
              <p className="text-gray-400 text-sm">Showing 1-5 of 1,247 sessions</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="bg-transparent border-gray-700 text-gray-400">
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>
                <Button variant="outline" size="sm" className="bg-blue-600 border-blue-600 text-white">
                  1
                </Button>
                <Button variant="outline" size="sm" className="bg-transparent border-gray-700 text-gray-400">
                  2
                </Button>
                <Button variant="outline" size="sm" className="bg-transparent border-gray-700 text-gray-400">
                  3
                </Button>
                <Button variant="outline" size="sm" className="bg-transparent border-gray-700 text-gray-400">
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* New Session Dialog */}
        <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
          <DialogContent className="bg-[#1a1a2e] rounded-xl border border-gray-800">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">Create New Session</DialogTitle>
              <DialogDescription className="text-gray-400 text-sm">
                Create a new session either instantly or schedule it for later.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Session Type</Label>
                <Select value={sessionType} onValueChange={setSessionType}>
                  <SelectTrigger className="bg-[#1a1a2e] border border-gray-800 text-gray-400">
                    <SelectValue>
                      {sessionType === 'instant' ? 'Instant' : 'Scheduled'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border border-gray-800 text-gray-400">
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting Name</Label>
                <Input
                  type="text"
                  value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                  className="bg-[#1a1a2e] border border-gray-800 text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting ID</Label>
                <Input
                  type="text"
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  className="bg-[#1a1a2e] border border-gray-800 text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting Link</Label>
                <Input
                  type="text"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className="bg-[#1a1a2e] border border-gray-800 text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Meeting Password</Label>
                <Input
                  type="password"
                  value={meetingPassword}
                  onChange={(e) => setMeetingPassword(e.target.value)}
                  className="bg-[#1a1a2e] border border-gray-800 text-gray-400"
                />
              </div>

              {sessionType === 'scheduled' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">Date</Label>
                    <Input
                      type="date"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="bg-[#1a1a2e] border border-gray-800 text-gray-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">Time</Label>
                    <Input
                      type="time"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                      className="bg-[#1a1a2e] border border-gray-800 text-gray-400"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end mt-4">
              <Button
                className="bg-cyan-400 hover:bg-cyan-500 text-black"
                onClick={handleCreateSession}
              >
                Create Session
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}