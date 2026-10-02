function openTicketDetailModal(id) {
  const t = cachedTickets.find(x => x.id === id);
  if (!t) return showToast('Ticket not found.', 'error');
  if (typeof closeMessagesDrawer === 'function') closeMessagesDrawer();
  activeTicketId = id;

  document.getElementById('detailTicketId').textContent = t.id;
  const st = document.getElementById('detailTicketStatus');
  st.textContent = statusLabel(t);
  st.className = `px-2.5 py-0.5 text-xs font-bold rounded-full border ${getStatusConfig(t.status || 'Pending')}`;
  document.getElementById('detailTicketDate').textContent = `Reported: ${t.date || ''}`;
  document.getElementById('detailCategory').textContent = ticketCategoryLabel(t);
  renderTicketProgress(t);

  // Badges row
  const badges = [];
  if (t.priority === 'High') badges.push('<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-100 text-rose-700 border border-rose-200 uppercase">Urgent</span>');
  if ((t.upvotes || 0) > 1) badges.push(`<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">${t.upvotes} affected</span>`);
  if (t.reopenCount) badges.push(`<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-orange-50 text-orange-700 border border-orange-200 uppercase">Reopened${t.reopenCount > 1 ? ' ×' + t.reopenCount : ''}</span>`);
  if (t.outsideCampus) badges.push('<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase">Outside campus</span>');
  if (t.confidential) badges.push('<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-slate-800 text-white uppercase">Confidential</span>');
  const metaRow = document.getElementById('detailMetaRow');
  metaRow.innerHTML = badges.join('');
  metaRow.classList.toggle('hidden', badges.length === 0);

  // Reported by — staff & admin only (students already know it's theirs)
  const repWrap = document.getElementById('detailReporterWrap');
  if (currentRole !== 'student' && (t.userName || t.userEmail)) {
    repWrap.classList.remove('hidden');
    document.getElementById('detailReporter').innerHTML =
      `${escapeHtml(t.userName || '')} <span class="text-slate-400 font-normal">· ${escapeHtml(reporterLabel(t))}</span>` +
      (t.userEmail ? `<br><span class="text-[11px] font-normal text-slate-500 break-all">${escapeHtml(t.userEmail)}</span>` : '');
  } else repWrap.classList.add('hidden');

  // Location (own section) and Contact (own section) kept separate
  document.getElementById('detailLocation').textContent = t.location || 'Not provided';
  const contactWrap = document.getElementById('detailContactWrap');
  const phoneA = document.getElementById('detailPhone');
  if (t.phone && t.phone !== 'Not provided') {
    contactWrap.classList.remove('hidden');
    phoneA.href = `tel:${t.phone}`; document.getElementById('detailPhoneText').textContent = t.phone;
  } else { contactWrap.classList.add('hidden'); }
  const dir = document.getElementById('detailDirections');
  if (typeof t.lat === 'number') { dir.classList.remove('hidden'); dir.classList.add('flex'); dir.href = directionsUrl(t.lat, t.lng); }
  else { dir.classList.add('hidden'); dir.classList.remove('flex'); }

  // Assigned technician — with a dialable phone for admin & staff (not students,
  // to keep a technician's personal number from every reporter).
  const asgWrap = document.getElementById('detailAssignedWrap');
  if (t.assignedToName) {
    asgWrap.classList.remove('hidden');
    let techPhone = null;
    if (currentRole !== 'student' && typeof cachedTechnicians !== 'undefined') {
      const tech = cachedTechnicians.find(x => x.firebaseId === t.assignedTo)
        || cachedTechnicians.find(x => (x.email || '').toLowerCase() === String(t.assignedToEmail || '').toLowerCase());
      if (tech && tech.phone && tech.phone !== 'Not provided') techPhone = tech.phone;
    }
    document.getElementById('detailAssigned').innerHTML = escapeHtml(t.assignedToName)
      + (techPhone ? `<br><a href="tel:${escapeHtml(techPhone)}" class="text-xs font-semibold text-emerald-600 hover:underline inline-flex items-center gap-1 mt-1"><i data-lucide="phone" class="w-3 h-3"></i>${escapeHtml(techPhone)}</a>` : '');
  } else asgWrap.classList.add('hidden');

  // Description — plain text, its own box (no map/photo mixed in)
  document.getElementById('detailDescription').textContent = t.description || '—';

  // Attached photo — its own section
  const photoWrap = document.getElementById('detailPhotoWrap');
  if (t.photoUrl) { photoWrap.classList.remove('hidden'); document.getElementById('detailPhoto').innerHTML = attachmentHtml(t.photoUrl, 'Reported photo'); }
  else photoWrap.classList.add('hidden');

  renderChatMessages(t.messages || []);
  applyChatOpenState(t);
  if (typeof markTicketSeen === 'function') { markTicketSeen(t); updateMessagesBadge(); }
  showModal('ticketDetailModal');
  if (window.lucide) lucide.createIcons();
}
function closeTicketDetailModal() { hideModal('ticketDetailModal'); activeTicketId = null; }

function ticketTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ticketDateLabel(value) {
  const ms = ticketTimestamp(value);
  return ms ? new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

function renderTicketProgress(t) {
  const stepsEl = document.getElementById('ticketProgressSteps');
  if (!stepsEl || !t) return;
  const stages = [
    { label: 'Reported', at: t.createdAt || t.date },
    { label: t.assignedTo ? 'Technician assigned' : 'Assignment', at: t.assignedAt },
    { label: 'Work started', at: t.acknowledgedAt },
    { label: 'Fixed', at: t.resolvedAt || t.resolvedAtMs },
  ];
  const active = t.status === 'Resolved' ? stages.length
    : t.status === 'In Progress' ? 2
      : t.assignedTo ? 1 : 0;
  stepsEl.innerHTML = stages.map((step, i) => {
    const complete = i < active;
    const current = i === active && active < stages.length;
    const date = ticketDateLabel(step.at);
    return `<li class="ticket-progress-step ${complete ? 'complete' : ''} ${current ? 'current' : ''}"${current ? ' aria-current="step"' : ''}>
      <span class="ticket-progress-dot" aria-hidden="true">${complete ? '✓' : i + 1}</span>
      <span class="ticket-progress-copy"><strong>${step.label}</strong>${date ? `<time>${escapeHtml(date)}</time>` : ''}</span>
    </li>`;
  }).join('');

  const updates = [t.feedbackAt, t.reopenedAt, t.resolvedAt, t.resolvedAtMs, t.acknowledgedAt, t.assignedAt, t.createdAt, t.date,
    ...(Array.isArray(t.messages) ? t.messages.map(m => m.at) : [])]
    .map(ticketTimestamp).filter(Boolean).sort((a, b) => b - a);
  const latestTime = updates[0] || null;
  document.getElementById('ticketLastUpdated').textContent = latestTime ? `Updated ${ticketDateLabel(latestTime)}` : '';

  const nextText = t.status === 'Resolved'
    ? 'Is the problem fixed? Rate the repair, or reopen this ticket if it still needs attention.'
    : t.status === 'In Progress'
      ? 'A technician is working on this. Add a message if you have useful details.'
      : t.assignedTo
        ? 'A technician has been assigned and will acknowledge the work.'
        : 'CampusCare will assign this report to the right team.';
  document.getElementById('ticketNextStep').textContent = nextText;
  renderTicketAppointments(t);

  const actions = document.getElementById('ticketProgressActions');
  const user = window.API && API.getCurrentUser && API.getCurrentUser();
  const reporter = currentRole === 'student' && user && t.userId === user.uid;
  if (reporter && t.status === 'Resolved') {
    const canReopen = studentCanReopen(t);
    actions.innerHTML = `${t.rating ? '<span class="self-center text-[11px] font-semibold text-emerald-700">Thanks for rating this repair.</span>' : `<button type="button" onclick="openFeedbackModal('${escapeHtml(t.id)}')" class="ticket-progress-action rate">Rate this repair</button>`}${canReopen ? `<button type="button" onclick="openReopenModal('${escapeHtml(t.id)}')" class="ticket-progress-action reopen">Not fixed?</button>` : ''}`;
    actions.classList.remove('hidden');
  } else {
    actions.innerHTML = '';
    actions.classList.add('hidden');
  }
}

function appointmentDateTime(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function appointmentInputValue(value) {
  const date = new Date(Number(value));
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function setAppointmentWindow(startAt, endAt) {
  const start = document.getElementById('appointmentStart');
  const end = document.getElementById('appointmentEnd');
  start.value = appointmentInputValue(startAt);
  end.value = appointmentInputValue(endAt);
}

function renderTicketAppointments(t) {
  const panel = document.getElementById('ticketAppointmentPanel');
  if (!panel) return;
  const user = window.API && API.getCurrentUser && API.getCurrentUser();
  const tech = currentRole === 'staff' && typeof getCurrentTech === 'function' ? getCurrentTech() : null;
  const isReporter = currentRole === 'student' && user && t.userId === user.uid;
  const isAssignedTech = tech && tech.firebaseId === t.assignedTo;
  const canView = isReporter || isAssignedTech || currentRole === 'admin';
  panel.classList.toggle('hidden', !canView || !!t.confidential);
  if (!canView || t.confidential) return;

  const current = t.appointment;
  const windows = Array.isArray(t.availabilityWindows) ? t.availabilityWindows : [];
  const availability = document.getElementById('reporterAvailability');
  if (windows.length && (isReporter || isAssignedTech || currentRole === 'admin')) {
    availability.innerHTML = `<p class="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Reporter availability</p><div class="space-y-1">${windows.map((w, i) => `<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2"><span class="text-[10px] font-semibold text-slate-700">${appointmentDateTime(w.startAt)} – ${new Date(Number(w.endAt)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>${isAssignedTech && t.status !== 'Resolved' ? `<button type="button" class="text-[10px] font-extrabold text-iiitg-700 underline" onclick="setAppointmentWindow(${Number(w.startAt)}, ${Number(w.endAt)})">Propose this</button>` : ''}</div>`).join('')}</div>`;
    availability.classList.remove('hidden');
  } else {
    availability.innerHTML = '';
    availability.classList.add('hidden');
  }

  const currentBox = document.getElementById('currentAppointment');
  if (current) {
    const state = { proposed: 'Waiting for reporter', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled' }[current.status] || current.status;
    const statusClass = current.status === 'confirmed' ? 'text-emerald-800 bg-emerald-50' : current.status === 'proposed' ? 'text-amber-900 bg-amber-50' : 'text-slate-700 bg-slate-100';
    currentBox.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2"><strong class="text-xs text-slate-800">${appointmentDateTime(current.startAt)} – ${new Date(Number(current.endAt)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong><span class="rounded-full px-2 py-1 text-[9px] font-extrabold ${statusClass}">${state}</span></div>${current.proposedByName ? `<p class="text-[10px] text-slate-500 mt-1">Proposed by ${escapeHtml(current.proposedByName)}</p>` : ''}`;
    currentBox.classList.remove('hidden');
  } else {
    currentBox.innerHTML = windows.length ? '<p class="text-[11px] text-slate-600">Your preferred times are shared with the assigned technician. A visit time will appear here when they propose one.</p>' : '<p class="text-[11px] text-slate-600">No visit time has been proposed yet.</p>';
    currentBox.classList.remove('hidden');
  }

  const actions = document.getElementById('appointmentResponseActions');
  if (isReporter && current && current.status === 'proposed') {
    actions.innerHTML = `<button type="button" onclick="respondToTicketAppointment('confirmed')" class="appointment-button confirm">Confirm this time</button><button type="button" onclick="respondToTicketAppointment('declined')" class="appointment-button decline">Ask for another time</button>`;
    actions.classList.remove('hidden');
  } else {
    actions.innerHTML = '';
    actions.classList.add('hidden');
  }

  const history = Array.isArray(t.appointmentHistory) ? [...t.appointmentHistory].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)).slice(0, 5) : [];
  const historyEl = document.getElementById('appointmentHistory');
  historyEl.innerHTML = history.length ? `<details class="mt-2"><summary class="cursor-pointer text-[10px] font-bold text-slate-500">Appointment changes (${history.length})</summary><ol class="mt-2 space-y-1.5">${history.map(event => {
    const labels = { proposed: 'Visit proposed', confirmed: 'Visit confirmed', declined: 'New time requested', superseded: 'Earlier proposal replaced' };
    return `<li class="border-l-2 border-slate-200 pl-2.5"><span class="block text-[10px] font-bold text-slate-700">${labels[event.status] || 'Appointment updated'}</span><span class="block text-[10px] text-slate-500">${appointmentDateTime(event.startAt)} · ${ticketDateLabel(event.at)}</span></li>`;
  }).join('')}</ol></details>` : '';

  const form = document.getElementById('appointmentProposalForm');
  const canPropose = isAssignedTech && t.status !== 'Resolved';
  form.classList.toggle('hidden', !canPropose);
  if (canPropose) {
    const min = appointmentInputValue(Date.now());
    document.getElementById('appointmentStart').min = min;
    document.getElementById('appointmentEnd').min = min;
    if (windows.length && document.getElementById('appointmentStart').value === '') {
      setAppointmentWindow(windows[0].startAt, windows[0].endAt);
    }
  }
}

async function submitAppointmentProposal(e) {
  e.preventDefault();
  const startAt = new Date(document.getElementById('appointmentStart').value).getTime();
  const endAt = new Date(document.getElementById('appointmentEnd').value).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= Date.now() || endAt <= startAt) {
    showToast('Choose a future visit window with an end time after its start.', 'warning');
    return;
  }
  try {
    await API.proposeAppointment(activeTicketId, { startAt, endAt });
    showToast('Visit time proposed to the reporter.', 'success');
  } catch (err) { showToast(err.message || 'Could not propose the visit time.', 'error'); }
}

async function respondToTicketAppointment(decision) {
  if (!activeTicketId) return;
  try {
    await API.respondToAppointment(activeTicketId, decision);
    showToast(decision === 'confirmed' ? 'Visit time confirmed.' : 'The technician has been asked to suggest another time.', 'success');
  } catch (err) { showToast(err.message || 'Could not update the visit time.', 'error'); }
}

// A student's chat is closed once their ticket is marked fixed — they keep the
// full history and ticket details, but can only write again after reopening it.
// Staff and admin can always message (they may need to follow up).
function studentCanReopen(t) {
  const user = window.API && API.getCurrentUser ? API.getCurrentUser() : null;
  const isOwner = user && t.userId === user.uid;
  const fixedMs = t.resolvedAtMs || (t.resolvedAt && t.resolvedAt.seconds ? t.resolvedAt.seconds * 1000 : 0);
  return isOwner && t.status === 'Resolved' && (!fixedMs || Date.now() - fixedMs < 30 * 86400000);
}
function applyChatOpenState(t) {
  const form = document.getElementById('chatForm');
  const notice = document.getElementById('chatClosedNotice');
  if (!form || !notice) return;
  const closed = currentRole === 'student' && t.status === 'Resolved';
  form.classList.toggle('hidden', closed);
  notice.classList.toggle('hidden', !closed);
  if (closed) {
    const reopenBtn = document.getElementById('chatReopenBtn');
    if (reopenBtn) reopenBtn.classList.toggle('hidden', !studentCanReopen(t));
  }
}
function reopenFromChat() {
  if (!activeTicketId) return;
  closeTicketDetailModal();
  if (typeof openReopenModal === 'function') openReopenModal(activeTicketId);
}

const MY_SENDER = () => currentRole === 'student' ? 'Student' : (currentRole === 'staff' ? 'Technician' : 'Admin');

function renderChatMessages(messages, containerId = 'detailMessages') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 64;
  const me = MY_SENDER();

  const frag = document.createDocumentFragment();
  (Array.isArray(messages) ? messages : []).forEach((m, index) => {
    const isMe = m.sender === me;
    const div = document.createElement('div');
    div.dataset.liveKey = `message-${index}-${m.at || ''}`;
    if (m.isSystem) {
      div.className = "flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider my-4 text-center";
      div.innerHTML = `<span class="h-px w-12 bg-slate-200 shrink-0"></span><i data-lucide="info" class="w-3 h-3 shrink-0"></i> ${escapeHtml(m.text)} (${escapeHtml(m.time)})<span class="h-px w-12 bg-slate-200 shrink-0"></span>`;
    } else {
      // Legacy messages stored attachments as raw <a> HTML; show only their text
      let body = m.fileUrl ? '' : escapeHtml(String(m.text || '').replace(/<[^>]*>/g, ''));
      if (m.fileUrl) body = (m.text && m.text !== m.fileName ? `<div class="mb-1">${escapeHtml(m.text)}</div>` : '') + attachmentHtml(m.fileUrl, m.fileName, isMe);
      div.className = `flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'} mb-3`;
      div.innerHTML = `
        <span class="text-[10px] font-bold text-slate-400 mb-1 px-1">${escapeHtml(m.senderName || m.sender || 'Unknown')}${m.senderName && m.sender && m.senderName !== m.sender ? ` <span class="font-semibold text-slate-300">(${escapeHtml(m.sender === 'Technician' ? 'Technician' : m.sender === 'Student' ? 'Reporter' : m.sender)})</span>` : ''} &bull; ${escapeHtml(m.time)}</span>
        <div class="px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words ${isMe ? 'bg-iiitg-800 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}">${body}</div>`;
    }
    frag.appendChild(div);
  });
  patchHtml(container, [...frag.children].map(message => message.outerHTML).join(''));
  if (window.lucide) lucide.createIcons();
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

function buildMessage(extra) {
  const user = window.API.getCurrentUser();
  return {
    sender: MY_SENDER(),
    senderName: currentRole === 'admin' ? 'Administrator'
      : (currentRole === 'staff' && typeof getCurrentTech === 'function' && getCurrentTech()) ? getCurrentTech().name
      : (user ? (user.displayName || user.email.split('@')[0]) : MY_SENDER()),
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    at: Date.now(),
    isSystem: false,
    ...extra
  };
}

async function handleSendMessage(e) {
  e.preventDefault();
  if (!activeTicketId) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  // Student chat is closed once the ticket is fixed (until they reopen it).
  if (currentRole === 'student') {
    const t = cachedTickets.find(x => x.id === activeTicketId);
    if (t && t.status === 'Resolved') { showToast('This chat is closed. Reopen the ticket to continue.', 'warning'); return; }
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i>`;
  btn.disabled = true;

  try {
    await window.API.addTicketMessage(activeTicketId, buildMessage({ text }));
    input.value = '';
    // The real-time listener re-renders the conversation
  } catch (err) {
    console.error(err);
    showToast('Failed to send message.', 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

async function handleChatFileUpload(e) {
  if (!activeTicketId) return;
  const file = e.target.files[0];
  if (!file) return;

  const btn = document.getElementById('chatAttachBtn');
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i>`;
  btn.disabled = true;
  if (window.lucide) lucide.createIcons();

  try {
    // A confidential ticket's chat files also stay private (inside Firestore).
    const t = cachedTickets.find(x => x.id === activeTicketId);
    const url = await window.API.uploadFile(file, "chat_attachments", { inline: !!(t && t.confidential) });
    await window.API.addTicketMessage(activeTicketId, buildMessage({ text: file.name, fileUrl: url, fileName: file.name }));
    showToast('File attached successfully', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to attach file: ' + err.message, 'error');
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
    e.target.value = '';
    if (window.lucide) lucide.createIcons();
  }
}
