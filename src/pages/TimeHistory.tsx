import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, Search, Filter, Download, ArrowLeft, Coffee, Loader2, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, differenceInSeconds, parseISO } from 'date-fns';
import { TimeLog } from '../types';
import { cn, safeDate } from '../lib/utils';

export default function TimeHistory() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    fetchLogs();
  }, [selectedMonth, profile]);

  async function fetchLogs() {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const start = startOfMonth(selectedMonth).toISOString();
      const end = endOfMonth(selectedMonth).toISOString();

      const q = query(
        collection(db, 'time_tracking'),
        where('user_id', '==', profile.id),
        where('clock_in', '>=', start),
        where('clock_in', '<=', end),
        orderBy('clock_in', 'desc')
      );
      
      const snapshot = await getDocs(q);
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TimeLog)));
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalHours = logs.reduce((acc, curr) => acc + (curr.total_hours || 0), 0);

  return (
    <div className="space-y-8 font-sans pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors mb-2"
          >
            <ArrowLeft size={16} /> Back to Tracker
          </button>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Time History</h1>
          <p className="text-zinc-500 mt-1">Review your past work logs and break times.</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="month" 
            value={format(selectedMonth, 'yyyy-MM')}
            onChange={(e) => setSelectedMonth(new Date(e.target.value))}
            className="px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-black"
          />
          <button className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-zinc-600 transition-colors">
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Total Hours</p>
          <p className="text-3xl font-bold text-zinc-900">{totalHours.toFixed(1)}h</p>
          <div className="mt-4 flex items-center gap-2 text-emerald-600 text-xs font-bold">
            <TrendingUp size={14} />
            <span>+12% from last month</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Total Sessions</p>
          <p className="text-3xl font-bold text-zinc-900">{logs.length}</p>
          <div className="mt-4 flex items-center gap-2 text-zinc-400 text-xs font-bold">
            <Calendar size={14} />
            <span>{format(selectedMonth, 'MMMM yyyy')}</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Avg. Per Day</p>
          <p className="text-3xl font-bold text-zinc-900">{(totalHours / (logs.length || 1)).toFixed(1)}h</p>
          <div className="mt-4 flex items-center gap-2 text-zinc-400 text-xs font-bold">
            <Clock size={14} />
            <span>Based on active days</span>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
            <tr>
              <th className="px-6 py-4">Date & Time</th>
              <th className="px-6 py-4">Breaks</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Total Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <Loader2 className="animate-spin mx-auto text-emerald-500" size={32} />
                </td>
              </tr>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{format(safeDate(log.clock_in), 'EEEE, MMM d')}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {format(safeDate(log.clock_in), 'h:mm a')} - {log.clock_out ? format(safeDate(log.clock_out), 'h:mm a') : 'In Progress'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {log.breaks && Array.isArray(log.breaks) && log.breaks.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {log.breaks.map((b, i) => (
                          <span key={i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-100">
                            <Coffee size={10} />
                            {b.end ? `${Math.round(differenceInSeconds(safeDate(b.end), safeDate(b.start)) / 60)}m` : 'Active'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">No breaks</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {log.clock_out ? (
                      <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-600 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        In Progress
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-zinc-900 bg-zinc-100 px-3 py-1.5 rounded-xl">
                      {log.total_hours ? `${log.total_hours.toFixed(2)}h` : '---'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 text-sm">
                  No logs found for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
