// ═══════════════════════════════════════════════════════════════
//  API GATEWAY
//  The single entry point the presentation layer (js/frontend) uses.
//  It composes the independent services below into one facade
//  (window.API). The UI never touches Firestore or a service directly.
//
//   UI ──► API Gateway ──► AuthService      UserService     TicketService
//                          AssignmentService StaffService   MessageService
//                          FileService       NoticeService  SettingsService
//                               ▲      events (core/eventBus.js)     │
//                               └────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════
import { AuthService } from './services/authService.js';
import { UserService } from './services/userService.js';
import { TicketService } from './services/ticketService.js';
import { AssignmentService } from './services/assignmentService.js';
import { StaffService } from './services/staffService.js';
import { MessageService } from './services/messageService.js';
import { FileService } from './services/fileService.js';
import { NoticeService } from './services/noticeService.js';
import { SettingsService } from './services/settingsService.js';
import { AuditService } from './services/auditService.js';
import { bus } from './core/eventBus.js';

// The audit log listens to domain events and records every action.
AuditService.start(bus);

export const API = {
  // ── Auth ──
  ADMIN_EMAILS: AuthService.ADMIN_EMAILS,
  getCurrentUser: () => AuthService.getCurrentUser(),
  onAuthChange: (cb) => AuthService.onAuthChange(cb),
  login: (p) => AuthService.login(p),
  _verifyRole: (u, r) => AuthService.verifyRole(u, r),
  resetPassword: (e) => AuthService.resetPassword(e),
  updateMyPassword: (p) => AuthService.updateMyPassword(p),
  logout: () => { UserService.clear(); return AuthService.logout(); },

  // ── Users / profiles ──
  getMyProfile: (force) => UserService.getMyProfile(force),
  saveMyProfile: (p) => UserService.saveMyProfile(p),

  // ── Files ──
  uploadFile: (f, folder, opts) => FileService.uploadFile(f, folder, opts),

  // ── Tickets ──
  subscribeToTickets: (scope, cb, onError, onSync) => TicketService.subscribe(scope, cb, onError, onSync),
  subscribeToConfidentialTickets: (uid, isAdmin, cb, onError, onSync) => TicketService.subscribeConfidential(uid, isAdmin, cb, onError, onSync),
  createTicket: (p) => TicketService.create(p),
  findSimilarTickets: (q) => TicketService.findSimilar(q),
  joinTicket: (id) => TicketService.join(id),
  followTicket: (id) => TicketService.follow(id),
  unfollowTicket: (id) => TicketService.unfollow(id),
  proposeAppointment: (id, window) => TicketService.proposeAppointment(id, window),
  respondToAppointment: (id, decision) => TicketService.respondToAppointment(id, decision),
  addTicketMessage: (id, m) => TicketService.addMessage(id, m),
  acknowledgeTicket: (id, techId, name) => TicketService.acknowledge(id, techId, name),
  resolveTicket: (id, remarks, photo, materials) => TicketService.resolve(id, remarks, photo, materials),
  reopenTicket: (id, reason) => TicketService.reopen(id, reason),
  escalateTicket: (id) => TicketService.escalate(id),
  submitFeedback: (id, rating) => TicketService.rate(id, rating),

  // ── Assignment ──
  assignTicket: (id, techId, name) => AssignmentService.assignTicket(id, techId, name),
  autoAssignTicket: (id) => AssignmentService.autoAssignTicket(id, { force: true }),
  autoAssignWaiting: (dept) => AssignmentService.autoAssignWaiting(dept, { force: true }),
  autoAssignWaitingAsTechnician: (dept, techId) => AssignmentService.autoAssignWaiting(dept, { candidateTechId: techId }),

  // ── Staff ──
  subscribeToTechnicians: (scope, cb) => StaffService.subscribe(scope, cb),
  createTechnician: (p) => StaffService.create(p),
  subscribeToCampusMembers: (cb) => StaffService.subscribeMembers(cb),
  createCampusMember: (p) => StaffService.createMember(p),
  deleteCampusMember: (uid) => StaffService.removeMember(uid),
  resolveStaffEmailByPhone: (phone) => StaffService.emailForPhone(phone),
  rebuildStaffPhoneIndex: () => StaffService.rebuildPhoneIndex(),
  updateTechnicianStatus: (id, s) => StaffService.setStatus(id, s),
  resetTechnicianPassword: (id) => StaffService.resetPassword(id),
  isUsingTempPassword: () => StaffService.isUsingTempPassword(),
  deleteTechnician: (id) => StaffService.remove(id),
  submitProfilePhotoRequest: (id, name, url) => StaffService.requestPhoto(id, name, url),
  subscribeToProfileRequests: (cb) => StaffService.subscribePhotoRequests(cb),
  resolveProfileRequest: (id, ok) => StaffService.resolvePhotoRequest(id, ok),

  // ── Messages ──
  sendAdminMessage: (text, role, ticket) => MessageService.sendToAdmin(text, role, ticket),
  adminStartConversation: (r, text) => MessageService.adminStart(r, text),
  replyToAdminMessage: (id, text, fromAdmin) => MessageService.reply(id, text, fromAdmin),
  subscribeToAdminMessages: (cb) => MessageService.subscribeAll(cb),
  subscribeToMyMessages: (uid, cb) => MessageService.subscribeMine(uid, cb),
  markAdminMessageRead: (id) => MessageService.markReadByAdmin(id),
  markThreadReadByUser: (id) => MessageService.markReadByUser(id),

  // ── Notices ──
  subscribeToNotices: (cb) => NoticeService.subscribe(cb),
  postNotice: (n) => NoticeService.post(n),
  endNotice: (id) => NoticeService.end(id),

  // ── Settings ──
  subscribeToSettings: (cb) => SettingsService.subscribe(cb),

  // ── Audit log (admin) ──
  subscribeToAuditLog: (cb) => AuditService.subscribe(cb),
  saveSettings: (s) => SettingsService.save(s),

  // ── Diagnostics (for the architecture demo) ──
  _events: () => bus.recent(),
  _services: ['AuthService', 'UserService', 'TicketService', 'AssignmentService', 'StaffService', 'MessageService', 'FileService', 'NoticeService', 'SettingsService', 'AuditService'],
};

window.API = API;
window.dispatchEvent(new Event('api-ready'));
