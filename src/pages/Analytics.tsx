import React, { useState, useEffect } from 'react';
import { BarChart3, Users, FileText, CheckCircle2, TrendingUp, Loader2, User, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, getCountFromServer, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    totalUsers: 0,
    totalDocuments: 0,
    activeUsers: [] as { name: string; count: number; avatar?: string }[],
    mostEditedDocs: [] as { name: string; count: number }[],
    taskCompletionRate: 0,
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // 1. Basic Counts
      const [taskCount, completedCount, userCount, docCount] = await Promise.all([
        getCountFromServer(collection(db, 'tasks')),
        getCountFromServer(query(collection(db, 'tasks'), where('status', '==', 'Completed'))),
        getCountFromServer(collection(db, 'profiles')),
        getCountFromServer(collection(db, 'documents'))
      ]);

      // 2. Active Users (based on activity logs in the last 7 days)
      const sevenDaysAgo = subDays(new Date(), 7);
      const activityQuery = query(
        collection(db, 'activity_logs'), 
        where('timestamp', '>=', Timestamp.fromDate(sevenDaysAgo))
      );
      const activitySnapshot = await getDocs(activityQuery);

      const userActivityMap = new Map();
      const userIds = new Set(activitySnapshot.docs.map(d => d.data().user_id));
      
      // Resolve user names
      const userProfiles = new Map();
      await Promise.all(Array.from(userIds).map(async (uid) => {
        if (!uid) return;
        const pSnap = await getDoc(doc(db, 'profiles', uid as string));
        if (pSnap.exists()) {
          userProfiles.set(uid, pSnap.data());
        }
      }));

      activitySnapshot.docs.forEach(d => {
        const data = d.data();
        const userId = data.user_id;
        const profile = userProfiles.get(userId);
        if (!userActivityMap.has(userId)) {
          userActivityMap.set(userId, { name: profile?.name || 'Unknown', count: 0, avatar: profile?.avatar_url });
        }
        userActivityMap.get(userId).count += 1;
      });

      const sortedActiveUsers = Array.from(userActivityMap.values())
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 5);

      // 3. Most Edited Documents (based on document activity)
      const docActivityQuery = query(
        collection(db, 'document_activity'), 
        where('action', '==', 'edited')
      );
      const docActivitySnapshot = await getDocs(docActivityQuery);

      const docActivityMap = new Map();
      const docIds = new Set(docActivitySnapshot.docs.map(d => d.data().document_id));
      
      // Resolve document names
      const documentNames = new Map();
      await Promise.all(Array.from(docIds).map(async (did) => {
        if (!did) return;
        const dSnap = await getDoc(doc(db, 'documents', did as string));
        if (dSnap.exists()) {
          documentNames.set(did, dSnap.data().name);
        }
      }));

      docActivitySnapshot.docs.forEach(d => {
        const data = d.data();
        const docId = data.document_id;
        const name = documentNames.get(docId) || 'Unknown Document';
        if (!docActivityMap.has(docId)) {
          docActivityMap.set(docId, { name, count: 0 });
        }
        docActivityMap.get(docId).count += 1;
      });

      const sortedEditedDocs = Array.from(docActivityMap.values())
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 5);

      setStats({
        totalTasks: taskCount.data().count || 0,
        completedTasks: completedCount.data().count || 0,
        totalUsers: userCount.data().count || 0,
        totalDocuments: docCount.data().count || 0,
        activeUsers: sortedActiveUsers,
        mostEditedDocs: sortedEditedDocs,
        taskCompletionRate: taskCount.data().count ? Math.round((completedCount.data().count / taskCount.data().count) * 100) : 0,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Admin Analytics</h1>
        <button 
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
        >
          Refresh Data
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <CheckCircle2 size={20} />
            </div>
            <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
              <ArrowUpRight size={14} /> +12%
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Task Completion Rate</p>
          <p className="text-3xl font-bold mt-1">{stats.taskCompletionRate}%</p>
        </div>

        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
              <Users size={20} />
            </div>
            <span className="text-xs font-medium text-blue-500 flex items-center gap-1">
              <ArrowUpRight size={14} /> +3
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Total Team Members</p>
          <p className="text-3xl font-bold mt-1">{stats.totalUsers}</p>
        </div>

        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
              <FileText size={20} />
            </div>
            <span className="text-xs font-medium text-purple-500 flex items-center gap-1">
              <ArrowUpRight size={14} /> +8
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Managed Documents</p>
          <p className="text-3xl font-bold mt-1">{stats.totalDocuments}</p>
        </div>

        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-medium text-orange-500 flex items-center gap-1">
              <ArrowUpRight size={14} /> +24%
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Total Tasks</p>
          <p className="text-3xl font-bold mt-1">{stats.totalTasks}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Most Active Users */}
        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Users size={20} className="text-emerald-500" />
            Most Active Users (Last 7 Days)
          </h2>
          <div className="space-y-6">
            {stats.activeUsers.map((user, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 overflow-hidden">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-zinc-500">{user.count} activities logged</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${(user.count / stats.activeUsers[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {stats.activeUsers.length === 0 && (
              <p className="text-sm text-zinc-500 italic text-center py-8">No activity data found</p>
            )}
          </div>
        </div>

        {/* Most Edited Documents */}
        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <FileText size={20} className="text-blue-500" />
            Most Edited Documents
          </h2>
          <div className="space-y-6">
            {stats.mostEditedDocs.map((doc, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-xs text-zinc-500">{doc.count} revisions made</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-500">{doc.count}</p>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Edits</p>
                </div>
              </div>
            ))}
            {stats.mostEditedDocs.length === 0 && (
              <p className="text-sm text-zinc-500 italic text-center py-8">No document activity data found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
