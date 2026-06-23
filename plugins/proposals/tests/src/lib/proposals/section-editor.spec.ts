/**
 * section-editor.spec.ts
 *
 * Pins the contract of `proposals/section-editor.ts` — pure markdown
 * section manipulation used by `proposals_edit` and `proposals_add_slice`.
 *
 * Coverage:
 *   - `renderSectionBody`: string vs string[] rendering.
 *   - `replaceSection`: heading present (replace body), heading absent
 *     (insert before `## Slices` if present, else append), heading
 *     present at end of file (replace body until EOF).
 *   - The `## Acceptance (global)` variant for the acceptance field
 *     (multi-slice proposals use it as a sibling heading).
 */

import { describe, expect, it } from 'vitest';

import {
	FIELD_CANONICAL_HEADING,
	FIELD_HEADING_RE,
	renderSectionBody,
	replaceSection,
} from '@mcp-vertex/proposals/lib/proposals/section-editor';

describe('renderSectionBody', () => {
	it('returns the string as-is when the value is a string', () => {
		expect(renderSectionBody('hello world')).toBe('hello world');
	});

	it('joins an array with `- ` bullet markers', () => {
		expect(renderSectionBody(['one', 'two', 'three'])).toBe(
			'- one\n- two\n- three',
		);
	});

	it('returns an empty string for an empty array', () => {
		expect(renderSectionBody([])).toBe('');
	});

	it('returns an empty string for the empty string', () => {
		expect(renderSectionBody('')).toBe('');
	});
});

describe('replaceSection', () => {
	it('replaces the body of an existing `## Goal` section in-place', () => {
		const md = `# Title\n\n## Goal\n\nold body\n\n## Why\n\nwhy body\n`;
		const out = replaceSection(
			md,
			FIELD_HEADING_RE.goal,
			FIELD_CANONICAL_HEADING.goal,
			'new body',
		);
		expect(out).toBe(
			`# Title\n\n## Goal\n\nnew body\n\n## Why\n\nwhy body\n`,
		);
	});

	it('matches the `## Acceptance (global)` variant for the acceptance field', () => {
		const md = `# Title\n\n## Acceptance (global)\n\n- a\n- b\n`;
		const out = replaceSection(
			md,
			FIELD_HEADING_RE.acceptance,
			FIELD_CANONICAL_HEADING.acceptance,
			'fresh',
		);
		expect(out).toContain('## Acceptance');
		expect(out).toContain('fresh');
		expect(out).not.toContain('- a');
	});

	it('inserts a new section before `## Slices` when the heading is absent', () => {
		const md = `# Title\n\n## Slices\n\n### S1 — Foo\n`;
		const out = replaceSection(
			md,
			FIELD_HEADING_RE.goal,
			FIELD_CANONICAL_HEADING.goal,
			'a fresh goal',
		);
		expect(out).toBe(
			`# Title\n\n## Goal\n\na fresh goal\n\n## Slices\n\n### S1 — Foo\n`,
		);
	});

	it('appends the section at EOF when both the heading and `## Slices` are absent', () => {
		const md = `# Title\n\n## Why\n\nwhy body\n`;
		const out = replaceSection(
			md,
			FIELD_HEADING_RE.goal,
			FIELD_CANONICAL_HEADING.goal,
			'a fresh goal',
		);
		expect(out).toBe(
			`# Title\n\n## Why\n\nwhy body\n\n## Goal\n\na fresh goal\n`,
		);
	});

	it('replaces the body of the LAST section (no next heading)', () => {
		const md = `# Title\n\n## Goal\n\nold\n`;
		const out = replaceSection(
			md,
			FIELD_HEADING_RE.goal,
			FIELD_CANONICAL_HEADING.goal,
			'new',
		);
		expect(out).toBe(`# Title\n\n## Goal\n\nnew\n`);
	});

	it('does NOT touch the frontmatter block', () => {
		const md = `---\nid: f1\nstatus: ready\n---\n\n## Goal\n\nold\n\n## Why\n\nwhy\n`;
		const out = replaceSection(
			md,
			FIELD_HEADING_RE.goal,
			FIELD_CANONICAL_HEADING.goal,
			'new',
		);
		expect(out).toContain('id: f1');
		expect(out).toContain('status: ready');
		expect(out).toContain('## Goal\n\nnew\n');
	});
});

describe('FIELD_HEADING_RE — registry invariant', () => {
	it('every editable field has a regex AND a canonical heading', () => {
		// If you add a new field to `IEditableField`, you MUST add both
		// a regex AND a canonical heading here — this test guards
		// against the half-change.
		const fields = Object.keys(FIELD_CANONICAL_HEADING) as Array<
			keyof typeof FIELD_CANONICAL_HEADING
		>;
		for (const field of fields) {
			expect(FIELD_HEADING_RE[field]).toBeInstanceOf(RegExp);
			expect(FIELD_CANONICAL_HEADING[field]).toMatch(/^##\s+\S/);
		}
	});
});
