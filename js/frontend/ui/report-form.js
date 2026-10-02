// ═══════════════════════════════════════════════════════════════
//  REPORT A PROBLEM: 3-step wizard
//   1 What  → search any problem, or pick a type then the problem
//   2 Where → type of place → type its name / number (suggestions come
//             from what real users typed before) → room / spot + map pin
//   3 Details → "already reported?" + description, phone, photo, urgency
//  Data (problem types, places) comes from js/shared/catalog.js
// ═══════════════════════════════════════════════════════════════
const wiz = { step: 1, cat: '', issue: '', placeType: null };
const REPORT_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
const reportDraftKey = () => {
  const user = window.API && API.getCurrentUser && API.getCurrentUser();
  return user ? `campuscare_report_draft_${user.uid}` : null;
};
const recentReportsKey = () => {
  const user = window.API && API.getCurrentUser && API.getCurrentUser();
  return user ? `campuscare_recent_reports_${user.uid}` : null;
};
let isRestoringReportDraft = false;

function saveReportDraft() {
  if (isRestoringReportDraft) return;
  const key = reportDraftKey();
  if (!key) return;
  const draft = {
    savedAt: Date.now(), step: wiz.step, category: wiz.cat, issue: wiz.issue, customIssue: !!wiz.customIssue,
    search: document.getElementById('issueSearch')?.value || '', customText: document.getElementById('customIssue')?.value || '',
    placeType: wiz.placeType && wiz.placeType.key,
    placeName: document.getElementById('placeName')?.value || '',
    spot: document.getElementById('modalLocation')?.value || '',
    description: document.getElementById('modalDescription')?.value || '',
    phone: document.getElementById('modalPhone')?.value || '',
    availability: [1, 2].map(i => ({ start: document.getElementById(`availability${i}Start`)?.value || '', end: document.getElementById(`availability${i}End`)?.value || '' })),
    urgent: !!document.getElementById('modalUrgent')?.checked,
    isPublic: !!document.getElementById('modalIsPublic')?.checked,
    pin: typeof reportPin !== 'undefined' && reportPin ? { lat: reportPin.lat, lng: reportPin.lng, source: reportPin.source } : null,
  };
  try {
    const hasAvailability = draft.availability.some(w => w.start || w.end);
    const hasContent = draft.category || draft.issue || draft.search || draft.customText || draft.placeName || draft.spot || draft.description || draft.phone || hasAvailability;
    if (hasContent) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
    const notice = document.getElementById('reportDraftNotice');
    if (notice && hasContent) notice.classList.remove('hidden');
  } catch (e) { /* Storage may be unavailable; reporting still works. */ }
}

function clearReportDraft() {
  const key = reportDraftKey();
  if (key) { try { sessionStorage.removeItem(key); } catch (e) {} }
  document.getElementById('reportDraftNotice')?.classList.add('hidden');
}

function setAvailabilityMinima() {
  const min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelectorAll('#reportForm input[type="datetime-local"]').forEach(input => { input.min = min; });
}

function collectAvailabilityWindows() {
  const windows = [];
  for (let i = 1; i <= 2; i++) {
    const startValue = document.getElementById(`availability${i}Start`).value;
    const endValue = document.getElementById(`availability${i}End`).value;
    if (!startValue && !endValue) continue;
    if (!startValue || !endValue) {
      showToast(`Add both a start and end time for preferred window ${i}.`, 'warning');
      return null;
    }
    const startAt = new Date(startValue).getTime(), endAt = new Date(endValue).getTime();
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= Date.now() || endAt <= startAt) {
      showToast(`Preferred window ${i} must be in the future and end after it starts.`, 'warning');
      return null;
    }
    windows.push({ startAt, endAt });
  }
  return windows;
}

function readReportDraft() {
  const key = reportDraftKey();
  if (!key) return null;
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!draft || Date.now() - draft.savedAt > REPORT_DRAFT_TTL) { sessionStorage.removeItem(key); return null; }
    return draft;
  } catch (e) { return null; }
}

function getRecentReports() {
  const key = recentReportsKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]').slice(0, 5); } catch (e) { return []; }
}

function rememberReport(payload) {
  const key = recentReportsKey();
  if (!key) return;
  const item = {
    category: payload.category, issue: payload.subCategory, categoryLabel: CATEGORY_LABELS[payload.category] || payload.category,
    customIssue: !!payload.customIssue, placeType: payload.placeType, zone: String(payload.location || '').split(' — ')[0],
    spot: String(payload.location || '').split(' — ').slice(1).join(' — '),
  };
  try {
    const recent = getRecentReports().filter(x => !(x.category === item.category && x.issue === item.issue && x.zone === item.zone));
    localStorage.setItem(key, JSON.stringify([item, ...recent].slice(0, 5)));
  } catch (e) {}
}

