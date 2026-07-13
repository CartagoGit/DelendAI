export const configurationCenterScript = (): string => `
(function () {
  'use strict';
  var root = document.querySelector('[data-mcpv-configuration-center]');
  if (!root) return;
  var edits = new Map();
  var save = root.querySelector('[data-config-save]');
  var discard = root.querySelector('[data-config-discard]');
  var status = root.querySelector('[data-config-status]');
  var initialDigest = root.getAttribute('data-config-digest') || '';

  function post(message) {
    var host = window.__MCPV_CONFIGURATION_HOST__;
    if (host && typeof host.post === 'function') {
      host.post(message);
      return;
    }
    window.dispatchEvent(new CustomEvent('mcpv-configuration-message', { detail: message }));
  }

  function activateTab(id, focus) {
    var tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (tab) {
      var active = tab.getAttribute('data-config-tab') === id;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
      if (active && focus) tab.focus();
    });
    root.querySelectorAll('[role="tabpanel"]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-config-panel') !== id;
    });
  }

  root.querySelectorAll('[role="tab"]').forEach(function (tab) {
    tab.addEventListener('click', function () { activateTab(tab.getAttribute('data-config-tab'), false); });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      var tabs = Array.from(root.querySelectorAll('[role="tab"]'));
      var index = tabs.indexOf(tab);
      var delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      var next = tabs[(index + delta + tabs.length) % tabs.length];
      activateTab(next.getAttribute('data-config-tab'), true);
    });
  });

  function markDirty() {
    var dirty = edits.size > 0;
    root.setAttribute('data-dirty', dirty ? 'true' : 'false');
    if (save) save.disabled = !dirty || root.querySelector('[data-invalid="true"]') !== null;
    if (discard) discard.disabled = !dirty;
    if (status) status.textContent = dirty ? root.getAttribute('data-copy-restart') || '' : '';
  }

  function valueOf(control, kind) {
    if (kind === 'boolean') return control.checked;
    if (kind === 'number') return control.value === '' ? null : Number(control.value);
    if (kind === 'json' || kind === 'unsupported') return JSON.parse(control.value);
    return control.value;
  }

  root.querySelectorAll('[data-config-path]').forEach(function (control) {
    control.addEventListener('change', function () {
      var field = control.closest('.mcpv-config__field');
      try {
        var path = JSON.parse(control.getAttribute('data-config-path'));
        var kind = control.getAttribute('data-config-kind');
        var remove = control.getAttribute('data-config-optional') === 'true' && kind !== 'boolean' && control.value === '';
        if (remove) edits.set(JSON.stringify(path), { action: 'delete', path: path });
        else edits.set(JSON.stringify(path), { action: 'set', path: path, value: valueOf(control, kind) });
        if (field) field.setAttribute('data-invalid', 'false');
      } catch (_) {
        if (field) field.setAttribute('data-invalid', 'true');
      }
      markDirty();
    });
  });

  var search = root.querySelector('[data-config-search]');
  if (search) search.addEventListener('input', function () {
    var query = search.value.trim().toLocaleLowerCase();
    root.querySelectorAll('[data-config-search-text]').forEach(function (entry) {
      var text = (entry.getAttribute('data-config-search-text') || '').toLocaleLowerCase();
      entry.setAttribute('data-search-hidden', query && !text.includes(query) ? 'true' : 'false');
    });
  });

  if (save) save.addEventListener('click', function () {
    if (save.disabled) return;
    save.disabled = true;
    root.setAttribute('data-state', 'saving');
    post({ command: 'saveConfiguration', expectedDigest: initialDigest, edits: Array.from(edits.values()) });
  });
  if (discard) discard.addEventListener('click', function () {
    post({ command: 'discardConfiguration' });
  });

  window.addEventListener('message', function (event) {
    var message = event.data || {};
    if (message.command === 'configurationSaved') {
      edits.clear();
      initialDigest = typeof message.digest === 'string' ? message.digest : initialDigest;
      root.setAttribute('data-config-digest', initialDigest);
      root.setAttribute('data-state', 'ready');
      markDirty();
      if (status) status.textContent = root.getAttribute('data-copy-saved') || '';
    }
    if (message.command === 'configurationConflict') {
      root.setAttribute('data-state', 'conflict');
      if (status) status.textContent = root.getAttribute('data-copy-conflict') || '';
      if (save) save.disabled = true;
    }
    if (message.command === 'configurationInvalid') {
      root.setAttribute('data-state', 'invalid');
      if (status) status.textContent = root.getAttribute('data-copy-invalid') || '';
      if (save) save.disabled = true;
    }
  });
  markDirty();
})();
`;
