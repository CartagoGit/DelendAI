import {
	DEFAULT_EXTENSION_SETTINGS,
	HOST_LANGUAGE_CHOICES,
	type IDashboardAllModels,
	type IExtensionSettings,
} from '@mcp-vertex/client';
import { languages, rtlLangs } from '@mcp-vertex/shared/i18n';

import { renderHeaderBar } from '../../components';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';

const renderLangPicker = (current: string): string => {
	const currentMeta = languages.find((entry) => entry.code === current);
	return `<label class="mcpv-header__lang-picker">
		<select name="language" data-header-lang>
			${HOST_LANGUAGE_CHOICES.map((code) => {
				const meta = languages.find((entry) => entry.code === code);
				const selected = code === current ? ' selected' : '';
				return `<option value="${escapeHtml(code)}"${selected}>${escapeHtml(meta?.label ?? code)}</option>`;
			}).join('')}
		</select>
		<span aria-hidden="true">${escapeHtml(currentMeta?.flag ?? 'gb').toUpperCase()}</span>
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
	const themeTitle = extensionText(
		{
			site: {} as never,
			extension: { 'header.theme': 'Theme' },
			dev: {} as never,
			tools: {},
		},
		'header.theme',
		'Theme',
	);
	return `<label class="mcpv-header__theme-picker" title="${themeTitle}">
		<span aria-hidden="true">◐</span>
		<select name="theme" data-header-theme>
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
	void rtlLangs;
	return renderHeaderBar({
		brandName: 'mcp-vertex',
		version: `${escapeHtml(model.server.version)} · ${escapeHtml(model.server.name)}`,
		direction: rtlLangs.includes(settings.language) ? 'rtl' : 'ltr',
		actions: `${renderLangPicker(settings.language)}${renderThemeSwitcher(settings.theme)}`,
	});
}
