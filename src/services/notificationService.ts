import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  updateDoc, 
  doc, 
  addDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { Notification } from '../types';

export const notificationService = {
  async getNotifications(userId: string) {
    if (!userId) {
      console.warn('getNotifications called without userId');
      return [];
    }
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || d.data().created_at
    } as Notification));
  },

  async markAsRead(notificationId: string) {
    const docRef = doc(db, 'notifications', notificationId);
    await updateDoc(docRef, { is_read: true });
  },

  async markAllAsRead(userId: string) {
    if (!userId) return;
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', userId),
      where('is_read', '==', false)
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { is_read: true });
    });

    await batch.commit();
  },

  async createNotification(userId: string, message: string, title: string = 'Notification', link?: string) {
    try {
      await addDoc(collection(db, 'notifications'), {
        user_id: userId,
        message,
        title,
        link,
        is_read: false,
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
    
    // Optional: Send email logic would go here
    console.log(`[Email Notification Placeholder] To: ${userId}, Message: ${message}`);
  },

  async notifyTaskAssigned(taskId: string, assignedTo: string, taskTitle: string) {
    await this.createNotification(
      assignedTo,
      `You have been assigned to task: "${taskTitle}"`,
      'Task Assigned',
      `/tasks?id=${taskId}`
    );
  },

  async notifyTaskUpdated(taskId: string, userId: string, taskTitle: string, updatedBy: string) {
    if (userId === updatedBy) return; // Don't notify self
    await this.createNotification(
      userId,
      `Task "${taskTitle}" has been updated by ${updatedBy}`,
      'Task Updated',
      `/tasks?id=${taskId}`
    );
  },

  async notifyTaskCompleted(taskId: string, userId: string, taskTitle: string, completedBy: string) {
    if (userId === completedBy) return;
    await this.createNotification(
      userId,
      `Task "${taskTitle}" has been completed by ${completedBy}`,
      'Task Completed',
      `/tasks?id=${taskId}`
    );
  },

  async notifyFileUploaded(fileId: string, userId: string, fileName: string, uploadedBy: string) {
    if (userId === uploadedBy) return;
    await this.createNotification(
      userId,
      `New file "${fileName}" uploaded by ${uploadedBy}`,
      'File Uploaded',
      `/documents?id=${fileId}`
    );
  },

  async notifyFileEdited(fileId: string, userId: string, fileName: string, editedBy: string) {
    if (userId === editedBy) return;
    await this.createNotification(
      userId,
      `File "${fileName}" has been edited by ${editedBy}`,
      'File Edited',
      `/documents?id=${fileId}`
    );
  },

  async notifyMention(userId: string, taskTitle: string, mentionedBy: string, taskId: string) {
    await this.createNotification(
      userId,
      `${mentionedBy} mentioned you in a comment on task: "${taskTitle}"`,
      'Mention',
      `/tasks?id=${taskId}`
    );
  }
};

