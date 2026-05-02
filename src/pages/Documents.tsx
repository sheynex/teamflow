import React, { useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, or } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { 
  FileText, 
  Upload, 
  Search, 
  Filter, 
  MoreVertical, 
  Download, 
  Trash2, 
  Folder as FolderIcon, 
  File, 
  ExternalLink, 
  ChevronRight, 
  Plus, 
  LayoutGrid, 
  List as ListIcon,
  Loader2,
  ArrowLeft,
  Lock,
  Tag,
  Eye,
  X,
  Info,
  PieChart
} from 'lucide-react';
import { format } from 'date-fns';
import { Document, Folder } from '../types';
import { formatBytes, cn, safeDate } from '../lib/utils';
import DocumentDetail from '../components/DocumentDetail';
import FilePreview from '../components/FilePreview';
import FolderDetail from '../components/FolderDetail';
import { notificationService } from '../services/notificationService';

export default function Documents() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const isSuperAdminEmail = (profile?.email || '')?.toLowerCase() === 'servicefinda02@gmail.com';
  const isAdmin = ['Admin', 'Super Admin', 'Manager'].includes(profile?.role || '') || isSuperAdminEmail;

  async function toggleLock(item: Document | Folder, type: 'document' | 'folder') {
    if (!profile || !isAdmin) return;
    const newState = !item.is_locked;
    
    try {
      const collectionName = type === 'document' ? 'documents' : 'folders';
      await updateDoc(doc(db, collectionName, item.id), {
        is_locked: newState,
        locked_by: newState ? profile.id : null,
        locked_at: newState ? new Date().toISOString() : null
      });

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: newState ? `locked ${type}` : `unlocked ${type}`,
        target_type: type,
        target_id: item.id,
        description: `${newState ? 'Locked' : 'Unlocked'} ${type}: ${item.name}`,
        timestamp: serverTimestamp()
      });
    } catch (error: any) {
      console.error(`Error toggling lock for ${type}:`, error);
      alert(`Permission denied: ${error.message}`);
    }
  }

  async function shareDocument(document: Document) {
    const input = prompt("Enter email addresses of team members to share with (comma separated):");
    if (!input) return;

    const emails = input.split(',').map(e => e.trim().toLowerCase());
    try {
      // Find profiles for these emails
      const profilesSnapshot = await getDocs(query(collection(db, 'profiles'), where('email', 'in', emails)));
      const profileIds = profilesSnapshot.docs.map(d => d.id);

      if (profileIds.length === 0) {
        alert("No users found with those email addresses.");
        return;
      }

      const currentAssigned = document.assigned_ids || [];
      const newAssigned = Array.from(new Set([...currentAssigned, ...profileIds]));

      await updateDoc(doc(db, 'documents', document.id), {
        assigned_ids: newAssigned
      });

      // Notify users
      for (const pId of profileIds) {
        await notificationService.createNotification(pId, `${profile?.name} shared a document with you: ${document.name}`, 'Document Shared', `/documents?id=${document.id}`);
      }

      alert(`Document shared with ${profileIds.length} users.`);
    } catch (error: any) {
      console.error("Error sharing document:", error);
      alert("Error sharing: " + error.message);
    }
  }
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [selectedFolderForInfo, setSelectedFolderForInfo] = useState<Folder | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [currentFolderName, setCurrentFolderName] = useState<string>('root');

  useEffect(() => {
    setLoading(true);
    setDocuments([]);
    setFolders([]);
    
    // Subscribe to Folders
    const foldersQuery = query(
      collection(db, 'folders'),
      where('parent_id', '==', currentFolderId),
      orderBy('name')
    );
    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      setFolders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Folder)));
    });

    // Subscribe to Documents
    let unsubscribeDocs: () => void = () => {};
    const baseDocsRef = collection(db, 'documents');
    
    if (isAdmin) {
      const q = currentFolderId 
        ? query(baseDocsRef, where('folder_id', '==', currentFolderId), orderBy('created_at', 'desc'))
        : query(baseDocsRef, orderBy('created_at', 'desc'));
        
      unsubscribeDocs = onSnapshot(q, (snapshot) => {
        let docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document));
        if (!currentFolderId) {
          docs = docs.filter(d => !d.folder_id || d.folder_id === 'root');
        }
        setDocuments(docs);
        setLoading(false);
      }, (err) => {
        console.error("Admin Docs error:", err);
        setLoading(false);
      });
    } else {
      // Staff Role
      if (currentFolderId) {
        // In a specific folder, we can just query by folder_id
        // The security rules will block if the folder/doc is locked
        const q = query(baseDocsRef, where('folder_id', '==', currentFolderId), orderBy('created_at', 'desc'));
        unsubscribeDocs = onSnapshot(q, (snapshot) => {
          setDocuments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
          setLoading(false);
        }, (err) => {
          console.error("Staff Folder Docs error:", err);
          setDocuments([]);
          setLoading(false);
        });
      } else {
        // At root, we need to avoid the OR query which requires complex indexing
        // We'll perform two separate active listeners and merge results
        const qOwned = query(baseDocsRef, where('uploaded_by', '==', profile?.id), orderBy('created_at', 'desc'));
        const qAssigned = query(baseDocsRef, where('assigned_ids', 'array-contains', profile?.id), orderBy('created_at', 'desc'));
        
        let ownedDocs: Document[] = [];
        let assignedDocs: Document[] = [];
        
        const unsubOwned = onSnapshot(qOwned, (snap) => {
          ownedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Document))
             .filter(d => !d.folder_id || d.folder_id === 'root');
          setDocuments(Array.from(new Map([...ownedDocs, ...assignedDocs].map(d => [d.id, d])).values()));
          setLoading(false);
        }, () => setLoading(false));

        const unsubAssigned = onSnapshot(qAssigned, (snap) => {
          assignedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Document))
             .filter(d => !d.folder_id || d.folder_id === 'root');
          setDocuments(Array.from(new Map([...ownedDocs, ...assignedDocs].map(d => [d.id, d])).values()));
          setLoading(false);
        }, () => setLoading(false));

        unsubscribeDocs = () => {
          unsubOwned();
          unsubAssigned();
        };
      }
    }

    // Fetch Folder Path
    if (currentFolderId) {
      fetchFolderPath(currentFolderId);
    } else {
      setFolderPath([]);
      setCurrentFolderName('Documents');
    }

    return () => {
      unsubscribeFolders();
      unsubscribeDocs();
    };
  }, [currentFolderId, profile?.id]);

  async function fetchFolderPath(folderId: string) {
    const path: Folder[] = [];
    let currentId: string | null = folderId;
    let depth = 0;
    const MAX_DEPTH = 10;
    
    while (currentId && depth < MAX_DEPTH) {
      depth++;
      const res = await getDoc(doc(db, 'folders', currentId));
      if (!res.exists()) break;
      
      const data = { id: res.id, ...res.data() } as Folder;
      path.unshift(data);
      if (data.id === folderId) setCurrentFolderName(data.name);
      currentId = data.parent_id || null;
    }
    setFolderPath(path);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    setUploadProgress(10); // Initial progress

    try {
      const filePath = `documents/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filePath);
      
      console.log('Initiating upload for document:', filePath);
      
      const uploadTask = uploadBytesResumable(storageRef, file);

      // We can wrap the uploadTask in a promise to wait for completion
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
            setUploadProgress(progress);
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
      
      await addDoc(collection(db, 'documents'), {
        name: file.name,
        file_path: filePath,
        download_url: downloadUrl,
        uploaded_by: profile.id,
        uploaded_by_name: profile.name,
        uploaded_by_avatar: profile.avatar_url || null,
        folder_id: currentFolderId,
        folder: currentFolderId || 'root',
        size: file.size,
        file_type: file.type,
        created_at: new Date().toISOString()
      });

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'uploaded document',
        target_type: 'document',
        description: `Uploaded document: ${file.name}`,
        details: { name: file.name, folder_id: currentFolderId },
        timestamp: serverTimestamp()
      });
      console.log('Document process complete');
    } catch (error: any) {
      console.error('Fatal document upload error:', error);
      alert(`Upload failed: ${error.message}. Please check your Firebase Storage CORS settings and ensuring you have clicked 'Get Started' in the Firebase Storage console.`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (e.target) e.target.value = '';
    }
  }

  async function createFolder() {
    if (!newFolderName.trim() || !profile) return;

    try {
      await addDoc(collection(db, 'folders'), {
        name: newFolderName.trim(),
        parent_id: currentFolderId,
        created_by: profile.id,
        created_at: new Date().toISOString()
      });

      setIsNewFolderModalOpen(false);
      setNewFolderName('');
    } catch (error: any) {
      console.error('Error creating folder:', error);
      alert('Error creating folder: ' + (error.message || 'Unknown error'));
    }
  }

  async function deleteFolder(folderData: Folder) {
    if (!profile) return;
    if (folderData.is_locked && !isAdmin) {
      alert("Permission denied: This folder is locked.");
      return;
    }

    if (!confirm(`Are you sure you want to delete the folder "${folderData.name}"? This will only work if the folder is empty.`)) return;

    try {
      // Check for subfolders
      const subfoldersSnap = await getDocs(query(collection(db, 'folders'), where('parent_id', '==', folderData.id)));
      // Check for documents
      const docsSnap = await getDocs(query(collection(db, 'documents'), where('folder_id', '==', folderData.id)));

      if (!subfoldersSnap.empty || !docsSnap.empty) {
        alert("Cannot delete folder: It contains files or subfolders. Please delete all contents first.");
        return;
      }

      await deleteDoc(doc(db, 'folders', folderData.id));

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'deleted folder',
        target_type: 'folder',
        description: `Deleted folder: ${folderData.name}`,
        details: { name: folderData.name },
        timestamp: serverTimestamp()
      });

    } catch (error: any) {
      console.error('Error deleting folder:', error);
      alert('Error deleting folder: ' + (error.message || 'Unknown error'));
    }
  }

  async function deleteDocument(docData: Document) {
    if (!confirm(`Are you sure you want to delete "${docData.name}"?`)) return;
    try {
      const storageRef = ref(storage, docData.file_path);
      await deleteObject(storageRef);
      await deleteDoc(doc(db, 'documents', docData.id));

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile?.id,
        action: 'deleted document',
        target_type: 'document',
        description: `Deleted document: ${docData.name}`,
        details: { name: docData.name },
        timestamp: serverTimestamp()
      });

    } catch (error: any) {
      console.error('Error deleting document:', error);
      alert('Error deleting document: ' + (error.message || 'Unknown error'));
    }
  }

  const getFileIcon = (type: string | undefined) => {
    if (!type) return <File className="text-zinc-400" />;
    if (type.includes('pdf')) return <FileText className="text-red-500" />;
    if (type.includes('image')) return <File className="text-blue-500" />;
    if (type.includes('sheet') || type.includes('excel')) return <File className="text-emerald-500" />;
    if (type.includes('word') || type.includes('officedocument')) return <FileText className="text-blue-600" />;
    return <File className="text-zinc-400" />;
  };

  const filteredDocs = documents.filter(doc => {
    return doc.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredFolders = folders.filter(folder => {
    return folder.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Documents</h1>
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mt-1">
            <button 
              onClick={() => {
                setLoading(true);
                setCurrentFolderId(null);
                setCurrentFolderName('Documents');
              }}
              className="hover:text-emerald-600 transition-colors font-medium"
            >
              All Files
            </button>
            {folderPath.map((folder, i) => (
              <React.Fragment key={folder.id}>
                <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-700" />
                <button 
                  onClick={() => {
                    setLoading(true);
                    setCurrentFolderId(folder.id);
                  }}
                  className={cn(
                    "hover:text-emerald-600 transition-colors",
                    i === folderPath.length - 1 ? "font-bold text-zinc-900 dark:text-zinc-100" : "font-medium"
                  )}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {currentFolderId && (
            <button 
              onClick={() => {
                const folder = folderPath[folderPath.length - 1];
                if (folder) setSelectedFolderForInfo(folder);
              }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 p-2 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Current Folder Stats"
            >
              <PieChart size={20} />
            </button>
          )}
          {currentFolderId && (isAdmin || folderPath[folderPath.length - 1]?.created_by === profile?.id) && (
            <button 
              onClick={() => {
                const folder = folderPath[folderPath.length - 1];
                if (folder) deleteFolder(folder);
              }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 hover:text-red-500 p-2 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Delete Current Folder"
            >
              <Trash2 size={20} />
            </button>
          )}
          <button 
            onClick={() => setIsNewFolderModalOpen(true)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm"
          >
            <FolderIcon size={18} className="text-zinc-400" /> New Folder
          </button>
          <label className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer relative overflow-hidden group">
            {uploading ? (
              <>
                <div 
                  className="absolute inset-0 bg-emerald-600/50 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
                <Loader2 className="animate-spin relative z-10" size={18} />
                <span className="relative z-10">{Math.round(uploadProgress)}%</span>
              </>
            ) : (
              <>
                <Upload size={18} />
                Upload File
              </>
            )}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            placeholder="Search in this folder..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 shadow-sm">
            <button 
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-lg transition-all ${view === 'grid' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setView('list')}
              className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={32} />
          <p className="font-medium">Loading documents...</p>
        </div>
      ) : (filteredDocs.length > 0 || folders.length > 0 || currentFolderId !== null) ? (
        <div className="space-y-8">
          {/* Back Button */}
          {currentFolderId !== null && (
            <button 
              onClick={() => {
                setLoading(true);
                const parentId = folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null;
                setCurrentFolderId(parentId);
              }}
              className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors group w-fit"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to {folderPath.length > 1 ? folderPath[folderPath.length - 2].name : 'All Files'}
            </button>
          )}

          {/* Folders List/Grid */}
          {filteredFolders.length > 0 && (
            <div className={cn(
              view === 'grid' 
                ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" 
                : "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden mb-4"
            )}>
              {view === 'list' && (
                <div className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 px-6 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Folders
                </div>
              )}
              {filteredFolders.map((folder) => (
                view === 'grid' ? (
                  <div 
                    key={folder.id}
                    onClick={() => {
                      if (folder.is_locked && !isAdmin) {
                        alert("Permission Denied: This folder is locked by an administrator and is restricted.");
                        return;
                      }
                      setLoading(true);
                      setCurrentFolderId(folder.id);
                    }}
                    className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex flex-col items-center gap-3 group cursor-pointer"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 transition-colors relative">
                      <FolderIcon size={24} className={cn("text-zinc-400 group-hover:text-emerald-500", folder.is_locked && "text-amber-500")} />
                      {folder.is_locked && (
                        <div className="absolute -top-1 -left-1 p-1 bg-amber-500 rounded-full text-white shadow-sm" title="Locked by Admin">
                          <Lock size={10} />
                        </div>
                      )}
                      <div className="absolute -top-1 -right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFolderForInfo(folder);
                          }}
                          className="p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full text-zinc-400 hover:text-emerald-500 shadow-sm transition-all"
                          title="Folder Info & Report"
                        >
                          <Info size={12} />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLock(folder, 'folder');
                            }}
                            className={cn(
                              "p-1 border shadow-sm transition-all rounded-full",
                              folder.is_locked 
                                ? "bg-amber-500 border-amber-600 text-white hover:bg-amber-600" 
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-amber-500"
                            )}
                            title={folder.is_locked ? "Unlock Folder" : "Lock Folder"}
                          >
                            <Lock size={12} />
                          </button>
                        )}
                        {(isAdmin || folder.created_by === profile?.id) && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFolder(folder);
                            }}
                            className="p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full text-zinc-400 hover:text-red-500 shadow-sm transition-all"
                            title="Delete Folder"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 truncate w-full text-center">{folder.name}</span>
                  </div>
                ) : (
                  <div 
                    key={folder.id}
                    onClick={() => {
                      if (folder.is_locked && !isAdmin) {
                        alert("Permission Denied: This folder is locked by an administrator and is restricted.");
                        return;
                      }
                      setLoading(true);
                      setCurrentFolderId(folder.id);
                    }}
                    className="flex items-center justify-between px-6 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <FolderIcon size={18} className={cn("text-zinc-400 group-hover:text-emerald-500 transition-colors", folder.is_locked && "text-amber-500")} />
                        {folder.is_locked && (
                          <div className="absolute -top-1 -left-1 bg-amber-500 rounded-full p-0.5 text-white">
                            <Lock size={8} />
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{folder.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFolderForInfo(folder);
                        }}
                        className="p-1.5 text-zinc-300 hover:text-zinc-500 transition-colors"
                      >
                        <Info size={14} />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock(folder, 'folder');
                          }}
                          className={cn(
                            "p-1.5 transition-colors",
                            folder.is_locked ? "text-amber-500" : "text-zinc-300 hover:text-amber-500"
                          )}
                        >
                          <Lock size={14} />
                        </button>
                      )}
                      {(isAdmin || folder.created_by === profile?.id) && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFolder(folder);
                          }}
                          className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <ChevronRight size={14} className="text-zinc-300" />
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Files Grid/List */}
          {(filteredDocs.length > 0 || (filteredFolders.length === 0 && filteredDocs.length === 0)) && (
            view === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredDocs.map((doc) => (
                  <div 
                    key={doc.id} 
                    onClick={() => {
                      if (doc.is_locked && !isAdmin) {
                        alert("Permission Denied: This file is locked by an administrator.");
                        return;
                      }
                      setSelectedDocId(doc.id);
                    }}
                    className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group cursor-pointer relative"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="relative">
                        <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl group-hover:bg-zinc-100 dark:group-hover:bg-zinc-700 transition-colors">
                          {getFileIcon(doc.file_type)}
                        </div>
                        {doc.is_locked && (
                          <div className="absolute -top-1 -left-1 p-1 bg-amber-500 rounded-full text-white shadow-sm" title="Locked by Admin">
                            <Lock size={10} />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isAdmin && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLock(doc, 'document');
                            }}
                            className={cn(
                              "p-1.5 rounded-lg transition-all",
                              doc.is_locked 
                                ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400" 
                                : "text-zinc-400 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            )}
                            title={doc.is_locked ? "Unlock Document" : "Lock Document"}
                          >
                            <Lock size={16} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            shareDocument(doc);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                          title="Share / Assign"
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    </div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 truncate" title={doc.name}>{doc.name}</h3>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                      {formatBytes(doc.size)} • {doc.created_at ? format(safeDate(doc.created_at), 'MMM d') : ''}
                    </p>
                    
                    <div className="mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-500 dark:text-zinc-400 overflow-hidden uppercase">
                          {doc.uploaded_by_name?.[0] || '?'}
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          {doc.uploaded_by_name?.split(' ')[0]}
                        </span>
                      </div>
                      <div className="flex gap-1 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewDoc(doc);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors"
                          title="Preview"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(doc.download_url, '_blank');
                          }}
                          className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors"
                          title="Download"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDocument(doc);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Uploaded By</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Size</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredDocs.map((doc) => (
                      <tr 
                        key={doc.id} 
                        onClick={() => {
                          if (doc.is_locked && !isAdmin) {
                            alert("Permission Denied: This file is locked by an administrator.");
                            return;
                          }
                          setSelectedDocId(doc.id);
                        }}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg relative">
                              {getFileIcon(doc.file_type)}
                              {doc.is_locked && (
                                <div className="absolute -top-1 -left-1 p-0.5 bg-amber-500 rounded-full text-white">
                                  <Lock size={8} />
                                </div>
                              )}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 transition-colors">{doc.name}</span>
                              {doc.is_locked && <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">Locked</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 overflow-hidden uppercase">
                              {doc.uploaded_by_name?.[0] || '?'}
                            </div>
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{doc.uploaded_by_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-500 font-medium">{doc.created_at ? format(safeDate(doc.created_at), 'MMM d, yyyy') : ''}</td>
                        <td className="px-6 py-4 text-xs text-zinc-500 font-medium">{formatBytes(doc.size)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1 items-center">
                            {isAdmin && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLock(doc, 'document');
                                }}
                                className={cn(
                                  "p-1.5 rounded-lg transition-all",
                                  doc.is_locked 
                                    ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10" 
                                    : "text-zinc-400 hover:text-amber-500"
                                )}
                                title={doc.is_locked ? "Unlock Document" : "Lock Document"}
                              >
                                <Lock size={16} />
                              </button>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                shareDocument(doc);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors"
                              title="Share"
                            >
                              <ExternalLink size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewDoc(doc);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors"
                              title="Preview"
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(doc.download_url, '_blank');
                              }}
                              className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors"
                              title="Download"
                            >
                              <Download size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDocument(doc);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="bg-zinc-50 dark:bg-zinc-900 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
            <FileText size={32} />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">No documents found</h3>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Upload your first file to get started.</p>
          <label className="mt-6 inline-flex bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-2 rounded-xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all cursor-pointer shadow-sm">
            Upload File
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      )}

      {/* New Folder Modal */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in zoom-in duration-200 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">New Folder</h2>
            <input 
              type="text" 
              placeholder="Folder name" 
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all mb-6 placeholder:text-zinc-400"
              autoFocus
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setIsNewFolderModalOpen(false)}
                className="flex-1 px-4 py-2 rounded-xl font-bold border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={createFolder}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Detail Panel */}
      {selectedDocId && (
        <DocumentDetail 
          documentId={selectedDocId} 
          onClose={() => setSelectedDocId(null)} 
          onUpdate={() => {}}
        />
      )}

      {/* File Preview Modal */}
      {previewDoc && (
        <FilePreview 
          document={previewDoc} 
          onClose={() => setPreviewDoc(null)} 
        />
      )}

      {/* Folder Detail Modal */}
      {selectedFolderForInfo && (
        <FolderDetail 
          folder={selectedFolderForInfo} 
          onClose={() => setSelectedFolderForInfo(null)}
          isVirtual={false}
        />
      )}
    </div>
  );
}

