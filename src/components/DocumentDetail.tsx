import React, { useState, useEffect } from 'react';
import { X, Download, History, User, Clock, FileText, Upload, Trash2, Loader2, ExternalLink, Lock, Unlock, Tag, Plus as PlusIcon, Eye } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDoc, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { Document, DocumentVersion, DocumentActivity, Profile } from '../types';
import { format } from 'date-fns';
import { formatBytes, cn, safeDate } from '../lib/utils';
import { notificationService } from '../services/notificationService';
import FilePreview from './FilePreview';
import DocumentComments from './DocumentComments';

interface DocumentDetailProps {
  documentId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function DocumentDetail({ documentId, onClose, onUpdate }: DocumentDetailProps) {
  const { profile } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [activities, setActivities] = useState<DocumentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [isLocking, setIsLocking] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    trackActivity('opened');

    // Subscribe to Document
    const unsubscribeDoc = onSnapshot(doc(db, 'documents', documentId), async (snapshot) => {
      try {
        if (snapshot.exists()) {
          const docData = { id: snapshot.id, ...snapshot.data() } as Document;
          // Fetch uploader profile if needed
          if (docData.uploaded_by && !docData.uploaded_by_name) {
            const profileSnap = await getDoc(doc(db, 'profiles', docData.uploaded_by));
            if (profileSnap.exists()) {
              const pData = profileSnap.data() as Profile;
              docData.uploaded_by_name = pData.name;
              docData.uploaded_by_avatar = pData.avatar_url;
            }
          }
          setDocument(docData);
        }
      } catch (err) {
        console.error('Error fetching document in detail:', err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Document detail snapshot error:', error);
      setLoading(false);
    });

    // Subscribe to Versions
    const versionsQuery = query(
      collection(db, 'document_versions'),
      where('document_id', '==', documentId),
      orderBy('version_number', 'desc')
    );
    const unsubscribeVersions = onSnapshot(versionsQuery, async (snapshot) => {
      try {
        const vList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DocumentVersion));
        // Resolve profiles for versions
        const resolvedVersions = await Promise.all(vList.map(async (v) => {
          if (v.created_by) {
            try {
              const pSnap = await getDoc(doc(db, 'profiles', v.created_by));
              if (pSnap.exists()) {
                v.profiles = { name: (pSnap.data() as Profile).name };
              }
            } catch (err) {
              console.error('Error fetching profile for version:', err);
            }
          }
          return v;
        }));
        setVersions(resolvedVersions);
      } catch (err) {
        console.error('Error processing versions snapshot:', err);
      }
    }, (err) => {
      console.error('Versions snapshot error:', err);
    });

    // Subscribe to Activity
    const activityQuery = query(
      collection(db, 'document_activity'),
      where('document_id', '==', documentId),
      orderBy('created_at', 'desc')
    );
    const unsubscribeActivity = onSnapshot(activityQuery, async (snapshot) => {
      try {
        const aList = snapshot.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          created_at: d.data().created_at?.toDate?.()?.toISOString() || d.data().created_at
        } as DocumentActivity));
        
        // Resolve profiles for activity
        const resolvedActivities = await Promise.all(aList.map(async (a) => {
          if (a.user_id) {
            try {
              const pSnap = await getDoc(doc(db, 'profiles', a.user_id));
              if (pSnap.exists()) {
                const pData = pSnap.data() as Profile;
                a.profiles = { name: pData.name, avatar_url: pData.avatar_url };
              }
            } catch (err) {
              console.error('Error fetching profile for activity:', err);
            }
          }
          return a;
        }));
        setActivities(resolvedActivities);
      } catch (err) {
        console.error('Error processing activity snapshot:', err);
      }
    }, (err) => {
      console.error('Activity snapshot error:', err);
    });

    return () => {
      unsubscribeDoc();
      unsubscribeVersions();
      unsubscribeActivity();
    };
  }, [documentId]);

  async function trackActivity(action: 'opened' | 'edited' | 'downloaded') {
    if (!profile) return;
    try {
      await addDoc(collection(db, 'document_activity'), {
        document_id: documentId,
        user_id: profile.id,
        action,
        created_at: serverTimestamp()
      });
      
      // Also log to general activity logs
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: `${action} document`,
        target_type: 'document',
        target_id: documentId,
        description: `${action.charAt(0).toUpperCase() + action.slice(1)} document: ${document?.name || 'document'}`,
        details: { name: document?.name || 'document' },
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error tracking activity:', error);
    }
  }

  async function handleDownload(filePath: string, fileName: string) {
    try {
      // In Firebase, we can use the stored download_url if available, or get it
      let url = document?.download_url;
      if (filePath !== document?.file_path) {
        const storageRef = ref(storage, filePath);
        url = await getDownloadURL(storageRef);
      }
      
      if (!url) throw new Error('Download URL not found');
      
      const a = window.document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.click();
      
      trackActivity('downloaded');
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file');
    }
  }

  async function handleNewVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile || !document) return;
    setUploadingVersion(true);

    try {
      const versionNumber = versions.length + 1;
      const filePath = `versions/${documentId}/v${versionNumber}_${file.name}`;
      const storageRef = ref(storage, filePath);
      
      console.log('Initiating upload for new version:', filePath);
      
      const uploadTask = uploadBytesResumable(storageRef, file);

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Version upload: ' + progress + '%');
          }, 
          (error) => {
            console.error('Upload task error:', error);
            reject(error);
          }, 
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      // 1. Create version record
      await addDoc(collection(db, 'document_versions'), {
        document_id: documentId,
        version_number: versionNumber,
        file_path: filePath,
        download_url: downloadUrl,
        created_by: profile.id,
        created_at: new Date().toISOString()
      });

      // 2. Update main document record to point to latest version
      await updateDoc(doc(db, 'documents', documentId), {
        file_path: filePath,
        download_url: downloadUrl,
        size: file.size,
        file_type: file.type
      });

      // Trigger Notifications
      const recipients = new Set<string>();
      if (document.uploaded_by !== profile.id) recipients.add(document.uploaded_by);
      
      // If linked to a task, notify task creator and assignee
      if (document.task_id) {
        const taskSnap = await getDoc(doc(db, 'tasks', document.task_id));
        if (taskSnap.exists()) {
          const taskData = taskSnap.data();
          if (taskData.assigned_to && taskData.assigned_to !== profile.id) recipients.add(taskData.assigned_to);
          if (taskData.created_by && taskData.created_by !== profile.id) recipients.add(taskData.created_by);
        }
      }

      for (const recipientId of recipients) {
        await notificationService.notifyFileEdited(documentId, recipientId, document.name, profile.name);
      }

      trackActivity('edited');
      onUpdate();
      console.log('Version upload process complete');
    } catch (error: any) {
      console.error('Fatal version upload error:', error);
      alert(`Upload failed: ${error.message}. Please check CORS and ensure Storage is enabled.`);
    } finally {
      setUploadingVersion(false);
      if (e.target) e.target.value = '';
    }
  }

  async function toggleLock() {
    if (!profile || !document) return;
    setIsLocking(true);
    try {
      const isLocked = !!document.locked_by;
      await updateDoc(doc(db, 'documents', documentId), {
        locked_by: isLocked ? null : profile.id,
        locked_at: isLocked ? null : new Date().toISOString()
      });

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: isLocked ? 'unlocked document' : 'locked document',
        target_type: 'document',
        target_id: documentId,
        description: `${isLocked ? 'Unlocked' : 'Locked'} document: ${document.name}`,
        details: { name: document.name },
        timestamp: serverTimestamp()
      });

      onUpdate();
    } catch (error) {
      console.error('Error toggling lock:', error);
    } finally {
      setIsLocking(false);
    }
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTag.trim() || !document) return;
    
    const tags = [...(document.tags || []), newTag.trim().toLowerCase()];
    const uniqueTags = Array.from(new Set(tags));

    try {
      await updateDoc(doc(db, 'documents', documentId), { tags: uniqueTags });
      setNewTag('');
      onUpdate();
    } catch (error) {
      console.error('Error adding tag:', error);
    }
  }

  async function removeTag(tagToRemove: string) {
    if (!document) return;
    const tags = (document.tags || []).filter(t => t !== tagToRemove);

    try {
      await updateDoc(doc(db, 'documents', documentId), { tags });
      onUpdate();
    } catch (error) {
      console.error('Error removing tag:', error);
    }
  }

  const lastOpened = activities.find(a => a.action === 'opened');
  const lastEdited = activities.find(a => a.action === 'edited');
  const lastActivity = activities[0];

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-950 shadow-2xl z-50 flex items-center justify-center border-l border-zinc-200 dark:border-zinc-800">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (!document) return null;

  const isLockedByOther = document.locked_by && document.locked_by !== profile?.id;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-950 shadow-2xl z-50 flex flex-col border-l border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-emerald-500" />
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Document Details</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors">
          <X size={20} className="text-zinc-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* File Info */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight break-all">{document.name}</h2>
            <div className="flex gap-2">
              <button 
                onClick={toggleLock}
                disabled={isLocking || isLockedByOther}
                className={cn(
                  "p-2 rounded-xl transition-colors",
                  document.locked_by 
                    ? "bg-red-50 dark:bg-red-500/10 text-red-600" 
                    : "bg-zinc-50 dark:bg-zinc-900 text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
                title={isLockedByOther ? `Locked by ${document.uploaded_by_name}` : document.locked_by ? 'Unlock Document' : 'Lock Document'}
              >
                {isLocking ? <Loader2 className="animate-spin" size={20} /> : document.locked_by ? <Lock size={20} /> : <Unlock size={20} />}
              </button>
              <button 
                onClick={() => setShowPreview(true)}
                className="p-2 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                title="Preview Document"
              >
                <Eye size={20} />
              </button>
              <button 
                onClick={() => handleDownload(document.file_path, document.name)}
                className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
              >
                <Download size={20} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md font-bold uppercase tracking-wider">{document.file_type?.split('/')[1] || 'FILE'}</span>
            <span>{formatBytes(document.size)}</span>
            <span>Uploaded {document.created_at ? format(safeDate(document.created_at), 'MMM d, yyyy') : ''}</span>
          </div>
          
          {/* Tags */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {document.tags?.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-medium group">
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-opacity">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={addTag} className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Add tag..." 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                />
              </div>
              <button type="submit" className="p-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity">
                <PlusIcon size={14} />
              </button>
            </form>
          </div>
        </div>

        {/* Tracking Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Uploaded By</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden text-black uppercase">
                {document.uploaded_by_avatar ? <img src={document.uploaded_by_avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : document.uploaded_by_name?.[0]}
              </div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{document.uploaded_by_name}</span>
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Last Opened By</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden text-black uppercase">
                {lastOpened?.profiles?.avatar_url ? <img src={lastOpened.profiles.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : lastOpened?.profiles?.name?.[0] || '?'}
              </div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{lastOpened?.profiles?.name || 'Never'}</span>
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Last Edited By</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden text-black uppercase">
                {lastEdited?.profiles?.avatar_url ? <img src={lastEdited.profiles.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : lastEdited?.profiles?.name?.[0] || '?'}
              </div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{lastEdited?.profiles?.name || 'Never'}</span>
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Last Activity</p>
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <Clock size={14} className="text-zinc-400" />
              <span className="text-sm font-medium">{lastActivity?.created_at ? format(safeDate(lastActivity.created_at), 'MMM d, h:mm a') : 'None'}</span>
            </div>
          </div>
        </div>

        {/* Version Control */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest flex items-center gap-2">
              <History size={16} />
              Version History
            </h3>
            <label className={cn(
              "cursor-pointer bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center gap-2",
              isLockedByOther && "opacity-50 cursor-not-allowed"
            )}>
              <Upload size={14} />
              New Version
              <input type="file" className="hidden" onChange={handleNewVersion} disabled={uploadingVersion || !!isLockedByOther} />
            </label>
          </div>
          {isLockedByOther && (
            <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-600">
              <Lock size={14} />
              Document is locked by {document.uploaded_by_name}. Editing is disabled.
            </div>
          )}
          <div className="space-y-3">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-emerald-200 transition-all group rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                    v{v.version_number}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Version {v.version_number}</p>
                    <p className="text-[10px] text-zinc-400">By {v.profiles?.name} • {v.created_at ? format(safeDate(v.created_at), 'MMM d, yyyy') : ''}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleDownload(v.file_path, `v${v.version_number}_${document.name}`)}
                  className="p-2 text-zinc-400 hover:text-emerald-600 transition-all"
                >
                  <Download size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Comments Section */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <DocumentComments documentId={documentId} />
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest flex items-center gap-2">
            <Clock size={16} />
            Recent Activity
          </h3>
          <div className="space-y-4">
            {activities.slice(0, 5).map((a) => (
              <div key={a.id} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden text-black uppercase">
                  {a.profiles?.avatar_url ? <img src={a.profiles.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : a.profiles?.name?.[0]}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{a.profiles?.name}</span> {a.action} the document
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{a.created_at ? format(safeDate(a.created_at), 'MMM d, h:mm a') : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {showPreview && (
        <FilePreview 
          document={document} 
          onClose={() => setShowPreview(false)} 
        />
      )}
    </div>
  );
}

