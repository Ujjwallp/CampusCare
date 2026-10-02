const debouncedFilterStudentTickets = debounce(filterStudentTickets, 250);

const STUDENT_TAB_TITLE = { Mine: 'My Tickets', Community: 'Shared Issues', LostFound: 'Lost & Found' };
const STUDENT_TAB_SUB = {
  Mine: "Problems you reported or joined, and how they're going.",
  Community: 'Problems that affect many people (Wi-Fi, water, mess…). Press "Me too" instead of reporting again.',
  LostFound: 'Lost or found something on campus? Posted here for everyone, so it gets back to its owner faster.',
};
function switchStudentTab(tab) {
  studentCurrentTab = tab;
  setActiveNav(tab);
  document.getElementById('studentPageTitle').textContent = STUDENT_TAB_TITLE[tab] || 'My Tickets';
  document.getElementById('studentPageSub').textContent = STUDENT_TAB_SUB[tab] || STUDENT_TAB_SUB.Mine;
  filterStudentTickets();
}

function filterStudentTickets() {
  const q = document.getElementById('ticketSearchFilter').value.trim().toUpperCase();
  const s = document.getElementById('statusFilter').value;
  const source = studentCurrentTab === 'Mine' ? [...getMyTickets(), ...getFollowedTickets()]
    : studentCurrentTab === 'LostFound' ? cachedTickets.filter(t => t.isPublic && isLostFound(t))
    : cachedTickets.filter(t => t.isPublic && !isLostFound(t));
  const filtered = source.filter(t => {
    const hay = `${t.id || ''} ${ticketCategoryLabel(t)} ${t.description || ''} ${t.location || ''}`.toUpperCase();
    return (!q || hay.includes(q)) && (s === 'ALL' || t.status === s);
  });

  if (studentCurrentTab === 'Community') {
    filtered.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  } else if (studentCurrentTab === 'LostFound') {
    filtered.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  }
  renderStudentTickets(filtered);
}

async function upvoteTicket(id) {
  try {
    const r = await API.joinTicket(id);
    showToast(`Thanks. ${r.count} people affected${r.escalated ? '. It is now URGENT' : ''}. You'll get updates on this issue.`, 'success');
  } catch (err) { showToast(err.message, 'warning'); }
}

async function toggleTicketFollow(id, shouldFollow, btn) {
  if (btn) { btn.disabled = true; btn.textContent = shouldFollow ? 'Following…' : 'Updating…'; }
  try {
    if (shouldFollow) await API.followTicket(id);
    else await API.unfollowTicket(id);
    filterStudentTickets();
    showToast(shouldFollow ? 'You’ll get updates when this issue changes.' : 'You’re no longer following this issue.', 'success');
  } catch (err) {
    showToast(err.message || 'Could not update following.', 'warning');
    if (btn) { btn.disabled = false; btn.textContent = shouldFollow ? 'Follow updates' : 'Following'; }
  }
}

