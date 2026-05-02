import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Calendar, Flag, User, Clock, MessageSquare, History, CheckCircle2, AlertCircle, Paperclip, File as FileIcon, Download, Trash2, Plus, ChevronRight, ListChecks } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { Task, TaskComment, Activity, Document as DocType, Profile, ChecklistItem } from '../types';
import { format, parseISO } from 'date-fns';
import { notificationService } from '../services/notificationService';
import { safeDate, formatBytes, cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function TaskDetail({ taskId, onClose, onUpdate }: TaskDetailProps) {
  const { profile } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [attachments, setAttachments] = useState<DocType[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'comments' | 'attachments' | 'history'>('checklist');
  const [isDeleting, setIsDeleting] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdminEmail = (profile?.email || '')?.toLowerCase() === 'servicefinda02@gmail.com';
  const isAdmin = ['Admin', 'Super Admin', 'Manager'].includes(profile?.role || '') || isSuperAdminEmail;
  const canDelete = isAdmin || (profile?.id === task?.created_by);

  useEffect(() => {
    setLoading(true);
    
    // Subscribe to Task
    const unsubscribeTask = onSnapshot(doc(db, 'tasks', taskId), (snapshot) => {
      if (snapshot.exists()) {
        setTask({ id: snapshot.id, ...snapshot.data() } as Task);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error listening to task:', error);
      setLoading(false);
    });

    // Subscribe to comments
    const commentsQuery = query(
      collection(db, 'task_comments'),
      where('task_id', '==', taskId),
      orderBy('created_at', 'asc')
    );
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TaskComment)));
    });

    // Subscribe to attachments
    const attachmentsQuery = query(
      collection(db, 'documents'),
      where('task_id', '==', taskId),
      orderBy('created_at', 'desc')
    );
    const unsubscribeAttachments = onSnapshot(attachmentsQuery, (snapshot) => {
      setAttachments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DocType)));
    });

    // Fetch History (using onSnapshot for real-time history)
    const historyQuery = query(
      collection(db, 'activity_logs'),
      where('target_id', '==', taskId),
      orderBy('timestamp', 'desc')
    );
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      setHistory(snapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        created_at: d.data().timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
      } as any)));
    });

    // Fetch Users
    const fetchUsers = async () => {
      const usersQuery = query(collection(db, 'profiles'), orderBy('name'));
      const snapshot = await getDocs(usersQuery);
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Profile)));
    };
    fetchUsers();

    return () => {
      unsubscribeTask();
      unsubscribeComments();
      unsubscribeAttachments();
      unsubscribeHistory();
    };
  }, [taskId]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    
    setUploadingFile(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const filePath = `tasks/${taskId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filePath);
      
      console.log('Initiating upload to:', filePath);
      
      const uploadTask = uploadBytesResumable(storageRef, file);

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
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

      console.log('Download URL obtained:', downloadUrl);

      await addDoc(collection(db, 'documents'), {
        name: file.name,
        file_path: filePath,
        download_url: downloadUrl,
        uploaded_by: profile.id,
        uploaded_by_name: profile.name,
        task_id: taskId,
        size: file.size,
        file_type: file.type,
        created_at: new Date().toISOString()
      });

      // Trigger Notifications
      if (task) {
        if (task.assigned_to && task.assigned_to !== profile.id) {
          await notificationService.notifyFileUploaded(taskId, task.assigned_to, file.name, profile.name);
        }
        if (task.created_by !== profile.id) {
          await notificationService.notifyFileUploaded(taskId, task.created_by, file.name, profile.name);
        }
      }

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'attached a file to task',
        target_type: 'task',
        target_id: taskId,
        description: `Attached file "${file.name}" to task`,
        details: { filename: file.name },
        timestamp: serverTimestamp()
      });
      
      console.log('Task attachment process fully complete');
    } catch (error: any) {
      console.error('Fatal error starting upload:', error);
      setUploadError(`Upload failed: ${error.message}. Please check CORS and ensure Storage is enabled.`);
    } finally {
      setUploadingFile(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteAttachment(id: string, filePath: string) {
    if (!confirm('Are you sure you want to delete this attachment?')) return;
    try {
      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);
      await deleteDoc(doc(db, 'documents', id));

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile?.id,
        action: 'removed attachment from task',
        target_type: 'task',
        target_id: taskId,
        description: `Removed an attachment from task`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !commentText.trim()) return;
    setSendingComment(true);

    try {
      await addDoc(collection(db, 'task_comments'), {
        task_id: taskId,
        user_id: profile.id,
        user_name: profile.name,
        user_avatar: profile.avatar_url || null,
        content: commentText.trim(),
        created_at: new Date().toISOString()
      });

      setCommentText('');
      
      // Trigger Notifications
      if (task) {
        const recipients = new Set<string>();
        if (task.assigned_to && task.assigned_to !== profile.id) recipients.add(task.assigned_to);
        if (task.created_by !== profile.id) recipients.add(task.created_by);
        
        // Handle Mentions
        const mentionRegex = /@(\w+)/g;
        const matches = commentText.match(mentionRegex);
        if (matches) {
          matches.forEach(match => {
            const name = match.substring(1).toLowerCase();
            const mentionedUser = users.find(u => u.name.toLowerCase().replace(/\s+/g, '').includes(name));
            if (mentionedUser && mentionedUser.id !== profile.id) {
              notificationService.notifyMention(mentionedUser.id, task.title, profile.name, taskId);
              recipients.delete(mentionedUser.id);
            }
          });
        }
        
        for (const recipientId of recipients) {
          await notificationService.createNotification(
            recipientId,
            `${profile.name} commented on task: "${task.title}"`,
            'New Comment',
            `/tasks?id=${taskId}`
          );
        }
      }

      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'commented on task',
        target_type: 'task',
        target_id: taskId,
        description: `Added a comment to task: "${commentText.substring(0, 30)}..."`,
        details: { comment: commentText.substring(0, 50) },
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSendingComment(false);
    }
  }

  async function updateStatus(newStatus: Task['status']) {
    if (!profile || !task) return;
    try {
      await updateDoc(doc(db, 'tasks', taskId), { 
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      
      // Trigger Notifications
      const recipients = new Set<string>();
      if (task.assigned_ids) {
        task.assigned_ids.forEach(id => {
          if (id !== profile.id) recipients.add(id);
        });
      }
      if (task.assigned_to && task.assigned_to !== profile.id) recipients.add(task.assigned_to);
      if (task.created_by !== profile.id) recipients.add(task.created_by);

      for (const recipientId of recipients) {
        if (newStatus === 'Completed') {
          await notificationService.notifyTaskCompleted(taskId, recipientId, task.title, profile.name);
        } else {
          await notificationService.notifyTaskUpdated(taskId, recipientId, task.title, profile.name);
        }
      }

      setTask({ ...task, status: newStatus });
      onUpdate();
      
      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: `changed status to ${newStatus}`,
        target_type: 'task',
        target_id: taskId,
        description: `Changed task status to ${newStatus}`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function updateAssignee(newAssigneeId: string) {
    if (!profile || !task) return;
    try {
      const oldAssigneeId = task.assigned_to;
      await updateDoc(doc(db, 'tasks', taskId), { 
        assigned_to: newAssigneeId || null,
        updated_at: new Date().toISOString()
      });

      if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
        await notificationService.notifyTaskAssigned(taskId, newAssigneeId, task.title);
      }

      onUpdate();
      
      // Log activity
      const assigneeName = users.find(u => u.id === newAssigneeId)?.name || 'Unassigned';
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        user_name: profile.name,
        action: `reassigned task to ${assigneeName}`,
        target_type: 'task',
        target_id: taskId,
        description: `Reassigned task from ${users.find(u => u.id === oldAssigneeId)?.name || 'Unassigned'} to ${assigneeName}`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating assignee:', error);
    }
  }

  async function updateDueDate(newDate: string) {
    if (!profile || !task) return;
    try {
      await updateDoc(doc(db, 'tasks', taskId), { 
        due_date: newDate || null,
        updated_at: new Date().toISOString()
      });

      onUpdate();
      
      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: `changed due date to ${newDate || 'None'}`,
        target_type: 'task',
        target_id: taskId,
        description: `Changed due date to ${newDate || 'None'}`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating due date:', error);
    }
  }

  async function handleAddChecklistItem(e: React.KeyboardEvent | React.MouseEvent) {
    if (!profile || !task) return;
    if (!newChecklistItem.trim()) return;

    const currentChecklist = task.checklist || [];
    const newItem: ChecklistItem = {
      id: uuidv4(),
      text: newChecklistItem.trim(),
      completed: false
    };

    const updatedChecklist = [...currentChecklist, newItem];
    
    try {
      await updateDoc(doc(db, 'tasks', taskId), { checklist: updatedChecklist });
      setNewChecklistItem('');
      
      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'added checklist item',
        target_type: 'task',
        target_id: taskId,
        description: `Added "${newItem.text}" to checklist`,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding checklist item:', error);
    }
  }

  async function toggleChecklistItem(itemId: string) {
    if (!profile || !task || !task.checklist) return;
    
    const updatedChecklist = task.checklist.map(item => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );

    try {
      await updateDoc(doc(db, 'tasks', taskId), { checklist: updatedChecklist });
    } catch (error) {
      console.error('Error toggling checklist item:', error);
    }
  }

  async function removeChecklistItem(itemId: string) {
    if (!profile || !task || !task.checklist) return;
    
    const updatedChecklist = task.checklist.filter(item => item.id !== itemId);

    try {
      await updateDoc(doc(db, 'tasks', taskId), { checklist: updatedChecklist });
    } catch (error) {
      console.error('Error removing checklist item:', error);
    }
  }

  async function handleDeleteTask() {
    if (!task || !profile) return;
    if (!confirm(`Are you sure you want to delete "${task.title}"? This action cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      // 1. Delete comments
      const commentsSnapshot = await getDocs(query(collection(db, 'task_comments'), where('task_id', '==', taskId)));
      for (const d of commentsSnapshot.docs) {
        await deleteDoc(d.ref);
      }

      // 2. Delete attachments (files + docs)
      const docsSnapshot = await getDocs(query(collection(db, 'documents'), where('task_id', '==', taskId)));
      for (const d of docsSnapshot.docs) {
        const fileData = d.data();
        if (fileData.file_path) {
          try {
            await deleteObject(ref(storage, fileData.file_path));
          } catch (e) {
            console.warn('Error deleting file from storage:', e);
          }
        }
        await deleteDoc(d.ref);
      }

      // 3. Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'deleted task',
        target_type: 'task',
        target_id: taskId,
        description: `Deleted task: "${task.title}"`,
        timestamp: serverTimestamp()
      });

      // 4. Delete the task itself
      await deleteDoc(doc(db, 'tasks', taskId));
      
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      alert(`Failed to delete task: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex items-center justify-center border-l border-zinc-200">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-950 shadow-2xl z-50 flex flex-col border-l border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare size={20} className="text-emerald-500" />
          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Task Details</span>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button 
              onClick={handleDeleteTask}
              disabled={isDeleting}
              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all"
              title="Delete Task"
            >
              {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
            </button>
          )}
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Title & Description */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{task.title}</h2>
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              task.priority === 'Urgent' ? 'text-red-600 bg-red-50 border-red-100 dark:bg-red-500/10 dark:border-red-500/20' :
              task.priority === 'High' ? 'text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20' :
              task.priority === 'Medium' ? 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20' :
              'text-zinc-600 bg-zinc-50 border-zinc-100 dark:text-zinc-400 dark:bg-zinc-800/50 dark:border-zinc-800'
            }`}>
              {task.priority}
            </span>
            <div className={cn(
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ring-1 ring-inset relative",
              task.status === 'Completed' ? 'text-emerald-600 bg-emerald-50 border-emerald-100 ring-emerald-500/10' :
              task.status === 'Review' ? 'text-indigo-600 bg-indigo-50 border-indigo-100 ring-indigo-500/10' :
              task.status === 'In Progress' ? 'text-sky-600 bg-sky-50 border-sky-100 ring-sky-500/10' :
              'text-amber-600 bg-amber-50 border-amber-100 ring-amber-500/10'
            )}>
              <select 
                value={task.status}
                onChange={(e) => updateStatus(e.target.value as any)}
                className="bg-transparent border-none text-inherit outline-none cursor-pointer font-bold appearance-none pr-4"
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Completed">Completed</option>
              </select>
              <ChevronRight size={10} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none opacity-50" />
            </div>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
            {task.description || 'No description provided.'}
          </p>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Assignees</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {task.assigned_ids && task.assigned_ids.length > 0 ? (
                task.assigned_ids.map(id => {
                  const u = users.find(user => user.id === id);
                  return (
                    <div 
                      key={id} 
                      className="group relative flex items-center gap-1.5 px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg"
                      title={u?.name || id}
                    >
                      <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-500 dark:text-zinc-400 overflow-hidden">
                        {u?.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u?.name?.[0] || '?')}
                      </div>
                      <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 max-w-[60px] truncate">{u?.name || 'User'}</span>
                    </div>
                  );
                })
              ) : task.assigned_to ? (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-500 dark:text-zinc-400 overflow-hidden">
                    {users.find(u => u.id === task.assigned_to)?.avatar_url ? (
                      <img src={users.find(u => u.id === task.assigned_to)?.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (users.find(u => u.id === task.assigned_to)?.name?.[0] || '?')}
                  </div>
                  <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 truncate">{users.find(u => u.id === task.assigned_to)?.name || 'User'}</span>
                </div>
              ) : (
                <span className="text-xs text-zinc-400 italic">Unassigned</span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Due Date</p>
            <div className="relative">
              <input
                type="date"
                value={task.due_date ? safeDate(task.due_date).toISOString().split('T')[0] : ''}
                onChange={(e) => updateDueDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
              />
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="space-y-4">
          <div className="flex border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto scrollbar-none">
            <button 
              onClick={() => setActiveTab('checklist')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'checklist' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <ListChecks size={14} />
                Checklist ({(task.checklist || []).filter(i => i.completed).length}/{(task.checklist || []).length})
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('comments')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'comments' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageSquare size={14} />
                Comments ({comments.length})
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('attachments')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'attachments' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Paperclip size={14} />
                Files ({attachments.length})
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                activeTab === 'history' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <History size={14} />
                Log
              </div>
            </button>
          </div>

          {activeTab === 'checklist' ? (
            <div className="space-y-4">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
                {task.checklist && task.checklist.length > 0 ? task.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 group bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-xl border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-all">
                    <button
                      onClick={() => toggleChecklistItem(item.id)}
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-all",
                        item.completed 
                          ? "bg-emerald-500 border-emerald-500 text-white" 
                          : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                      )}
                    >
                      {item.completed && <CheckSquare size={12} className="fill-current text-white" />}
                    </button>
                    <span className={cn(
                      "flex-1 text-sm font-medium transition-all",
                      item.completed ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-300"
                    )}>
                      {item.text}
                    </span>
                    <button
                      onClick={() => removeChecklistItem(item.id)}
                      className="p-1.5 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-8 text-zinc-400">
                    <ListChecks size={24} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No checklist items yet.</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem(e)}
                  placeholder="Add a step..."
                  className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                />
                <button
                  onClick={handleAddChecklistItem}
                  className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-500/20"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          ) : activeTab === 'comments' ? (
            <div className="space-y-4">
              <div className="space-y-4 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
                {comments.length > 0 ? comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400 overflow-hidden uppercase">
                      {comment.user_avatar ? (
                        <img src={comment.user_avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        comment.user_name?.[0] || '?'
                      )}
                    </div>
                    <div className="flex-1 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{comment.user_name}</span>
                        <span className="text-[10px] text-zinc-400">{comment.created_at ? format(safeDate(comment.created_at), 'MMM d, h:mm a') : ''}</span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{comment.content}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-zinc-400 text-sm py-8">No comments yet found.</p>
                )}
              </div>
              
              <form onSubmit={handleAddComment} className="relative">
                <input 
                  type="text" 
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..." 
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm text-zinc-900 dark:text-white"
                />
                <button 
                  type="submit"
                  disabled={sendingComment || !commentText.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {sendingComment ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </form>
            </div>
          ) : activeTab === 'attachments' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Task Attachments</h3>
                <div className="flex items-center gap-4">
                  {uploadingFile && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-300" 
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-400">{Math.round(uploadProgress)}%</span>
                    </div>
                  )}
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {uploadingFile ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                    Upload File
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </div>

              {uploadError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-xs animate-in fade-in slide-in-from-top-1">
                  <AlertCircle size={14} />
                  <span className="flex-1">{uploadError}</span>
                  <button onClick={() => setUploadError(null)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg">
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
                {attachments.length > 0 ? attachments.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-100 dark:border-zinc-800 shadow-sm">
                        <FileIcon size={16} className="text-zinc-400" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {file.size ? formatBytes(file.size) : 'Unknown size'} • {file.created_at ? format(safeDate(file.created_at), 'MMM d') : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 transition-opacity">
                      <button 
                        onClick={() => {
                          window.open(file.download_url, '_blank');
                        }}
                        className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
                      >
                        <Download size={14} />
                      </button>
                      <button 
                        onClick={() => deleteAttachment(file.id, file.file_path)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-zinc-400 text-sm py-8">No attachments found.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
              {history.length > 0 ? history.map((log) => (
                <div key={log.id} className="flex gap-3 relative pb-4 last:pb-0">
                  <div className="absolute left-3 top-8 bottom-0 w-px bg-zinc-100 dark:bg-zinc-800 last:hidden"></div>
                  <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center z-10 uppercase text-[10px] font-bold">
                    {log.action?.includes('status') ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertCircle size={12} className="text-zinc-400" />}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">{log.user_name || 'System'}</span> {log.action}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{log.timestamp ? format(safeDate(log.timestamp), 'MMM d, h:mm a') : ''}</p>
                  </div>
                </div>
              )) : (
                <p className="text-center text-zinc-400 text-sm py-8">No history recorded.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <Clock size={14} />
          <span>Task created on {task.created_at ? format(safeDate(task.created_at), 'MMMM d, yyyy') : 'Unknown'}</span>
        </div>
      </div>
    </div>
  );
}

function CheckSquare({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
