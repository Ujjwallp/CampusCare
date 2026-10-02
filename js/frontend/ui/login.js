function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (input && icon) {
    input.type = input.type === 'password' ? 'text' : 'password';
    icon.setAttribute('data-lucide', input.type === 'password' ? 'eye' : 'eye-off');
    if (window.lucide) lucide.createIcons();
  }
}

function setRole(role) {
  currentRole = role;
  const tabs = { student: document.getElementById('tab-student'), staff: document.getElementById('tab-staff'), admin: document.getElementById('tab-admin') };
  const baseClass = 'py-2.5 rounded-xl text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center gap-1.5 text-xs font-semibold';
  const activeClass = 'py-2.5 rounded-xl bg-white text-iiitg-900 shadow-sm transition-all flex items-center justify-center gap-1.5 text-xs font-bold tab-active';

  Object.values(tabs).forEach(t => { if (t) t.className = baseClass; });
  if (tabs[role]) tabs[role].className = activeClass;

  const config = {
    student: { heading: 'Campus Sign In', subheading: 'Students & faculty: sign in with your official IIITG Google account.', label: '', placeholder: '', value: '' },
    staff: { heading: 'Technician & Caretaker Desk', subheading: 'Technicians & caretakers: log in with your phone number (or email) and the password the admin set up for you. Non-teaching staff — use the Campus User tab.', label: 'Phone / Email', placeholder: 'Phone number or email', value: '' },
    admin: { heading: 'Administrator Console', subheading: 'Warden, HoD & Administrative Officer access.', label: 'Admin Username', placeholder: 'admin@iiitg.ac.in', value: 'admin@iiitg.ac.in' },
  };

  const c = config[role];
  if (!c) return;

  document.getElementById('loginHeading').textContent = c.heading;
  document.getElementById('loginSubheading').textContent = c.subheading;
  document.getElementById('identifierLabel').textContent = c.label;
  document.getElementById('userIdentifier').placeholder = c.placeholder;
  document.getElementById('userIdentifier').value = c.value;

  // The Campus User box has its own type dropdown (student / faculty / non-
  // teaching). Students & faculty sign in through Google; non-teaching staff use
  // phone/email + password. Staff (technicians) and admin use the password form.
  const campusWrap = document.getElementById('campusTypeWrap');
  if (campusWrap) campusWrap.classList.toggle('hidden', role !== 'student');
  if (role === 'student') {
    setCampusType(campusLoginType || 'student');
  } else {
    document.getElementById('standardLoginForm').classList.remove('hidden');
    document.getElementById('googleSsoContainer').classList.add('hidden');
  }
}

// Campus User sub-type chosen in the login box.
let campusLoginType = 'student';
function setCampusType(type) {
  campusLoginType = (type === 'faculty' || type === 'nonteaching') ? type : 'student';
  const sel = document.getElementById('campusTypeSelect');
  if (sel && sel.value !== campusLoginType) sel.value = campusLoginType;
  const isNonTeaching = campusLoginType === 'nonteaching';
  document.getElementById('googleSsoContainer').classList.toggle('hidden', isNonTeaching);
  document.getElementById('standardLoginForm').classList.toggle('hidden', !isNonTeaching);
  const sub = document.getElementById('loginSubheading');
  const idLabel = document.getElementById('identifierLabel');
  const idInput = document.getElementById('userIdentifier');
  if (isNonTeaching) {
    if (sub) sub.textContent = 'Non-teaching staff: sign in with the phone number (or email) and password the admin set up for you.';
    if (idLabel) idLabel.textContent = 'Phone / Email';
    if (idInput) idInput.placeholder = 'Phone number or email';
  } else if (sub) {
    sub.textContent = campusLoginType === 'faculty'
      ? 'Faculty & teaching staff: sign in with your official IIITG Google account.'
      : 'Students: sign in with your official IIITG Google account.';
  }
}

// Non-teaching staff pick "Non-teaching staff" in the Campus box but authenticate
// exactly like provisioned staff (phone/email + password).
function isStaffStyleLogin() { return currentRole === 'staff' || (currentRole === 'student' && campusLoginType === 'nonteaching'); }

function waitForAPI() {
  if (window.API) return Promise.resolve(window.API);
  return new Promise((resolve, reject) => {
    window.addEventListener('api-ready', () => resolve(window.API), { once: true });
    setTimeout(() => reject(new Error('Could not connect to Firebase. Check your internet connection and reload.')), 40000);
  });
}

