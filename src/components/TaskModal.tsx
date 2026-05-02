import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Flag, User, Type, AlignLeft, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, doc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Profile, Task, ChecklistItem } from '../types';
import { notificationService } from '../services/notificationService';
import { safeDate, cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task?: Task | null;
}

export default function TaskModal({ isOpen, onClose, onSuccess, task }: TaskModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Task['status']>('Pending');
  const [priority, setPriority] = useState<Task['priority']>('Medium');
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      if (task) {
        setTitle(task.title);
        setDescription(task.description || '');
        setStatus(task.status);
        setPriority(task.priority);
        setAssignedIds(task.assigned_ids || (task.assigned_to ? [task.assigned_to] : []));
        setDueDate(task.due_date ? safeDate(task.due_date).toISOString().split('T')[0] : '');
        setChecklist(task.checklist || []);
      } else {
        setTitle('');
        setDescription('');
        setStatus('Pending');
        setPriority('Medium');
        setAssignedIds([]);
        setDueDate('');
        setChecklist([]);
      }
    }
  }, [isOpen, task]);

  async function fetchUsers() {
    const q = query(collection(db, 'profiles'), orderBy('name'));
    const snapshot = await getDocs(q);
    const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Profile));
    setUsers(usersData);
  }

  const toggleUser = (userId: string) => {
    setAssignedIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: uuidv4(),
      text: newChecklistItem.trim(),
      completed: false
    };
    setChecklist([...checklist, newItem]);
    setNewChecklistItem('');
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(checklist.filter(item => item.id !== id));
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist(checklist.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);

    try {
      const taskData = {
        title,
        description,
        status,
        priority,
        assigned_ids: assignedIds,
        // Keep single assigned_to for legacy compatibility if needed (first one)
        assigned_to: assignedIds.length > 0 ? assignedIds[0] : null,
        due_date: dueDate || null,
        created_by: profile.id,
        created_by_name: profile.name,
        updated_at: new Date().toISOString(),
        checklist: checklist
      };

      let taskId = task?.id;

      if (task) {
        await updateDoc(doc(db, 'tasks', task.id), taskData);
      } else {
        const docRef = await addDoc(collection(db, 'tasks'), {
          ...taskData,
          created_at: new Date().toISOString()
        });
        taskId = docRef.id;
      }

      if (taskId) {
        // Trigger Notifications for all newly assigned users
        for (const userId of assignedIds) {
          const isNewlyAssigned = task ? !(task.assigned_ids || []).includes(userId) : true;
          if (isNewlyAssigned) {
            await notificationService.notifyTaskAssigned(taskId, userId, title);
          }
        }
        
        // Notify others of update if not newly assigned
        if (task) {
          const othersToNotify = assignedIds.filter(id => (task.assigned_ids || []).includes(id));
          for (const userId of othersToNotify) {
             await notificationService.notifyTaskUpdated(taskId, userId, title, profile.name);
          }
          
          if (task.created_by !== profile.id) {
            await notificationService.notifyTaskUpdated(taskId, task.created_by, title, profile.name);
          }
        }

        // Log activity
        try {
          await addDoc(collection(db, 'activity_logs'), {
            user_id: profile.id,
            action: task ? 'updated task' : 'created task',
            target_type: 'task',
            target_id: taskId,
            description: `${task ? 'Updated' : 'Created'} task: ${title}`,
            details: { title },
            timestamp: serverTimestamp()
          });
        } catch (logError) {
          console.warn('Activity log skipped:', logError);
        }
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving task:', error);
      alert(`Error saving task: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{task ? 'Edit Task' : 'Create New Task'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
              <Type size={16} className="text-zinc-400" />
              Task Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
              <AlignLeft size={16} className="text-zinc-400" />
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
              placeholder="Add more details..."
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
                  <Flag size={16} className="text-zinc-400" />
                  Priority
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p as any)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center",
                        priority === p 
                          ? p === 'Urgent' ? "bg-rose-500 text-white border-rose-500 shadow-sm" :
                            p === 'High' ? "bg-orange-500 text-white border-orange-500 shadow-sm" :
                            p === 'Medium' ? "bg-sky-500 text-white border-sky-500 shadow-sm" :
                            "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                          : "bg-white dark:bg-zinc-950 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
                  <CheckSquare size={16} className="text-zinc-400" />
                  Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Pending', 'In Progress', 'Review', 'Completed'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s as any)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center",
                        status === s 
                          ? s === 'Completed' ? "bg-emerald-500 text-white border-emerald-500 shadow-sm" :
                            s === 'Review' ? "bg-indigo-500 text-white border-indigo-500 shadow-sm" :
                            s === 'In Progress' ? "bg-sky-500 text-white border-sky-500 shadow-sm" :
                            "bg-amber-500 text-white border-amber-500 shadow-sm"
                          : "bg-white dark:bg-zinc-950 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
                  <User size={16} className="text-zinc-400" />
                  Assign Team Members
                </label>
                <div className="w-full h-32 overflow-y-auto p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-1">
                  {users.map((u) => {
                    const isAssigned = assignedIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors",
                          isAssigned 
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" 
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        <span className="truncate">{u.name}</span>
                        {isAssigned && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                      </button>
                    );
                  })}
                  {users.length === 0 && (
                    <div className="text-xs text-zinc-500 p-2 text-center italic">No users found</div>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">Click to add/remove team members</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
                  <Calendar size={16} className="text-zinc-400" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
              <CheckSquare size={16} className="text-zinc-400" />
              Checklist
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <button
                    type="button"
                    onClick={() => toggleChecklistItem(item.id)}
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors shadow-sm",
                      item.completed 
                        ? "bg-emerald-500 border-emerald-500 text-white" 
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                    )}
                  >
                    {item.completed && <CheckSquare size={12} className="fill-current" />}
                  </button>
                  <span className={cn(
                    "flex-1 text-sm transition-all",
                    item.completed ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-300"
                  )}>
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Add checklist item..."
                className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-2 rounded-xl font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (task ? 'Update Task' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
