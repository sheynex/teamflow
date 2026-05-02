import React, { useState, useEffect, useMemo } from 'react';
import { Search as SearchIcon, FileText, CheckSquare, MessageSquare, Loader2, User as UserIcon } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, limit, orderBy, onSnapshot, where } from 'firebase/firestore';
import { Task, Document, TaskComment, Profile } from '../types';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { safeDate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Search() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  
  const [allData, setAllData] = useState<{
    tasks: Task[];
    documents: Document[];
    comments: TaskComment[];
    profiles: Profile[];
  }>({ tasks: [], documents: [], comments: [], profiles: [] });
  
  const [loading, setLoading] = useState(true);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Real-time synchronization of data
  useEffect(() => {
    if (!profile) return;
    setLoading(true);

    const subscriptions: (() => void)[] = [];

    // Subscribe to Tasks
    let unsubTasks: () => void;
    if (profile.role === 'Staff') {
      const qAssigned = query(collection(db, 'tasks'), where('assigned_ids', 'array-contains', profile.id), orderBy('created_at', 'desc'), limit(50));
      const qCreated = query(collection(db, 'tasks'), where('created_by', '==', profile.id), orderBy('created_at', 'desc'), limit(50));
      
      let t1: Task[] = [];
      let t2: Task[] = [];
      
      const update = () => {
        const merged = Array.from(new Map([...t1, ...t2].map(t => [t.id, t])).values())
          .sort((a, b) => safeDate(b.created_at).getTime() - safeDate(a.created_at).getTime());
        setAllData(prev => ({ ...prev, tasks: merged }));
        setLoading(false);
      };

      const u1 = onSnapshot(qAssigned, (s) => { t1 = s.docs.map(d => ({id: d.id, ...d.data()} as Task)); update(); });
      const u2 = onSnapshot(qCreated, (s) => { t2 = s.docs.map(d => ({id: d.id, ...d.data()} as Task)); update(); });
      unsubTasks = () => { u1(); u2(); };
    } else {
      const tasksQ = query(collection(db, 'tasks'), orderBy('created_at', 'desc'), limit(100));
      unsubTasks = onSnapshot(tasksQ, (snap) => {
        setAllData(prev => ({ ...prev, tasks: snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)) }));
        setLoading(false);
      }, () => setLoading(false));
    }
    subscriptions.push(unsubTasks);

    // Subscribe to Documents
    let unsubDocs: () => void;
    if (profile.role === 'Staff') {
      const qOwned = query(collection(db, 'documents'), where('uploaded_by', '==', profile.id), orderBy('created_at', 'desc'), limit(50));
      const qAssigned = query(collection(db, 'documents'), where('assigned_ids', 'array-contains', profile.id), orderBy('created_at', 'desc'), limit(50));
      
      let d1: Document[] = [];
      let d2: Document[] = [];

      const update = () => {
        const merged = Array.from(new Map([...d1, ...d2].map(doc => [doc.id, doc])).values())
          .sort((a, b) => safeDate(b.created_at).getTime() - safeDate(a.created_at).getTime());
        setAllData(prev => ({ ...prev, documents: merged }));
      };

      const u1 = onSnapshot(qOwned, (s) => { d1 = s.docs.map(d => ({id: d.id, ...d.data()} as Document)); update(); });
      const u2 = onSnapshot(qAssigned, (s) => { d2 = s.docs.map(d => ({id: d.id, ...d.data()} as Document)); update(); });
      unsubDocs = () => { u1(); u2(); };
    } else {
      const docsQ = query(collection(db, 'documents'), orderBy('created_at', 'desc'), limit(100));
      unsubDocs = onSnapshot(docsQ, (snap) => {
        setAllData(prev => ({ ...prev, documents: snap.docs.map(d => ({ id: d.id, ...d.data() } as Document)) }));
      }, (error) => console.error("Search docs error:", error));
    }
    subscriptions.push(unsubDocs);

    // Subscribe to Comments
    const commentsQ = query(collection(db, 'task_comments'), orderBy('created_at', 'desc'), limit(100));
    subscriptions.push(onSnapshot(commentsQ, (snap) => {
      const comments = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskComment));
      setAllData(prev => ({ ...prev, comments }));
    }, (error) => {
      console.error("Search comments subscription error:", error);
    }));

    // Subscribe to Profiles
    const profilesQ = query(collection(db, 'profiles'), limit(100));
    subscriptions.push(onSnapshot(profilesQ, (snap) => {
      const profiles = snap.docs.map(d => ({ id: d.id, ...d.data() } as Profile));
      setAllData(prev => ({ ...prev, profiles }));
    }, (error) => {
      console.error("Search profiles subscription error:", error);
    }));

    return () => subscriptions.forEach(unsub => unsub());
  }, [profile?.id, profile?.role]);

  const filteredResults = useMemo(() => {
    const term = debouncedTerm.toLowerCase().trim();
    if (!term) return { tasks: [], documents: [], comments: [], profiles: [] };

    return {
      tasks: allData.tasks.filter(t => 
        t.title.toLowerCase().includes(term) || 
        t.description?.toLowerCase().includes(term)
      ).slice(0, 8),
      documents: allData.documents.filter(d => 
        d.name.toLowerCase().includes(term) || 
        d.tags?.some(tag => tag.toLowerCase().includes(term))
      ).slice(0, 8),
      comments: allData.comments.filter(c => 
        c.content.toLowerCase().includes(term)
      ).slice(0, 8),
      profiles: allData.profiles.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.email.toLowerCase().includes(term) ||
        p.role.toLowerCase().includes(term)
      ).slice(0, 8)
    };
  }, [debouncedTerm, allData]);

  const hasAnyResults = filteredResults.tasks.length > 0 || 
                        filteredResults.documents.length > 0 || 
                        filteredResults.comments.length > 0 || 
                        filteredResults.profiles.length > 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-6 items-center text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Global Search</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Find tasks, users, and documents across your workspace instantly.</p>
        </div>
        
        <div className="relative w-full max-w-2xl group">
          <div className="absolute inset-0 bg-emerald-500/10 blur-xl group-focus-within:bg-emerald-500/20 transition-all rounded-3xl" />
          <div className="relative flex items-center bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl focus-within:border-emerald-500 transition-all shadow-xl">
            <SearchIcon className="ml-4 text-zinc-400" size={24} />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Start typing to search..."
              className="flex-1 px-4 py-5 bg-transparent border-none focus:ring-0 text-lg font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400"
            />
            {loading && (
              <div className="mr-6">
                <Loader2 className="animate-spin text-emerald-500" size={20} />
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!debouncedTerm ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            key="empty"
            className="py-20 text-center"
          >
            <div className="inline-flex p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-full mb-4">
              <SearchIcon size={40} className="text-zinc-300" />
            </div>
            <p className="text-zinc-400 font-medium italic">Type something to begin your search...</p>
          </motion.div>
        ) : !hasAnyResults ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            key="no-results"
            className="py-20 text-center"
          >
            <p className="text-zinc-500 font-bold text-xl">No results found for "{debouncedTerm}"</p>
            <p className="text-zinc-400 mt-2">Try different keywords or check your spelling.</p>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            key="results"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {/* Task Section */}
            <SearchSection 
              title="Tasks" 
              icon={<CheckSquare size={18} />} 
              items={filteredResults.tasks}
              renderItem={(task) => (
                <Link
                  key={task.id}
                  to={`/tasks?id=${task.id}`}
                  className="block p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-emerald-500 transition-all hover:shadow-lg group"
                >
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">{task.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{task.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md ${
                      task.status === 'Completed' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {task.status}
                    </span>
                    <span className="text-[10px] text-zinc-400">{format(safeDate(task.created_at), 'MMM d')}</span>
                  </div>
                </Link>
              )}
            />

            {/* Document Section */}
            <SearchSection 
              title="Documents" 
              icon={<FileText size={18} />} 
              items={filteredResults.documents}
              renderItem={(doc) => (
                <Link
                  key={doc.id}
                  to={`/documents?id=${doc.id}`}
                  className="block p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-emerald-500 transition-all hover:shadow-lg group"
                >
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">{doc.name}</h3>
                  <p className="text-xs text-zinc-500 mt-1 truncate">{doc.file_type?.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 rounded uppercase">#{tag}</span>
                    ))}
                  </div>
                </Link>
              )}
            />

            {/* People Section */}
            <SearchSection 
              title="People" 
              icon={<UserIcon size={18} />} 
              items={filteredResults.profiles}
              renderItem={(person) => (
                <Link
                  key={person.id}
                  to={`/users?id=${person.id}`}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-emerald-500 transition-all hover:shadow-md group"
                >
                  <div className="w-10 h-10 rounded-full border-2 border-zinc-100 dark:border-zinc-800 overflow-hidden group-hover:border-emerald-500 transition-colors">
                    {person.avatar_url ? (
                      <img src={person.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 text-zinc-300 font-bold uppercase text-xs">
                        {person.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{person.name}</h3>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{person.role}</p>
                  </div>
                </Link>
              )}
            />

            {/* Discussion Section */}
            <SearchSection 
              title="Discussion" 
              icon={<MessageSquare size={18} />} 
              items={filteredResults.comments}
              renderItem={(comment) => (
                <Link
                  key={comment.id}
                  to={`/tasks?id=${comment.task_id}`}
                  className="block p-4 bg-zinc-50/50 dark:bg-zinc-800/30 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 rounded-xl transition-all"
                >
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 italic line-clamp-3">"{comment.content}"</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
                    <span className="font-bold uppercase tracking-widest text-[8px]">Feedback</span>
                    <span>{format(safeDate(comment.created_at), 'MMM d')}</span>
                  </div>
                </Link>
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchSection({ title, icon, items, renderItem }: { title: string, icon: React.ReactNode, items: any[], renderItem: (item: any) => React.ReactNode }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-zinc-400 px-1 border-b border-zinc-100 dark:border-zinc-800 pb-2">
        {icon}
        <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{title} <span className="text-emerald-500 opacity-50 ml-1">({items.length})</span></h2>
      </div>
      <div className="space-y-3">
        {items.map(item => renderItem(item))}
      </div>
    </div>
  );
}
