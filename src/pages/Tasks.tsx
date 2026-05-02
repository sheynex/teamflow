import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, where, or } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Calendar, 
  CheckSquare, 
  LayoutGrid, 
  List as ListIcon,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { Task, Profile } from '../types';
import { cn, safeDate } from '../lib/utils';
import TaskModal from '../components/TaskModal';
import TaskDetail from '../components/TaskDetail';

type ViewMode = 'kanban' | 'list';

const STATUS_COLUMNS: Task['status'][] = ['Pending', 'In Progress', 'Review', 'Completed'];

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const { user, profile } = useAuth();
  const isSuperAdminEmail = (user?.email || profile?.email || '')?.toLowerCase() === 'servicefinda02@gmail.com';

  useEffect(() => {
    const taskId = searchParams.get('id');
    if (taskId) {
      setDetailTaskId(taskId);
    }
    if (searchParams.get('new') === 'true') {
      setSelectedTask(null);
      setIsModalOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    
    const isVerifiedAdmin = ['Admin', 'Super Admin', 'Manager'].includes(profile?.role || '');
    const isAdmin = isVerifiedAdmin || isSuperAdminEmail;

    let unsubscribe: () => void = () => {};
    if (!isAdmin) {
      // Split query to avoid index requirements for OR + orderBy
      const qAssignedIds = query(collection(db, 'tasks'), where('assigned_ids', 'array-contains', profile.id), orderBy('created_at', 'desc'));
      const qCreatedBy = query(collection(db, 'tasks'), where('created_by', '==', profile.id), orderBy('created_at', 'desc'));
      const qAssignedTo = query(collection(db, 'tasks'), where('assigned_to', '==', profile.id), orderBy('created_at', 'desc'));

      let assignedIdsTasks: Task[] = [];
      let createdByTasks: Task[] = [];
      let assignedToTasks: Task[] = [];

      const updateTasks = () => {
        const merged = Array.from(new Map([...assignedIdsTasks, ...createdByTasks, ...assignedToTasks].map(t => [t.id, t])).values());
        setTasks(merged.sort((a, b) => safeDate(b.created_at).getTime() - safeDate(a.created_at).getTime()));
        setLoading(false);
      };

      const unsub1 = onSnapshot(qAssignedIds, (snap) => {
        assignedIdsTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        updateTasks();
      }, () => setLoading(false));

      const unsub2 = onSnapshot(qCreatedBy, (snap) => {
        createdByTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        updateTasks();
      }, () => setLoading(false));

      const unsub3 = onSnapshot(qAssignedTo, (snap) => {
        assignedToTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        updateTasks();
      }, () => setLoading(false));

      unsubscribe = () => {
        unsub1();
        unsub2();
        unsub3();
      };
    } else {
      const tasksQuery = query(collection(db, 'tasks'), orderBy('created_at', 'desc'));
      unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
        setLoading(false);
      }, (err) => {
        console.error('Error listening to tasks:', err);
        setLoading(false);
      });
    }
    
    return () => unsubscribe();
  }, [profile]);

  const filteredTasks = tasks.filter(task => {
    const matchesFilter = filter === 'All' || task.status === filter;
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'text-red-600 bg-red-50 border-red-100';
      case 'High': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'Medium': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'Low': return 'text-zinc-600 bg-zinc-50 border-zinc-100';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'text-emerald-600 bg-emerald-50 border-emerald-100 ring-emerald-500/10';
      case 'Review': return 'text-indigo-600 bg-indigo-50 border-indigo-100 ring-indigo-500/10';
      case 'In Progress': return 'text-sky-600 bg-sky-50 border-sky-100 ring-sky-500/10';
      case 'Pending': return 'text-amber-600 bg-amber-50 border-amber-100 ring-amber-500/10';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-100 ring-zinc-500/10';
    }
  };

  const handleTaskClick = (task: Task) => {
    setDetailTaskId(task.id);
  };

  const handleEditTask = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const otherTasks = filteredTasks.filter(t => !STATUS_COLUMNS.includes(t.status));

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Tasks</h1>
          <p className="text-zinc-500 mt-1">Manage and track your project tasks.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-zinc-200 rounded-xl p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <button 
            onClick={() => { setSelectedTask(null); setIsModalOpen(true); }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={20} /> New Task
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            placeholder="Search tasks..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {['All', ...STATUS_COLUMNS].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap ${
                filter === s 
                  ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" 
                  : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* View Content */}
      {loading ? (
        <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={32} />
          <p className="font-medium">Loading tasks...</p>
        </div>
      ) : filteredTasks.length > 0 ? (
        viewMode === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STATUS_COLUMNS.map(status => {
              const statusColor = getStatusColor(status);
              const columnTasks = filteredTasks.filter(t => t.status === status);
              
              return (
                <div key={status} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-zinc-100 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", 
                        status === 'Completed' ? 'bg-emerald-500' :
                        status === 'Review' ? 'bg-indigo-500' :
                        status === 'In Progress' ? 'bg-sky-500' : 'bg-amber-500'
                      )} />
                      <h3 className="text-xs font-black text-zinc-700 uppercase tracking-widest">{status}</h3>
                      <span className="bg-zinc-100 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4 min-h-[200px] pb-10">
                    {columnTasks.map(task => (
                      <TaskCard key={task.id} task={task} onClick={() => handleTaskClick(task)} onEdit={(e) => handleEditTask(e, task)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {otherTasks.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-zinc-100 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-400" />
                    <h3 className="text-xs font-black text-zinc-700 uppercase tracking-widest">Other</h3>
                    <span className="bg-zinc-100 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {otherTasks.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 min-h-[200px] pb-10">
                  {otherTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => handleTaskClick(task)} onEdit={(e) => handleEditTask(e, task)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Task</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Assignee</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTasks.map(task => (
                  <tr key={task.id} onClick={() => handleTaskClick(task)} className="hover:bg-zinc-50 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors">{task.title}</p>
                        <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{task.description}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ring-1 ring-inset ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2 overflow-hidden">
                          {task.assigned_ids && task.assigned_ids.length > 0 ? (
                            task.assigned_ids.slice(0, 3).map((id, index) => (
                              <div 
                                key={id} 
                                className="w-6 h-6 rounded-full bg-zinc-100 border-2 border-white flex items-center justify-center text-[8px] font-black text-zinc-500 shadow-sm"
                                title={`User ID: ${id}`}
                              >
                                {index + 1}
                              </div>
                            ))
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                              ?
                            </div>
                          )}
                        </div>
                        {task.assigned_ids && task.assigned_ids.length > 3 && (
                          <span className="text-[10px] font-bold text-zinc-400">+{task.assigned_ids.length - 3}</span>
                        )}
                        {!task.assigned_ids && task.assigned_to && (
                          <span className="text-xs text-zinc-500">{task.assigned_to.slice(0, 4)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Calendar size={14} />
                        <span>{task.due_date ? format(safeDate(task.due_date), 'MMM d, yyyy') : 'No date'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={(e) => handleEditTask(e, task)} className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
            <CheckSquare size={32} />
          </div>
          <h3 className="text-lg font-bold text-zinc-900">No tasks found</h3>
          <p className="text-zinc-500 mt-1">Get started by creating your first task.</p>
          <button 
            onClick={() => { setSelectedTask(null); setIsModalOpen(true); }}
            className="mt-6 bg-zinc-900 text-white px-6 py-2 rounded-xl font-semibold hover:bg-zinc-800 transition-colors"
          >
            Create Task
          </button>
        </div>
      )}

      {/* Modals & Detail Panel */}
      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {}} 
        task={selectedTask}
      />
      
      {detailTaskId && (
        <TaskDetail 
          taskId={detailTaskId} 
          onClose={() => setDetailTaskId(null)} 
          onUpdate={() => {}}
        />
      )}
    </div>
  );
}

interface TaskCardProps {
  key?: string | number;
  task: Task;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
}

function TaskCard({ task, onClick, onEdit }: TaskCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'text-red-600 bg-red-50 border-red-100';
      case 'High': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'Medium': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'Low': return 'text-zinc-600 bg-zinc-50 border-zinc-100';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-100';
    }
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden",
        task.status === 'Completed' ? 'hover:border-emerald-200' :
        task.status === 'Review' ? 'hover:border-indigo-200' :
        task.status === 'In Progress' ? 'hover:border-sky-200' :
        'hover:border-amber-200'
      )}
    >
      {/* Subtle status top border */}
      <div className={cn("absolute top-0 left-0 right-0 h-1", 
        task.status === 'Completed' ? 'bg-emerald-500' :
        task.status === 'Review' ? 'bg-indigo-500' :
        task.status === 'In Progress' ? 'bg-sky-500' :
        'bg-amber-500'
      )} />
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
          {task.priority}
        </span>
        <button onClick={onEdit} className="p-1 text-zinc-300 hover:text-zinc-600 transition-colors">
          <MoreVertical size={14} />
        </button>
      </div>
      
      <h4 className="text-sm font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors line-clamp-2 mb-2">{task.title}</h4>
      <p className="text-xs text-zinc-500 line-clamp-2 mb-4 leading-relaxed">{task.description}</p>
      
      <div className="flex items-center justify-between pt-3 border-t border-zinc-50">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          <Calendar size={12} />
          <span>{task.due_date ? format(safeDate(task.due_date), 'MMM d') : 'No date'}</span>
        </div>
        <div className="flex -space-x-2 overflow-hidden">
          {task.assigned_ids && task.assigned_ids.length > 0 ? (
            task.assigned_ids.slice(0, 3).map((id, index) => (
              <div 
                key={id} 
                className="w-6 h-6 rounded-full bg-zinc-100 border-2 border-white flex items-center justify-center text-[8px] font-black text-zinc-500 shadow-sm"
              >
                {index + 1}
              </div>
            ))
          ) : (
            <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400 border-2 border-white">
              {task.assigned_to?.[0] || '?'}
            </div>
          )}
          {task.assigned_ids && task.assigned_ids.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-zinc-900 border-2 border-white flex items-center justify-center text-[8px] font-black text-white shadow-sm">
              +{task.assigned_ids.length - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
