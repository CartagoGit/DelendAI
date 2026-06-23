/**
 * `renderHostBridge` — generates the `<script>` block that defines
 * `window.__MV_HOST__` BEFORE the `componentScript` runs. This is
 * the FIX for BUG T1 (toolbar inoperativo): the runtime fallback
 * was a no-op host `{dispatch: () => {}}` because the host never
 * injected `__MV_HOST__`. Now every webview that wants the shared
 * component runtime gets a working host bridge by appending the
 * result of `renderHostBridge()` to its `<body>` before the
 * `componentScript` block.
 *
 * The bridge:
 *   - Captures `acquireVsCodeApi()` ONCE per webview session (the
 *     API throws on subsequent calls — see bug K1).
 *   - Exposes `dispatch(actionId)` which posts `{command, action,
 *     commandId}` to the host. The action id is forwarded
 *     verbatim so the host can decide what to do (the toolbar uses
 *     the action id to look up the action's command, but the bridge
 *     ALSO includes `data-mv-command` if the element has it, so the
 *     host can shortcut that lookup).
 *   - Exposes `setLanguage(lang)` / `persistLanguage(lang)` for the
 *     language picker (the existing surface).
 *   - Tolerates non-VS Code hosts by checking `window.acquireVsCodeApi`
 *     is a function; otherwise the bridge exposes a no-op dispatch
 *     and posts nothing. The runtime's try/catch swallows any host
 *     rejection so a misconfigured host never throws into the UI.
 *
 * The returned string is safe to interpolate directly into the
 * webview HTML; all interpolation is constant.
 */
export const renderHostBridge = (): string =>
	`
<script>
(function () {
  'use strict';
  var vscode = (typeof window.acquireVsCodeApi === 'function')
    ? window.acquireVsCodeApi()
    : null;

  function post(payload) {
    if (!vscode) return;
    try { vscode.postMessage(payload); }
    catch (e) { console.error('[mv] postMessage failed:', e); }
  }

  function findActionEl(evt) {
    var t = evt && evt.target;
    if (!(t instanceof Element)) return null;
    return t.closest('[data-mv-action]');
  }

  window.__MV_HOST__ = {
    id: 'webview',
    dispatch: function (actionId, evt) {
      var el = evt && evt.originalEvent ? findActionEl(evt.originalEvent) : null;
      var commandId = el ? el.getAttribute('data-mv-command') : null;
      post({
        command: 'mvAction',
        action: actionId,
        commandId: commandId,
      });
    },
    setLanguage: function (lang) {
      post({ command: 'setLanguage', lang: lang });
    },
    persistLanguage: function (lang) {
      post({ command: 'persistLanguage', lang: lang });
    },
  };
})();
</script>
`.trim();