function renderRecentReports() {
  const box = document.getElementById('recentReportChoices');
  if (!box) return;
  const recent = getRecentReports().slice(0, 3);
  box.innerHTML = recent.length ? `<p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Report again</p><div class="flex flex-wrap gap-2">${recent.map((r, i) => `<button type="button" class="recent-choice" data-recent-report="${i}"><span class="block text-left">${escapeHtml(r.issue)}</span><span class="block text-left text-[10px] font-medium opacity-70">${escapeHtml(r.categoryLabel)}${r.zone ? ` · ${escapeHtml(r.zone)}` : ''}</span></button>`).join('')}</div>` : '';
  box.classList.toggle('hidden', !recent.length);
}

function useRecentReport(index) {
  const recent = getRecentReports()[index];
  if (!recent || !CATALOG[recent.category]) return;
  wiz.issue = '';
  pickCategory(recent.category);
  if (recent.customIssue) {
    showCustomIssue(recent.category);
    document.getElementById('customIssue').value = recent.issue;
  }
  chooseIssue(recent.category, recent.issue, recent.customIssue);
}

function renderRecentPlaces() {
  const box = document.getElementById('recentPlaceChoices');
  if (!box) return;
  const recent = getRecentReports().filter(r => r.zone && r.placeType && placeTypeByKey(r.placeType)).slice(0, 3);
  box.innerHTML = recent.length ? `<p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Recent places</p><div class="flex flex-wrap gap-2">${recent.map((r, i) => `<button type="button" class="recent-choice" data-recent-place="${getRecentReports().indexOf(r)}"><span class="block text-left">${escapeHtml(r.zone)}</span><span class="block text-left text-[10px] font-medium opacity-70">${escapeHtml(r.spot || 'No room or spot')}</span></button>`).join('')}</div>` : '';
  box.classList.toggle('hidden', !recent.length);
}

function useRecentPlace(index) {
  const recent = getRecentReports()[index];
  if (!recent || !placeTypeByKey(recent.placeType)) return;
  choosePlaceType(recent.placeType, true);
  document.getElementById('placeName').value = recent.zone;
  document.getElementById('modalLocation').value = recent.spot || '';
  onPlaceName(recent.zone, true);
  saveReportDraft();
}

function restoreReportDraft() {
  const draft = readReportDraft();
  renderRecentReports();
  renderRecentPlaces();
  if (!draft) return;
  isRestoringReportDraft = true;
  if (draft.category && CATALOG[draft.category]) {
    wiz.cat = draft.category; wiz.issue = draft.issue || ''; wiz.customIssue = !!draft.customIssue;
    pickCategory(draft.category);
    document.getElementById('modalCategory').value = draft.category;
    document.getElementById('modalSubCategory').value = wiz.issue;
    document.querySelectorAll('.issue-card').forEach(b => b.classList.toggle('active', b.dataset.cat === wiz.cat && b.dataset.issue === wiz.issue));
    if (wiz.customIssue) {
      showCustomIssue(wiz.cat);
      document.getElementById('customIssue').value = wiz.issue;
    }
  }
  document.getElementById('issueSearch').value = draft.search || '';
  if (draft.customText && !wiz.customIssue && draft.category && CATALOG[draft.category]) {
    showCustomIssue(draft.category);
    document.getElementById('customIssue').value = draft.customText;
  }
  if (draft.placeType && placeTypeByKey(draft.placeType)) {
    choosePlaceType(draft.placeType, true);
    document.getElementById('placeName').value = draft.placeName || '';
    document.getElementById('modalLocation').value = draft.spot || '';
    onPlaceName(draft.placeName || '', true);
  }
  document.getElementById('modalDescription').value = draft.description || '';
  document.getElementById('modalPhone').value = draft.phone || document.getElementById('modalPhone').value;
  (draft.availability || []).forEach((w, i) => {
    if (i > 1) return;
    document.getElementById(`availability${i + 1}Start`).value = w.start || '';
    document.getElementById(`availability${i + 1}End`).value = w.end || '';
  });
  document.getElementById('modalUrgent').checked = !!draft.urgent;
  document.getElementById('modalIsPublic').checked = !!draft.isPublic;
  if (wiz.cat && wiz.issue) applyIssueRules();
  isRestoringReportDraft = false;
  document.getElementById('reportDraftNotice')?.classList.remove('hidden');
  goStep(Math.min(3, Math.max(1, Number(draft.step) || 1)));
  if (draft.pin && typeof toggleReportMap === 'function') {
    toggleReportMap(true);
    setTimeout(() => { if (typeof setReportPin === 'function') setReportPin(draft.pin.lat, draft.pin.lng, draft.pin.source || 'map'); }, 120);
  }
}

