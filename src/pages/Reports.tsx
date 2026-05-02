import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend
} from 'recharts';
import { 
  Calendar, Users, FileText, CheckCircle2, Clock, 
  Download, Filter, ChevronDown, TrendingUp, AlertCircle,
  FileBarChart, Loader2, ArrowRight, X, Briefcase, Activity,
  ArrowUpRight, ArrowDownRight, History
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, limit } from 'firebase/firestore';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, differenceInDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Task, Document, Profile } from '../types';
import { safeDate, formatBytes } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type ReportType = 'time' | 'tasks' | 'storage' | 'team';
type UserTabType = 'tasks' | 'time' | 'documents';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const UserReportDrawer = ({ 
  user, 
  onClose, 
  profiles 
}: { 
  user: Profile; 
  onClose: () => void;
  profiles: Profile[];
}) => {
  const [activeTab, setActiveTab] = useState<UserTabType>('tasks');
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [dateRange, setDateRange] = useState('30d');

  useEffect(() => {
    fetchUserData();
  }, [user.id, dateRange]);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = subDays(new Date(), days);
      const startTimestamp = Timestamp.fromDate(startDate);

      const [tasksSnap, timeSnap, logsSnap, docsSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), where('created_at', '>=', startTimestamp))),
        getDocs(query(collection(db, 'time_tracking'), where('user_id', '==', user.id), where('clock_in', '>=', startTimestamp), orderBy('clock_in', 'desc'))),
        getDocs(query(collection(db, 'activity_logs'), where('performed_by', '==', user.id), where('executed_at', '>=', startTimestamp), orderBy('executed_at', 'desc'))),
        getDocs(collection(db, 'documents'))
      ]);

      const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const userTasks = allTasks.filter(t => t.assigned_ids?.includes(user.id) || t.created_by === user.id);
      const timeLogs = timeSnap.docs.map(d => d.data());
      const activityLogs = logsSnap.docs.map(d => d.data());
      const ownedDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(d => d.uploaded_by === user.id);

      // Task Summary
      const taskSummary = {
        total: userTasks.length,
        completed: userTasks.filter(t => t.status === 'Completed').length,
        pending: userTasks.filter(t => ['Todo', 'In Progress', 'In Review'].includes(t.status)).length,
        overdue: userTasks.filter(t => t.status !== 'Completed' && t.due_date && safeDate(t.due_date) < new Date()).length
      };

      // Time Summary
      const totalHours = timeLogs.reduce((acc, log) => {
        if (!log.clock_out) return acc;
        return acc + (safeDate(log.clock_out).getTime() - safeDate(log.clock_in).getTime());
      }, 0) / (1000 * 60 * 60);

      const activeDays = new Set(timeLogs.map(log => format(safeDate(log.clock_in), 'yyyy-MM-dd'))).size;

      setUserData({
        tasks: userTasks,
        taskSummary,
        timeLogs,
        timeStats: {
          totalHours: totalHours.toFixed(1),
          avgDaily: activeDays > 0 ? (totalHours / activeDays).toFixed(1) : 0,
          activeDays
        },
        activityLogs: activityLogs.filter(log => log.collection === 'documents'),
        ownedDocs
      });
    } catch (err) {
      console.error('Drawer data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white dark:bg-zinc-950 shadow-2xl z-50 flex flex-col border-l border-zinc-200 dark:border-zinc-800"
    >
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-emerald-500/20">
            {user.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">{user.name}</h2>
              <span className={`w-2 h-2 rounded-full ${user.role === 'Admin' ? 'bg-blue-500' : 'bg-emerald-500'} animate-pulse`} />
            </div>
            <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">{user.role}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                {user.department || 'General'}
              </span>
              <span className="text-[10px] font-black uppercase tracking-tighter text-emerald-500">Active Now</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Tabs Nav */}
      <div className="px-6 py-4 flex gap-6 bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800">
        {[
          { id: 'tasks', label: 'Task Report', icon: CheckCircle2 },
          { id: 'time', label: 'Time Activity', icon: Clock },
          { id: 'documents', label: 'Documents', icon: FileText },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as UserTabType)}
            className={`flex items-center gap-2 pb-4 -mb-4 border-b-2 font-black uppercase tracking-widest text-[10px] transition-all ${
              activeTab === tab.id 
                ? 'border-emerald-500 text-emerald-500' 
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50">
            <Loader2 className="animate-spin text-emerald-500 mb-4" size={40} />
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Loading metrics...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                {/* Task Summary Cards */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total', value: userData.taskSummary.total, color: 'zinc' },
                    { label: 'Completed', value: userData.taskSummary.completed, color: 'emerald' },
                    { label: 'Pending', value: userData.taskSummary.pending, color: 'amber' },
                    { label: 'Overdue', value: userData.taskSummary.overdue, color: 'rose' },
                  ].map(stat => (
                    <div key={stat.label} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">{stat.label}</p>
                      <p className={`text-xl font-black text-${stat.color}-500 transition-all`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Task Table */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Task Name</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Status</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                      {userData.tasks.map((task: any) => (
                        <tr key={task.id} className="text-sm">
                          <td className="px-4 py-3 font-bold text-zinc-700 dark:text-zinc-300">{task.title}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500' :
                              task.status === 'In Progress' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                            }`}>
                              {task.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500 font-medium">
                            {task.due_date ? format(safeDate(task.due_date), 'MMM d, yyyy') : 'No date'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'time' && (
              <div className="space-y-6">
                {/* Time Summary */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Logged Hours', value: userData.timeStats.totalHours, icon: Clock, color: 'emerald' },
                    { label: 'Daily Avg', value: userData.timeStats.avgDaily, icon: Activity, color: 'blue' },
                    { label: 'Active Days', value: userData.timeStats.activeDays, icon: Calendar, color: 'amber' },
                  ].map(stat => (
                    <div key={stat.label} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-sm">
                      <div className={`w-8 h-8 rounded-lg bg-${stat.color}-500/10 text-${stat.color}-500 flex items-center justify-center mb-4`}>
                        <stat.icon size={16} />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{stat.label}</p>
                      <p className="text-lg font-black">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Clock Logs */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <History size={12} /> Recent Sessions
                  </h4>
                  <div className="space-y-2">
                    {userData.timeLogs.map((log: any, idx: number) => (
                      <div key={idx} className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-between border border-zinc-100/50 dark:border-zinc-800/50">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <Clock size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-zinc-700 dark:text-zinc-300">
                              {format(safeDate(log.clock_in), 'EEEE, MMM d')}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-medium">
                              {format(safeDate(log.clock_in), 'HH:mm')} — {log.clock_out ? format(safeDate(log.clock_out), 'HH:mm') : 'Active'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-600">
                            {log.clock_out 
                              ? ((safeDate(log.clock_out).getTime() - safeDate(log.clock_in).getTime()) / (1000 * 60 * 60)).toFixed(2)
                              : '...'
                            }h
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-6">
                {/* Doc Summary */}
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Asset Ownership</p>
                    <p className="text-sm font-medium text-zinc-500">This user manages {userData.ownedDocs.length} enterprise documents.</p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                    <FileText size={20} />
                  </div>
                </div>

                {/* Interaction Table */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Activity size={12} /> Document Interactions
                  </h4>
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Resource</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Action</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                        {userData.activityLogs.map((log: any, idx: number) => (
                          <tr key={idx} className="text-sm">
                            <td className="px-4 py-3">
                              <span className="font-bold text-zinc-700 dark:text-zinc-300 block truncate max-w-[150px]">
                                {log.action_details?.title || log.document_name || 'Generic Asset'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-black uppercase ${
                                log.action === 'Uploaded' ? 'text-blue-500' :
                                log.action === 'Deleted' ? 'text-rose-500' : 'text-emerald-500'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-[10px] text-zinc-500 font-medium font-mono">
                              {format(safeDate(log.executed_at), 'MM/dd HH:mm')}
                            </td>
                          </tr>
                        ))}
                        {userData.activityLogs.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-zinc-400 italic text-xs">
                              No document activity detected in this cycle.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer / Export */}
      <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <button 
          onClick={() => alert(`Generating detailed report for ${user.name}...`)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
        >
          <Download size={16} />
          Export User Metrics (PDF)
        </button>
      </div>
    </motion.div>
  );
};

export default function Reports() {
  const { profile } = useAuth();
  const [activeReport, setActiveReport] = useState<ReportType>('time');
  const [dateRange, setDateRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drillDownUser, setDrillDownUser] = useState<Profile | null>(null);

  const isAdmin = ['Admin', 'Super Admin'].includes(profile?.role || '');

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [activeReport, dateRange]);

  const fetchProfiles = async () => {
    const snap = await getDocs(collection(db, 'profiles'));
    setProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Profile)));
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = subDays(new Date(), days);

      if (activeReport === 'time') {
        await fetchTimeReport(startDate);
      } else if (activeReport === 'tasks') {
        await fetchTaskReport(startDate);
      } else if (activeReport === 'storage') {
        await fetchStorageReport();
      } else if (activeReport === 'team') {
        await fetchTeamReport(startDate);
      }
    } catch (err) {
      console.error('Report error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeReport = async (startDate: Date) => {
    const q = query(
      collection(db, 'time_tracking'),
      where('clock_in', '>=', Timestamp.fromDate(startDate)),
      orderBy('clock_in', 'asc')
    );
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => d.data());

    // Aggregate by day
    const days = eachDayOfInterval({ start: startDate, end: new Date() });
    const chartData = days.map(day => {
      const dayLogs = logs.filter(log => isSameDay(safeDate(log.clock_in), day));
      const totalMillis = dayLogs.reduce((acc, log) => {
        if (!log.clock_out) return acc;
        return acc + (safeDate(log.clock_out).getTime() - safeDate(log.clock_in).getTime());
      }, 0);
      return {
        date: format(day, 'MMM d'),
        hours: Number((totalMillis / (1000 * 60 * 60)).toFixed(2))
      };
    });

    // Aggregate by user
    const userMap = new Map();
    logs.forEach(log => {
      const userId = log.user_id;
      if (!log.clock_out) return;
      const hours = (safeDate(log.clock_out).getTime() - safeDate(log.clock_in).getTime()) / (1000 * 60 * 60);
      userMap.set(userId, (userMap.get(userId) || 0) + hours);
    });

    const userData = Array.from(userMap.entries()).map(([uid, hours]) => {
      const p = profiles.find(p => p.id === uid);
      return { name: p?.name || 'Unknown', hours: Number(hours.toFixed(1)) };
    }).sort((a, b) => b.hours - a.hours);

    setData({ chartData, userData, totalHours: chartData.reduce((a, b) => a + b.hours, 0) });
  };

  const fetchTaskReport = async (startDate: Date) => {
    const q = query(
      collection(db, 'tasks'),
      where('created_at', '>=', Timestamp.fromDate(startDate))
    );
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => d.data() as Task);

    const statusCounts = tasks.reduce((acc: any, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});

    const priorityCounts = tasks.reduce((acc: any, t) => {
      acc[t.priority] = (acc[t.priority] || 0) + 1;
      return acc;
    }, {});

    const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    const priorityData = Object.entries(priorityCounts).map(([name, value]) => ({ name, value }));
    
    const days = eachDayOfInterval({ start: startDate, end: new Date() });
    const lineData = days.map(day => ({
      date: format(day, 'MMM d'),
      created: tasks.filter(t => isSameDay(safeDate(t.created_at), day)).length,
      completed: tasks.filter(t => t.status === 'Completed' && t.updated_at && isSameDay(safeDate(t.updated_at), day)).length
    }));

    setData({ pieData, lineData, priorityData, totalHours: 0 });
  };

  const fetchStorageReport = async () => {
    const snap = await getDocs(collection(db, 'documents'));
    const docs = snap.docs.map(d => d.data() as Document);

    const typeGroups = docs.reduce((acc: any, d) => {
      const type = (d.file_type || 'other').split('/')[1] || 'ext';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const pieData = Object.entries(typeGroups).map(([name, value]) => ({ 
      name: name.toUpperCase(), 
      value 
    })).sort((a: any, b: any) => b.value - a.value).slice(0, 5);

    const userGroups = docs.reduce((acc: any, d) => {
      const p = profiles.find(p => p.id === d.uploaded_by);
      const name = p?.name || 'Unknown';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    const uploaderData = Object.entries(userGroups).map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value).slice(0, 5);

    const totalSize = docs.reduce((acc, d) => acc + (d.size || 0), 0);
    
    setData({ pieData, uploaderData, totalSize, docCount: docs.length });
  };

  const fetchTeamReport = async (startDate: Date) => {
    const [tasksSnap, commentsSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('created_at', '>=', Timestamp.fromDate(startDate)))),
      getDocs(query(collection(db, 'task_comments'), where('created_at', '>=', Timestamp.fromDate(startDate))))
    ]);

    const tasks = tasksSnap.docs.map(d => d.data());
    const comments = commentsSnap.docs.map(d => d.data());

    const teamStats = profiles.map(p => {
      const created = tasks.filter(t => t.created_by === p.id).length;
      const assigned = tasks.filter(t => t.assigned_ids?.includes(p.id)).length;
      const completed = tasks.filter(t => t.assigned_ids?.includes(p.id) && t.status === 'Completed').length;
      const feedback = comments.filter(c => c.user_id === p.id).length;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        created,
        assigned,
        completed,
        feedback,
        score: created + (assigned * 0.5) + (completed * 2) + (feedback * 0.2),
        activity: created + assigned + feedback
      };
    }).sort((a, b) => b.score - a.score);

    setData({ teamStats });
  };

  const handleExport = () => {
    alert('Exporting data as CSV...');
  };

  return (
    <div className="space-y-8 relative">
      <AnimatePresence>
        {drillDownUser && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrillDownUser(null)}
              className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-40"
            />
            <UserReportDrawer 
              user={drillDownUser} 
              onClose={() => setDrillDownUser(null)} 
              profiles={profiles}
            />
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Enterprise Reporting</h1>
          <p className="text-zinc-500 text-sm mt-1">Intelligent insights for team performance and infrastructure audit.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold hover:bg-zinc-50 transition-all shadow-sm"
          >
            <Download size={16} />
            Export Data
          </button>
        </div>
      </div>

      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl w-full max-w-xl">
        {[
          { id: 'time', label: 'Hours', icon: Clock },
          { id: 'tasks', label: 'Velocity', icon: CheckCircle2 },
          { id: 'storage', label: 'Cloud', icon: FileBarChart },
          { id: 'team', label: 'Pulse', icon: Users },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id as ReportType)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeReport === tab.id 
                ? 'bg-white dark:bg-zinc-800 text-emerald-500 shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl space-y-6 shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Analysis Param</h3>
            
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: '7d', label: 'Past Week' },
                { id: '30d', label: 'Last 30 Days' },
                { id: '90d', label: 'Quarterly' },
              ].map(r => (
                <button 
                  key={r.id}
                  onClick={() => setDateRange(r.id)}
                  className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-all border ${
                    dateRange === r.id 
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' 
                      : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="p-4 bg-emerald-500/5 rounded-2xl border border-dashed border-emerald-500/20">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-black mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Ledger Synchronized</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-[500px] flex flex-col items-center justify-center"
              >
                <Loader2 className="animate-spin text-emerald-500 mb-4" size={48} />
                <p className="text-zinc-500 font-black uppercase tracking-widest text-[10px]">Processing Database...</p>
              </motion.div>
            ) : (
              <motion.div
                key={activeReport}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                       <TrendingUp size={16} className="text-emerald-500" />
                       Efficiency Trend
                    </h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        {activeReport === 'time' ? (
                          <AreaChart data={data.chartData}>
                            <defs>
                              <linearGradient id="colorMain" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px', fontSize: '10px', color: '#fff' }} />
                            <Area type="monotone" dataKey="hours" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorMain)" />
                          </AreaChart>
                        ) : (
                          <BarChart data={data.lineData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                            <Bar dataKey="created" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                       <BarChart size={16} className="text-emerald-500" />
                       Distribution
                    </h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie
                             data={data.pieData || data.priorityData}
                             cx="50%"
                             cy="50%"
                             innerRadius={60}
                             outerRadius={80}
                             paddingAngle={5}
                             dataKey="value"
                           >
                             {(data.pieData || data.priorityData)?.map((entry: any, index: number) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                           </Pie>
                           <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                           <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                         </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Resource Registry</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-zinc-50 dark:border-zinc-800/50">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Target</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Metric</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Drill-down</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                        {activeReport === 'team' && data.teamStats?.map((s: any) => (
                          <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-xs font-black">
                                  {s.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-black">{s.name}</span>
                                  <span className="text-[10px] uppercase font-bold text-zinc-400">{s.role}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5 min-w-[150px]">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-zinc-500">
                                  <span>Activity</span>
                                  <span>{s.score.toFixed(0)} pts</span>
                                </div>
                                <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(s.score * 5, 100)}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setDrillDownUser(profiles.find(p => p.id === s.id) || null)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all"
                              >
                                View Report <ArrowRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {activeReport !== 'team' && (
                           <tr>
                             <td colSpan={3} className="px-6 py-8 text-center text-zinc-400 text-xs italic">
                               Switch to "Pulse" tab to drill down into team member specifics.
                             </td>
                           </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
