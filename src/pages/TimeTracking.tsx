import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, addDoc, updateDoc, orderBy, limit, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Play, Square, Clock, Calendar, History, TrendingUp, Loader2, Coffee, Users } from 'lucide-react';
import { format, differenceInSeconds, startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { TimeLog, Profile, ProfileDisplay } from '../types';
import { cn, safeDate } from '../lib/utils';

export default function TimeTracking() {
  const { profile } = useAuth();
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [activeUsers, setActiveUsers] = useState<(TimeLog & { profiles?: ProfileDisplay })[]>([]);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(0);
  const [stats, setStats] = useState({
    today: 0,
    week: 0
  });

  useEffect(() => {
    if (!profile) return;
    
    // Subscribe to active users
    const activeUsersQuery = query(collection(db, 'time_tracking'), where('clock_out', '==', null));
    const unsubscribeActiveUsers = onSnapshot(activeUsersQuery, async (snapshot) => {
      const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TimeLog));
      const resolvedUsers = await Promise.all(usersData.map(async (u) => {
        const pSnap = await getDoc(doc(db, 'profiles', u.user_id));
        return {
          ...u,
          profiles: pSnap.exists() ? { name: pSnap.data().name, avatar_url: pSnap.data().avatar_url } : undefined
        };
      }));
      setActiveUsers(resolvedUsers);
    });

    // Subscribe to current user's active session
    const activeSessionQuery = query(
      collection(db, 'time_tracking'), 
      where('user_id', '==', profile.id),
      where('clock_out', '==', null)
    );
    const unsubscribeActiveSession = onSnapshot(activeSessionQuery, (snapshot) => {
      if (!snapshot.empty) {
        setActiveLog({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as TimeLog);
      } else {
        setActiveLog(null);
      }
    });

    fetchLogs();
    fetchStats();

    return () => {
      unsubscribeActiveUsers();
      unsubscribeActiveSession();
    };
  }, [profile]);

  useEffect(() => {
    let interval: any;
    if (activeLog) {
      interval = setInterval(() => {
        const now = new Date();
        const clockIn = safeDate(activeLog.clock_in);
        let totalSeconds = differenceInSeconds(now, clockIn);
        
        // Subtract break time
        if (activeLog && activeLog.breaks && Array.isArray(activeLog.breaks)) {
          activeLog.breaks.forEach(b => {
            const start = safeDate(b.start);
            const end = b.end ? safeDate(b.end) : now;
            totalSeconds -= differenceInSeconds(end, start);
          });
        }
        
        setTimer(totalSeconds > 0 ? totalSeconds : 0);
      }, 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [activeLog]);

  async function fetchStats() {
    if (!profile) {
      setLoading(false);
      return;
    }
    const todayStart = startOfDay(new Date()).toISOString();
    const weekStart = startOfWeek(new Date()).toISOString();

    const todayQuery = query(collection(db, 'time_tracking'), where('user_id', '==', profile.id), where('clock_in', '>=', todayStart));
    const weekQuery = query(collection(db, 'time_tracking'), where('user_id', '==', profile.id), where('clock_in', '>=', weekStart));

    const [todayLogs, weekLogs] = await Promise.all([
      getDocs(todayQuery),
      getDocs(weekQuery)
    ]);

    setStats({
      today: todayLogs.docs.reduce((acc, d) => acc + (d.data().total_hours || 0), 0),
      week: weekLogs.docs.reduce((acc, d) => acc + (d.data().total_hours || 0), 0)
    });
  }

  async function fetchLogs() {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'time_tracking'),
        where('user_id', '==', profile.id),
        where('clock_out', '!=', null),
        orderBy('clock_out', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TimeLog)));
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleClockIn() {
    if (!profile) return;
    setLoading(true);
    try {
      const logData = {
        user_id: profile.id,
        clock_in: new Date().toISOString(),
        clock_out: null,
        breaks: [],
        total_hours: 0,
        created_at: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'time_tracking'), logData);
      
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'clocked in',
        target_type: 'time_log',
        target_id: docRef.id,
        description: `Clocked in at ${format(new Date(), 'h:mm a')}`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error clocking in:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!activeLog || !profile) return;
    
    // If on break, end break first
    const isOnBreak = activeLog.breaks?.some(b => !b.end);
    if (isOnBreak) {
      alert('Please end your break before clocking out.');
      return;
    }

    setLoading(true);
    try {
      const clockOut = new Date().toISOString();
      const totalHours = timer / 3600;
      
      await updateDoc(doc(db, 'time_tracking', activeLog.id), { 
        clock_out: clockOut, 
        total_hours: totalHours 
      });
      
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'clocked out',
        target_type: 'time_log',
        target_id: activeLog.id,
        description: `Clocked out after ${formatDuration(timer)}`,
        details: { duration: formatDuration(timer) },
        timestamp: serverTimestamp()
      });

      fetchLogs();
      fetchStats();
    } catch (error) {
      console.error('Error clocking out:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleBreak() {
    if (!activeLog || !profile) return;
    
    const breaks = [...(activeLog.breaks || [])];
    const isOnBreak = breaks.some(b => !b.end);
    const now = new Date().toISOString();

    if (isOnBreak) {
      // End break
      const breakIndex = breaks.findIndex(b => !b.end);
      breaks[breakIndex].end = now;
    } else {
      // Start break
      breaks.push({ start: now, end: null as any });
    }

    try {
      await updateDoc(doc(db, 'time_tracking', activeLog.id), { breaks });
      
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: isOnBreak ? 'ended break' : 'started break',
        target_type: 'time_log',
        target_id: activeLog.id,
        description: `${isOnBreak ? 'Ended' : 'Started'} break`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error toggling break:', error);
    }
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isOnBreak = activeLog?.breaks?.some(b => !b.end);

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Time Tracking</h1>
          <p className="text-zinc-500 mt-1">Manage your work sessions and breaks.</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Today</p>
            <p className="text-xl font-bold text-zinc-900">{stats.today.toFixed(1)}h</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">This Week</p>
            <p className="text-xl font-bold text-zinc-900">{stats.week.toFixed(1)}h</p>
          </div>
        </div>
      </div>

      {/* Active Timer Card */}
      <div className={cn(
        "rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden transition-all duration-500",
        isOnBreak ? "bg-amber-500" : activeLog ? "bg-zinc-950" : "bg-zinc-100 text-zinc-900 border border-zinc-200 shadow-none"
      )}>
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Clock size={160} />
        </div>
        
        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <div className={cn(
            "mb-4 flex items-center gap-2 font-bold uppercase tracking-widest text-[10px]",
            isOnBreak ? "text-white" : activeLog ? "text-emerald-400" : "text-zinc-400"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isOnBreak ? "bg-white animate-pulse" : activeLog ? "bg-emerald-400 animate-pulse" : "bg-zinc-300"
            )}></div>
            {isOnBreak ? 'On Break' : activeLog ? 'Working' : 'Ready'}
          </div>
          
          <div className="text-7xl md:text-8xl font-mono font-bold tracking-tighter mb-8">
            {formatDuration(timer)}
          </div>

          <div className="flex gap-4">
            {!activeLog ? (
              <button
                onClick={handleClockIn}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" size={24} />}
                Clock In
              </button>
            ) : (
              <>
                <button
                  onClick={handleToggleBreak}
                  className={cn(
                    "px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 shadow-lg",
                    isOnBreak 
                      ? "bg-white text-amber-600 hover:bg-zinc-50 shadow-white/10" 
                      : "bg-zinc-800 text-white hover:bg-zinc-700 shadow-black/20"
                  )}
                >
                  <Coffee size={24} />
                  {isOnBreak ? 'End Break' : 'Take Break'}
                </button>
                <button
                  onClick={handleClockOut}
                  disabled={loading}
                  className="bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-red-500/20"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Square fill="currentColor" size={24} />}
                  Clock Out
                </button>
              </>
            )}
          </div>
          
          {activeLog && (
            <div className="mt-6 flex gap-4 text-xs font-medium opacity-60">
              <p>Started at {format(safeDate(activeLog.clock_in), 'h:mm a')}</p>
              {activeLog.breaks && Array.isArray(activeLog.breaks) && activeLog.breaks.length > 0 && (
                <p>• {activeLog.breaks.length} break{activeLog.breaks.length > 1 ? 's' : ''} taken</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Logs */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-bold text-zinc-900 flex items-center gap-2">
                <History size={20} className="text-zinc-400" />
                Recent History
              </h2>
              <a href="/time-history" className="text-xs font-bold text-emerald-600 hover:text-emerald-700">View All</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Clock In</th>
                    <th className="px-6 py-4">Clock Out</th>
                    <th className="px-6 py-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-zinc-400" />
                            <span className="text-sm font-bold text-zinc-900">{format(safeDate(log.clock_in), 'MMM d, yyyy')}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {format(safeDate(log.clock_in), 'h:mm a')}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {log.clock_out ? format(safeDate(log.clock_out), 'h:mm a') : '---'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-lg">
                            {log.total_hours ? `${log.total_hours.toFixed(2)}h` : '---'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 text-sm">
                        No recent logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Active Employees */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
          <h2 className="font-bold text-zinc-900 flex items-center gap-2 mb-6">
            <Users size={20} className="text-emerald-500" />
            Active Now
          </h2>
          
          <div className="space-y-4">
            {activeUsers.length > 0 ? (
              activeUsers.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-500 overflow-hidden">
                      {log.profiles?.avatar_url ? <img src={log.profiles.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : log.profiles?.name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{log.profiles?.name}</p>
                      <p className="text-[10px] text-zinc-400">Since {format(safeDate(log.clock_in), 'h:mm a')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-emerald-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[10px] font-bold uppercase tracking-wider">Active</span>
                    </div>
                    {log.breaks?.some(b => !b.end) && (
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">On Break</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-zinc-400 text-sm">
                No employees clocked in.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
