// ─── UI STATE CACHE ───
let currentRole = 'student';
let isLoggedIn = false;
let staffCurrentTab = 'Pending';
let adminCurrentTab = 'Analytics';
let studentCurrentTab = 'Mine';
let activeTicketId = null;

// Latest data from Firestore (kept fresh by real-time listeners)
let cachedTickets = [];
let cachedTechnicians = [];
let cachedAdminMessages = [];
let cachedProfileRequests = [];
let cachedAuditLog = [];
let cachedCampusMembers = [];
