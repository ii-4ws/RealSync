import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Search, Filter, Download, FileText, MoreVertical, ChevronLeft, ChevronRight, GitCompare } from 'lucide-react';

type Screen = 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq';

interface ReportsScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
}

export function ReportsScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail }: ReportsScreenProps) {
  const reports = [
    {
      id: 'RPT-001',
      name: 'Q3 Financial Review Analysis',
      date: 'Nov 16, 2025',
      duration: '42:15',
      riskLevel: 'low',
      actions: 3,
    },
    {
      id: 'RPT-002',
      name: 'Product Strategy Session Report',
      date: 'Nov 16, 2025',
      duration: '35:20',
      riskLevel: 'low',
      actions: 2,
    },
    {
      id: 'RPT-003',
      name: 'Client Onboarding Analysis',
      date: 'Nov 15, 2025',
      duration: '28:45',
      riskLevel: 'medium',
      actions: 5,
    },
    {
      id: 'RPT-004',
      name: 'Team Standup Summary',
      date: 'Nov 15, 2025',
      duration: '15:30',
      riskLevel: 'low',
      actions: 1,
    },
    {
      id: 'RPT-005',
      name: 'Investor Pitch Deep Analysis',
      date: 'Nov 14, 2025',
      duration: '55:10',
      riskLevel: 'high',
      actions: 12,
    },
  ];

  const getRiskBadge = (risk: string) => {
    const styles = {
      low: 'bg-green-500/20 text-green-400 hover:bg-green-500/20',
      medium: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20',
      high: 'bg-red-500/20 text-red-400 hover:bg-red-500/20',
    };
    return styles[risk as keyof typeof styles];
  };

  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="reports" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Meeting Analysis Reports" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} />
        
        <div className="flex-1 overflow-y-auto p-8">
          {/* Filters and Actions */}
          <div className="mb-6 space-y-4">
            {/* Search Bar */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search reports..."
                  className="pl-10 bg-[#1a1a2e] border-gray-700 text-white h-12"
                />
              </div>
              <Button className="bg-cyan-400 hover:bg-cyan-500 text-black h-12 px-6">
                <FileText className="w-4 h-4 mr-2" />
                Generate New Report
              </Button>
            </div>

            {/* Filters Row */}
            <div className="flex gap-4">
              <Select>
                <SelectTrigger className="w-48 bg-[#1a1a2e] border-gray-700 text-white h-11">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-gray-700">
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-48 bg-[#1a1a2e] border-gray-700 text-white h-11">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-gray-700">
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-48 bg-[#1a1a2e] border-gray-700 text-white h-11">
                  <SelectValue placeholder="Meeting Host" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-gray-700">
                  <SelectItem value="all">All Hosts</SelectItem>
                  <SelectItem value="john">John Doe</SelectItem>
                  <SelectItem value="jane">Jane Smith</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1"></div>

              <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300 h-11">
                <GitCompare className="w-4 h-4 mr-2" />
                Compare Sessions
              </Button>

              <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300 h-11">
                <Download className="w-4 h-4 mr-2" />
                Bulk Download
              </Button>
            </div>
          </div>

          {/* Reports Table */}
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-white text-xl">Analysis Reports</h2>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="w-12">
                      <Checkbox className="border-gray-600" />
                    </TableHead>
                    <TableHead className="text-gray-400">Report ID</TableHead>
                    <TableHead className="text-gray-400">Name</TableHead>
                    <TableHead className="text-gray-400">Date</TableHead>
                    <TableHead className="text-gray-400">Duration</TableHead>
                    <TableHead className="text-gray-400">Risk Level</TableHead>
                    <TableHead className="text-gray-400">Actions</TableHead>
                    <TableHead className="text-gray-400"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id} className="border-gray-800 hover:bg-[#2a2a3e]">
                      <TableCell>
                        <Checkbox className="border-gray-600" />
                      </TableCell>
                      <TableCell className="text-cyan-400">{report.id}</TableCell>
                      <TableCell className="text-white">{report.name}</TableCell>
                      <TableCell className="text-gray-300">{report.date}</TableCell>
                      <TableCell className="text-gray-300">{report.duration}</TableCell>
                      <TableCell>
                        <Badge className={getRiskBadge(report.riskLevel)}>
                          {report.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-300">{report.actions} items</TableCell>
                      <TableCell>
                        <button className="text-gray-400 hover:text-white">
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-6 border-t border-gray-800 flex justify-between items-center">
              <p className="text-gray-400 text-sm">Showing 1-5 of 247 reports</p>
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
      </div>
    </div>
  );
}