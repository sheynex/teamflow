import React from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  FileText, 
  Clock, 
  LogOut, 
  Menu, 
  X,
  Users as UsersIcon,
  Bell,
  Search,
  Moon,
  Sun,
  BarChart3,
  Settings as SettingsIcon,
  Shield,
  FileBarChart
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import NotificationBell from './NotificationBell';

export default function Sidebar() {
  const location = useLocation();
  const { user, profile, signOut, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  
  const isSuperAdminEmail = (user?.email || profile?.email || '')?.toLowerCase() === 'servicefinda02@gmail.com';

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Search', icon: Search, path: '/search' },
    { name: 'Tasks', icon: CheckSquare, path: '/tasks' },
    { name: 'Documents', icon: FileText, path: '/documents' },
    { name: 'Users', icon: UsersIcon, path: '/users' },
    { name: 'Time Tracking', icon: Clock, path: '/time' },
  ];

  if (profile?.role === 'Admin' || profile?.role === 'Super Admin' || isSuperAdminEmail) {
    navItems.push({ name: 'Analytics', icon: BarChart3, path: '/analytics' });
    navItems.push({ name: 'Reports', icon: FileBarChart, path: '/reports' });
    navItems.push({ name: 'Settings', icon: SettingsIcon, path: '/settings' });
  }

  return (
    <>
      {/* Mobile Menu Toggle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-zinc-900 rounded-md shadow-md border border-zinc-200 dark:border-zinc-800"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-zinc-950 text-zinc-400 transition-transform duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">
                T
              </div>
              <span className="text-white font-semibold text-lg tracking-tight">TeamFlow</span>
            </div>
            <NotificationBell />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group",
                    isActive 
                      ? "bg-emerald-500/10 text-emerald-500" 
                      : "hover:bg-zinc-900 hover:text-white"
                  )}
                >
                  <item.icon size={20} className={cn(
                    isActive ? "text-emerald-500" : "text-zinc-500 group-hover:text-white"
                  )} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Profile & Logout */}
          <div className="p-4 border-t border-zinc-900">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 overflow-hidden text-black uppercase font-bold">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  profile?.name?.[0] || 'U'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {isSuperAdminEmail ? 'Super Admin' : (profile?.name || 'User')}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {isSuperAdminEmail ? 'Super Admin' : (profile?.role || 'Staff')}
                </p>
              </div>
            </div>
            <button 
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900 hover:text-white transition-colors text-left mb-1"
            >
              {theme === 'dark' ? (
                <>
                  <Sun size={20} className="text-zinc-500" />
                  <span className="font-medium text-sm">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon size={20} className="text-zinc-500" />
                  <span className="font-medium text-sm">Dark Mode</span>
                </>
              )}
            </button>
            <button 
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900 hover:text-white transition-colors text-left"
            >
              <LogOut size={20} className="text-zinc-500" />
              <span className="font-medium text-sm">Sign Out</span>
            </button>
            
            {isSuperAdminEmail && (
              <div className="mt-4 px-2">
                <button 
                  onClick={async () => {
                    try {
                      if (!user?.uid) throw new Error("Auth user session not found");
                      
                      await setDoc(doc(db, 'profiles', user.uid), { 
                        id: user.uid, 
                        email: user.email!,
                        role: 'Admin', 
                        name: 'Super Admin',
                        updated_at: serverTimestamp()
                      }, { merge: true });

                      alert('Cloud Permissions Synchronized! Refreshing your session...');
                      window.location.reload();
                    } catch (e: any) {
                      alert('Sync Failed: ' + e.message);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] border border-emerald-400/20"
                >
                  <Shield size={14} className="animate-pulse" />
                  Sync Permissions
                </button>
                <p className="mt-2 text-[10px] text-zinc-500 text-center uppercase tracking-tighter opacity-50 font-bold">
                  Admin Identity Tool
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

