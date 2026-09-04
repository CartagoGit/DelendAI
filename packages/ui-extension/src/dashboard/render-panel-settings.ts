/**
 * `renderPanelSettings` — inline settings panel for the dashboard.
 *
 * Sections:
 *  1. Appearance (theme, language, motion)
 *  2. Workspace (docsUrl + flags)
 *  3. Diagnostics (log level)
 *  4. Live preview (renders a small themed + localised card so the
 *     user can see the change before committing it).
 *
 * Persistence: every change posts a `settings` message via the bridge
 * wired in `renderDashboard`. The host persists it through the same
 * `SettingsService` the standalone `openSettings` command uses, so
 * theme + language survive across sessions and reloads.
 */
import {
	HOST_LANGUAGE_CHOICES,
	HOST_LOG_LEVELS,
	HOST_MOTION_CHOICES,
	HOST_THEME_CHOICES,
	type IExtensionSettings,
} from '@delendai/client';
import { BRAND_HEX_BLUE, BRAND_HEX_PURPLE } from '@delendai/shared';
import {
	languages,
	rtlLangs,
	settingsTranslations,
} from '@delendai/shared/i18n';
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml } from './format';

const selectOption = (value: string, current: string, label: string): string =>
	`<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;

const themeSwatches = (
	theme: string,
): { bg: string; fg: string; accent: string } => {
	switch (theme) {
		case 'light':
			return { bg: '#ffffff', fg: '#1f2328', accent: '#0969da' };
		case 'midnight':
			return { bg: '#0d1117', fg: '#c9d1d9', accent: BRAND_HEX_PURPLE };
		case 'solarized':
			return { bg: '#fdf6e3', fg: '#586e75', accent: '#268bd2' };
		case 'nord':
			return { bg: '#2e3440', fg: '#d8dee9', accent: '#88c0d0' };
		default:
			return { bg: '#161b22', fg: '#d4d4d4', accent: BRAND_HEX_BLUE };
	}
};

const renderThemeCards = (current: string): string =>
	HOST_THEME_CHOICES.map((theme) => {
		const swatches = themeSwatches(theme);
		const checked = theme === current ? 'true' : 'false';
		return `<label class="mcpv-settings__theme" data-theme-card="${escapeHtml(theme)}" aria-pressed="${checked}">
			<input type="radio" name="theme" value="${escapeHtml(theme)}"${checked === 'true' ? ' checked' : ''} />
			<span class="mcpv-settings__theme-swatch" data-theme-preview="${escapeHtml(theme)}" aria-hidden="true">
				<span class="mcpv-settings__theme-swatch-band" style="background:${swatches.bg}"></span>
				<span class="mcpv-settings__theme-swatch-band" style="background:${swatches.accent}"></span>
				<span class="mcpv-settings__theme-swatch-band" style="background:${swatches.fg}"></span>
			</span>
			<span class="mcpv-settings__theme-label">${escapeHtml(theme)}</span>
		</label>`;
	}).join('');

const renderLanguageCards = (current: string): string =>
	HOST_LANGUAGE_CHOICES.map((code) => {
		const checked = code === current ? 'true' : 'false';
		const meta = languages.find((entry) => entry.code === code);
		return `<label class="mcpv-settings__lang" data-lang-card="${escapeHtml(code)}" aria-pressed="${checked}">
			<input type="radio" name="language" value="${escapeHtml(code)}"${checked === 'true' ? ' checked' : ''} />
			<span class="mcpv-settings__lang-flag" aria-hidden="true">${escapeHtml((meta?.flag ?? 'gb').toUpperCase())}</span>
			<span class="mcpv-settings__lang-label">${escapeHtml(meta?.label ?? code)}</span>
			<span class="mcpv-settings__lang-native" lang="${escapeHtml(code)}">${escapeHtml(code)}</span>
		</label>`;
	}).join('');

const renderSelect = (
	name: string,
	current: string,
	values: readonly string[],
	resolveLabel: (value: string) => string,
): string =>
	`<select name="${escapeHtml(name)}" class="mcpv-settings__select">${values.map((value) => selectOption(value, current, resolveLabel(value))).join('')}</select>`;

export interface IRenderPanelSettingsOptions {
	readonly settings: IExtensionSettings;
	readonly lang: ILangDict;
	readonly compact?: boolean;
}

export const renderPanelSettings = (
	settings: IExtensionSettings,
	lang: ILangDict,
	compact = false,
): string => {
	const text = (key: string, fallback: string): string =>
		extensionText(lang, key) || fallback;
	const copy = settingsTranslations(lang);
	const direction = rtlLangs.includes(settings.language) ? 'rtl' : 'ltr';
	const themeSelect = renderSelect(
		'theme',
		settings.theme,
		HOST_THEME_CHOICES,
		(value) => copy.option('theme', value),
	);
	const languageSelect = renderSelect(
		'language',
		settings.language,
		HOST_LANGUAGE_CHOICES,
		(value) => copy.option('language', value),
	);
	const motionSelect = renderSelect(
		'motion',
		settings.motion,
		HOST_MOTION_CHOICES,
		(value) => copy.option('motion', value),
	);
	const logLevelSelect = renderSelect(
		'logLevel',
		settings.logLevel,
		HOST_LOG_LEVELS,
		(value) => copy.option('logLevel', value),
	);
	return `<section class="mcpv-panel mcpv-panel--settings${compact ? ' mcpv-panel--compact' : ''}" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" dir="${direction}">
	<h2 class="mcpv-panel__title">${escapeHtml(text('settings.title', 'Settings'))}</h2>
	<p class="mcpv-fg-muted">${escapeHtml(text('settings.description', 'Personalize the dashboard and host preferences.'))}</p>
	<form id="mcpv-dashboard-settings-form" class="mcpv-settings">
		<section class="mcpv-settings__section" aria-labelledby="settings-section-appearance">
			<header class="mcpv-settings__section-header">
				<h3 id="settings-section-appearance">${escapeHtml(text('settings.section.appearance', 'Appearance'))}</h3>
				<p>${escapeHtml(text('settings.section.appearanceLead', 'Personalize the dashboard and host. Changes apply instantly and survive a window reload.'))}</p>
			</header>
			<div class="mcpv-settings__group">
				<div class="mcpv-settings__label">
					<span>${escapeHtml(copy.theme)}</span>
					<small>${escapeHtml(text('settings.theme.help', 'Pick how the dashboard paints.'))}</small>
				</div>
				<div class="mcpv-settings__theme-grid">${renderThemeCards(settings.theme)}</div>
				<label class="mcpv-settings__select-compact">${themeSelect}</label>
			</div>
			<div class="mcpv-settings__group">
				<div class="mcpv-settings__label">
					<span>${escapeHtml(copy.language)}</span>
					<small>${escapeHtml(text('settings.language.help', 'Choose the language used by every panel and dialog.'))}</small>
				</div>
				<div class="mcpv-settings__lang-grid">${renderLanguageCards(settings.language)}</div>
				<label class="mcpv-settings__select-compact">${languageSelect}</label>
			</div>
			<div class="mcpv-settings__group mcpv-settings__group--inline">
				<div class="mcpv-settings__label">
					<span>${escapeHtml(copy.motion)}</span>
					<small>${escapeHtml(text('settings.motion.help', 'Reduced motion is recommended when you prefer static UI.'))}</small>
				</div>
				${motionSelect}
			</div>
			<div class="mcpv-settings__group mcpv-settings__group--inline">
				<div class="mcpv-settings__label">
					<span>${escapeHtml(text('settings.compact.title', 'Compact layout'))}</span>
					<small>${escapeHtml(text('settings.compact.help', 'Tighten padding across panels for dense workflows.'))}</small>
				</div>
				<label class="mcpv-settings__toggle">
					<input type="checkbox" data-settings-compact ${compact ? ' checked' : ''} />
					<span>${escapeHtml(text('settings.compact.label', 'Enable compact mode'))}</span>
				</label>
			</div>
		</section>
		<section class="mcpv-settings__section" aria-labelledby="settings-section-workspace">
			<header class="mcpv-settings__section-header">
				<h3 id="settings-section-workspace">${escapeHtml(text('settings.section.workspace', 'Workspace'))}</h3>
				<p>${escapeHtml(text('settings.section.workspaceLead', 'How the dashboard connects to MCP and which documentation it surfaces.'))}</p>
			</header>
			<label class="mcpv-settings__field">
				<span>${escapeHtml(copy.docsUrl)}</span>
				<small>${escapeHtml(text('settings.docsUrlHelp', 'HTTPS URL the Docs iframe loads.'))}</small>
				<input name="docsUrl" type="url" required value="${escapeHtml(settings.docsUrl)}" />
			</label>
			<label class="mcpv-settings__check">
				<input name="allowLocalhost" type="checkbox"${settings.allowLocalhost ? ' checked' : ''} />
				<span>${escapeHtml(copy.allowLocalhostDocsUrl)}</span>
				<small>${escapeHtml(text('settings.allowLocalhostDocsUrlHelp', 'Only enable while developing locally.'))}</small>
			</label>
			<label class="mcpv-settings__check">
				<input name="allowPrivateIps" type="checkbox"${settings.allowPrivateIps ? ' checked' : ''} />
				<span>${escapeHtml(copy.allowPrivateIpsDocsUrl)}</span>
				<small>${escapeHtml(text('settings.allowPrivateIpsDocsUrlHelp', 'Allow docs on private IPs.'))}</small>
			</label>
		</section>
		<section class="mcpv-settings__section" aria-labelledby="settings-section-diagnostics">
			<header class="mcpv-settings__section-header">
				<h3 id="settings-section-diagnostics">${escapeHtml(text('settings.section.diagnostics', 'Diagnostics'))}</h3>
				<p>${escapeHtml(text('settings.section.diagnosticsLead', 'Internal log level.'))}</p>
			</header>
			<div class="mcpv-settings__group mcpv-settings__group--inline">
				<div class="mcpv-settings__label">
					<span>${escapeHtml(copy.logLevel)}</span>
					<small>${escapeHtml(text('settings.logLevel.help', 'Higher levels swallow more events.'))}</small>
				</div>
				${logLevelSelect}
			</div>
		</section>
		<section class="mcpv-settings__section mcpv-settings__section--preview" aria-labelledby="settings-section-preview">
			<header class="mcpv-settings__section-header">
				<h3 id="settings-section-preview">${escapeHtml(text('settings.previewHeading', 'Preview'))}</h3>
				<p>${escapeHtml(text('settings.previewBody', 'This is how the dashboard will look with the selected theme and language.'))}</p>
			</header>
			<div class="mcpv-settings__preview" data-theme-preview="${escapeHtml(settings.theme)}" dir="${direction}">
				<strong>${escapeHtml(text('settings.title', 'Settings'))}</strong>
				<p>${escapeHtml(copy.description)}</p>
				<div class="mcpv-settings__preview-actions">
					<button type="button" class="mcpv-button mcpv-button--primary" disabled>${escapeHtml(copy.save)}</button>
					<button type="button" class="mcpv-button" disabled>${escapeHtml(copy.reset)}</button>
				</div>
			</div>
		</section>
		<div class="mcpv-settings__actions">
			<button type="submit" class="mcpv-button mcpv-button--primary">${escapeHtml(copy.save)}</button>
			<button type="button" data-settings-reset class="mcpv-button">${escapeHtml(copy.reset)}</button>
		</div>
	</form>
	<p id="mcpv-dashboard-settings-status" class="mcpv-settings-panel__status" role="status" aria-live="polite" hidden></p>
</section>`;
};
