/**
 * `apps/shared/src/components/ui/stepper.ts` — host-agnostic
 * numbered list with a connected rail and inline-code spans.
 *
 * Replaces the markup portion of
 * `apps/web/src/components/ui/Stepper.astro`. Returns an HTML
 * string; pure presentational, no client JS, no `<slot>`. Any
 * host can call `renderStepper({ steps, start })` and emit the same
 * HTML the docs site uses.
 *
 * Conventions
 * -----------
 * - Each step's body may include `` `code` `` backticks. These
 *   are split out and rendered as `<code>` chips.
 * - Class namespace: `mcpv-stepper`, `mcpv-stepper__*`. The companion
 *   SCSS (`_stepper.scss`) carries a `@extend .ui-stepper ->
 *   .mcpv-stepper` alias so the docs site's existing markup keeps
 *   working without a rename.
 * - The list is rendered as `<ol start="…">` so the semantic
 *   order survives even when CSS hides the visual numbers (and
 *   so screen readers announce "1." … "N.").
 */
import { escapeHtml } from '../../lib/escape';

export interface IStepperProps {
	/** Ordered list of step bodies. Each body may contain `code` backticks. */
	readonly steps: ReadonlyArray<string>;
	/** Number for the first step (default 1). */
	readonly start?: number;
}

interface ITextPart {
	readonly text?: string;
	readonly code?: string;
}

const splitCodeSpans = (text: string): ITextPart[] =>
	text
		.split(/(`[^`]+`)/g)
		.filter((p) => p.length > 0)
		.map(
			(part): ITextPart =>
				part.startsWith('`') && part.endsWith('`')
					? { code: part.slice(1, -1) }
					: { text: part },
		);

const renderPart = (part: ITextPart): string =>
	part.code !== undefined
		? `<code>${escapeHtml(part.code)}</code>`
		: escapeHtml(part.text ?? '');

/**
 * Render a `<ol class="mcpv-stepper">` stepper as a string.
 *
 * @example
 *   renderStepper({
 *     steps: [
 *       'Install `bun` from the official site.',
 *       'Run `bun install` to fetch dependencies.',
 *     ],
 *   })
 */
export const renderStepper = (props: IStepperProps): string => {
	const start = props.start ?? 1;
	const items = props.steps
		.map((s, i) => {
			const num = start + i;
			const parts = splitCodeSpans(s).map(renderPart).join('');
			return (
				`<li class="mcpv-stepper__item">` +
				`<span class="mcpv-stepper__num" aria-hidden="true">${num}</span>` +
				`<div class="mcpv-stepper__body">` +
				`<p class="mcpv-stepper__text">${parts}</p>` +
				`</div>` +
				`</li>`
			);
		})
		.join('');
	return `<ol class="mcpv-stepper" start="${start}">${items}</ol>`;
};
