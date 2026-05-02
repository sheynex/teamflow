import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { UserPlus, Loader2 } from 'lucide-react';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const isSuperAdminEmail = email.toLowerCase() === 'servicefinda02@gmail.com';
      const assignedRole = isSuperAdminEmail ? 'Super Admin' : 'Staff';

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      if (user) {
        // Create profile record
        await setDoc(doc(db, 'profiles', user.uid), {
          id: user.uid,
          name: fullName,
          role: assignedRole,
          email: email,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        
        // Log activity
        await addDoc(collection(db, 'activity_logs'), {
          user_id: user.uid,
          action: 'user registered',
          target_type: 'user',
          target_id: user.uid,
          description: 'New user account created',
          timestamp: serverTimestamp()
        });

        navigate('/');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden">
        <div className="p-8">
          <div className="flex justify-center mb-8">
            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-2xl">
              T
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-zinc-900 text-center mb-2">Create Account</h2>
          <p className="text-zinc-500 text-center mb-8">Join TeamFlow to manage your projects</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg border border-emerald-100">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <UserPlus size={20} /> Sign Up
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Already have an account? Sign In
            </Link>
          </div>
        </div>
        
        <div className="bg-zinc-50 p-4 border-t border-zinc-100 text-center">
          <p className="text-xs text-zinc-400">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
