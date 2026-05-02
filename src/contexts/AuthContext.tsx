import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Profile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mountedRef.current) return;

      if (firebaseUser) {
        setUser(firebaseUser);
        await fetchProfile(firebaseUser.uid, firebaseUser);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current) {
        setLoading(prev => {
          if (prev) console.warn('Auth safety timeout reached.');
          return false;
        });
      }
    }, 15000);

    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  async function fetchProfile(userId: string, currentUser?: User) {
    if (!userId) {
      if (mountedRef.current) setLoading(false);
      return;
    }
    
    const authUser = currentUser || user;
    const rawEmail = authUser?.email || '';
    const currentEmail = rawEmail.trim().toLowerCase();
    
    try {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await getDoc(docRef);
      
      let profileData = docSnap.exists() ? docSnap.data() as Profile : null;

      // check if we have a placeholder profile for this email
      if (!profileData && currentEmail) {
        const q = query(collection(db, 'profiles'), where('email', '==', currentEmail));
        const qSnap = await getDocs(q);
        
        if (!qSnap.empty) {
          const placeholderDoc = qSnap.docs[0];
          const placeholderData = placeholderDoc.data() as Profile;
          
          // Migrate placeholder to the new UID doc
          profileData = {
            ...placeholderData,
            id: userId, // Use actual UID
            avatar_url: authUser?.photoURL || placeholderData.avatar_url,
            updated_at: new Date().toISOString()
          };

          // Save the new UID-based profile
          await setDoc(doc(db, 'profiles', userId), profileData);
          
          // Delete old placeholder doc (if it had a different ID)
          if (placeholderDoc.id !== userId) {
            await deleteDoc(doc(db, 'profiles', placeholderDoc.id));
          }
        }
      }

      const IS_SUPER_ADMIN = currentEmail === 'servicefinda02@gmail.com';

      if (IS_SUPER_ADMIN) {
        const isNew = !profileData;
        const fallbackName = authUser?.displayName || 'Super Admin';
        
        if (isNew) {
          profileData = {
            id: userId,
            email: currentEmail,
            name: fallbackName,
            role: 'Super Admin' as any,
            avatar_url: authUser?.photoURL || null,
            created_at: new Date().toISOString()
          };
        } else {
          profileData = { ...profileData, role: 'Super Admin' as any };
          if (!profileData.name || profileData.name.toLowerCase().includes('staff') || !profileData.name.trim()) {
            profileData.name = 'Super Admin';
          }
        }
        
        if (mountedRef.current) {
          setProfile(profileData);
          setLoading(false);
        }

        // SYNC TO DB
        setTimeout(async () => {
          try {
            if (isNew) {
              await setDoc(doc(db, 'profiles', userId), { 
                id: userId, 
                email: currentEmail, 
                name: profileData!.name, 
                role: 'Super Admin',
                avatar_url: authUser?.photoURL || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            } else if (docSnap.data()?.role !== 'Super Admin') {
              await updateDoc(doc(db, 'profiles', userId), { 
                role: 'Super Admin', 
                name: profileData!.name,
                updated_at: new Date().toISOString()
              });
            }
          } catch (syncErr) {
            console.error('Background sync failed:', syncErr);
          }
        }, 0);
        
        return; 
      }

      // Handle new regular users
      if (!profileData && authUser) {
        const newProfile: Profile = {
          id: userId,
          email: currentEmail,
          name: authUser.displayName || 'Staff Member',
          role: 'Staff' as any,
          avatar_url: authUser.photoURL || null,
          created_at: new Date().toISOString()
        };
        
        profileData = newProfile;
        
        // Save to DB
        setTimeout(async () => {
          try {
            await setDoc(doc(db, 'profiles', userId), {
              ...newProfile,
              updated_at: new Date().toISOString()
            });
          } catch (syncErr) {
            console.error('Error creating regular profile:', syncErr);
          }
        }, 0);
      }

      setProfile(profileData);
    } catch (error: any) {
      console.error('Error fetching profile:', error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  const signOut = async () => {
    try {
      setUser(null);
      setProfile(null);
      setLoading(false);
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  };

  async function updateProfile(updates: Partial<Profile>) {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'profiles', user.uid), updates);
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
