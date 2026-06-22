/**
 * `runtime` — minimal client-side dispatcher for webviews.
 *
 * Reads the `componentScript` below and exposes `mv.runtime` so the
 * host can attach it to `window` (or just inject the script inline).
 * Handles three delegations:
 *   - `data-mv-action`   → calls `host.dispatch(actionId, evt)`
 *   - `data-mv-toggle`   → for `dropdown`, opens/closes the menu
 *   - `data-mv-lang`     → reads the new value and calls
 *                         `host.setLanguage(lang)` + `host.persistLanguage(lang)`
 *   - `data-mv-toast-ttl` → auto-removes the toast after the ttl
 *
 * Pure string (no DOM mount). Inject via `<script>${componentScript}</script>`
 * after the webview's body content.
 */

import type { IHostAdapter } from '../contracts/interfaces/host-adapter.interface';

export interface IComponentRuntimeHost extends Pick<IHostAdapter, 'id'> {
	/** Dispatch a `data-mv-action` event. The action id is `string` (stable). */
	dispatch(actionId: string, evt: { originalEvent: Event }): void;
	/** Update the host's language. */
	setLanguage(lang: string): void;
	/** Persist the language choice (e.g. `globalState`). */
	persistLanguage(lang: string): void;
}

/** The component script (a single template-literal string). */
export const componentScript: string = `
(function () {
  'use strict';
  var host = window.__MV_HOST__ || { id: 'web', dispatch: function () {}, setLanguage: function () {}, persistLanguage: function () {} };
  var openDropdowns = new Set();

  function closeAllDropdowns(exceptId) {
    document.querySelectorAll('.mv-dropdown__trigger[aria-expanded="true"]').forEach(function (t) {
      var id = t.getAttribute('data-mv-dropdown-id');
      if (id && id !== exceptId) {
        t.setAttribute('aria-expanded', 'false');
        var menu = document.getElementById(id + '-menu');
        if (menu) menu.hidden = true;
        openDropdowns.delete(id);
      }
    });
  }

  function toggleDropdown(id) {
    var trigger = document.querySelector('.mv-dropdown__trigger[data-mv-dropdown-id="' + id + '"]');
    var menu = document.getElementById(id + '-menu');
    if (!trigger || !menu) return;
    var open = trigger.getAttribute('aria-expanded') === 'true';
    if (open) {
      trigger.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
      openDropdowns.delete(id);
    } else {
      closeAllDropdowns(id);
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      openDropdowns.add(id);
    }
  }

  // Delegated click handler.
  // data-mv-toggle dispatch: handled per-type below (dropdown / disclosure).
  document.addEventListener('click', function (evt) {
    var target = evt.target;
    if (!(target instanceof Element)) return;

    // Dropdown trigger → toggle.
    var trigger = target.closest('.mv-dropdown__trigger');
    if (trigger) {
      var id = trigger.getAttribute('data-mv-dropdown-id');
      if (id) { toggleDropdown(id); evt.preventDefault(); return; }
    }

    // Dropdown item → dispatch + close.
    var item = target.closest('[data-mv-action]');
    if (item) {
      var action = item.getAttribute('data-mv-action');
      var dropdownId = item.getAttribute('data-mv-dropdown-id');
      if (action) {
        try { host.dispatch(action, { originalEvent: evt }); } catch (e) { console.error('[mv] dispatch failed:', e); }
      }
      if (dropdownId) { closeAllDropdowns(null); }
      return;
    }

    // Outside click → close all open dropdowns.
    if (!target.closest('.mv-dropdown')) closeAllDropdowns(null);
  });

  // Esc → close all dropdowns.
  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') closeAllDropdowns(null);
  });

  // Language picker change.
  document.addEventListener('change', function (evt) {
    var target = evt.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute('data-mv-lang')) {
      var lang = target.value;
      try {
        host.setLanguage(lang);
        host.persistLanguage(lang);
      } catch (e) { console.error('[mv] setLanguage failed:', e); }
    }
  });

  // Toast auto-remove.
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-mv-toast-ttl]').forEach(function (el) {
      var ttl = parseInt(el.getAttribute('data-mv-toast-ttl') || '0', 10);
      if (ttl > 0) setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ttl);
    });
  });
  // Also handle toasts that appear after DOMContentLoaded (rare).
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n instanceof Element && n.hasAttribute('data-mv-toast-ttl')) {
          var ttl = parseInt(n.getAttribute('data-mv-toast-ttl') || '0', 10);
          if (ttl > 0) setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, ttl);
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`.trim();

/**
 * `renderRuntime` — returns the `<script>` block to inject into the
 * webview. The host must expose `window.__MV_HOST__` matching the
 * `IComponentRuntimeHost` shape before this script runs (e.g. via
 * `<script>window.__MV_HOST__ = { ... }</script>` placed BEFORE the
 * runtime script).
 */
export const renderRuntime = (): string =>
	`<script>${componentScript}</script>`;
