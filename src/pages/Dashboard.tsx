import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, getCountFromServer, onSnapshot, doc, setDoc, or, and, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
  CheckSquare, Clock, FileText, AlertCircle, TrendingUp, 
  Users, Activity as ActivityIcon, Loader2, Calendar,
  ArrowRight, ChevronRight, History, Plus
} from 'lucide-react';
import { format, startOfWeek, endOfDay, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Task, Document, Activity } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { cn, safeDate } from '../lib/utils';

interface DashboardStats {
  activeTasks: number;
  totalDocs: number;
  hoursThisWeek: number;
  activeEmployees: number;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  
  const isSuperAdminEmail = (user?.email || profile?.email || '')?.toLowerCase() === 'servicefinda02@gmail.com';

  const [stats, setStats] = useState<DashboardStats>({
    activeTasks: 0,
    totalDocs: 0,
    hoursThisWeek: 0,
    activeEmployees: 0
  });
  const [tasksDueToday, setTasksDueToday] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [recentDocs, setRecentDocs] = useState<(Document & { last_activity?: Activity })[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = endOfDay(now).toISOString();
    const weekStart = startOfWeek(now).toISOString();

    // Listen to changes in several collections
    const isVerifiedAdmin = ['Admin', 'Super Admin', 'Manager'].includes(profile?.role || '');
    const isAdmin = isVerifiedAdmin || (profile?.role === 'Super Admin') || isSuperAdminEmail;
    
    // We use isVerifiedAdmin for the query filter to ensure non-elevated users only see their own tasks
    // BUT we should include Super Admin email in the 'elevated' logic
    const hasElevatedAccess = isAdmin;
    
    const tasksQuery = !hasElevatedAccess
      ? query(
          collection(db, 'tasks'), 
          or(
            where('assigned_ids', 'array-contains', profile.id), 
            where('created_by', '==', profile.id),
            where('assigned_to', '==', profile.id)
          )
        )
      : query(collection(db, 'tasks'), limit(10));

    const docsQuery = !hasElevatedAccess
      ? query(collection(db, 'documents'), where('uploaded_by', '==', profile.id))
      : query(collection(db, 'documents'), limit(10));

    const timeLogsQuery = query(collection(db, 'time_tracking'), where('user_id', '==', profile.id), where('clock_in', '>=', weekStart));
    const activeStaffQuery = query(collection(db, 'time_tracking'), where('clock_out', '==', null));
    
    // Only admins see system-wide latest activities
    const latestActivitiesQuery = !hasElevatedAccess
      ? query(collection(db, 'activity_logs'), where('user_id', '==', profile.id), orderBy('timestamp', 'desc'), limit(6))
      : query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(6));

