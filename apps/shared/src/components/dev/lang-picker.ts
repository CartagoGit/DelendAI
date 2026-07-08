/**
 * `apps/shared/src/components/dev/lang-picker.ts` —
 * host-agnostic language picker. Returns an HTML string.
 *
 * Replaces the `renderLangPicker` helper in
 * `extensions/vscode/src/dev/settings-panel.ts` (f00102 S4.5).
 * Uses the canonical `languages` registry from
 * `../i18n/shared` so the dropdown always stays in lockstep
 * with the i18n surface — adding a new language to the
 * dictionary is the only place the picker needs to learn
 * about it.
 *
 * Conventions
 * -----------
 * - Class namespace: `mv-lang-picker` / `mv-lang-picker__*`
 *   with the optional `mv-lang-picker--inline` modifier.
 *   Legacy `.settings__*` aliases live in the companion
 *   SCSS via `@extend`.
 * - Renders a real `<label><span>{caption}</span><select>` for
 *   screen readers; the `<select>` carries the canonical
 *   language `code` as its value (matching the docs-site
 *   URL convention: `/<lang>/...`).
 * - `name` is exposed so multiple pickers can coexist (e.g.
 *   a CLI init wizard + an extension settings panel) without
 *   colliding on a single form field.
 */

import { languages, type Lang } from '../../i18n/shared';

export interface IRenderLangPickerOptions {
	/** Currently selected language code. */
	readonly current: Lang;
	/** Form name. Default `lang`. */
	readonly name?: string;
	/** Label text shown before the `<select>`. Default `Language`. */
	readonly caption?: string;
	/** When true, render as a single inline row instead of a
	 *  full-width field. Default false. */
	readonly inline?: boolean;
}

const escapeAttr = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const codeOf = (entry: (typeof languages)[number]): string =>
	'code' in entry ? String(entry.code) : '';

const nameOf = (entry: (typeof languages)[number]): string =>
	'name' in entry ? String(entry.name) : codeOf(entry);

export const renderLangPicker = (
	options: IRenderLangPickerOptions,
): string => {
	const name = options.name ?? 'lang';
	const caption = options.caption ?? 'Language';
	const optionsHtml = languages
		.map((entry) => {
			const code = codeOf(entry);
			const label = nameOf(entry);
			const sel = code === options.current ? ' selected' : '';
			return `<option value="${escapeAttr(code)}"${sel}>${escapeAttr(label)}</option>`;
		})
		.join('');

	return (
		`<label class="mv-lang-picker${options.inline ? ' mv-lang-picker--inline' : ''}">` +
		`<span>${escapeAttr(caption)}</span>` +
		`<select name="${escapeAttr(name)}">${optionsHtml}</select>` +
		`</label>`
	);
};