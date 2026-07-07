/**
 * `apps/shared/src/components/ui/callout.ts` — host-agnostic callout
 * block, returns an HTML string.
 *
 * Replaces the `apps/web/src/components/ui/Callout.astro` slice
 * (f00048 S1) when consumed from any host — the marketing site, the
 * VS Code / JetBrains extension webview, or a future product surface.
 * The previous version used Astro's `<slot/>`, which only renders
 * inside an `.astro` page; this version takes the body as a string
 * (HTML) and emits a single `<aside>` with the body inlined. Both
 * Astro and the webview use the same output:
 *
 *   import { renderCallout } from '@mcp-vertex/shared/components/ui/callout';
 *   // Astro:  <Callout ...><Callout.Body set:html={...} /></Callout>
 *   // Webview: webview.html += renderCallout({...}, body);
 *
 * The companion SCSS (`./callout.scss`) carries the BEM rules. It is
 * `@forward`'d from the shared `styles` index, so any host that
 * already pulls in the shared styles also gets the callout rules
 * with no extra imports.
 *
 * Conventions
 * -----------
 * - Variant colours come from the `--mv-callout-{variant}` rule set
 *   in the companion SCSS; the actual hex / colour-mix lives there,
 *   not here. The component stays palette-neutral.
 * - Default titles (`Note`, `Tip`, `Warning`, `Danger`) live in this
 *   file. When the unified `ILangDict.ui.*` shape finishes migrating
 *   (the S2 merge landing in apps/shared/src/i18n/langs/), the
 *   resolution will pick the per-language label automatically if the
 *   host passes `lang_label`. Until then, the English defaults apply
 *   regardless of `lang_label`.
 * - The body is `string` (raw HTML). The caller is responsible for
 *   escaping untrusted input. This matches the `renderRuntime` /
 *   `renderDropdown` contract in this same workspace.
 * - The returned HTML uses class names `mv-callout`, `mv-callout__*`,
 *   `mv-callout--{note,tip,warn,danger}`. **Not** `ui-callout` —
 *   the rename aligns with the shared BEM namespace `mv-*`. Hosts
 *   that previously used `ui-callout` get a `@extend` alias in the
 *   companion SCSS so the old markup keeps working until the rename
 *   lands across `apps/web`.
 */

import type { Lang } from '../../i18n/shared';

export type CalloutVariant = 'note' | 'tip' | 'warn' | 'danger';

export interface ICalloutProps {
	readonly variant?: CalloutVariant;
	/** Optional heading. Falls back to the variant's default label. */
	readonly title?: string;
	/**
	 * Optional locale tag. Reserved for S2 once the unified
	 * `ILangDict.ui.callout*` keys ship in `apps/shared/src/i18n/langs/`.
	 * Currently a no-op (the English defaults apply); hosts that pass
	 * it will not get an error but will also not get a translated
	 * title until S2 lands. The field stays in the contract so the
	 * call sites don't have to migrate again.
	 */
	readonly lang_label?: Lang;
}

const DEFAULT_ICON: Readonly<Record<CalloutVariant, string>> = Object.freeze({
	note: 'i',
	tip: '*',
	warn: '!',
	danger: 'x',
});

const DEFAULT_TITLE: Readonly<Record<CalloutVariant, string>> = Object.freeze({
	note: 'Note',
	tip: 'Tip',
	warn: 'Warning',
	danger: 'Danger',
});

const escapeHtml = (raw: string): string =>
	raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/**
 * Render a callout `<aside>` element as a string.
 *
 * `body` is the inner HTML of the callout — already escaped by the
 * caller if it's user input. The function does NOT escape `body`
 * because callers that pass plain text wrap it in `<p>` and callers
 * that pass composed HTML want full fidelity.
 *
 * @example
 *   renderCallout(
 *     { variant: 'tip', title: 'Pro tip' },
 *     `<p>Use <code>--noEmit</code> for type-only checks.</p>`
 *   )
 */
export const renderCallout = (props: ICalloutProps, body: string): string => {
	const variant: CalloutVariant = props.variant ?? 'note';
	const heading = props.title ?? DEFAULT_TITLE[variant];
	const icon = DEFAULT_ICON[variant];
	const cls = `mv-callout mv-callout--${variant}`;

	return [
		`<aside class="${cls}" role="note" data-mv-callout="${variant}"`,
		props.lang_label ? ` lang="${escapeHtml(props.lang_label)}"` : '',
		`>`,
		`<span class="mv-callout__icon" aria-hidden="true">${escapeHtml(icon)}</span>`,
		`<div class="mv-callout__body">`,
		`<p class="mv-callout__title">${escapeHtml(heading)}</p>`,
		`<div class="mv-callout__content">${body}</div>`,
		`</div>`,
		`</aside>`,
	].join('');
};
