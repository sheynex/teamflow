import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, Timestamp } from 'firebase/firestore';
import { Activity as ActivityType, Search, Filter, Calendar, User, Tag, FileText, CheckSquare, Clock, X, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Activity, Profile, Task, Document, ProfileDisplay } from '../types';
import { safeDate } from '../lib/utils';

export default function ActivityLog() {
  const [activities, setActivities] = useState<(Activity & { profiles?: ProfileDisplay & { role: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [selectedUser, selectedType, selectedDate]);

  async function fetchInitialData() {
    try {
      const [usersSnap, tasksSnap, docsSnap] = await Promise.all([
        getDocs(query(collection(db, 'profiles'), orderBy('name'))),
        getDocs(query(collection(db, 'tasks'), orderBy('title'), limit(50))),
        getDocs(query(collection(db, 'documents'), orderBy('name'), limit(50)))
      ]);
      
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Profile)));
      setTasks(tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  }

  async function fetchActivities() {
    setLoading(true);
    try {
      let q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100));
      
      if (selectedUser !== 'all') {
        q = query(collection(db, 'activity_logs'), where('user_id', '==', selectedUser), orderBy('timestamp', 'desc'), limit(100));
      }
      
      if (selectedType !== 'all') {
        // Simple filter for type
        q = query(collection(db, 'activity_logs'), where('target_type', '==', selectedType), orderBy('timestamp', 'desc'), limit(100));
        
        if (selectedUser !== 'all') {
          q = query(collection(db, 'activity_logs'), where('user_id', '==', selectedUser), where('target_type', '==', selectedType), orderBy('timestamp', 'desc'), limit(100));
        }
      }

      if (selectedDate) {
        const start = Timestamp.fromDate(startOfDay(new Date(selectedDate)));
        const end = Timestamp.fromDate(endOfDay(new Date(selectedDate)));
        
        q = query(collection(db, 'activity_logs'), where('timestamp', '>=', start), where('timestamp', '<=', end), orderBy('timestamp', 'desc'));
        
        if (selectedUser !== 'all') {
          q = query(collection(db, 'activity_logs'), where('user_id', '==', selectedUser), where('timestamp', '>=', start), where('timestamp', '<=', end), orderBy('timestamp', 'desc'));
        }
      }
      
      const snapshot = await getDocs(q);
      const activityData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
      
      // Resolve profiles
      const resolvedActivities = await Promise.all(activityData.map(async (a) => {
        if (a.user_id) {
          const pSnap = await getDoc(doc(db, 'profiles', a.user_id));
          if (pSnap.exists()) {
            const pData = pSnap.data();
            return {
              ...a,
              profiles: { name: pData.name, avatar_url: pData.avatar_url, role: pData.role }
            };
          }
        }
        return a;
      }));

      setActivities(resolvedActivities as any);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredActivities = activities.filter(activity => 
    activity.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    activity.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    activity.profiles?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getIcon = (type: string) => {
    switch (type) {
      case 'task': return <CheckSquare size={18} className="text-blue-500" />;
      case 'document': return <FileText size={18} className="text-purple-500" />;
      case 'time_log': return <Clock size={18} className="text-emerald-500" />;
      case 'user': return <User size={18} className="text-amber-500" />;
      default: return <ActivityType size={18} className="text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Activity Log</h1>
          <p className="text-zinc-500 mt-1">Track all system events and user actions.</p>
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            showFilters ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          <Filter size={18} />
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">User</label>
            <select 
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm bg-zinc-50"
            >
              <option value="all">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Type</label>
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm bg-zinc-50"
            >
              <option value="all">All Types</option>
              <option value="task">Tasks</option>
              <option value="document">Documents</option>
              <option value="time_log">Time Tracking</option>
              <option value="user">User Actions</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm bg-zinc-50"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={() => {
                setSelectedUser('all');
                setSelectedType('all');
                setSelectedDate('');
                setSearchTerm('');
              }}
              className="w-full px-4 py-2 text-sm font-bold text-zinc-500 hover:text-red-500 transition-colors flex items-center justify-center gap-2"
            >
              <X size={16} /> Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
        <input 
          type="text" 
          placeholder="Search activity description, action, or user..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
        />
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
            <p className="text-zinc-500 font-medium">Loading activity logs...</p>
          </div>
        ) : filteredActivities.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {filteredActivities.map((activity) => (
              <div key={activity.id} className="p-6 hover:bg-zinc-50/50 transition-colors group">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors">
                    {getIcon(activity.target_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden">
                          {activity.profiles?.avatar_url ? (
                            <img src={activity.profiles.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            activity.profiles?.name?.[0] || '?'
                          )}
                        </div>
                        <p className="text-sm font-bold text-zinc-900">
                          {activity.profiles?.name} 
                          <span className="font-normal text-zinc-500 ml-2 uppercase text-[10px] tracking-widest bg-zinc-100 px-2 py-0.5 rounded-md">
                            {activity.action}
                          </span>
                        </p>
                      </div>
                      <span className="text-xs font-medium text-zinc-400 whitespace-nowrap flex items-center gap-1.5">
                        <Clock size={12} />
                        {activity.timestamp || activity.created_at ? format(safeDate(activity.timestamp || activity.created_at), 'MMM d, h:mm a') : 'Recently'}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 mt-2 leading-relaxed">
                      {activity.description || 'No description provided.'}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100">
                        <Tag size={12} />
                        <span>{activity.target_type}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100">
                        <User size={12} />
                        <span>{activity.profiles?.role}</span>
                      </div>
                    </div>
                    {activity.details && Object.keys(activity.details).length > 0 && (
                      <div className="mt-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 text-[11px] text-zinc-500 font-mono overflow-x-auto">
                        <pre>{JSON.stringify(activity.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-20 text-center text-zinc-500">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
              <ActivityType size={32} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">No activity found</h3>
            <p className="mt-1">Try adjusting your filters or search terms.</p>
          </div>
        )}
      </div>
    </div>
  );
}
