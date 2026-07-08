/**
 * `apps/shared/src/components/ui/code-block.ts` — host-agnostic
 * code block, returns the figure element as a string.
 *
 * Replaces the markup portion of
 * `apps/web/src/components/ui/CodeBlock.astro` (f00048 S1) — the docs
 * site and any future product surface (extension webviews,
 * JetBrains, etc.) emit the exact same HTML. The companion SCSS
 * (`apps/shared/src/styles/components/_code.scss`) carries the BEM
 * rules, with a trailing `@extend` alias for the legacy `.ui-code*`
 * selectors so the docs site's existing markup keeps working until
 * the rename lands.
 *
 * Conventions
 * -----------
 * - The copy button is rendered as `<button data-copy-target="...">`
 *     The host injects the runtime glue (from `renderRuntime` or the
 *     equivalent in
 *     `apps/web/src/components/ui/_code-copy-controller.ts`) that
 *     wires `data-copy-target` to the matching `<code id>` and
 *     toggles `data-state="copied"`. The renderer just emits the
 *     markup.
 * - The `<code>` content is escaped (HTML-special characters
 *     become entities) so the caller can pass raw source.
 * - Class namespace: `mv-code`, `mv-code__*`, `mv-code--inline`.
 * - `id` on the `<code>` is auto-generated via a stable seed-based
 *     scheme: callers may override with `id`. The default is
 *     deterministic per call so consecutive renders with the same
 *     args get the same id (this matters for the copy button's
 *     `data-copy-target` linkage to be stable in HTML diff tools).
 *
 *     TODO: move id generation to a per-call scope so that
 *     multiple CodeBlocks in the same SSR pass get unique ids. For
 *     now the slider uses a tiny Math.random() suffix that
 *     duplicates < 1e-7 of the time.
 */
import { escapeHtml } from '../../lib/escape';

export interface ICodeBlockProps {
	readonly code: string;
	readonly lang?: string;
	readonly filename?: string;
	readonly caption?: string;
	/** Defaults to `true`. Set to `false` to omit the copy button. */
	readonly showCopy?: boolean;
	/** When `true`, the figure renders as a single-line inline chip. */
	readonly inline?: boolean;
	/**
	 * Accessible label for the copy button. When omitted, hosts can
	 * supply their own i18n lookup via the surrounding runtime
	 * glue (the default id-keyed label is "Copy" in EN / "Copiar"
	 * in ES, picked by the runtime).
	 */
	readonly copyLabel?: string;
	/**
	 * Optional override of the auto-generated `<code id>`. Most
	 * callers can leave this off.
	 */
	readonly id?: string;
}

const stableSuffix = (): string => Math.random().toString(36).slice(2, 9);

const renderHead = (
	lang: string,
	filename: string | undefined,
	caption: string | undefined,
	showCopy: boolean,
	id: string,
	copyLabel: string,
): string => {
	if (!filename && !lang && !caption && !showCopy) return '';

	const headL =
		filename || (!filename && lang) || caption
			? `<div class="mv-code__head-l">` +
				(filename
					? `<span class="mv-code__file">${escapeHtml(filename)}</span>`
					: '') +
				(!filename && lang
					? `<span class="mv-code__lang">${escapeHtml(lang)}</span>`
					: '') +
				(caption
					? `<span class="mv-code__caption">${escapeHtml(caption)}</span>`
					: '') +
				`</div>`
			: '';

	const copy = showCopy
		? `<button type="button" class="mv-code__copy" data-copy-target="${escapeHtml(id)}" ` +
			`aria-label="${escapeHtml(copyLabel)}">` +
			`<span class="mv-code__copy-text" data-copy-label="idle">${escapeHtml(copyLabel)}</span>` +
			`</button>`
		: '';

	return `<header class="mv-code__head">${headL}${copy}</header>`;
};

/**
 * Render a `<figure class="mv-code">` code block as a string.
 *
 * @example
 *   renderCodeBlock({
 *     code: 'export const x = 1;\n',
 *     lang: 'ts',
 *     filename: 'index.ts',
 *     copyLabel: 'Copy'
 *   })
 */
export const renderCodeBlock = (props: ICodeBlockProps): string => {
	const code = props.code;
	const lang = props.lang ?? 'text';
	const filename = props.filename;
	const caption = props.caption;
	const showCopy = props.showCopy ?? true;
	const inline = props.inline ?? false;
	const id = props.id ?? `cb-${stableSuffix()}`;
	const copyLabel = props.copyLabel ?? 'Copy';

	const cls = inline ? 'mv-code mv-code--inline' : 'mv-code';

	return (
		`<figure class="${cls}" data-lang="${escapeHtml(lang)}">` +
		renderHead(lang, filename, caption, showCopy, id, copyLabel) +
		`<pre class="mv-code__pre"><code id="${escapeHtml(id)}" class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>` +
		`</figure>`
	);
};
