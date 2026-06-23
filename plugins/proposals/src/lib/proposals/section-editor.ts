/**
 * section-editor.ts
 *
 * Pure markdown section manipulation — replace, insert, or remove
 * the body of a `## Heading` section. Used by `proposals_edit`
 * (and future `proposals_add_*` tools) to keep the
 * "section semantics" out of the tool's tool-surface code.
 *
 * SRP: this module owns ONLY the question "given a markdown blob
 * and a `## Heading` reference, how do I rewrite the section's body
 * while leaving the rest byte-identical?". No file I/O, no
 * validation, no schema — those live in the tool that calls into
 * here.
 *
 * Pre-refactor: `FIELD_HEADING_RE`, `FIELD_CANONICAL_HEADING`,
 * `renderSectionBody` and `replaceSection` were private helpers
 * inside `mutate-tools.ts`. Extracting them here:
 *   - lets a future `proposals_remove_section` tool reuse the same
 *     heading detection + boundary logic without duplicating regexes,
 *   - lets the "edit" and "add_slice" tools share the same
 *     canonical-heading insertion behaviour (so a freshly-added
 *     `## Goal` always reads `## Goal`, never `##goal `),
 *   - keeps `mutate-tools.ts` focused on the tool surface (Zod
 *     schemas + registration), not on markdown semantics.
 *
 * Pure functions: every helper takes a string and returns a string
 * (or an array of strings for `renderSectionBody`). No I/O, no
 * shared state, easy to unit-test.
 */

/**
 * The five canonical top-level fields that `proposals_edit` supports.
 * New fields are added by extending this union + extending the two
 * `Record` maps below — a single point of change for the contract
 * between the tool and the markdown shape.
 */
export type IEditableField =
	| 'goal'
	| 'why'
	| 'nonGoals'
	| 'acceptance'
	| 'risk';

/**
 * Maps each editable field to the markdown heading regex that locates its
 * section. `acceptance` matches both the plain `## Acceptance` heading
 * and the `## Acceptance (global)` variant used by multi-slice proposals
 * (see `docs/proposals/ready/f00020-skills-and-tools-coverage.md`).
 */
export const FIELD_HEADING_RE: Record<IEditableField, RegExp> = {
	goal: /^## Goal\s*$/im,
	why: /^## Why\s*$/im,
	nonGoals: /^## Non-goals\s*$/im,
	acceptance: /^## Acceptance(?:\s*\(.*\))?\s*$/im,
	risk: /^## risks and mitigations\s*$/im,
};

export const FIELD_CANONICAL_HEADING: Record<IEditableField, string> = {
	goal: '## Goal',
	why: '## Why',
	nonGoals: '## Non-goals',
	acceptance: '## Acceptance',
	risk: '## risks and mitigations',
};

/** Render a field value (string or string[]) as the markdown body of a section. */
export const renderSectionBody = (value: string | readonly string[]): string =>
	typeof value === 'string'
		? value
		: value.map((line) => `- ${line}`).join('\n');

/**
 * Replace the body of `heading`'s section (everything between the
 * heading line and the next `## ` heading, or end of file) with
 * `newBody`. If the heading does not exist yet, appends a new section
 * (with `canonicalHeading`) right before `## Slices` when present,
 * otherwise at the end of the document.
 */
export const replaceSection = (
	markdown: string,
	headingRe: RegExp,
	canonicalHeading: string,
	newBody: string,
): string => {
	const lines = markdown.split('\n');
	const headingIndex = lines.findIndex((line) => headingRe.test(line));
	if (headingIndex === -1) {
		// Section absent: insert a new one before `## Slices` if present,
		// else append at the end. Keeps frontmatter + everything else intact.
		const slicesIndex = lines.findIndex((line) =>
			/^## Slices\s*$/.test(line),
		);
		const insertion = [canonicalHeading, '', newBody, ''];
		if (slicesIndex === -1) {
			return [...lines, '', ...insertion].join('\n');
		}
		return [
			...lines.slice(0, slicesIndex),
			...insertion,
			...lines.slice(slicesIndex),
		].join('\n');
	}
	// Find the next top-level heading after this one.
	let endIndex = lines.length;
	for (let i = headingIndex + 1; i < lines.length; i += 1) {
		if (/^## /.test(lines[i] ?? '')) {
			endIndex = i;
			break;
		}
	}
	return [
		...lines.slice(0, headingIndex),
		canonicalHeading,
		'',
		newBody,
		'',
		...lines.slice(endIndex),
	].join('\n');
};
