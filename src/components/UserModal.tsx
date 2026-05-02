import React, { useState, useEffect } from 'react';
import { X, Loader2, User, Mail, Shield, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { Profile, UserRole } from '../types';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: Profile | null;
}

export default function UserModal({ isOpen, onClose, onSuccess, user }: UserModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (user) {
        setName(user.name);
        setEmail(user.email);
        setRole(user.role);
      } else {
        setName('');
        setEmail('');
        setRole('Staff');
      }
      setError(null);
    }
  }, [isOpen, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const dbRole = role;

      if (user) {
        // Update existing user
        const userRef = doc(db, 'profiles', user.id);
        await updateDoc(userRef, {
          name,
          role: dbRole,
          updated_at: new Date().toISOString()
        });
      } else {
        // Create or update by email
        const q = query(collection(db, 'profiles'), where('email', '==', email.trim().toLowerCase()));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const profileDoc = querySnapshot.docs[0];
          await updateDoc(doc(db, 'profiles', profileDoc.id), {
            name,
            role: dbRole,
            updated_at: new Date().toISOString()
          });
        } else {
          // Create a placeholder profile
          // Since we don't have a UID yet, we'll use a random ID.
          // Note: The AuthContext will need to link this when the user signs in.
          await addDoc(collection(db, 'profiles'), {
            id: 'temp_' + Date.now(), // Temporary ID until they sign in
            name,
            email: email.trim().toLowerCase(),
            role: dbRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      onSuccess();
      
      if (!user) {
        // Generate invitation link
        const inviteLink = window.location.origin;
        const subject = encodeURIComponent("Invitation to join the Task Management Team");
        const body = encodeURIComponent(`Hi ${name},\n\nYou have been invited to join our team as a ${dbRole}. Please use the link below to sign in with your Google account and get started:\n\n${inviteLink}\n\nWelcome aboard!`);
        const mailtoUrl = `mailto:${email.trim()}?subject=${subject}&body=${body}`;

        const confirmSend = window.confirm(`User ${name} added! Would you like to open your email client to send the invitation link to ${email}?`);
        if (confirmSend) {
          window.location.href = mailtoUrl;
        } else {
          const copyLink = window.confirm("Would you like to copy the invitation link to your clipboard?");
          if (copyLink) {
            navigator.clipboard.writeText(inviteLink);
            alert("Invitation link copied to clipboard.");
          }
        }
      }

      onClose();
    } catch (err: any) {
      console.error('Error in UserModal:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{user ? 'Edit User' : 'Manage User'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl flex gap-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
              <User size={16} className="text-zinc-400" />
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-zinc-400"
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
              <Mail size={16} className="text-zinc-400" />
              Email Address
            </label>
            <input
              type="email"
              required
              disabled={!!user}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:bg-zinc-50 dark:disabled:bg-zinc-800 disabled:text-zinc-400 placeholder:text-zinc-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-400 mb-1">
              <Shield size={16} className="text-zinc-400" />
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option value="Staff">Staff</option>
              <option value="Manager">Manager</option>
              <option value="Admin">Admin</option>
              <option value="Super Admin">Super Admin</option>
            </select>
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
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (user ? 'Save Changes' : 'Manage User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
