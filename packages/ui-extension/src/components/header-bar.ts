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
	readonly direction?: 'ltr' | 'rtl';
	/** Optional connection state — when 'lost', the brand mark renders in
	 *  the host's error colour instead of the brand gradient so the
	 *  user notices at a glance that MCP is unreachable. */
	readonly connection?: 'ok' | 'lost';
}

/** Inline brand SVG copied from the extension/app logo asset so every host
 *  renders the same MCP Vertex mark without a runtime asset dependency. */
const BRAND_SVG = `<svg class="mcpv-header__logo" viewBox="0 0 64 64" aria-hidden="true">
	<defs>
		<linearGradient id="mcpv-brand-gradient" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="var(--mcpv-brand-blue)"/>
			<stop offset="1" stop-color="var(--mcpv-brand-purple)"/>
		</linearGradient>
	</defs>
	<path d="M32 4 L56 18 L56 46 L32 60 L8 46 L8 18 Z" fill="none" stroke="url(#mcpv-brand-gradient)" stroke-width="4.5" stroke-linejoin="round"/>
	<g stroke="url(#mcpv-brand-gradient)" stroke-width="3.5" stroke-linecap="round">
		<line x1="32" y1="32" x2="32" y2="8"/>
		<line x1="32" y1="32" x2="11.5" y2="44"/>
		<line x1="32" y1="32" x2="52.5" y2="44"/>
	</g>
	<path d="M32 21 L41 26.5 L41 37.5 L32 43 L23 37.5 L23 26.5 Z" fill="url(#mcpv-brand-gradient)"/>
	<g fill="url(#mcpv-brand-gradient)">
		<circle cx="32" cy="8" r="5"/>
		<circle cx="11.5" cy="44" r="5"/>
		<circle cx="52.5" cy="44" r="5"/>
	</g>
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
	// Only stamp the attribute when the caller actually reported a
	// connection state. The stylesheet keys solely off
	// `[data-connection='lost']`, so an unconditional `="ok"` added
	// nothing but noise to the opening tag for every host that does not
	// track connectivity at all.
	const stateAttr =
		opts.connection === undefined
			? ''
			: ` data-connection="${opts.connection}"`;
	return `<header class="mcpv-header"${opts.direction === 'rtl' ? ' dir="rtl"' : ''}${stateAttr}>
	${BRAND_SVG}
	<div class="mcpv-header__brand">
		<div class="mcpv-header__name">${escapeHtml(opts.brandName)}</div>
		<div class="mcpv-header__version">v${escapeHtml(opts.version)}</div>
	</div>
	${right.length > 0 ? `<div class="mcpv-header__strip">${right}</div>` : ''}
</header>`;
};
