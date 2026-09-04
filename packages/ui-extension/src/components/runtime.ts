/**
 * `runtime` — minimal client-side dispatcher for webviews.
 *
 * Reads the `componentScript` below and exposes `mv.runtime` so the
 * host can attach it to `window` (or just inject the script inline).
 * Handles three delegations:
 *   - `data-delendai-action`   → calls `host.dispatch(actionId, evt)`
 *   - `data-delendai-toggle`   → for `dropdown`, opens/closes the menu
 *   - `data-delendai-lang`     → reads the new value and calls
 *                         `host.setLanguage(lang)` + `host.persistLanguage(lang)`
 *   - `data-delendai-toast-ttl` → auto-removes the toast after the ttl
 *
 * Pure string (no DOM mount). Inject via `<script>${componentScript}</script>`
 * after the webview's body content.
 */

import type { IHostAdapter } from '../contracts/interfaces/host-adapter.interface';

export interface IComponentRuntimeHost extends Pick<IHostAdapter, 'id'> {
	/** Dispatch a `data-delendai-action` event. The action id is `string` (stable). */
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
  var host = window.__MCPV_HOST__ || { id: 'web', dispatch: function () {}, setLanguage: function () {}, persistLanguage: function () {} };
  var openDropdowns = new Set();

  // Mirror the open state onto the wrapper's data-open attribute so
  // the host CSS can drive the transition without a JS-side class
  // flip. We keep aria-expanded on the trigger (a11y) and hidden on
  // the panel (a11y tree removal) in lockstep with data-open.
  function setDropdownOpen(trigger, menu, wrapper, open) {
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      menu.removeAttribute('hidden');
      if (wrapper) wrapper.setAttribute('data-open', '');
    } else {
      menu.setAttribute('hidden', '');
      if (wrapper) wrapper.removeAttribute('data-open');
    }
  }

  function closeAllDropdowns(exceptId) {
    document.querySelectorAll('[data-delendai-toggle="dropdown"][aria-expanded="true"]').forEach(function (t) {
      var id = t.getAttribute('data-delendai-dropdown-id');
      if (id && id !== exceptId) {
        var menu = document.getElementById(id + '-menu');
        var wrapper = t.closest('[data-delendai-dropdown]');
        setDropdownOpen(t, menu, wrapper, false);
        openDropdowns.delete(id);
      }
    });
  }

  function toggleDropdown(id) {
    var trigger = document.querySelector('[data-delendai-toggle="dropdown"][data-delendai-dropdown-id="' + id + '"]');
    var menu = document.getElementById(id + '-menu');
    if (!trigger || !menu) return;
    var open = trigger.getAttribute('aria-expanded') === 'true';
    if (open) {
      setDropdownOpen(trigger, menu, trigger.closest('[data-delendai-dropdown]'), false);
      openDropdowns.delete(id);
    } else {
      closeAllDropdowns(id);
      setDropdownOpen(trigger, menu, trigger.closest('[data-delendai-dropdown]'), true);
      openDropdowns.add(id);
    }
  }

  // Delegated click handler.
  // data-delendai-toggle dispatch: handled per-type below (dropdown / disclosure).
  // The trigger / wrapper selectors stay attribute-based (data-delendai-toggle,
  // data-delendai-dropdown) so the runtime works with whatever classPrefix the
  // host passed to renderDropdown -- including the docs site's nav__more
  // (the trigger is .nav__more__trigger but it still carries the same
  // data-delendai-toggle="dropdown" contract).
  document.addEventListener('click', function (evt) {
    var target = evt.target;
    if (!(target instanceof Element)) return;

    // Dropdown trigger → toggle.
    var trigger = target.closest('[data-delendai-toggle="dropdown"]');
    if (trigger) {
      var id = trigger.getAttribute('data-delendai-dropdown-id');
      if (id) { toggleDropdown(id); evt.preventDefault(); return; }
    }

    // Sticky toast close button → dismiss + notify host.
    var toastClose = target.closest('[data-delendai-toast-close]');
    if (toastClose) {
      var closeId = toastClose.getAttribute('data-delendai-toast-close');
      dismissToast(document.getElementById(closeId));
      evt.preventDefault();
      return;
    }

    // Dropdown item → dispatch + close.
    var item = target.closest('[data-delendai-action]');
    if (item) {
      var action = item.getAttribute('data-delendai-action');
      var dropdownId = item.getAttribute('data-delendai-dropdown-id');
      if (action) {
        try { host.dispatch(action, { originalEvent: evt }); } catch (_) {}
      }
      if (dropdownId) { closeAllDropdowns(null); }
      return;
    }

    // Outside click → close all open dropdowns.
    if (!target.closest('[data-delendai-dropdown]')) closeAllDropdowns(null);
  });

  // Dismiss a toast: remove it from the DOM and fire a cancelable
  // 'delendai-toast-dismiss' custom event the host can listen to (e.g. to
  // record that the user dismissed a sticky toast).
  function dismissToast(el) {
    if (!el || !el.parentNode) return;
    var id = el.getAttribute('data-delendai-toast');
    document.dispatchEvent(new CustomEvent('delendai-toast-dismiss', {
      bubbles: true,
      detail: { id: id },
    }));
    el.parentNode.removeChild(el);
  }

  // Esc → close all dropdowns, then dismiss the most recent sticky toast.
  document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape') return;
    closeAllDropdowns(null);
    var stickies = document.querySelectorAll('[data-delendai-toast-sticky="true"]');
    if (stickies.length > 0) dismissToast(stickies[stickies.length - 1]);
  });

  // Language picker change.
  document.addEventListener('change', function (evt) {
    var target = evt.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute('data-delendai-lang')) {
      var lang = target.value;
      try {
        host.setLanguage(lang);
        host.persistLanguage(lang);
      } catch (_) {}
    }
  });

  // Toast auto-remove.
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-delendai-toast-ttl]').forEach(function (el) {
      var ttl = parseInt(el.getAttribute('data-delendai-toast-ttl') || '0', 10);
      if (ttl > 0) setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ttl);
    });

    // f00099-style icon-fallback wiring: when a [data-delendai-icon]
    // wrapper's <img> fails to load, mark the wrapper as broken
    // so the shared SCSS hides the image and reveals the
    // first-letter fallback span. The renderer never emits
    // inline onerror handlers — every host that injects
    // renderRuntime() gets this behaviour for free.
    document.querySelectorAll('[data-delendai-icon] > img').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) {
        img.parentNode.classList.add('is-broken');
      }
      img.addEventListener('error', function () {
        img.parentNode.classList.add('is-broken');
      });
      img.addEventListener('load', function () {
        img.parentNode.classList.remove('is-broken');
      });
    });
  });
  // Also handle toasts that appear after DOMContentLoaded (rare).
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n instanceof Element && n.hasAttribute('data-delendai-toast-ttl')) {
          var ttl = parseInt(n.getAttribute('data-delendai-toast-ttl') || '0', 10);
          if (ttl > 0) setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, ttl);
        }
        // Same wiring for icons that mount after DOMContentLoaded
        // (e.g. tabs inserted by a dynamic view switch).
        if (n instanceof Element && n.hasAttribute('data-delendai-icon')) {
          bindIconFallback(n);
        }
        if (n instanceof Element) {
          var icons = n.querySelectorAll ? n.querySelectorAll('[data-delendai-icon]') : [];
          icons.forEach(bindIconFallback);
        }
      });
    });
  });
  function bindIconFallback(wrapper) {
    if (!wrapper || wrapper.dataset.mcpvIconBound === '1') return;
    wrapper.dataset.mcpvIconBound = '1';
    var img = wrapper.querySelector('img');
    if (!img) return;
    if (img.complete && img.naturalWidth === 0) {
      wrapper.classList.add('is-broken');
    }
    img.addEventListener('error', function () {
      wrapper.classList.add('is-broken');
    });
    img.addEventListener('load', function () {
      wrapper.classList.remove('is-broken');
    });
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`.trim();

/**
 * `renderRuntime` — returns the `<script>` block to inject into the
 * webview. The host must expose `window.__MCPV_HOST__` matching the
 * `IComponentRuntimeHost` shape before this script runs (e.g. via
 * `<script>window.__MCPV_HOST__ = { ... }</script>` placed BEFORE the
 * runtime script).
 */
export const renderRuntime = (): string =>
	`<script>${componentScript}</script>`;
