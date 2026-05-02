import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { Users as UsersIcon, Search, UserPlus, Shield, Mail, Calendar, Edit2, Trash2, Loader2 } from 'lucide-react';
import { Profile } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { cn, safeDate } from '../lib/utils';
import UserModal from '../components/UserModal';

export default function Users() {
  const { user, profile: currentUserProfile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  const isSuperAdmin = (user?.email || currentUserProfile?.email)?.toLowerCase() === 'servicefinda02@gmail.com' || currentUserProfile?.role === 'Super Admin';
  const isAdmin = currentUserProfile?.role === 'Admin' || currentUserProfile?.role === 'Super Admin' || isSuperAdmin;

  useEffect(() => {
    setLoading(true);
    const usersQuery = query(collection(db, 'profiles'), orderBy('name', 'asc'));
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Profile));
      setUsers(usersData);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Error listening to users:', err);
      setError('Failed to load user list. Check your database permissions.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const deleteUser = async (userToDelete: Profile) => {
    if (!isAdmin && !isSuperAdmin) {
      alert("Only admins can delete users.");
      return;
    }

    if (userToDelete.id === (currentUserProfile?.id || user?.uid)) {
      alert("You cannot delete your own account.");
      return;
    }

    if (!confirm(`Are you sure you want to remove ${userToDelete.name}? This will remove their profile from the database. Note: Their auth account must be deleted manually in the Firebase Console.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'profiles', userToDelete.id));
      // onSnapshot will update the UI
    } catch (error) {
      console.error('Error deleting user:', error);
      alert("Failed to delete user profile. They may have dependent data (tasks/logs).");
    }
  };

  const handleEditUser = (user: Profile) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">User Management</h1>
          <p className="text-zinc-500 mt-1">Manage team members and their access roles.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-sm"
          >
            <UserPlus size={20} /> Add Member
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            placeholder="Search users by name or email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 font-medium">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-emerald-500" size={32} />
                      <div className="space-y-1">
                        <p>Loading user list...</p>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Querying Cloud Database</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-3 bg-red-50 rounded-full">
                        <Shield className="text-red-500" size={32} />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-zinc-900">{error}</p>
                        <p className="text-sm text-zinc-500">If you just registered, your permissions might need a manual sync.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => window.location.reload()}
                          className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-sm"
                        >
                          Try Again
                        </button>
                        {isSuperAdmin && (
                          <button 
                            onClick={async () => {
                              try {
                                if (!user?.uid) throw new Error("Auth session not detected.");
                                setLoading(true);
                                await setDoc(doc(db, 'profiles', user.uid), { 
                                  id: user.uid, 
                                  email: user.email!,
                                  role: 'Super Admin', 
                                  name: user.displayName || 'Super Admin',
                                  updated_at: new Date().toISOString()
                                }, { merge: true });

                                alert('Identity Verified! Your Admin status is now locked in.');
                                window.location.reload();
                              } catch (e: any) {
                                alert('Sync failed: ' + (e.message || 'Unknown database error'));
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
                          >
                            <Shield size={16} /> Sync My Admin Permissions
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((userItem) => (
                  <tr key={userItem.id} className="hover:bg-zinc-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold overflow-hidden border border-emerald-100">
                          {userItem.avatar_url ? (
                            <img src={userItem.avatar_url} alt={userItem.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            userItem.name?.[0] || '?'
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900">{userItem.name}</p>
                          <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <Mail size={12} />
                            <span>{userItem.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border",
                        (userItem.role === 'Admin' || userItem.role === 'Super Admin') ? "bg-purple-50 text-purple-600 border-purple-100" :
                        userItem.role === 'Manager' ? "bg-blue-50 text-blue-600 border-blue-100" :
                        "bg-zinc-50 text-zinc-600 border-zinc-100"
                      )}>
                        {(userItem.role === 'Admin' || userItem.role === 'Super Admin') && <Shield size={10} />}
                        {userItem.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                        <Calendar size={14} />
                        <span>{userItem.created_at ? format(safeDate(userItem.created_at), 'MMM d, yyyy') : 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 transition-opacity">
                        <button 
                          onClick={() => handleEditUser(userItem)}
                          className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50"
                          title="Edit User"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => deleteUser(userItem)}
                          className="p-2 text-zinc-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 font-medium">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UserModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {}}
        user={selectedUser}
      />
    </div>
  );
}
