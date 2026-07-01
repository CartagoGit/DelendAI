import type { IExtensionSettings } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { escapeHtml } from '../dashboard/format';
import { extensionText } from '../i18n/extension-text';
import { renderComponentCssTokenRootCss } from '../styles/component-css';

export interface IRenderSettingsOptions {
	readonly settings: IExtensionSettings;
	readonly saveCommand: string;
	readonly resetCommand: string;
	readonly lang: ILangDict;
}

const selected = (actual: string, expected: string): string =>
	actual === expected ? ' selected' : '';

/**
 * `CLIENT_SCRIPT` — the form's submit/reset handler. The previous
 * version had no script at all, so Save/Reset were native DOM
 * submit/reset events with no host bridge (BUG S1: settings could
 * never persist). We now capture the form submit, serialize the
 * fields into a plain object, and post it to the host as
 * `{command: 'save', settings: {...}}`. The host is responsible for
 * persisting via the injected `ISettingsStore`. Reset posts
 * `{command: 'reset'}` and the host re-renders the form with the
 * defaults. We also surface a brief inline confirmation so the user
 * knows the action took effect.
 */
const quoted = (value: string): string => JSON.stringify(value);

const clientScript = (savedMessage: string, resetMessage: string): string => `
(function () {
  'use strict';
  const vscode = (typeof window.acquireVsCodeApi === 'function')
    ? window.acquireVsCodeApi()
    : null;

  function readForm(form) {
    const out = {};
    new FormData(form).forEach(function (value, key) { out[key] = value; });
    // f00062 H13: post booleans as booleans, not 'true' / 'false' strings.
    // The host's Zod parse (ExtensionSettingsSchema) rejects strings where
    // booleans are declared — emitting 'true' / 'false' would round-trip
    // back as a malformed payload. The schema is the single source of truth.
    out.allowLocalhost = form.querySelector('[name="allowLocalhost"]').checked;
    out.allowPrivateIps = form.querySelector('[name="allowPrivateIps"]').checked;
    return out;
  }

  function flash(msg) {
    let banner = document.getElementById('mv-settings-banner');
    if (!banner) {
      banner = document.createElement('p');
      banner.id = 'mv-settings-banner';
      banner.className = 'mv-banner';
      const form = document.querySelector('form');
      if (form) form.parentNode.insertBefore(banner, form);
    }
    banner.textContent = msg;
  }

  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', function (evt) {
      evt.preventDefault();
      const settings = readForm(form);
      if (vscode) vscode.postMessage({ command: 'save', settings: settings });
			flash(${quoted(savedMessage)});
    });
    form.addEventListener('reset', function (evt) {
      // Defer to native reset so the form fields visibly clear,
      // then notify the host. The host may respond with a fresh
      // \`renderSettings\` call that overrides the visual state.
      setTimeout(function () {
        if (vscode) vscode.postMessage({ command: 'reset' });
				flash(${quoted(resetMessage)});
      }, 0);
    });
  }
})();
`.trim();

