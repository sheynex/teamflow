export type UserRole = 'Super Admin' | 'Admin' | 'Manager' | 'Staff';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  department?: string;
  created_at: string;
  updated_at?: string;
}

export interface ProfileDisplay {
  name: string;
  avatar_url?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Review' | 'Completed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  assigned_to?: string; // Legacy field
  assigned_ids?: string[]; // New field for multiple assignees
  created_by: string;
  due_date?: string;
  created_at: string;
  updated_at?: string;
  profiles?: ProfileDisplay;
  checklist?: ChecklistItem[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  created_at: string;
  profiles?: ProfileDisplay;
}

export interface Folder {
  id: string;
  name: string;
  parent_id?: string;
  created_by: string;
  created_at: string;
  is_locked?: boolean;
  locked_by?: string;
  locked_at?: string;
}

export interface Document {
  id: string;
  name: string;
  file_path: string;
  download_url?: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  uploaded_by_avatar?: string;
  task_id?: string;
  folder_id?: string;
  folder: string; // Legacy
  created_at: string;
  profiles?: ProfileDisplay;
  size?: number;
  file_type?: string;
  tags?: string[];
  is_locked?: boolean;
  locked_by?: string;
  locked_at?: string;
  assigned_ids?: string[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  download_url?: string;
  created_by: string;
  created_at: string;
  profiles?: ProfileDisplay;
}

export interface DocumentActivity {
  id: string;
  document_id: string;
  user_id: string;
  action: 'opened' | 'edited' | 'downloaded' | 'locked' | 'unlocked' | 'tagged' | 'untagged' | 'version_created';
  created_at: string;
  profiles?: ProfileDisplay;
}

export interface TimeLog {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out?: string;
  breaks?: { start: string; end?: string }[];
  total_hours?: number;
  created_at: string;
  profiles?: ProfileDisplay;
}

export interface Activity {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id?: string;
  description?: string;
  details?: any;
  timestamp: string;
  created_at: string;
  profiles?: ProfileDisplay;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}
