// ─── PROFILE: everyone on campus (students, faculty, non-teaching staff) ───
// First sign-in asks who you are and where you usually are, so every report
// is pre-filled and the admin knows whether a faculty member, the librarian
// or a student raised it.
let myProfile = null;

const USER_TYPE_LABEL = { student: 'Student', faculty: 'Faculty', staff: 'Non-teaching staff' };
function userTypeLabel(t) { return USER_TYPE_LABEL[t] || 'Campus user'; }

// No fixed list of campus places: the user picks a kind of place and types its name.
function renderProfilePlaceTypes(selected) {
  const sel = document.getElementById('profilePlaceType');
  sel.innerHTML = '<option value="">Choose...</option>' + PLACE_TYPES.map(t => `<option value="${t.key}" ${t.key === selected ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
  onProfilePlaceType();
}

function onProfilePlaceType() {
  const t = placeTypeByKey(document.getElementById('profilePlaceType').value);
  document.getElementById('profileZoneLabel').textContent = t ? t.nameLabel : 'Name';
  document.getElementById('profileZone').placeholder = t ? t.namePlaceholder : 'Type the name';
  document.getElementById('profileSpotLabel').textContent = t ? t.spotLabel : 'Room number';
  document.getElementById('profileSpot').placeholder = t ? t.spotPlaceholder : 'e.g. 214';
  fillDatalist('profilePlaceSuggestions', knownPlaces(t ? t.key : ''));
}

function onProfileTypeChange() {
  const type = document.querySelector('input[name="profileType"]:checked')?.value;
  document.querySelectorAll('.ptype-card').forEach(c => c.classList.toggle('active', c.querySelector('input').checked));
  document.getElementById('profileDept').placeholder = type === 'student' ? 'e.g. B.Tech CSE, 2nd year' : type === 'faculty' ? 'e.g. Computer Science' : 'e.g. Library, Accounts';
  document.getElementById('profileDeptLabel').textContent = type === 'student' ? 'Programme' : type === 'faculty' ? 'Department' : 'Office / section';
  document.getElementById('profileIdLabel').textContent = type === 'student' ? 'Roll number' : 'Employee ID (optional)';
}

function openProfileModal(forced) {
  hideEl('clerkMenuDropdown');
  const p = myProfile || {};
  const user = window.API.getCurrentUser();
  document.getElementById('profileName').value = p.name || (user && user.displayName) || '';
  document.getElementById('profileEmail').textContent = user ? user.email : '';
  document.querySelectorAll('input[name="profileType"]').forEach(r => { r.checked = r.value === (p.userType || (user && /^\d/.test(user.email) ? 'student' : '')); });
  onProfileTypeChange();
  document.getElementById('profileDept').value = p.department || '';
  document.getElementById('profileIdNo').value = p.idNumber || '';
  document.getElementById('profilePhone').value = p.phone || '';
  renderProfilePlaceTypes(p.placeType || '');
  document.getElementById('profileZone').value = p.zone || '';
  document.getElementById('profileSpot').value = p.spot || '';
  document.getElementById('profileForcedNote').classList.toggle('hidden', !forced);
  document.getElementById('profileClose').classList.toggle('hidden', !!forced);
  showModal('profileModal');
}

async function saveProfile(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="profileType"]:checked')?.value;
  if (!type) return showToast('Please choose: Student, Faculty or Non-teaching staff.', 'warning');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    myProfile = await window.API.saveMyProfile({
      name: document.getElementById('profileName').value,
      userType: type,
      department: document.getElementById('profileDept').value,
      idNumber: document.getElementById('profileIdNo').value,
      phone: document.getElementById('profilePhone').value,
      placeType: document.getElementById('profilePlaceType').value,
      zone: document.getElementById('profileZone').value.trim(),
      spot: document.getElementById('profileSpot').value,
    });
    hideModal('profileModal');
    applyProfileToUI();
    showToast('Profile saved.', 'success');
  } catch (err) {
    showToast('Could not save: ' + err.message, 'error');
  } finally { btn.disabled = false; }
}

function applyProfileToUI() {
  if (!myProfile) return;
  if (currentRole === 'student') {
    document.getElementById('authBadgeRole').textContent = userTypeLabel(myProfile.userType).toUpperCase() + ' PORTAL';
    document.getElementById('clerkMenuName').textContent = myProfile.name;
    const user = window.API && window.API.getCurrentUser && window.API.getCurrentUser();
    setAvatar(document.getElementById('clerkUserButton'), myProfile.photoURL || (user && user.photoURL), myProfile.name);
  }
}

// Called after a campus user signs in
async function loadMyProfile() {
  try {
    myProfile = await window.API.getMyProfile(true);
    if (!myProfile) setTimeout(() => openProfileModal(true), 500);
    else applyProfileToUI();
  } catch (e) { console.warn(e); }
}
