/**
 * `buildHeader` — top-of-dashboard brand row.
 *
 * Carries the brand mark + version, the language picker (flag SVG +
 * native label) and the theme switcher. Each picker persists the
 * new value via the `settings` bridge wired in `renderDashboard`.
 */
import {
	DEFAULT_EXTENSION_SETTINGS,
	HOST_LANGUAGE_CHOICES,
	type IDashboardAllModels,
	type IExtensionSettings,
} from '@mcp-vertex/client';
import { languages, rtlLangs } from '@mcp-vertex/shared/i18n';
import { renderFlagIcon } from '../brand-icons';

import { renderHeaderBar } from '../../components';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

const EMPTY_LANG_DICT = {
	site: {},
	extension: {},
	dev: {},
	tools: {},
} as unknown as ILangDict;

const renderLangPicker = (current: string): string => {
	const currentMeta = languages.find((entry) => entry.code === current);
	const currentFlag = renderFlagIcon(current);
	const langLabel = extensionText(
		EMPTY_LANG_DICT,
		'header.language',
		'Language',
	);
	return `<label class="mcpv-header__lang-picker">
		<span class="mcpv-header__lang-flag" aria-hidden="true">${currentFlag}</span>
		<select name="language" data-header-lang aria-label="${langLabel}">
			${HOST_LANGUAGE_CHOICES.map((code) => {
				const meta = languages.find((entry) => entry.code === code);
				const flag = renderFlagIcon(code);
				const selected = code === current ? ' selected' : '';
				return `<option value="${escapeHtml(code)}"${selected} data-flag="${escapeHtml(code)}">${escapeHtml(meta?.label ?? code)} · ${escapeHtml(code)}</option>`;
			}).join('')}
		</select>
	</label>`;
};

const renderThemeSwitcher = (current: string): string => {
	const themes = [
		'system',
		'light',
		'dark',
		'midnight',
		'solarized',
		'nord',
	] as const;
	const themeTitle = extensionText(EMPTY_LANG_DICT, 'header.theme', 'Theme');
	return `<label class="mcpv-header__theme-picker" title="${themeTitle}">
		<span class="mcpv-header__theme-icon" aria-hidden="true">◐</span>
		<select name="theme" data-header-theme aria-label="${themeTitle}">
			${themes
				.map(
					(theme) =>
						`<option value="${theme}"${theme === current ? ' selected' : ''}>${escapeHtml(theme)}</option>`,
				)
				.join('')}
		</select>
	</label>`;
};

export function buildHeader(
	model: IDashboardAllModels,
	settings: IExtensionSettings = DEFAULT_EXTENSION_SETTINGS,
): string {
	const connection: 'ok' | 'lost' =
		model.server.version === 'unavailable' ? 'lost' : 'ok';
	return renderHeaderBar({
		brandName: 'mcp-vertex',
		version: `${escapeHtml(model.server.version)} · ${escapeHtml(model.server.name)}`,
		direction: rtlLangs.includes(settings.language) ? 'rtl' : 'ltr',
		connection,
		actions: `${renderLangPicker(settings.language)}${renderThemeSwitcher(settings.theme)}`,
	});
}

void languages;
