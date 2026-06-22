/**
 * `LanguagePicker` — webview-agnostic language picker. Reads the
 * current language from `localStorage['mv:lang']` (or the
 * `IHostAdapter` provided initial value), falls back to `'en'` if
 * neither is set. Calls `opts.onChange(lang)` and writes
 * `localStorage['mv:lang']` when the user picks a new language.
 *
 * Renders as a native `<select>` (with the MV brand chevron) so
 * the keyboard navigation is free and the CSP is happy. The
 * `data-mv-lang` attribute lets the runtime delegate change events.
 */
import type { ILangMeta, Lang } from '@mcp-vertex/shared/i18n';

import { escapeHtml } from '../dashboard/format';

export interface ILanguagePickerOptions {
	readonly id?: string;
	readonly current: Lang;
	readonly languages: readonly ILangMeta[];
	readonly onChange?: (lang: Lang) => void;
}

const STORAGE_KEY = 'mv:lang';

const isLang = (v: string, langs: readonly ILangMeta[]): v is Lang =>
	langs.some((l) => l.code === v);

/** Read the persisted or browser-default language. */
export const readInitialLang = (
	langs: readonly ILangMeta[],
	fallback: Lang = 'en',
): Lang => {
	if (typeof localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && isLang(stored, langs)) return stored;
	if (typeof navigator !== 'undefined' && navigator.language) {
		const tag = (navigator.language ?? '').toLowerCase().split('-')[0];
		if (tag && isLang(tag, langs)) return tag;
	}
	return fallback;
};

/** Persist the language choice. */
export const writeLang = (lang: Lang): void => {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, lang);
};

/**
 * `renderLanguagePicker` — returns the HTML string for a language
 * picker. The host injects the rendered string into the webview
 * and wires `change` events via the runtime (or directly with
 * `element.addEventListener('change', e => onChange(e.target.value))`).
 */
export const renderLanguagePicker = (opts: ILanguagePickerOptions): string => {
	const idAttr = opts.id ? ` id="${escapeHtml(opts.id)}"` : '';
	const options = opts.languages
		.map(
			(l) =>
				`<option value="${escapeHtml(l.code)}"${l.code === opts.current ? ' selected' : ''}>${escapeHtml(l.label)}</option>`,
		)
		.join('');
	return `<label class="mv-lang-picker"${idAttr}>
	<span class="mv-lang-picker__label" aria-hidden="true">🌐</span>
	<select class="mv-lang-picker__select" data-mv-lang aria-label="Language">
		${options}
	</select>
</label>`;
};
