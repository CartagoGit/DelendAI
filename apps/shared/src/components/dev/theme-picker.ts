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
 * - Class namespace: `mcpv-theme-picker` / `mcpv-theme-picker__*`
 *   with the optional `mcpv-theme-picker--inline` modifier. Legacy
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
import { escapeAttr } from '../../lib/escape';
import {
	HOST_THEME_CHOICES,
	type HostTheme,
} from '@delendai/client/lib/contracts/interfaces/settings.interface';

export type ThemeChoice = HostTheme;

/** All non-system theme values backed by `:root[data-theme="..."]`
 * blocks in `apps/shared/src/styles/_themes.scss`. Hosts that want
 * a smaller surface (e.g. a CLI wizard that only knows dark + light)
 * can pass a custom `themes` option. */
export const ALL_THEMES: readonly ThemeChoice[] = HOST_THEME_CHOICES;

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
	/** Restrict the picker to a subset of `ALL_THEMES`. Default
	 * `ALL_THEMES` so every pick instance is a complete mirror of
	 * what `apps/shared/src/styles/_themes.scss` declares. Hosts
	 * that only support a fixed subset (e.g. a CLI that renders in a
	 * terminal and cannot use the lighter palettes) can pass an
	 * explicit list. */
	readonly themes?: ReadonlyArray<ThemeChoice>;
}

/** Default render order. Pinned by the picker so the radio buttons
 * do not shuffle between renders when callers accidentally rely on
 * insertion order. */
export const THEME_ORDER: readonly ThemeChoice[] = HOST_THEME_CHOICES;

/**
 * Preview swatch colours — the small inner dot on the swatch-style
 * theme picker the docs site uses. Lives in the shared package so the
 * dev preview extension, the marketing site, and any future product
 * surface (CLI init wizard, JetBrains plugin settings) read the same
 * canonical values. Values mirror the
 * `:root[data-theme="..."] { --bg / --accent }` blocks in
 * `apps/shared/src/styles/_themes.scss`; if you add a new theme, add
 * an entry here AND a matching SCSS block.
 */
export const THEME_BG: Readonly<
	Record<Exclude<ThemeChoice, 'system'>, string>
> = {
	dark: '#0d1117',
	light: '#ffffff',
	midnight: '#0b0f1a',
	solarized: '#002b36',
	nord: '#2e3440',
};

export const THEME_ACCENT: Readonly<
	Record<Exclude<ThemeChoice, 'system'>, string>
> = {
	dark: '#58a6ff',
	light: '#0969da',
	midnight: '#7c93ff',
	solarized: '#2aa198',
	nord: '#88c0d0',
};

const capitalise = (s: string): string =>
	s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);

export const renderThemePicker = (
	options: IRenderThemePickerOptions,
): string => {
	const name = options.name ?? 'theme';
	const order = options.themes ?? THEME_ORDER;
	const radios = order
		.map(
			(opt) =>
				`<label class="mcpv-theme-picker__radio">` +
				`<input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(opt)}"` +
				` ${opt === options.current ? 'checked' : ''} />` +
				`<span>${escapeAttr(capitalise(opt))}</span>` +
				`</label>`,
		)
		.join('');

	if (options.inline) {
		return (
			`<label class="mcpv-theme-picker mcpv-theme-picker--inline">` +
			`<span>Theme</span>` +
			`<div class="mcpv-theme-picker__radios" role="radiogroup">${radios}</div>` +
			`</label>`
		);
	}
	const hintHtml = options.hint
		? `<p class="mcpv-theme-picker__hint">${escapeAttr(options.hint)}</p>`
		: '';
	return (
		`<fieldset class="mcpv-theme-picker__field">` +
		`<legend>Theme</legend>` +
		hintHtml +
		`<div class="mcpv-theme-picker__radios" role="radiogroup">${radios}</div>` +
		`</fieldset>`
	);
};

export interface IRenderThemeSwatchesOptions {
	/** Currently selected theme. The matching swatch gets `aria-pressed="true"`. */
	readonly current: ThemeChoice;
	/** Form name. Default `theme`. */
	readonly name?: string;
	/** Container id (e.g. `cfg-themes`) so the host's existing
	 *  mutation listener can find the swatches without needing to
	 *  re-bind per render. */
	readonly id?: string;
	/** Restrict the picker to a subset of `ALL_THEMES`. Default
	 *  `ALL_THEMES` minus the `system` choice (which has no swatch). */
	readonly themes?: ReadonlyArray<ThemeChoice>;
}

/**
 * Swatch-style theme picker used by the docs site (`.swatches` row of
 * round chips, each with a small inner accent dot). Lives next to
 * `renderThemePicker` so a host can pick the visual model that
 * matches its surface without duplicating the canonical theme list
 * or the preview swatch colours. The output markup uses the same
 * `data-theme-value` contract the web's listener expects, so
 * existing handlers do not need to change.
 */
export const renderThemeSwatches = (
	options: IRenderThemeSwatchesOptions,
): string => {
	const order = (options.themes ?? THEME_ORDER).filter(
		(t) => t !== 'system',
	) as ReadonlyArray<Exclude<ThemeChoice, 'system'>>;
	const idAttr = options.id ? ` id="${escapeAttr(options.id)}"` : '';
	const name = options.name ?? 'theme';
	const buttons = order
		.map(
			(t) =>
				`<button` +
				` class="swatch"` +
				` type="button"` +
				` data-theme-value="${escapeAttr(t)}"` +
				` name="${escapeAttr(name)}"` +
				` value="${escapeAttr(t)}"` +
				` title="${escapeAttr(t)}"` +
				` aria-label="${escapeAttr(t)}"` +
				` aria-pressed="${t === options.current ? 'true' : 'false'}"` +
				` style="background:${THEME_BG[t]}"` +
				`><span style="background:${THEME_ACCENT[t]}"></span></button>`,
		)
		.join('');
	return `<div class="swatches"${idAttr}>${buttons}</div>`;
};
