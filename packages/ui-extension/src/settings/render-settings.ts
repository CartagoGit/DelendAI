import {
	HOST_LANGUAGE_CHOICES,
	HOST_LOG_LEVELS,
	HOST_MOTION_CHOICES,
	HOST_THEME_CHOICES,
	type IExtensionSettings,
} from '@delendai/client';
import {
	languages,
	settingsTranslations,
	type ILangDict,
	type ISettingsTranslations,
} from '@delendai/shared/i18n';

import { escapeHtml } from '../dashboard/format';
import { renderComponentCssTokenRootCss } from '../styles/component-css';

export interface IRenderSettingsOptions {
	readonly settings: IExtensionSettings;
	readonly saveCommand: string;
	readonly resetCommand: string;
	readonly lang: ILangDict;
}

const selected = (actual: string, expected: string): string =>
	actual === expected ? ' selected' : '';

const quoted = (value: string): string => JSON.stringify(value);

/**
 * Webview request/ack bridge. Save and reset remain pending until the host
 * acknowledges the matching request; stale replies cannot overwrite a newer
 * action and a rejected write is never announced as successful.
 */
const clientScript = (copy: ISettingsTranslations): string =>
	`
(function () {
  'use strict';
  const vscode = (typeof window.acquireVsCodeApi === 'function')
    ? window.acquireVsCodeApi()
    : null;
  const form = document.getElementById('delendai-settings-form');
  const banner = document.getElementById('delendai-settings-banner');
  const sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  let sequence = 0;
  let pending = null;

  function readForm() {
    const out = {};
    new FormData(form).forEach(function (value, key) { out[key] = value; });
    out.allowLocalhost = form.querySelector('[name="allowLocalhost"]').checked;
    out.allowPrivateIps = form.querySelector('[name="allowPrivateIps"]').checked;
    return out;
  }

  function applySettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    Object.keys(settings).forEach(function (key) {
      const field = form.elements.namedItem(key);
      if (!field) return;
      if (field.type === 'checkbox') field.checked = settings[key] === true;
      else if (typeof settings[key] === 'string') field.value = settings[key];
    });
  }

  function announce(message, isError) {
    banner.textContent = message;
    banner.hidden = false;
    banner.classList.toggle('delendai-banner--error', isError === true);
    banner.setAttribute('role', isError ? 'alert' : 'status');
  }

  function setPending(action, message) {
    sequence += 1;
    pending = { action: action, requestId: 'settings-' + sessionId + '-' + sequence };
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('button').forEach(function (button) {
      button.disabled = true;
    });
    announce(message, false);
    return pending.requestId;
  }

  function finishPending() {
    pending = null;
    form.removeAttribute('aria-busy');
    form.querySelectorAll('button').forEach(function (button) {
      button.disabled = false;
    });
  }

  if (!form || !banner) return;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (pending) return;
    if (!vscode) {
      announce(${quoted(copy.saveError)}, true);
      return;
    }
    const requestId = setPending('save', ${quoted(copy.saving)});
    vscode.postMessage({ command: 'save', requestId: requestId, settings: readForm() });
  });

  form.addEventListener('reset', function (event) {
    event.preventDefault();
    if (pending) return;
    if (!vscode) {
      announce(${quoted(copy.resetError)}, true);
      return;
    }
    const requestId = setPending('reset', ${quoted(copy.resetting)});
    vscode.postMessage({ command: 'reset', requestId: requestId });
  });

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (!pending || !message || message.requestId !== pending.requestId) return;
    if (message.command === 'settingsSaved') {
      const action = pending.action;
      applySettings(message.settings);
      finishPending();
      announce(action === 'reset' ? ${quoted(copy.resetToDefaults)} : ${quoted(copy.saved)}, false);
    } else if (message.command === 'settingsError') {
      const action = pending.action;
      finishPending();
      const fallback = action === 'reset' ? ${quoted(copy.resetError)} : ${quoted(copy.saveError)};
      announce(typeof message.message === 'string' && message.message.length > 0
        ? fallback + ' ' + message.message
        : fallback, true);
    }
  });
})();
`.trim();

const option = (value: string, current: string, label: string): string =>
	`<option value="${escapeHtml(value)}"${selected(current, value)}>${escapeHtml(label)}</option>`;

