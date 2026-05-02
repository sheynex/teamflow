import React, { useEffect, useState } from 'react';
import { X, FileText, PieChart, Info, Calendar, User, HardDrive, File, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { Folder, Document, Profile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { formatBytes, safeDate } from '../lib/utils';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface FolderDetailProps {
  folder: Folder;
  onClose: () => void;
  isVirtual?: boolean;
}

interface FolderStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  typeDistribution: { name: string; value: number }[];
  lastModified: string | null;
  creator?: Profile;
  contents: {
    documents: Document[];
    folders: Folder[];
  };
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function FolderDetail({ folder, onClose, isVirtual = false }: FolderDetailProps) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<FolderStats | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = ['Admin', 'Super Admin', 'Manager'].includes(profile?.role || '') || 
                  profile?.email?.toLowerCase() === 'servicefinda02@gmail.com';

  useEffect(() => {
    fetchFolderStats();
  }, [folder.id]);

  async function fetchFolderStats() {
    setLoading(true);
    try {
      // Fetch documents in this folder
      let documents: Document[] = [];
      
      if (isAdmin) {
        const q = isVirtual 
          ? query(collection(db, 'documents'), where('folder', '==', folder.name))
          : query(collection(db, 'documents'), where('folder_id', '==', folder.id));
        const snap = await getDocs(q);
        documents = snap.docs.map(d => ({ id: d.id, ...d.data() as any } as Document));
      } else {
        // Staff role - need to search docs they can see in this folder
        // For simplicity and avoiding index issues, we fetch by both conditions and merge
        const qOwned = query(
          collection(db, 'documents'), 
          where('folder_id', '==', folder.id), 
          where('uploaded_by', '==', profile?.id)
        );
        const qAssigned = query(
          collection(db, 'documents'), 
          where('folder_id', '==', folder.id), 
          where('assigned_ids', 'array-contains', profile?.id)
        );
        
        const [ownedSnap, assignedSnap] = await Promise.all([getDocs(qOwned), getDocs(qAssigned)]);
        const combined = new Map();
        ownedSnap.docs.forEach(d => combined.set(d.id, { id: d.id, ...d.data() as any }));
        assignedSnap.docs.forEach(d => combined.set(d.id, { id: d.id, ...d.data() as any }));
        documents = Array.from(combined.values());
      }
      
      const foldersQ = query(collection(db, 'folders'), where('parent_id', '==', folder.id));
      const foldersSnapshot = await getDocs(foldersQ);
      const subfolders = foldersSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any } as Folder));
      const totalFolders = subfolders.length;

      // Calculate stats
      const totalFiles = documents.length;
      const totalSize = documents.reduce((acc, doc) => acc + (doc.size || 0), 0);
      
      const typeMap: Record<string, number> = {};
      let lastMod: string | null = null;

      documents.forEach(doc => {
        const type = doc.file_type?.split('/')[1] || 'unknown';
        typeMap[type] = (typeMap[type] || 0) + 1;
        
        if (!lastMod || safeDate(doc.created_at) > safeDate(lastMod)) {
          lastMod = doc.created_at;
        }
      });

      const typeDistribution = Object.entries(typeMap).map(([name, value]) => ({
        name: name.toUpperCase(),
        value
      })).sort((a, b) => b.value - a.value);

      // Fetch creator profile
      let creator;
      if (folder.created_by) {
        const profileSnap = await getDoc(doc(db, 'profiles', folder.created_by));
        if (profileSnap.exists()) {
          creator = profileSnap.data() as Profile;
        }
      }

      setStats({
        totalFiles,
        totalFolders,
        totalSize,
        typeDistribution,
        lastModified: lastMod,
        creator,
        contents: {
          documents,
          folders: subfolders
        }
      });
    } catch (error) {
      console.error('Error fetching folder stats:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Info size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{folder.name}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wider">Folder Information & Report</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-emerald-500" size={32} />
              <p className="text-zinc-500 font-medium">Analyzing folder contents...</p>
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Stats */}
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2">
                        <FileText size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Files</span>
                      </div>
                      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalFiles}</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2">
                        <HardDrive size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Total Size</span>
                      </div>
                      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatBytes(stats.totalSize)}</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2">
                        <Info size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Subfolders</span>
                      </div>
                      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalFolders}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <Calendar size={16} className="text-emerald-500" />
                      Timeline
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500">Created At</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{format(safeDate(folder.created_at), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500">Last Activity</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {stats.lastModified ? format(safeDate(stats.lastModified), 'MMM d, yyyy HH:mm') : 'No activity'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <User size={16} className="text-emerald-500" />
                      Ownership
                    </h3>
                    <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                        {stats.creator?.avatar_url ? (
                          <img src={stats.creator.avatar_url} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          stats.creator?.name?.[0] || '?'
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{stats.creator?.name || 'Unknown User'}</p>
                        <p className="text-xs text-zinc-500">{stats.creator?.role || 'Staff'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Report/Chart */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <PieChart size={16} className="text-emerald-500" />
                      File Type Distribution
                    </h3>
                    
                    {stats.totalFiles > 0 ? (
                      <>
                        <div className="h-[200px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                              <Pie
                                data={stats.typeDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {stats.typeDistribution.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#18181b', 
                                  border: 'none', 
                                  borderRadius: '8px',
                                  color: '#fff',
                                  fontSize: '12px'
                                }}
                              />
                            </RePieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {stats.typeDistribution.map((item, index) => (
                            <div key={item.name} className="flex items-center gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="text-zinc-500 truncate">{item.name}</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 ml-auto">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="h-[200px] flex flex-col items-center justify-center text-zinc-400 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                        <File size={32} className="mb-2 opacity-20" />
                        <p className="text-xs font-medium">No files to analyze</p>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 rounded-2xl border border-emerald-100 dark:border-emerald-500/10">
                    <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">Quick Summary</h4>
                    <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                      This folder contains {stats.totalFiles} files and {stats.totalFolders} subfolders with a total footprint of {formatBytes(stats.totalSize)}. 
                      {stats.totalFiles > 0 && ` The most common file type is ${stats.typeDistribution[0]?.name}.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Contents Listing */}
              <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                  <HardDrive size={16} className="text-emerald-500" />
                  Folder Contents
                </h3>
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {stats.contents.folders.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <PieChart size={16} className="text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{f.name}</span>
                      <span className="ml-auto text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Folder</span>
                    </div>
                  ))}
                  {stats.contents.documents.map(d => (
                    <div key={d.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <FileText size={16} className="text-zinc-400" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{d.name}</span>
                        <span className="text-[10px] text-zinc-500">{formatBytes(d.size)}</span>
                      </div>
                      <span className="ml-auto text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{d.file_type?.split('/')[1] || 'File'}</span>
                    </div>
                  ))}
                  {stats.totalFiles === 0 && stats.totalFolders === 0 && (
                    <p className="text-center py-8 text-zinc-400 text-sm italic">This folder is empty.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-zinc-500">
              Failed to load folder statistics.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-sm"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