// ---------- open / close / reset ----------
function openComplaintModal() {
  resetComplaintForm();
  showModal('complaintModal');
  isRestoringReportDraft = true;
  if (typeof myProfile !== 'undefined' && myProfile) {
    document.getElementById('modalPhone').value = myProfile.phone || '';
    // Pre-fill the place the person usually is (their hostel room, office…)
    if (myProfile.placeType && placeTypeByKey(myProfile.placeType)) {
      choosePlaceType(myProfile.placeType, true);
      document.getElementById('placeName').value = myProfile.zone || '';
      onPlaceName(myProfile.zone || '', true);
      document.getElementById('modalLocation').value = myProfile.spot || '';
    }
  }
  isRestoringReportDraft = false;
  restoreReportDraft();
  setAvailabilityMinima();
  setTimeout(() => {
    const target = wiz.step === 1 ? document.getElementById('issueSearch')
      : wiz.step === 2 ? (document.querySelector('#placeTypeGrid .place-tile') || document.getElementById('placeName'))
        : document.getElementById('modalDescription');
    target && target.focus({ preventScroll: true });
  }, 80);
}

function closeComplaintModal() { hideModal('complaintModal'); }

function resetComplaintForm() {
  const wasRestoring = isRestoringReportDraft;
  isRestoringReportDraft = true;
  Object.assign(wiz, { step: 1, cat: '', issue: '', customIssue: false, placeType: null });
  document.getElementById('reportForm').reset();
  document.getElementById('modalCategory').value = '';
  document.getElementById('modalSubCategory').value = '';
  document.getElementById('modalMapZone').value = '';
  document.getElementById('issueSearchResults').classList.add('hidden');
  document.getElementById('categoryBrowse').classList.remove('hidden');
  document.getElementById('issueListWrap').classList.add('hidden');
  document.getElementById('customIssueWrap').classList.add('hidden');
  document.getElementById('placeDetail').classList.add('hidden');
  document.querySelectorAll('#categoryTiles .cat-tile, #placeTypeGrid .place-tile').forEach(b => b.classList.remove('active'));
  const sp = document.getElementById('similarPanel'); sp.innerHTML = ''; sp.classList.add('hidden');
  document.getElementById('reportDraftNotice')?.classList.add('hidden');
  lastSimilarKey = '';
  const photo = document.getElementById('complaintPhotoInput'); if (photo) handleFileUpload(photo, 'complaintPhotoName');
  if (typeof clearReportPin === 'function' && typeof reportMap !== 'undefined' && reportMap) clearReportPin();
  goStep(1);
  isRestoringReportDraft = wasRestoring;
}

// ---------- steps ----------
const STEP_TITLES = { 1: "What's wrong?", 2: 'Where is it?', 3: 'A few details' };