export const renderSettings = (options: IRenderSettingsOptions): string => {
	const { settings } = options;
	const copy = settingsTranslations(options.lang);
	const direction = settings.language === 'ar' ? 'rtl' : 'ltr';
	const themeOptions = HOST_THEME_CHOICES.map((value) =>
		option(value, settings.theme, copy.option('theme', value)),
	).join('');
	const languageOptions = HOST_LANGUAGE_CHOICES.map((value) => {
		const language = languages.find(
			(candidate) => candidate.code === value,
		);
		return option(value, settings.language, language?.label ?? value);
	}).join('');
	const motionOptions = HOST_MOTION_CHOICES.map((value) =>
		option(value, settings.motion, copy.option('motion', value)),
	).join('');
	const logLevelOptions = HOST_LOG_LEVELS.map((value) =>
		option(value, settings.logLevel, copy.option('logLevel', value)),
	).join('');

	return `<!DOCTYPE html>
<html lang="${escapeHtml(settings.language)}" dir="${direction}">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(copy.title)}</title>
	<style>
		${renderComponentCssTokenRootCss()}
		* { box-sizing: border-box; }
		body { font-family: var(--vscode-font-family, system-ui); padding: 20px; color: var(--delendai-fg-primary); background: var(--delendai-bg-primary); }
		main { width: min(100%, 680px); margin: 0 auto; }
		h1 { font-size: 20px; margin: 0 0 6px; }
		.delendai-lede, .delendai-description { color: var(--vscode-descriptionForeground, var(--delendai-fg-muted)); }
		.delendai-lede { margin: 0 0 20px; line-height: 1.5; }
		.delendai-field { display: block; margin: 0 0 18px; font-size: 13px; font-weight: 600; }
		.delendai-description { display: block; margin-top: 5px; font-size: 12px; font-weight: 400; line-height: 1.45; }
		.delendai-check { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: start; }
		.delendai-check .delendai-description { grid-column: 2; }
		input[type="url"], select { display: block; width: 100%; margin-top: 6px; padding: 8px 10px; font: inherit; color: var(--vscode-input-foreground, #c9d1d9); background: var(--vscode-input-background, #0d1117); border: 1px solid var(--vscode-input-border, #30363d); border-radius: 4px; outline: none; }
		input[type="checkbox"] { margin: 2px 0 0; accent-color: var(--vscode-focusBorder, #007acc); }
		input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 2px; }
		.delendai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
		.delendai-actions { display: flex; gap: 8px; margin-top: 20px; }
		.delendai-actions button { min-height: 34px; padding: 7px 16px; font: inherit; color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #007acc); border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; cursor: pointer; }
		.delendai-actions button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1f8ad2); }
		.delendai-actions button[type="reset"] { color: var(--vscode-button-secondaryForeground, #c9d1d9); background: var(--vscode-button-secondaryBackground, #3a3d41); }
		.delendai-actions button:disabled { cursor: wait; opacity: .65; }
		.delendai-banner { margin: 0 0 16px; padding: 9px 12px; font-size: 12px; color: var(--vscode-notificationsInfo-foreground, #c9d1d9); background: var(--vscode-notificationsInfo-background, #007acc20); border-inline-start: 3px solid var(--vscode-notificationsInfo-border, #007acc); border-radius: 3px; }
		.delendai-banner--error { color: var(--vscode-errorForeground, #f48771); border-inline-start-color: var(--vscode-inputValidation-errorBorder, #f48771); }
		@media (max-width: 520px) { body { padding: 14px; } .delendai-grid { grid-template-columns: 1fr; } }
		@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; } }
	</style>
</head>
<body>
	<main>
		<h1>${escapeHtml(copy.title)}</h1>
		<p class="delendai-lede">${escapeHtml(copy.description)}</p>
		<p id="delendai-settings-banner" class="delendai-banner" role="status" aria-live="polite" aria-atomic="true" hidden></p>
		<form id="delendai-settings-form" data-save-command="${escapeHtml(options.saveCommand)}" data-reset-command="${escapeHtml(options.resetCommand)}">
			<label class="delendai-field" for="delendai-docs-url">${escapeHtml(copy.docsUrl)}
				<input id="delendai-docs-url" name="docsUrl" type="url" required aria-describedby="delendai-docs-url-description" value="${escapeHtml(settings.docsUrl)}" />
				<span id="delendai-docs-url-description" class="delendai-description">${escapeHtml(copy.docsUrlDescription)}</span>
			</label>
			<label class="delendai-field delendai-check" for="delendai-localhost">
				<input id="delendai-localhost" type="checkbox" name="allowLocalhost" aria-describedby="delendai-localhost-description"${settings.allowLocalhost ? ' checked' : ''} />
				<span>${escapeHtml(copy.allowLocalhostDocsUrl)}</span>
				<span id="delendai-localhost-description" class="delendai-description">${escapeHtml(copy.allowLocalhostDocsUrlDescription)}</span>
			</label>
			<label class="delendai-field delendai-check" for="delendai-private-ips">
				<input id="delendai-private-ips" type="checkbox" name="allowPrivateIps" aria-describedby="delendai-private-ips-description"${settings.allowPrivateIps ? ' checked' : ''} />
				<span>${escapeHtml(copy.allowPrivateIpsDocsUrl)}</span>
				<span id="delendai-private-ips-description" class="delendai-description">${escapeHtml(copy.allowPrivateIpsDocsUrlDescription)}</span>
			</label>
			<div class="delendai-grid">
				<label class="delendai-field" for="delendai-log-level">${escapeHtml(copy.logLevel)}<select id="delendai-log-level" name="logLevel">${logLevelOptions}</select></label>
				<label class="delendai-field" for="delendai-theme">${escapeHtml(copy.theme)}<select id="delendai-theme" name="theme">${themeOptions}</select></label>
				<label class="delendai-field" for="delendai-language">${escapeHtml(copy.language)}<select id="delendai-language" name="language">${languageOptions}</select></label>
				<label class="delendai-field" for="delendai-motion">${escapeHtml(copy.motion)}<select id="delendai-motion" name="motion">${motionOptions}</select></label>
			</div>
			<div class="delendai-actions">
				<button type="submit">${escapeHtml(copy.save)}</button>
				<button type="reset">${escapeHtml(copy.reset)}</button>
			</div>
		</form>
	</main>
	<script>${clientScript(copy)}</script>
</body>
</html>`;
};
