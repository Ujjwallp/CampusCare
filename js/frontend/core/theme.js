// ─── THEME (light / dark / auto-system) ───
// A single toggle in the top nav cycles Auto → Light → Dark. "Auto" follows the
// operating-system setting. The choice is saved per browser. The <head> script
// has already applied the right theme before first paint (no flash); this file
// wires the button and reacts to OS changes while on Auto.
(function () {
  const KEY = 'campuscare_theme';
  const ORDER = ['system', 'light', 'dark'];
  const ICON = { system: 'monitor', light: 'sun', dark: 'moon' };
  const LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' };

  function getPref() { try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; } }
  function systemDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function isDark(pref) { return pref === 'dark' || (pref === 'system' && systemDark()); }

  function updateThemeToggle(pref) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.setAttribute('title', 'Theme: ' + LABEL[pref]);
    btn.setAttribute('aria-label', 'Theme: ' + LABEL[pref] + ' — click to change');
    btn.innerHTML = '<i data-lucide="' + ICON[pref] + '" class="w-5 h-5"></i>';
    if (window.lucide) lucide.createIcons();
  }
  window.updateThemeToggle = updateThemeToggle;

  window.applyTheme = function (pref) {
    pref = ORDER.includes(pref) ? pref : 'system';
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    const dark = isDark(pref);
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', pref);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b1220' : '#262262');
    updateThemeToggle(pref);
  };

  window.cycleTheme = function () {
    const next = ORDER[(ORDER.indexOf(getPref()) + 1) % ORDER.length];
    window.applyTheme(next);
    if (typeof showToast === 'function') showToast('Theme set to ' + LABEL[next], 'success');
  };

  // Follow the OS while the user is on "Auto".
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (getPref() === 'system') window.applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  document.addEventListener('DOMContentLoaded', () => updateThemeToggle(getPref()));
})();
