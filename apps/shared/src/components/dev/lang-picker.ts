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
 * - Class namespace: `delendai-lang-picker` / `delendai-lang-picker__*`
 *   with the optional `delendai-lang-picker--inline` modifier.
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
import { escapeAttr } from '../../lib/escape';

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

const codeOf = (entry: (typeof languages)[number]): Lang =>
	'code' in entry ? (entry.code as Lang) : ('en' as Lang);

const nameOf = (entry: (typeof languages)[number]): string =>
	'name' in entry ? String(entry.name) : codeOf(entry);

export const renderLangPicker = (options: IRenderLangPickerOptions): string => {
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
		`<label class="delendai-lang-picker${options.inline ? ' delendai-lang-picker--inline' : ''}">` +
		`<span>${escapeAttr(caption)}</span>` +
		`<select name="${escapeAttr(name)}">${optionsHtml}</select>` +
		`</label>`
	);
};

export interface IRenderLangLinksOptions {
	/** Currently selected language code. */
	readonly current: Lang;
	/** Resolves a language code to the URL the link should point to.
	 *  Defaults to `/${code}` (or `/` for the default `en` locale). */
	readonly hrefFor?: (code: Lang) => string;
	/** Container id (e.g. `cfg-languages`) so the host's listener can
	 *  find the link list without rebinding per render. */
	readonly id?: string;
}

/**
 * Anchor-list language picker used by the docs site (one `<a>` per
 * language, each linking to the equivalent page in that locale).
 * Lives next to `renderLangPicker` so a host can pick the visual
 * model that matches its surface without duplicating the canonical
 * language registry or the SSR href convention.
 *
 * The output uses the same `data-lang-code` attribute the web's
 * existing hydration listener reads, so existing handlers do not
 * need to change.
 */
export const renderLangLinks = (options: IRenderLangLinksOptions): string => {
	const idAttr = options.id ? ` id="${escapeAttr(options.id)}"` : '';
	const hrefFor =
		options.hrefFor ??
		((code: Lang): string => (code === 'en' ? '/' : `/${code}`));
	const links = languages
		.map((entry) => {
			const code = codeOf(entry);
			const label = nameOf(entry);
			const href = hrefFor(code);
			const aria = code === options.current ? ' aria-current="true"' : '';
			return (
				`<a class="lang-opt"` +
				` href="${escapeAttr(href)}"` +
				` data-lang-code="${escapeAttr(code)}"` +
				`${aria}` +
				`>` +
				`<span class="lang-opt__code">${escapeAttr(code)}</span>` +
				`<span class="lang-opt__label">${escapeAttr(label)}</span>` +
				`</a>`
			);
		})
		.join('');
	return `<div class="langs"${idAttr}>${links}</div>`;
};
