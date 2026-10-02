function toggleClerkMenu() {
  const menu = document.getElementById('clerkMenuDropdown');
  if (!menu) return;
  if (menu.classList.contains('hidden')) { menu.classList.remove('hidden'); menu.classList.add('animate-slide-down'); }
  else menu.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('clerkUserButton'), dd = document.getElementById('clerkMenuDropdown');
  if (dd && !dd.classList.contains('hidden') && btn && !btn.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
});

// ─── STAFF PROFILE & STATUS TOGGLE ───
let currentStaffTechId = null;
let currentStaffEmail = null;
let currentStaffStatus = 'On Duty';

function getCurrentTech() {
  if (currentStaffTechId) {
    const t = cachedTechnicians.find(x => x.firebaseId === currentStaffTechId);
    if (t) return t;
  }
  if (currentStaffEmail) return cachedTechnicians.find(x => (x.email || '').toLowerCase() === currentStaffEmail) || null;
  return null;
}

function initStaffDashboard(email, techId) {
  currentStaffEmail = (email || '').toLowerCase();
  currentStaffTechId = techId || null;
  syncStaffProfile();
}

// Called on every technicians snapshot so status stays in sync across devices
function syncStaffProfile() {
  if (currentRole !== 'staff') return;
  const tech = getCurrentTech();
  if (!tech) return;
  currentStaffTechId = tech.firebaseId;
  currentStaffStatus = tech.status || 'On Duty';
  renderStaffStatusButton();
}

function renderStaffStatusButton() {
  const btn = document.getElementById('staffStatusToggleBtn');
  if (!btn) return;
  const on = currentStaffStatus === 'On Duty';
  btn.className = `self-start sm:self-auto inline-flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-full border text-sm font-bold transition-colors btn-press ${on ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`;
  btn.title = on ? 'Tap to go off duty' : 'Tap to go on duty';
  btn.innerHTML = `<span class="relative inline-flex w-9 h-5 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}"><span class="absolute top-0.5 ${on ? 'left-[18px]' : 'left-0.5'} w-4 h-4 rounded-full bg-white shadow transition-all"></span></span>${on ? 'On Duty' : 'Off Duty'}`;
}

async function toggleStaffStatus() {
  const tech = getCurrentTech();
  if (!tech) {
    showToast("Your technician profile is still loading. Try again in a moment.", "warning");
    return;
  }
  const newStatus = currentStaffStatus === 'On Duty' ? 'Off Duty' : 'On Duty';
  const btn = document.getElementById('staffStatusToggleBtn');
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Updating...`;
  if (window.lucide) lucide.createIcons();

  try {
    // The Staff Service publishes "technician.onDuty"; the Assignment Service
    // reacts by giving this technician any tickets waiting for their team.
    const r = await window.API.updateTechnicianStatus(tech.firebaseId, newStatus);
    currentStaffStatus = newStatus;
    showToast(`Status updated to ${newStatus}`, "success");
    if (r && r.assigned) showToast(`${r.assigned} waiting ticket${r.assigned > 1 ? 's were' : ' was'} assigned to you.`, 'info');
  } catch (err) {
    console.error(err);
    showToast("Failed to update status: " + err.message, "error");
  } finally {
    renderStaffStatusButton();
  }
}

// Staff "Update Profile Photo" → goes to Admin for approval
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('staffProfileUpdateForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('updateProfilePhotoInput');
    if (!input.files || input.files.length === 0) return showToast('Please choose a photo first.', 'warning');
    const tech = getCurrentTech();
    if (!tech) return showToast('Your technician profile could not be found.', 'error');

    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Submitting...`;
    btn.disabled = true;
    try {
      const url = await window.API.uploadFile(input.files[0], 'profile_photos');
      await window.API.submitProfilePhotoRequest(tech.firebaseId, tech.name, url);
      showToast('Profile picture submitted for Administrator verification.', 'success');
      hideModal('staffProfileUpdateModal');
      form.reset();
      handleFileUpload(input, 'updateProfilePhotoName');
    } catch (err) {
      console.error(err);
      showToast('Failed: ' + err.message, 'error');
    } finally {
      btn.innerHTML = orig;
      btn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }
  });
});