export const renderSettings = (options: IRenderSettingsOptions): string => {
	const { settings } = options;
	const text = (key: string) => extensionText(options.lang, key);
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(text('settings.title'))}</title>
	<style>
		${renderComponentCssTokenRootCss()}
		body {
			font-family: var(--vscode-font-family, system-ui);
			padding: 16px;
			color: var(--mv-fg-primary);
			background: var(--mv-bg-primary);
		}
		h1 { font-size: 16px; margin: 0 0 16px; }
		label {
			display: block;
			margin: 0 0 12px;
			color: var(--mv-fg-primary);
			font-size: 12px;
		}
		/* FIX (S2): inputs and selects previously inherited the
		   browser's default light styling, which clashed with
		   dark and high-contrast themes. We now bind every
		   interactive element to the host's design tokens. */
		input[type="text"],
		input[type="url"],
		select {
			display: block;
			width: 100%;
			max-width: 520px;
			margin-top: 4px;
			padding: 6px 8px;
			font: inherit;
			color: var(--vscode-input-foreground, #c9d1d9);
			background: var(--vscode-input-background, #0d1117);
			border: 1px solid var(--vscode-input-border, #30363d);
			border-radius: 4px;
			outline: none;
		}
		input[type="text"]:focus,
		input[type="url"]:focus,
		select:focus {
			border-color: var(--vscode-focusBorder, #007acc);
		}
		input[type="checkbox"] {
			accent-color: var(--vscode-focusBorder, #007acc);
			vertical-align: middle;
		}
		.mv-actions { display: flex; gap: 8px; margin-top: 16px; }
		.mv-actions button {
			padding: 6px 14px;
			font: inherit;
			color: var(--vscode-button-foreground, #ffffff);
			background: var(--vscode-button-background, #007acc);
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 4px;
			cursor: pointer;
		}
		.mv-actions button:hover {
			background: var(--vscode-button-hoverBackground, #1f8ad2);
		}
		.mv-actions button[type="reset"] {
			color: var(--vscode-button-secondaryForeground, #c9d1d9);
			background: var(--vscode-button-secondaryBackground, #3a3d41);
		}
		.mv-actions button[type="reset"]:hover {
			background: var(--vscode-button-secondaryHoverBackground, #45494e);
		}
		.mv-banner {
			margin: 0 0 12px;
			padding: 8px 12px;
			font-size: 12px;
			color: var(--vscode-notificationsInfo-foreground, #c9d1d9);
			background: var(--vscode-notificationsInfo-background, #007acc20);
			border-left: 3px solid var(--vscode-notificationsInfo-border, #007acc);
			border-radius: 3px;
			min-height: 1em;
		}
	</style>
</head>
<body>
	<h1>${escapeHtml(text('settings.title'))}</h1>
	<form data-save-command="${escapeHtml(options.saveCommand)}" data-reset-command="${escapeHtml(options.resetCommand)}">
		<label>${escapeHtml(text('settings.docsUrl'))}
			<input name="docsUrl" type="url" value="${escapeHtml(settings.docsUrl)}" />
		</label>
		<label>
			<input type="checkbox" name="allowLocalhost"${settings.allowLocalhost ? ' checked' : ''} />
			${escapeHtml(text('settings.allowLocalhostDocsUrl'))}
		</label>
		<label>
			<input type="checkbox" name="allowPrivateIps"${settings.allowPrivateIps ? ' checked' : ''} />
			${escapeHtml(text('settings.allowPrivateIpsDocsUrl'))}
		</label>
		<label>${escapeHtml(text('settings.logLevel'))}
			<select name="logLevel">
				<option value="debug"${selected(settings.logLevel, 'debug')}>${escapeHtml(text('settings.logLevel.debug'))}</option>
				<option value="info"${selected(settings.logLevel, 'info')}>${escapeHtml(text('settings.logLevel.info'))}</option>
				<option value="warn"${selected(settings.logLevel, 'warn')}>${escapeHtml(text('settings.logLevel.warn'))}</option>
				<option value="error"${selected(settings.logLevel, 'error')}>${escapeHtml(text('settings.logLevel.error'))}</option>
			</select>
		</label>
		<label>${escapeHtml(text('settings.theme'))}
			<select name="theme">
				<option value="system"${selected(settings.theme, 'system')}>${escapeHtml(text('settings.theme.system'))}</option>
				<option value="light"${selected(settings.theme, 'light')}>${escapeHtml(text('settings.theme.light'))}</option>
				<option value="dark"${selected(settings.theme, 'dark')}>${escapeHtml(text('settings.theme.dark'))}</option>
			</select>
		</label>
		<div class="mv-actions">
			<button type="submit">${escapeHtml(text('settings.save'))}</button>
			<button type="reset">${escapeHtml(text('settings.reset'))}</button>
		</div>
	</form>
	<script>${clientScript(text('settings.saved'), text('settings.resetToDefaults'))}</script>
</body>
</html>`;
};