function renderStudentTickets(data) {
  const container = document.getElementById('studentTicketsContainer');
  if (!container) return;
  if (data.length === 0) {
    const mine = studentCurrentTab === 'Mine';
    patchHtml(container, `
      <div data-live-key="student-empty-${studentCurrentTab}" class="col-span-full text-center py-14 px-6 bg-white rounded-2xl border border-slate-200 border-dashed">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center mb-3"><i data-lucide="${mine ? 'inbox' : 'users'}" class="w-7 h-7 text-slate-300"></i></div>
        <h3 class="text-sm font-bold text-slate-900 mb-1">${mine ? 'No tickets yet' : 'No shared issues'}</h3>
        <p class="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">${mine ? 'Something broken on campus? Report it and track the fix here.' : 'Public issues reported by other students will show up here.'}</p>
        ${mine ? '<button onclick="openComplaintModal()" class="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-iiitg-800 text-white text-sm font-bold rounded-xl btn-press"><i data-lucide="plus" class="w-4 h-4 text-iiitg-gold"></i> Report an issue</button>' : ''}
      </div>`);
    if (window.lucide) lucide.createIcons();
    return;
  }

  const user = window.API ? API.getCurrentUser() : null;
  patchHtml(container, data.map(t => {
    const statusClass = getStatusConfig(t.status);
    const isOwner = user && t.userId === user.uid;
    const alreadyUpvoted = user && Array.isArray(t.upvotedBy) && t.upvotedBy.includes(user.uid);
    const explicitFollow = user && Array.isArray(t.followerIds) && t.followerIds.includes(user.uid);
    const lastChatMessage = Array.isArray(t.messages) ? [...t.messages].reverse().find(m => m && !m.isSystem) : null;
    const chatSender = lastChatMessage
      ? (lastChatMessage.sender === 'Student' ? 'You' : (lastChatMessage.senderName || (lastChatMessage.sender === 'Technician' ? (t.assignedToName || 'Technician') : lastChatMessage.sender || 'Update')))
      : '';
    const chatText = lastChatMessage
      ? (lastChatMessage.fileUrl ? `Attachment: ${lastChatMessage.fileName || lastChatMessage.text || 'file'}` : String(lastChatMessage.text || '').replace(/<[^>]*>/g, '').slice(0, 140))
      : '';
    const actions = [];
    if (studentCurrentTab === 'Community' && t.status !== 'Resolved') {
      actions.push(alreadyUpvoted || (user && t.userId === user.uid)
        ? `<span class="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg border border-blue-100 flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5"></i>${user && t.userId === user.uid ? 'Your report' : 'Upvoted'}</span>`
        : `<button onclick="upvoteTicket('${t.id}')" class="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1.5 btn-press"><i data-lucide="thumbs-up" class="w-3.5 h-3.5"></i>Me too</button>`);
    }
    if (t.isPublic && !isOwner) {
      if (explicitFollow) {
        actions.push(`<button onclick="toggleTicketFollow('${escapeHtml(t.id)}', false, this)" class="px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1.5 btn-press"><i data-lucide="bell-ring" class="w-3.5 h-3.5"></i>Following · turn off</button>`);
      } else if (!alreadyUpvoted && t.status !== 'Resolved') {
        actions.push(`<button onclick="toggleTicketFollow('${escapeHtml(t.id)}', true, this)" class="px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-1.5 btn-press"><i data-lucide="bell-plus" class="w-3.5 h-3.5"></i>Follow updates</button>`);
      }
    }
    const fixedMs = t.resolvedAtMs || (t.resolvedAt && t.resolvedAt.seconds * 1000) || 0;
    if (isOwner && t.status === 'Resolved' && studentCurrentTab === 'Mine' && (!fixedMs || Date.now() - fixedMs < 30 * 86400000)) {
      actions.push(`<button onclick="openReopenModal('${t.id}')" class="px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 flex items-center gap-1.5 btn-press"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>Not fixed?</button>`);
    }
    if (isOwner && t.status === 'Resolved' && studentCurrentTab === 'Mine') {
      actions.push(t.rating
        ? `<span class="px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-1"><i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i>${t.rating}/5</span>`
        : `<button onclick="openFeedbackModal('${t.id}')" class="px-3 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 flex items-center gap-1.5 btn-press"><i data-lucide="star" class="w-3.5 h-3.5 text-amber-500"></i>Rate fix</button>`);
    }
    actions.push(`<button onclick="openTicketDetailModal('${t.id}')" class="px-3 py-2 text-xs font-bold text-white bg-iiitg-800 hover:bg-iiitg-900 rounded-lg flex items-center gap-1.5 btn-press"><i data-lucide="message-square" class="w-3.5 h-3.5"></i>Details & chat</button>`);

    return `<article data-live-key="ticket-${escapeHtml(t.id)}" class="panel p-4 sm:p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-mono text-[11px] font-bold text-iiitg-700 bg-iiitg-50 px-2 py-1 rounded-md border border-iiitg-100">${escapeHtml(t.id)}</span>
        <span class="px-2.5 py-1 text-[11px] font-bold rounded-full ${statusClass} border">${escapeHtml(statusLabel(t))}</span>
        ${!isOwner && studentCurrentTab === 'Mine' ? `<span class="px-2 py-1 text-[10px] font-extrabold rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">${alreadyUpvoted ? 'Me too · updates on' : 'Following updates'}</span>` : ''}
        ${t.reopenCount ? `<span class="px-2 py-1 text-[10px] font-extrabold rounded-full bg-orange-50 text-orange-700 border border-orange-200 uppercase">Reopened${t.reopenCount > 1 ? ' ×' + t.reopenCount : ''}</span>` : ''}
        ${t.priority === 'High' ? '<span class="px-2 py-1 text-[10px] font-extrabold rounded-full bg-rose-50 text-rose-700 border border-rose-200 uppercase">Urgent</span>' : ''}
        ${t.isPublic ? `<span class="ml-auto text-[11px] font-bold text-blue-700 flex items-center gap-1"><i data-lucide="users" class="w-3.5 h-3.5"></i>${t.upvotes || 0}</span>` : ''}
      </div>
      <div class="min-w-0">
        <h3 class="text-[15px] font-bold text-slate-900 leading-snug">${escapeHtml(ticketCategoryLabel(t))}</h3>
        <p class="text-sm text-slate-600 mt-1 line-clamp-2">${escapeHtml(t.description)}</p>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-medium">
        <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i>${escapeHtml(t.location || '—')}</span>
        <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i>${escapeHtml(t.date || '')}</span>
        ${t.assignedToName ? `<span class="flex items-center gap-1"><i data-lucide="wrench" class="w-3 h-3"></i>${escapeHtml(t.assignedToName)}</span>` : ''}
      </div>
      ${lastChatMessage ? `<button type="button" onclick="openTicketDetailModal('${escapeHtml(t.id)}')" class="w-full min-w-0 text-left rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors" aria-label="Open ticket chat, latest message from ${escapeHtml(chatSender)}"><span class="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Latest chat · ${escapeHtml(chatSender)}${lastChatMessage.time ? ` · ${escapeHtml(lastChatMessage.time)}` : ''}</span><span class="block text-xs text-slate-700 truncate mt-0.5">${escapeHtml(chatText)}</span></button>` : ''}
      <div class="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-auto">${actions.join('')}</div>
    </article>`;
  }).join(''));
  if (window.lucide) lucide.createIcons();
}

// The report form (3-step wizard) lives in report-form.js

// ─── REOPEN ───
let reopenTicketId = null;
function openReopenModal(id) {
  reopenTicketId = id;
  document.getElementById('reopenTicketId').textContent = id;
  document.getElementById('reopenReason').value = '';
  showModal('reopenModal');
}
async function submitReopen(e) {
  e.preventDefault();
  const reason = document.getElementById('reopenReason').value.trim();
  if (!reason || !reopenTicketId) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await API.reopenTicket(reopenTicketId, reason);
    hideModal('reopenModal');
    showToast(`Ticket ${reopenTicketId} reopened.`, 'success');
  } catch (err) { console.error(err); showToast('Could not reopen: ' + err.message, 'error'); }
  finally { btn.disabled = false; }
}
