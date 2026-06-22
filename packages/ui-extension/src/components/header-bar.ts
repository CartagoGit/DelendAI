/**
 * `HeaderBar` — webview-agnostic brand header for every host panel
 * (dashboard, knowledge, settings, tool detail, toolbar).
 *
 * Pure string renderer — the host injects the result into a webview
 * via `panel.webview.setHtml(...)`. No `vscode` imports, no DOM mount
 * (the optional `HeaderBarElement` mount helper is exported for
 * future hosts that prefer a DOM-rooted API; today only the string
 * form is used by `@mcp-vertex/shared`-driven webviews).
 */
import { escapeHtml } from '../dashboard/format';

export interface IHeaderBarOptions {
	readonly brandName: string;
	readonly version: string;
	readonly langPicker?: string; // pre-rendered HTML string for the language picker
	readonly actions?: string; // pre-rendered HTML string for the right-hand action strip
}

/** Inline brand SVG — single source of truth (no `media/logo.svg` dependency at runtime). */
const BRAND_SVG = `<svg class="mv-header__logo" viewBox="0 0 64 64" aria-hidden="true">
	<defs>
		<linearGradient id="mv-brand-gradient" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="var(--mv-brand-blue, #58a6ff)"/>
			<stop offset="100%" stop-color="var(--mv-brand-purple, #a371f7)"/>
		</linearGradient>
	</defs>
	<path d="M32 4 L58 18 L58 46 L32 60 L6 46 L6 18 Z" fill="url(#mv-brand-gradient)"/>
	<path d="M32 14 L48 22 L48 42 L32 50 L16 42 L16 22 Z" fill="var(--mv-bg, #0d1117)"/>
</svg>`;

/**
 * `renderHeaderBar` — returns the HTML string for a header bar.
 * The host injects `langPicker` and `actions` (pre-rendered HTML) on
 * the right-hand strip; omit either for a header with just the brand.
 */
export const renderHeaderBar = (opts: IHeaderBarOptions): string => {
	const right = [opts.actions ?? '', opts.langPicker ?? '']
		.filter((s) => s.length > 0)
		.join('');
	return `<header class="mv-header">
	${BRAND_SVG}
	<div class="mv-header__brand">
		<div class="mv-header__name">${escapeHtml(opts.brandName)}</div>
		<div class="mv-header__version">v${escapeHtml(opts.version)}</div>
	</div>
	${right.length > 0 ? `<div class="mv-header__strip">${right}</div>` : ''}
</header>`;
};
