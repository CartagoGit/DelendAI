/**
 * `apps/shared/src/components/ui/copy-button.ts` — host-agnostic
 * standalone "Copy" button, returns an HTML string.
 *
 * Replaces the markup portion of
 * `apps/web/src/components/ui/CopyButton.astro` (f00048 S1). The
 * button is rendered with `data-copy-text="..."` so the host's
 * existing runtime glue (`initCopyButtons` in apps/web, or the
 * `data-delendai-*` glue from `renderRuntime` in the extension) picks the
 * click up and copies the snippet to the clipboard. The runtime
 * then toggles `data-state="copied"` on the same element.
 *
 * Conventions
 * -----------
 * - Class namespace: `delendai-copybtn`, `delendai-copybtn__*`, and
 *   `delendai-copybtn--{ghost,solid}` for the two variants. Trailing
 *   `@extend` block in the companion SCSS keeps `.ui-copybtn*`
 *   valid for one slice.
 * - The icon glyph is a Unicode character (⧉ / U+29C9). Hosts
 *   that want a real `<svg>` can override via the `icon` slot, but
 *   none of the existing call sites need to.
 */

export type CopyButtonVariant = 'ghost' | 'solid';

export interface ICopyButtonProps {
	readonly text: string;
	readonly label?: string;
	readonly variant?: CopyButtonVariant;
}

import { escapeAttr, escapeHtml } from '../../lib/escape';

/**
 * Render a standalone copy button as a string.
 *
 * @example
 *   renderCopyButton({ text: 'npm install @delendai/core', label: 'Copy', variant: 'solid' })
 */
export const renderCopyButton = (props: ICopyButtonProps): string => {
	const variant: CopyButtonVariant = props.variant ?? 'ghost';
	const label = props.label ?? 'Copy';
	return (
		`<button type="button" ` +
		`class="delendai-copybtn delendai-copybtn--${variant}" ` +
		`data-copy-text="${escapeAttr(props.text)}" ` +
		`aria-label="${escapeHtml(label)}">` +
		`<span class="delendai-copybtn__icon" aria-hidden="true">⧉</span>` +
		`<span class="delendai-copybtn__label" data-copy-label="idle">${escapeHtml(label)}</span>` +
		`</button>`
	);
};