    const fetchData = async () => {
      if (!profile?.id) return;
      try {
        // Task filters for non-admins
        const staffTaskFilter = !hasElevatedAccess
          ? or(
              where('assigned_ids', 'array-contains', profile.id), 
              where('created_by', '==', profile.id),
              where('assigned_to', '==', profile.id)
            )
          : null;

        const baseTasksQuery = collection(db, 'tasks');
        const activeTasksQuery = staffTaskFilter 
          ? query(baseTasksQuery, and(staffTaskFilter, where('status', '!=', 'Completed')))
          : query(baseTasksQuery, where('status', '!=', 'Completed'));

        const todayTasksQuery = staffTaskFilter
          ? query(baseTasksQuery, and(staffTaskFilter, where('due_date', '>=', todayStart), where('due_date', '<=', todayEnd), where('status', '!=', 'Completed')))
          : query(baseTasksQuery, where('due_date', '>=', todayStart), where('due_date', '<=', todayEnd), where('status', '!=', 'Completed'));

        const overdueTasksQuery = staffTaskFilter
          ? query(baseTasksQuery, and(staffTaskFilter, where('due_date', '<', todayStart), where('status', '!=', 'Completed')))
          : query(baseTasksQuery, where('due_date', '<', todayStart), where('status', '!=', 'Completed'));

        const [
          activeTasksSnap,
          docsCountSnap,
          weekLogsSnap,
          activeStaffSnap,
          activitiesSnap,
          todayTasksSnap,
          overdueTasksSnap,
          recentDocsSnap
        ] = await Promise.all([
          getDocs(query(activeTasksQuery, limit(100))).catch(() => ({ docs: [] })),
          getCountFromServer(docsQuery).catch(() => ({ data: () => ({ count: 0 }) })),
          getDocs(timeLogsQuery).catch(() => ({ docs: [] })),
          getDocs(activeStaffQuery).catch(() => ({ size: 0, docs: [] })),
          getDocs(latestActivitiesQuery).catch(() => ({ docs: [] })),
          getDocs(todayTasksQuery).catch(() => ({ docs: [] })),
          getDocs(overdueTasksQuery).catch(() => ({ docs: [] })),
          getDocs(query(docsQuery, limit(4))).catch(() => ({ docs: [] }))
        ]);

        const activities = (activitiesSnap as any).docs?.map((d: any) => ({ id: d.id, ...d.data() } as Activity)) || [];
        const todayTasks = (todayTasksSnap as any).docs?.map((d: any) => ({ id: d.id, ...d.data() } as Task)) || [];
        const overdue = (overdueTasksSnap as any).docs?.map((d: any) => ({ id: d.id, ...d.data() } as Task)) || [];
        const docs = (recentDocsSnap as any).docs?.map((d: any) => ({ id: d.id, ...d.data() } as Document)) || [];

        const activeCount = (activeTasksSnap as any).docs?.filter((d: any) => d.data().status !== 'Completed').length || 0;

        setStats({
          activeTasks: activeCount,
          totalDocs: (docsCountSnap as any).data?.().count || 0,
          hoursThisWeek: (weekLogsSnap as any).docs?.reduce((acc: number, d: any) => acc + (d.data().total_hours || 0), 0) || 0,
          activeEmployees: (activeStaffSnap as any).size || 0
        });

        setTasksDueToday(todayTasks);
        setOverdueTasks(overdue);
        setRecentActivity(activities);
        setRecentDocs(docs.map(d => ({ ...d, last_activity: undefined })));
        
        setActiveUsers((activeStaffSnap as any).docs?.map((d: any) => ({ id: d.id, ...d.data() })) || []);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to changes for real-time updates
    const unsubTasks = onSnapshot(tasksQuery, () => fetchData(), (err) => console.error('Tasks snapshot error:', err));
    const unsubDocs = onSnapshot(docsQuery, () => fetchData(), (err) => console.error('Docs snapshot error:', err));
    const unsubActivity = onSnapshot(latestActivitiesQuery, () => fetchData(), (err) => console.error('Activity snapshot error:', err));

    return () => {
      unsubTasks();
      unsubDocs();
      unsubActivity();
    };
  }, [profile]);

