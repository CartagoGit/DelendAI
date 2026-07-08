/**
 * `apps/shared/src/components/dev/theme-picker.ts` —
 * host-agnostic theme picker. Returns an HTML string.
 *
 * Replaces the `renderThemePicker` helper in
 * `extensions/vscode/src/dev/settings-panel.ts` (f00102 S4.5) so
 * any product surface that wants the same three-way
 * system / light / dark radios can import the same markup.
 *
 * Conventions
 * -----------
 * - Class namespace: `mv-theme-picker` / `mv-theme-picker__*`
 *   with the optional `mv-theme-picker--inline` modifier. Legacy
 *   `.settings__*` selectors are kept via `@extend` in the
 *   companion SCSS so the existing dev preview keeps working
 *   without a markup rename.
 * - The picker is a real `<fieldset>` + `<legend>` for screen
 *   readers, with a `<div role="radiogroup">` carrying the
 *   three `<label><input type="radio">` choices. The form name
 *   is exposed as `name` so multiple pickers can coexist on
 *   the same page (e.g. an extension settings panel + a CLI
 *   init wizard).
 * - The first option (`system`) is the recommended default for
 *   host environments (the extension inherits the VS Code
 *   theme); explicit light/dark are escape hatches for
 *   embedders that want a fixed surface.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface IRenderThemePickerOptions {
	/** Currently selected theme. */
	readonly current: ThemeChoice;
	/** Form name. Default `theme`. */
	readonly name?: string;
	/** Optional hint paragraph rendered under the legend. */
	readonly hint?: string;
	/** When true, omit the `<fieldset>` wrapper and render as a
	 *  single inline row. Default false. */
	readonly inline?: boolean;
}

const escapeAttr = (s: string): string =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const THEME_ORDER: ReadonlyArray<ThemeChoice> = ['system', 'light', 'dark'];

const capitalise = (s: string): string =>
	s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);

export const renderThemePicker = (
	options: IRenderThemePickerOptions,
): string => {
	const name = options.name ?? 'theme';
	const radios = THEME_ORDER.map(
		(opt) =>
			`<label class="mv-theme-picker__radio">` +
			`<input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(opt)}"` +
			` ${opt === options.current ? 'checked' : ''} />` +
			`<span>${escapeAttr(capitalise(opt))}</span>` +
			`</label>`,
	).join('');

	if (options.inline) {
		return (
			`<label class="mv-theme-picker mv-theme-picker--inline">` +
			`<span>Theme</span>` +
			`<div class="mv-theme-picker__radios" role="radiogroup">${radios}</div>` +
			`</label>`
		);
	}
	const hintHtml = options.hint
		? `<p class="mv-theme-picker__hint">${escapeAttr(options.hint)}</p>`
		: '';
	return (
		`<fieldset class="mv-theme-picker__field">` +
		`<legend>Theme</legend>` +
		hintHtml +
		`<div class="mv-theme-picker__radios" role="radiogroup">${radios}</div>` +
		`</fieldset>`
	);
};
