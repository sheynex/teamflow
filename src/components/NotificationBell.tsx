import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../services/notificationService';
import { Notification } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { cn, safeDate } from '../lib/utils';
import { Link } from 'react-router-dom';

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      
      // Poll for new notifications every minute
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await notificationService.getNotifications(user.uid);
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      await notificationService.markAllAsRead(user.uid);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-zinc-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden ring-1 ring-white/5">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[11px] text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-zinc-500">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-4 transition-colors hover:bg-zinc-800/50 relative group",
                      !notification.is_read && "bg-emerald-500/5"
                    )}
                  >
                    <div className="flex gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-white truncate">
                            {notification.title}
                          </p>
                          <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                            {formatDistanceToNow(safeDate(notification.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          {notification.message}
                        </p>
                        {notification.link && (
                          <Link
                            to={notification.link}
                            onClick={() => {
                              handleMarkAsRead(notification.id);
                              setIsOpen(false);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] text-emerald-500 hover:text-emerald-400 mt-2 font-medium transition-colors"
                          >
                            View details
                            <ExternalLink size={10} />
                          </Link>
                        )}
                      </div>
                      {!notification.is_read && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="p-1 text-zinc-600 hover:text-emerald-500 transition-colors"
                          title="Mark as read"
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-zinc-800 bg-zinc-900/50 text-center">
            <button className="text-[11px] text-zinc-500 hover:text-white transition-colors font-medium">
              View all activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