function goStep(n) {
  wiz.step = n;
  [1, 2, 3].forEach(i => document.getElementById('wizStep' + i).classList.toggle('hidden', i !== n));
  document.querySelectorAll('#wizSteps .wiz-bar').forEach(b => {
    const s = Number(b.dataset.step);
    b.classList.toggle('active', s === n); b.classList.toggle('done', s < n);
  });
  document.getElementById('wizSubtitle').textContent = `Step ${n} of 3 · ${STEP_TITLES[n]}`;
  document.getElementById('wizBack').textContent = n === 1 ? 'Cancel' : 'Back';
  document.getElementById('wizNext').classList.toggle('hidden', n === 3);
  document.getElementById('wizSubmit').classList.toggle('hidden', n !== 3);
  document.getElementById('wizBody').scrollTop = 0;
  if (n === 2 && typeof toggleReportMap === 'function') toggleReportMap(true);
  if (n === 2) renderRecentPlaces();
  if (n === 3) { renderWizSummary(); applyIssueRules(); checkSimilar(); }
  document.querySelectorAll('#wizSteps .wiz-bar').forEach(b => {
    if (Number(b.dataset.step) === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  saveReportDraft();
  if (window.lucide) lucide.createIcons();
  const focusTarget = n === 1 ? document.getElementById('issueSearch')
    : n === 2 ? (document.querySelector('#placeTypeGrid .place-tile') || document.getElementById('placeName'))
      : document.getElementById('modalDescription');
  if (focusTarget && !document.getElementById('complaintModal').classList.contains('hidden')) {
    setTimeout(() => focusTarget.focus({ preventScroll: true }), 0);
  }
}

function wizardBack() { if (wiz.step === 1) closeComplaintModal(); else goStep(wiz.step - 1); }

function wizardNext() {
  if (wiz.step === 1) {
    const typed = document.getElementById('customIssue').value.trim();
    if (!wiz.issue && typed && !document.getElementById('customIssueWrap').classList.contains('hidden')) return useCustomIssue();
    if (!wiz.issue) return showToast('Choose what the problem is, or type it.', 'warning');
    goStep(2);
  } else if (wiz.step === 2) {
    const err = validatePlace();
    if (err) return showToast(err, 'warning');
    goStep(3);
  }
}

// ---------- step 1: what ----------
function renderCategoryTiles() {
  const grid = document.getElementById('categoryTiles');
  const sel = document.getElementById('modalCategory');
  if (!grid || !sel) return;
  sel.innerHTML = '<option value=""></option>' + Object.entries(CATALOG).map(([k, c]) => `<option value="${k}">${escapeHtml(c.label)}</option>`).join('');
  grid.innerHTML = Object.entries(CATALOG).map(([k, c]) =>
    `<button type="button" data-cat="${k}" onclick="pickCategory('${k}')" class="cat-tile"><i data-lucide="${c.icon}" class="w-5 h-5"></i><span>${escapeHtml(c.label)}</span></button>`).join('');
  if (window.lucide) lucide.createIcons();
}

function issueTag(raw) {
  if (/^[*#]*!/.test(raw)) return '<span class="issue-tag bg-rose-100 text-rose-700">Urgent</span>';
  if (/^[!*]*#/.test(raw)) return '<span class="issue-tag bg-violet-100 text-violet-700">Confidential</span>';
  if (/^[!#]*\*/.test(raw)) return '<span class="issue-tag bg-blue-100 text-blue-700">Shared</span>';
  return '';
}

function pickCategory(k) {
  wiz.cat = k;
  document.querySelectorAll('#categoryTiles .cat-tile').forEach(b => b.classList.toggle('active', b.dataset.cat === k));
  document.getElementById('categoryBrowse').classList.add('hidden');
  document.getElementById('issueListWrap').classList.remove('hidden');
  document.getElementById('issueListTitle').textContent = CATALOG[k].label + ': pick the problem';
  document.getElementById('issueList').innerHTML = CATALOG[k].issues.map(raw => {
    const issue = cleanIssue(raw);
    return `<button type="button" class="issue-card ${wiz.issue === issue && wiz.cat === k ? 'active' : ''}" data-cat="${k}" data-issue="${escapeHtml(issue)}" onclick="chooseIssue(this.dataset.cat, this.dataset.issue)">${escapeHtml(issue)}${issueTag(raw)}</button>`;
  }).join('') + `<button type="button" class="issue-card !border-dashed !text-iiitg-700" onclick="showCustomIssue('${k}')"><i data-lucide="pencil" class="w-4 h-4"></i> My problem isn't listed: type it</button>`;
  if (window.lucide) lucide.createIcons();
  saveReportDraft();
}

function backToCategories() {
  document.getElementById('issueListWrap').classList.add('hidden');
  document.getElementById('categoryBrowse').classList.remove('hidden');
}

// Search every problem in the catalogue (with a few everyday words)
const SEARCH_ALIASES = { wifi: 'wi-fi', net: 'internet', ac: 'ac ', toilet: 'washroom flush', bulb: 'light', tubelight: 'tube light', pani: 'water', light: 'light bulb tube', fan: 'fan', lock: 'lock', leak: 'leak', food: 'food', bus: 'bus', rat: 'rats', cockroach: 'cockroaches', geyser: 'geyser hot water' };
function searchIssues(q) {
  const box = document.getElementById('issueSearchResults');
  q = (q || '').trim().toLowerCase();
  if (q.length < 2) { box.classList.add('hidden'); document.getElementById('categoryBrowse').classList.toggle('hidden', !!wiz.cat && !document.getElementById('issueListWrap').classList.contains('hidden')); return; }
  const words = q.split(/\s+/).flatMap(w => [w, ...(SEARCH_ALIASES[w] ? SEARCH_ALIASES[w].split(' ') : [])]).filter(Boolean);
  const hits = [];
  Object.entries(CATALOG).forEach(([k, c]) => c.issues.forEach(raw => {
    const issue = cleanIssue(raw), hay = (issue + ' ' + c.label).toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? (issue.toLowerCase().startsWith(w) ? 3 : 1) : 0), 0);
    if (score) hits.push({ k, raw, issue, score, label: c.label, icon: c.icon });
  }));
  hits.sort((a, b) => b.score - a.score);
  box.classList.remove('hidden');
  document.getElementById('categoryBrowse').classList.add('hidden');
  document.getElementById('issueListWrap').classList.add('hidden');
  box.innerHTML = hits.length ? hits.slice(0, 12).map((h, i) => `<button type="button" class="issue-card w-full ${i === 0 ? '!border-iiitg-300 !bg-iiitg-50/60' : ''}" data-cat="${h.k}" data-issue="${escapeHtml(h.issue)}" onclick="chooseIssue(this.dataset.cat, this.dataset.issue)">
      <i data-lucide="${h.icon}" class="w-4 h-4 shrink-0 ${i === 0 ? 'text-iiitg-600' : 'text-slate-400'}"></i><span class="min-w-0"><span class="block truncate">${escapeHtml(h.issue)}${i === 0 ? ' <span class="text-[9px] font-extrabold text-iiitg-700 bg-iiitg-100 rounded px-1 py-0.5 align-middle">BEST MATCH</span>' : ''}</span><span class="block text-[10px] font-semibold text-slate-400">${escapeHtml(h.label)}</span></span>${issueTag(h.raw)}</button>`).join('')
    : `<p class="text-xs text-slate-500 px-1">No matching problem in the list.</p>`;
  box.innerHTML += `<button type="button" class="issue-card w-full !border-dashed !text-iiitg-700" onclick="useSearchAsIssue()"><i data-lucide="pencil" class="w-4 h-4 shrink-0"></i><span class="truncate">Use "${escapeHtml(document.getElementById('issueSearch').value.trim())}" as my problem</span></button>`;
  if (!hits.length) document.getElementById('categoryBrowse').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

// ── typing your own problem ──
function showCustomIssue(cat) {
  wiz.cat = cat || 'Other';
  const wrap = document.getElementById('customIssueWrap');
  wrap.classList.remove('hidden');
  document.getElementById('customIssueLabel').textContent = cat && cat !== 'Other' ? `Type your ${CATALOG[cat].label} problem *` : 'Type your problem *';
  const input = document.getElementById('customIssue');
  input.focus();
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  saveReportDraft();
}

function useCustomIssue() {
  const text = document.getElementById('customIssue').value.trim();
  if (text.length < 3) return showToast('Type the problem in a few words.', 'warning');
  chooseIssue(wiz.cat || 'Other', text.charAt(0).toUpperCase() + text.slice(1), true);
}

// Guess the best-fitting category for a typed phrase, using the same keyword
// scoring the search uses. Simple keyword matching — no paid AI.
function suggestCategoryFor(text) {
  const q = (text || '').trim().toLowerCase();
  if (q.length < 2) return null;
  const words = q.split(/\s+/).flatMap(w => [w, ...(SEARCH_ALIASES[w] ? SEARCH_ALIASES[w].split(' ') : [])]).filter(Boolean);
  let best = null;
  Object.entries(CATALOG).forEach(([k, c]) => {
    if (k === 'Other') return;
    c.issues.forEach(raw => {
      const issue = cleanIssue(raw), hay = (issue + ' ' + c.label).toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? (issue.toLowerCase().startsWith(w) ? 3 : 1) : 0), 0);
      if (score && (!best || score > best.score)) best = { k, label: c.label, score };
    });
  });
  return best;
}

function useSearchAsIssue() {
  const text = document.getElementById('issueSearch').value.trim();
  document.getElementById('customIssue').value = text;
  // Auto-pick the most likely category so the ticket still reaches the right
  // team, instead of dumping every typed problem into "Other".
  const guess = suggestCategoryFor(text);
  showCustomIssue(guess ? guess.k : 'Other');
  if (guess) showToast(`Suggested category: ${guess.label}.`, 'info');
}

function chooseIssue(cat, issue, custom) {
  wiz.cat = cat; wiz.issue = issue; wiz.customIssue = !!custom;
  document.getElementById('modalCategory').value = cat;
  document.getElementById('modalSubCategory').value = issue;
  document.querySelectorAll('.issue-card').forEach(b => b.classList.toggle('active', b.dataset.cat === cat && b.dataset.issue === issue));
  saveReportDraft();
  setTimeout(() => goStep(2), 150);
}

// ---------- step 2: where ----------
// Same for every type of place: pick the type, then TYPE its name/number.
function renderPlaceTypes() {
  const grid = document.getElementById('placeTypeGrid');
  if (!grid) return;
  grid.innerHTML = PLACE_TYPES.map(t => `<button type="button" role="radio" class="place-tile" data-key="${t.key}" onclick="choosePlaceType('${t.key}')"><i data-lucide="${t.icon}" class="w-5 h-5"></i><span>${escapeHtml(t.label)}</span></button>`).join('');
  if (window.lucide) lucide.createIcons();
}

function choosePlaceType(key, silent) {
  const t = placeTypeByKey(key);
  if (!t) return;
  wiz.placeType = t;
  document.querySelectorAll('#placeTypeGrid .place-tile').forEach(b => { b.classList.toggle('active', b.dataset.key === key); b.setAttribute('aria-checked', b.dataset.key === key); });
  document.getElementById('placeDetail').classList.remove('hidden');
  const name = document.getElementById('placeName');
  name.value = ''; document.getElementById('modalMapZone').value = '';
  document.getElementById('placeNameLabel').textContent = t.nameLabel + ' *';
  name.placeholder = t.namePlaceholder;
  document.getElementById('spotLabel').textContent = t.spotLabel + (t.spotRequired ? ' *' : '');
  const spot = document.getElementById('modalLocation');
  spot.value = ''; spot.placeholder = t.spotPlaceholder || '';
  const known = knownPlaces(t.key);
  fillDatalist('placeSuggestions', known);
  document.getElementById('placeSuggestHint').classList.toggle('hidden', !known.length);
  if (!silent) setTimeout(() => name.focus(), 50);
  saveReportDraft();
}

function onPlaceName(value, silent) {
  document.getElementById('modalMapZone').value = value.trim();
  const t = wiz.placeType;
  if (t && t.spotRequired) document.getElementById('spotLabel').textContent = `${t.spotLabel}${value.trim() ? ' in ' + value.trim() : ''} *`;
  if (!silent) checkSimilarSoon();
}

function validatePlace() {
  const t = wiz.placeType;
  if (!t) return 'Choose the type of place (hostel, classroom, lab…).';
  const name = document.getElementById('placeName').value.trim();
  const spot = document.getElementById('modalLocation').value.trim();
  if (!name) return `Type the ${t.nameLabel.toLowerCase()}.`;
  if (t.spotRequired && !spot) return `Enter the ${t.spotLabel.toLowerCase()}.`;
  return null;
}

function currentLocationText() {
  const t = wiz.placeType;
  const zone = document.getElementById('placeName').value.trim();
  const spot = document.getElementById('modalLocation').value.trim();
  const room = t && t.key === 'hostel' && /^\d+[a-z]?$/i.test(spot) ? `Room ${spot}` : spot;
  return { zone, location: room ? `${zone} — ${room}` : zone };
}

// ---------- step 3: details ----------
function renderWizSummary() {
  const { location } = currentLocationText();
  const chip = (icon, text, step) => `<button type="button" onclick="goStep(${step})" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 max-w-full"><i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0"></i><span class="truncate">${escapeHtml(text)}</span><i data-lucide="pencil" class="w-3 h-3 text-slate-400 shrink-0"></i></button>`;
  document.getElementById('wizSummary').innerHTML =
    chip(CATALOG[wiz.cat] ? CATALOG[wiz.cat].icon : 'help-circle', `${CATALOG[wiz.cat] ? CATALOG[wiz.cat].label : ''} · ${wiz.issue}`, 1) +
    chip('map-pin', location + (typeof reportPin !== 'undefined' && reportPin ? ' · pinned on map' : ''), 2);
}

// urgent / confidential / shared rules for the chosen problem
function applyIssueRules() {
  const pub = document.getElementById('modalIsPublic'), urgent = document.getElementById('modalUrgent');
  const conf = isConfidentialIssue(wiz.cat, wiz.issue), area = isAreaWideIssue(wiz.cat, wiz.issue);
  pub.disabled = conf; pub.checked = conf ? false : area;
  if (isUrgentIssue(wiz.cat, wiz.issue)) urgent.checked = true;
  document.getElementById('confidentialNote').classList.toggle('hidden', !conf);
  document.getElementById('areaWideNote').classList.toggle('hidden', !area || conf);
  document.getElementById('availabilityDetails')?.classList.toggle('hidden', conf);
  if (conf) {
    [1, 2].forEach(i => {
      document.getElementById(`availability${i}Start`).value = '';
      document.getElementById(`availability${i}End`).value = '';
    });
  }

  // Confidential reports: photo only (no video), since video can't be stored
  // privately — the user shares it with the admin directly instead.
  const photo = document.getElementById('complaintPhotoInput');
  if (photo) {
    photo.setAttribute('accept', conf ? 'image/*' : 'image/*,video/*');
    if (conf && photo.files && photo.files.length && (photo.files[0].type || '').startsWith('video/')) {
      photo.value = '';
      handleFileUpload(photo, 'complaintPhotoName');
      showToast("Videos can't be added to a confidential report — share it with the admin directly.", 'warning');
    }
  }
  const photoName = document.getElementById('complaintPhotoName');
  if (photoName && !(photo && photo.files && photo.files.length)) {
    photoName.textContent = conf ? 'Add a photo (video → send to admin directly)' : 'Add a photo';
  }
}

// ─── "Is this already reported?" ───
let similarTimer = null, lastSimilarKey = '';
function checkSimilarSoon() { clearTimeout(similarTimer); similarTimer = setTimeout(checkSimilar, 300); }

async function checkSimilar() {
  const panel = document.getElementById('similarPanel');
  if (!panel) return;
  const cat = wiz.cat, issue = wiz.issue;
  const { zone } = currentLocationText();
  const pin = (typeof reportPin !== 'undefined' && reportPin) ? reportPin : null;
  const key = [cat, issue, zone, pin && pin.lat, pin && pin.lng].join('|');
  if (key === lastSimilarKey) return;
  lastSimilarKey = key;

  const notices = (typeof cachedNotices !== 'undefined' ? cachedNotices : []).filter(n =>
    cat && (n.category || n.zone) && (!n.category || n.category === cat) && (!n.zone || !zone || normalizePlace(n.zone) === normalizePlace(zone)));
  let html = notices.map(n => `<div class="p-3 rounded-xl border ${n.level === 'outage' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900'}">
      <div class="flex items-center gap-1.5 font-extrabold text-xs"><i data-lucide="megaphone" class="w-4 h-4"></i> Known issue: ${escapeHtml(n.title)}</div>
      ${n.body ? `<p class="text-[11px] mt-1 leading-relaxed">${escapeHtml(n.body)}</p>` : ''}</div>`).join('');

  let similar = [];
  if (cat && issue && !isConfidentialIssue(cat, issue)) {
    try { similar = await window.API.findSimilarTickets({ category: cat, subCategory: issue, location: zone ? zone + ' — ' : '', lat: pin && pin.lat, lng: pin && pin.lng, placeType: wiz.placeType && wiz.placeType.key }); }
    catch (e) { console.warn(e); }
  }
  if (similar.length) {
    html += `<div class="p-3 rounded-xl border border-blue-200 bg-blue-50">
      <div class="font-extrabold text-xs text-blue-900 flex items-center gap-1.5"><i data-lucide="users" class="w-4 h-4"></i> Already reported. Is it the same problem?</div>
      <p class="text-[11px] text-blue-800 mb-2">Press <strong>Me too</strong> instead of reporting it again. You'll get the same updates, and enough "Me too"s make it urgent.</p>
      <div class="space-y-1.5">${similar.map(t => `<div class="flex items-center gap-2 bg-white rounded-lg border border-blue-100 p-2">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(t.subCategory || ticketCategoryLabel(t))}</div>
            <div class="text-[10px] text-slate-500 truncate">${escapeHtml(t.location || '')}${t.distance != null ? ` · ${Math.round(t.distance)} m away` : ''} · ${escapeHtml(statusLabel(t))}</div>
            <div class="text-[10px] font-bold text-blue-700">${t.upvotes || 1} ${(t.upvotes || 1) === 1 ? 'person' : 'people'} affected${t.priority === 'High' ? ' · URGENT' : ''}</div>
          </div>
          ${t.mine ? '<span class="text-[10px] font-bold text-emerald-700 px-2">Already yours</span>'
            : `<button type="button" onclick="joinFromReport('${escapeHtml(t.id)}', this)" class="shrink-0 px-3 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Me too</button>`}
        </div>`).join('')}</div>
      <p class="text-[10px] text-blue-700 mt-2">Different problem? Just carry on below.</p></div>`;
  }
  panel.innerHTML = html;
  panel.classList.toggle('hidden', !html);
  if (window.lucide) lucide.createIcons();
}

async function joinFromReport(ticketId, btn) {
  btn.disabled = true; btn.textContent = 'Joining...';
  try {
    const r = await window.API.joinTicket(ticketId);
    closeComplaintModal();
    resetComplaintForm();
    showToast(`Added you to ${ticketId}. ${r.count} people affected.${r.escalated ? ' It is now URGENT.' : ''} You'll get its updates.`, 'success');
    switchStudentTab('Mine');
  } catch (err) {
    showToast(err.message, 'warning');
    btn.disabled = false; btn.textContent = 'Me too';
  }
}

// ---------- submit ----------
async function handleComplaintSubmit(e) {
  e.preventDefault();
  if (wiz.step !== 3) { wizardNext(); return; }
  if (!wiz.issue) { goStep(1); return showToast('Choose what the problem is.', 'warning'); }
  const placeErr = validatePlace();
  if (placeErr) { goStep(2); return showToast(placeErr, 'warning'); }
  const description = document.getElementById('modalDescription').value.trim();
  const phone = document.getElementById('modalPhone').value.trim();
  if (!description) return showToast('Please describe the problem.', 'warning');
  if (!phone) return showToast('Please add a contact number.', 'warning');
  const availabilityWindows = collectAvailabilityWindows();
  if (availabilityWindows === null) return;

  const { location } = currentLocationText();
  const isPublic = document.getElementById('modalIsPublic').checked;
  const payload = {
    category: wiz.cat,
    subCategory: wiz.issue,
    categoryDisplay: `${CATEGORY_LABELS[wiz.cat] || wiz.cat} — ${wiz.issue}`,
    customIssue: !!wiz.customIssue,
    placeType: wiz.placeType ? wiz.placeType.key : null,
    placeTypeLabel: wiz.placeType ? wiz.placeType.label : null,
    location, description, phone,
    priority: 'Normal',
    urgent: document.getElementById('modalUrgent').checked,
    isPublic, upvotes: isPublic ? 1 : 0, availabilityWindows,
  };
  if (typeof reportPin !== 'undefined' && reportPin) { payload.lat = reportPin.lat; payload.lng = reportPin.lng; payload.pinSource = reportPin.source; }

  const btn = document.getElementById('wizSubmit');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Sending...';
  btn.disabled = true;
  if (window.lucide) lucide.createIcons();
  try {
    const photoInput = document.getElementById('complaintPhotoInput');
    if (photoInput.files && photoInput.files.length) {
      // Confidential reports keep their photo inside Firestore (private), never
      // on Cloudinary, whose URLs are public.
      const keepPrivate = isConfidentialIssue(wiz.cat, wiz.issue);
      try { payload.photoUrl = await window.API.uploadFile(photoInput.files[0], 'ticket_proofs', { inline: keepPrivate }); }
      catch (upErr) { showToast('Photo not attached: ' + upErr.message, 'warning'); }
    }
    const newTicket = await window.API.createTicket(payload);
    rememberReport(payload);
    clearReportDraft();
    renderRecentReports();
    if (!cachedTickets.some(t => t.id === newTicket.id)) cachedTickets.unshift(newTicket);
    closeComplaintModal();
    resetComplaintForm();
    switchStudentTab('Mine');
    showToast(`Ticket ${newTicket.id} created${newTicket.assignedToName ? ` and given to ${newTicket.assignedToName}` : ''}.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed: ' + err.message, 'error');
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderCategoryTiles(); renderPlaceTypes(); renderRecentReports();
  const form = document.getElementById('reportForm');
  form?.addEventListener('input', saveReportDraft);
  form?.addEventListener('change', saveReportDraft);
  document.getElementById('recentReportChoices')?.addEventListener('click', (e) => {
    const button = e.target.closest('[data-recent-report]');
    if (button) useRecentReport(Number(button.dataset.recentReport));
  });
  document.getElementById('recentPlaceChoices')?.addEventListener('click', (e) => {
    const button = e.target.closest('[data-recent-place]');
    if (button) useRecentPlace(Number(button.dataset.recentPlace));
  });
});