async function handleLogin(e) {
  e.preventDefault();

  let id = document.getElementById('userIdentifier').value.trim().toLowerCase();
  const pwd = document.getElementById('userPassword').value;

  // The admin may type a bare username ("admin" -> admin@iiitg.ac.in).
  if (currentRole === 'admin' && id && !id.includes('@')) id = `${id}@iiitg.ac.in`;

  // Non-teaching staff authenticate like provisioned staff even though they
  // chose their type in the Campus User box.
  const effectiveRole = isStaffStyleLogin() ? 'staff' : currentRole;

  const btn = document.getElementById('loginSubmitBtn');
  const origText = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Verifying...`;
  btn.disabled = true;

  try {
    const api = await waitForAPI();
    // Staff can sign in with a phone number (preferred) or their email. When it's
    // a phone, resolve it to the login email first, then sign in normally.
    if (effectiveRole === 'staff' && !id.includes('@')) {
      const digits = id.replace(/\D/g, '');
      if (digits.length < 10) throw new Error('Enter your 10-digit phone number, or the email the admin set up for you.');
      const email = await api.resolveStaffEmailByPhone(digits);
      if (!email) throw new Error('No staff account found for that phone number. Check the number, or sign in with your email.');
      id = email;
    }
    const res = await api.login({ email: id, password: pwd, role: effectiveRole });
    if (res.success) {
      transitionToAuth(res.user);
      document.getElementById('userPassword').value = '';
    }
  } catch (err) {
    showToast(err.message || 'Authentication Failed', 'error');
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

async function handleGoogleLogin() {
  const btn = document.getElementById('googleSsoBtn');
  const orig = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Opening Google...`;
  btn.disabled = true;

  try {
    const api = await waitForAPI();
    const res = await api.login({ role: currentRole });
    if (res.success) transitionToAuth(res.user);
  } catch (err) {
    showToast(err.message || 'Google Sign-In Failed', 'error');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

// Accepts either a user object {email, name, role, techId} or legacy (email, name)
function transitionToAuth(userOrEmail, maybeName) {
  const user = typeof userOrEmail === 'object' ? userOrEmail : { email: userOrEmail, name: maybeName };
  const email = user.email;
  const name = user.name || email.split('@')[0];
  if (user.role) currentRole = user.role;
  isLoggedIn = true;
  try { sessionStorage.setItem('campuscare_role', currentRole); } catch (e) {}

  document.getElementById('authUserDisplay').textContent = email;
  document.getElementById('authBadgeRole').textContent = currentRole.toUpperCase() + ' PORTAL';
  document.getElementById('clerkMenuName').textContent = name;
  document.getElementById('clerkMenuEmail').textContent = email;

  // Use the Google account photo when the person has one, otherwise initials.
  setAvatar(document.getElementById('clerkUserButton'), user.photo || user.photoURL, name);

  // Role-specific menu items
  const profileItem = document.getElementById('menuUpdatePhoto');
  if (profileItem) profileItem.classList.toggle('hidden', currentRole !== 'staff');
  document.getElementById('menuProfile')?.classList.toggle('hidden', currentRole !== 'student');
  const contactItem = document.getElementById('menuContactAdmin');
  if (contactItem) contactItem.classList.toggle('hidden', currentRole === 'admin');

  renderNav(currentRole);
  startDataSubscriptions();

  hideEl('studentDashboardContent');
  hideEl('staffDashboardContent');
  hideEl('adminDashboardContent');

  // Never let one failing call strand the user on the login screen — the view
  // switch below must always run, so sign-in "takes" without a refresh.
  try {
    if (currentRole === 'student') {
      showEl('studentDashboardContent');
      switchStudentTab('Mine');
      if (typeof loadMyProfile === 'function') loadMyProfile();
      // Admin-provisioned members (non-teaching staff) must change their temp password too.
      if (user.provisioned && typeof checkTempPassword === 'function') checkTempPassword();
    } else if (currentRole === 'staff') {
      showEl('staffDashboardContent');
      initStaffDashboard(email, user.techId);
      switchStaffTab('Pending');
      if (typeof checkTempPassword === 'function') checkTempPassword();
    } else if (currentRole === 'admin') {
      showEl('adminDashboardContent');
      switchAdminTab('Analytics');
    }
  } catch (err) { console.error('post-login init error', err); }

  const loginView = document.getElementById('loginView');
  const authView = document.getElementById('authenticatedView');
  loginView.style.opacity = '0'; loginView.style.transition = 'opacity 0.3s ease';
  setTimeout(() => {
    loginView.classList.add('hidden'); loginView.style.opacity = '';
    authView.classList.remove('hidden'); authView.style.opacity = ''; authView.classList.add('animate-fade-in');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.lucide) lucide.createIcons();
    if (currentRole === 'admin') initAdminCharts(); // charts need a visible canvas
  }, 300);
}

async function handleLogout() {
  hideEl('clerkMenuDropdown');
  if (typeof clearReportDraft === 'function') clearReportDraft();
  isLoggedIn = false;
  try { sessionStorage.removeItem('campuscare_role'); } catch (e) {}
  stopDataSubscriptions();
  if (typeof closeMessagesDrawer === 'function') closeMessagesDrawer();
  msgSection = null; lastUnreadTotal = null; myProfile = null;
  if (window.API) await window.API.logout();
  currentStaffTechId = null;
  activeTicketId = null;

  const authView = document.getElementById('authenticatedView');
  const loginView = document.getElementById('loginView');
  authView.style.opacity = '0'; authView.style.transition = 'opacity 0.3s ease';
  setTimeout(() => {
    authView.classList.add('hidden'); authView.style.opacity = '';
    loginView.classList.remove('hidden'); loginView.classList.add('animate-fade-in');
    setRole(currentRole);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 300);
}

// Restore the session after a page refresh (Firebase keeps the user signed in)
async function restoreSession() {
  let savedRole = null;
  try { savedRole = sessionStorage.getItem('campuscare_role'); } catch (e) {}
  if (!savedRole) return;
  try {
    const api = await waitForAPI();
    const unsub = api.onAuthChange(async (fbUser) => {
      if (typeof unsub === 'function') unsub();
      if (!fbUser || isLoggedIn) return;
      try {
        const res = await api._verifyRole(fbUser, savedRole);
        currentRole = savedRole;
        setRole(savedRole);
        transitionToAuth(res.user);
      } catch (err) {
        try { sessionStorage.removeItem('campuscare_role'); } catch (e) {}
      }
    });
  } catch (e) { console.warn(e); }
}

async function checkTempPassword() {
  try {
    if (await window.API.isUsingTempPassword()) setTimeout(() => openPasswordChange(true), 600);
  } catch (e) { console.warn(e); }
}

function openPasswordChange(forced) {
  document.getElementById('pwForceNotice').classList.toggle('hidden', !forced);
  document.getElementById('pwModalClose').classList.toggle('hidden', !!forced);
  showModal('passwordResetModal');
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const input = document.getElementById('newPasswordInput');
  const newPass = input.value;
  const btn = e.target.querySelector('button[type="submit"]');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Updating...';
  btn.disabled = true;

  try {
    await window.API.updateMyPassword(newPass);
    showToast("Password updated successfully!", "success");
    document.getElementById('pwForceNotice').classList.add('hidden');
    document.getElementById('pwModalClose').classList.remove('hidden');
    hideModal('passwordResetModal');
    input.value = '';
  } catch (err) {
    console.error(err);
    if ((err.code || err.message || '').includes('requires-recent-login')) {
      showToast("Security: Please log out and log back in to change your password.", "error");
    } else if ((err.code || err.message || '').includes('weak-password')) {
      showToast("Password is too weak. Use at least 6 characters.", "error");
    } else {
      showToast("Failed: " + err.message, "error");
    }
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

async function handleContactAdmin(e) {
  e.preventDefault();
  const input = document.getElementById('adminMessageInput');
  const ticketSelect = document.getElementById('adminMessageTicketId');
  const text = input.value.trim();
  if (!text) return;

  let recipient = null;
  if (currentRole === 'admin') {
    const idx = document.getElementById('composeRecipient').value;
    recipient = (window.__composeRecipients || [])[Number(idx)];
    if (idx === '' || !recipient) return showToast("Choose who to send the message to.", "warning");
  }
  const relatedTicket = (currentRole === 'student' && ticketSelect) ? ticketSelect.value : null;
  if (currentRole === 'student' && !relatedTicket) return showToast("Please select the ticket you are writing about.", "warning");

  const btn = e.target.querySelector('button[type="submit"]');
  const orig = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Sending...`;
  btn.disabled = true;

  try {
    if (recipient) {
      await window.API.adminStartConversation(recipient, text);
      msgSection = recipient.role === 'student' ? 'student' : 'staff';
      showToast(`Message sent to ${recipient.name}.`, "success");
    } else {
      await window.API.sendAdminMessage(text, currentRole, relatedTicket);
      msgSection = 'admin';
      showToast("Message sent to Administrator.", "success");
    }
    input.value = '';
    showThreadList();
  } catch (err) {
    console.error(err);
    showToast("Failed to send message: " + err.message, "error");
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

// Old entry point kept for compatibility

// Shared issues the user joined with "Me too" (not their own report)
function getFollowedTickets() {
  const user = window.API ? window.API.getCurrentUser() : null;
  if (!user) return [];
  return cachedTickets.filter(t => t.userId !== user.uid && (
    (Array.isArray(t.upvotedBy) && t.upvotedBy.includes(user.uid))
    || (Array.isArray(t.followerIds) && t.followerIds.includes(user.uid))
  ));
}

// Tickets filed by the signed-in user
function getMyTickets() {
  const user = window.API ? window.API.getCurrentUser() : null;
  if (!user) return [];
  return cachedTickets.filter(t => (t.userId && t.userId === user.uid) || (t.userEmail && t.userEmail.toLowerCase() === (user.email || '').toLowerCase()));
}

// ─── FORGOT PASSWORD (real Firebase reset email) ───
function openResetPasswordModal() {
  const currentId = document.getElementById('userIdentifier')?.value;
  document.getElementById('resetEmailInput').value = currentId || '';
  hideEl('resetStep2Form');
  hideEl('resetStaffInfo');
  showEl('resetStep1Form');
  // Reset is always done by email. Staff may enter their phone number or email;
  // we look up the email and send the reset link there.
  const lbl = document.querySelector('#resetStep1Form label[for="resetEmailInput"]');
  const p = document.querySelector('#resetStep1Form p');
  if (isStaffStyleLogin()) {
    if (lbl) lbl.textContent = 'Phone number or email';
    if (p) p.textContent = 'Enter your registered phone number or email. We will email a secure link to set a new password to the email on file.';
    document.getElementById('resetEmailInput').placeholder = 'e.g. 9876543210';
  } else {
    if (lbl) lbl.textContent = 'Roll No / Webmail Address';
    if (p) p.textContent = 'Enter your registered IIITG email or Roll Number. We will email you a secure link to set a new password.';
    document.getElementById('resetEmailInput').placeholder = 'e.g. 2301045@iiitg.ac.in';
  }
  showModal('resetPasswordModal');
}
function closeResetPasswordModal() { hideModal('resetPasswordModal'); }

async function handleSendResetOtp(e) {
  e.preventDefault();
  let email = document.getElementById('resetEmailInput').value.trim().toLowerCase();

  const btn = e.target.querySelector('button[type="submit"]');
  const orig = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Sending...`;
  btn.disabled = true;
  try {
    const api = await waitForAPI();
    if (!email.includes('@')) {
      const digits = email.replace(/\D/g, '');
      if (isStaffStyleLogin() && digits.length >= 10) {
        // Staff entered a phone number — look up their login email.
        const found = await api.resolveStaffEmailByPhone(digits);
        if (!found) { showToast('No staff account found for that phone number.', 'warning'); btn.innerHTML = orig; btn.disabled = false; if (window.lucide) lucide.createIcons(); return; }
        email = found;
      } else if (/^\d+$/.test(email)) {
        email = `${email}@iiitg.ac.in`;   // student roll number
      }
    }
    if (!email.includes('@')) { showToast('Please enter a valid phone number or email.', 'warning'); btn.innerHTML = orig; btn.disabled = false; if (window.lucide) lucide.createIcons(); return; }
    await api.resetPassword(email);
    document.getElementById('resetTargetDisplay').textContent = email;
    hideEl('resetStep1Form'); showEl('resetStep2Form');
  } catch (err) {
    console.error(err);
    showToast((err.code || '').includes('invalid-email') ? 'That email address is not valid.' : 'Could not send reset link: ' + err.message, 'error');
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

// Kept for backwards compatibility with any old "Forgot Password?" links
