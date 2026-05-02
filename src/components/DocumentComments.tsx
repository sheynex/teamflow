import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, getDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { MessageSquare, Send, Loader2, User } from 'lucide-react';
import { cn, safeDate } from '../lib/utils';
import { Profile } from '../types';

interface DocumentCommentsProps {
  documentId: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: {
    name: string;
    avatar_url: string | null;
  };
}

export default function DocumentComments({ documentId }: DocumentCommentsProps) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'document_comments'),
      where('document_id', '==', documentId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const commentList = snapshot.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          created_at: d.data().created_at?.toDate?.()?.toISOString() || d.data().created_at
        } as Comment));

        // Resolve profiles for comments
        const resolvedComments = await Promise.all(commentList.map(async (c) => {
          if (c.user_id) {
            try {
              const pSnap = await getDoc(doc(db, 'profiles', c.user_id));
              if (pSnap.exists()) {
                const pData = pSnap.data() as Profile;
                c.profiles = { name: pData.name, avatar_url: pData.avatar_url };
              }
            } catch (err) {
              console.error('Error fetching profile for comment:', err);
            }
          }
          return c;
        }));

        // Sort manually for now if needed, or rely on Firestore if index is created
        const sortedComments = resolvedComments.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });

        setComments(sortedComments);
      } catch (error) {
        console.error('Error processing comments snapshot:', error);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Document comments snapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [documentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'document_comments'), {
        document_id: documentId,
        user_id: profile.id,
        content: newComment.trim(),
        created_at: serverTimestamp()
      });

      setNewComment('');
      
      // Log activity
      await addDoc(collection(db, 'activity_logs'), {
        user_id: profile.id,
        action: 'commented on document',
        target_type: 'document',
        target_id: documentId,
        description: `Added a comment to document`,
        details: { content: newComment.trim().substring(0, 50) },
        timestamp: serverTimestamp()
      });

    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Error posting comment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest flex items-center gap-2">
        <MessageSquare size={16} />
        Comments
      </h3>

      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
        {loading ? (
          <div className="py-4 text-center">
            <Loader2 className="animate-spin text-emerald-500 mx-auto" size={20} />
          </div>
        ) : comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-xs font-bold text-zinc-500 overflow-hidden text-black uppercase">
                {comment.profiles?.avatar_url ? (
                  <img src={comment.profiles.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  comment.profiles?.name?.[0] || '?'
                )}
              </div>
              <div className="flex-1 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{comment.profiles?.name}</span>
                  <span className="text-[10px] text-zinc-400">{comment.created_at ? format(safeDate(comment.created_at), 'MMM d, h:mm a') : 'Just now'}</span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{comment.content}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center py-4 text-sm text-zinc-500">No comments yet. Be the first to comment!</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="w-full px-4 py-3 pr-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none min-h-[80px]"
        />
        <button
          type="submit"
          disabled={submitting || !newComment.trim()}
          className="absolute right-3 bottom-3 p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
        >
          {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}

