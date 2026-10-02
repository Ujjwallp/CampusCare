// ─── MESSAGE SERVICE ───
// Direct conversations between campus users / technicians and the Administrator.
// (Ticket chats live on the ticket itself: TicketService.addMessage.)
import { db, auth, collection, doc, addDoc, updateDoc, query, where, onSnapshot, serverTimestamp, arrayUnion } from '../infra/firebase.js';
import { UserService } from './userService.js';

const stamp = () => new Date().toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const MessageService = {
  async sendToAdmin(text, role, relatedTicket = null) {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in.");
    const profile = UserService.cachedProfile();
    await addDoc(collection(db, 'admin_messages'), {
      senderId: user.uid, senderName: (profile && profile.name) || user.displayName || user.email.split('@')[0], senderEmail: user.email,
      senderRole: role || 'unknown', senderType: profile ? profile.userType : null,
      relatedTicketId: relatedTicket || null, text, createdAt: serverTimestamp(), lastActivity: Date.now(), replies: [], isRead: false, userUnread: false,
    });
  },

  async adminStart(recipient, text) {
    await addDoc(collection(db, 'admin_messages'), {
      senderId: recipient.uid, senderName: recipient.name, senderEmail: recipient.email, senderRole: recipient.role,
      relatedTicketId: recipient.ticketId || null, initiatedByAdmin: true, text: '',
      replies: [{ from: 'admin', name: 'Administrator', text, time: stamp(), at: Date.now() }],
      createdAt: serverTimestamp(), lastActivity: Date.now(), isRead: true, userUnread: true,
    });
  },

  async reply(msgId, text, fromAdmin) {
    const user = auth.currentUser;
    const reply = { from: fromAdmin ? 'admin' : 'user', name: fromAdmin ? 'Administrator' : (user ? (user.displayName || user.email.split('@')[0]) : 'User'), text, time: stamp(), at: Date.now() };
    await updateDoc(doc(db, 'admin_messages', msgId), { replies: arrayUnion(reply), lastActivity: Date.now(), isRead: !!fromAdmin, userUnread: !!fromAdmin });
  },

  subscribeAll(callback) {
    return onSnapshot(collection(db, 'admin_messages'), (s) => {
      const msgs = s.docs.map(d => ({ firebaseId: d.id, ...d.data() }));
      msgs.sort((a, b) => (a.createdAt?.seconds || Infinity) - (b.createdAt?.seconds || Infinity));
      callback(msgs);
    }, (err) => console.error("Admin messages listener error:", err));
  },
  subscribeMine(uid, callback) {
    return onSnapshot(query(collection(db, 'admin_messages'), where('senderId', '==', uid)), (s) => callback(s.docs.map(d => ({ firebaseId: d.id, ...d.data() }))), (err) => console.error(err));
  },
  async markReadByAdmin(msgId) { await updateDoc(doc(db, 'admin_messages', msgId), { isRead: true }); },
  async markReadByUser(msgId) { await updateDoc(doc(db, 'admin_messages', msgId), { userUnread: false }); },
};