  const statCards = [
    { label: 'Active Tasks', value: stats.activeTasks, icon: CheckSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Documents', value: stats.totalDocs, icon: FileText, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Hours This Week', value: `${stats.hoursThisWeek.toFixed(1)}h`, icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Active Now', value: stats.activeEmployees, icon: Users, color: 'text-amber-500', bg: 'bg-amber-50' },
  ];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Welcome back, {
              isSuperAdminEmail 
                ? 'Super Admin' 
                : (profile?.name && profile.name.trim() ? profile.name.trim().split(' ')[0] : 'Admin')
            }!
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-zinc-500 dark:text-zinc-400 text-lg">
              {format(new Date(), 'EEEE, MMMM do')} — Here's your overview.
            </p>
            {isSuperAdminEmail && (
              <button 
                onClick={async () => {
                  try {
                    if (!user?.uid) throw new Error("User session ID missing");
                    
                    await setDoc(doc(db, 'profiles', user.uid), { 
                      id: user.uid, 
                      email: user.email!,
                      role: 'Super Admin', 
                      name: 'Super Admin',
                      updated_at: new Date().toISOString()
                    }, { merge: true });

                    alert('Cloud identity permissions hard-synced successfully! Refreshing dashboard...');
                    window.location.reload();
                  } catch (e: any) {
                    alert('Sync failure: ' + e.message);
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-tighter hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync Active
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/tasks?new=true')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <Plus size={18} /> New Task
          </button>
          <div className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">{stats.activeEmployees} Team Members Online</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-2xl transition-colors", stat.bg, theme === 'dark' && 'bg-zinc-800')}>
                <stat.icon className={stat.color} size={24} />
              </div>
              <TrendingUp className="text-zinc-200 dark:text-zinc-800 group-hover:text-zinc-400 transition-colors" size={20} />
            </div>
            <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">{stat.label}</p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Tasks & Activity */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Tasks Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tasks Due Today */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                <h2 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 text-sm">
                  <Calendar size={18} className="text-blue-500" />
                  Due Today
                </h2>
                <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full uppercase">
                  {tasksDueToday.length} Tasks
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {tasksDueToday.length > 0 ? (
                  tasksDueToday.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => navigate(`/tasks?id=${task.id}`)}
                      className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 transition-colors">{task.title}</p>
                          <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-wider">
                            {task.priority}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-zinc-400 text-sm italic">
                    No tasks due today.
                  </div>
                )}
              </div>
            </div>

            {/* Overdue Tasks */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                <h2 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 text-sm">
                  <AlertCircle size={18} className="text-rose-500" />
                  Overdue
                </h2>
                <span className="text-[10px] font-bold bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full uppercase">
                  {overdueTasks.length} Tasks
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {overdueTasks.length > 0 ? (
                  overdueTasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => navigate(`/tasks?id=${task.id}`)}
                      className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-rose-600 transition-colors">{task.title}</p>
                          <p className="text-[10px] text-rose-400 mt-1 uppercase font-bold tracking-wider">
                            Due {task.due_date ? format(safeDate(task.due_date), 'MMM d') : 'No date'}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-zinc-400 text-sm italic">
                    Great job! No overdue tasks.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <ActivityIcon size={20} className="text-emerald-500" />
                System Activity
              </h2>
              <a href="/activity" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1">
                View History <ArrowRight size={14} />
              </a>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="p-5 flex gap-4 items-start hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 flex-shrink-0 border border-zinc-200 dark:border-zinc-700">
                      ?
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-zinc-900 dark:text-zinc-100">
                          <span className="font-bold">System</span> {activity.action}
                        </p>
                        <span className="text-[10px] text-zinc-400 font-medium">
                           {activity.timestamp || activity.created_at ? format(safeDate(activity.timestamp || activity.created_at), 'h:mm a') : 'Recently'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {activity.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          {activity.target_type}
                        </span>
                        {activity.target_id && (
                          <span className="text-[9px] font-bold text-zinc-300 dark:text-zinc-700 uppercase tracking-widest">
                            ID: {activity.target_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-zinc-400 text-sm">
                  No recent activity found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Documents & Team */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Recent Documents */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <FileText size={20} className="text-purple-500" />
                Recent Documents
              </h2>
              <a href="/documents" className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700">All Files</a>
            </div>
            <div className="p-4 space-y-4">
              {recentDocs.length > 0 ? (
                recentDocs.map(doc => (
                  <div key={doc.id} className="p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 hover:border-purple-200 dark:hover:border-purple-500/30 hover:bg-purple-50/30 dark:hover:bg-purple-500/10 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{doc.name}</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">
                          Uploaded Metadata
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-zinc-400 text-sm italic">
                  No documents found.
                </div>
              )}
            </div>
          </div>

          {/* Team Status */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Users size={20} className="text-amber-500" />
                Team Status
              </h2>
            </div>
            <div className="p-6 space-y-5">
              {activeUsers.length > 0 ? (
                activeUsers.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 overflow-hidden border border-zinc-200 dark:border-zinc-700">
                          {item.user_id?.[0]}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 bg-emerald-500 animate-pulse"></div>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">User {item.user_id?.slice(0, 4)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-500/20">
                        Online
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-zinc-400 text-sm italic">
                  No one is currently clocked in.
                </div>
              )}
            </div>
          </div>

          {/* Weekly Summary */}
          <div className="bg-zinc-900 dark:bg-zinc-950 rounded-3xl p-6 text-white shadow-xl shadow-zinc-200/50 dark:shadow-none relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-zinc-400 uppercase tracking-widest text-[10px]">Weekly Work Hours</h2>
                <History size={18} className="text-zinc-500" />
              </div>
              <div className="flex items-end gap-2 mb-4">
                <p className="text-5xl font-bold tracking-tighter">{stats.hoursThisWeek.toFixed(1)}</p>
                <p className="text-zinc-400 font-bold mb-1">HOURS</p>
              </div>
              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min((stats.hoursThisWeek / 40) * 100, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-3 font-bold uppercase tracking-wider">
                {stats.hoursThisWeek >= 40 ? 'Goal Reached!' : `${(40 - stats.hoursThisWeek).toFixed(1)}h to reach 40h goal`}
              </p>
            </div>
            {/* Decorative background element */}
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors" />
          </div>

        </div>
      </div>
    </div>
  );
}


