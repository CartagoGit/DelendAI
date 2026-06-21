import { describe, expect, it } from 'vitest';

import { lintProposalMarkdown } from '@mcp-vertex/proposals/lib/proposals/proposal-scaffold-linter';

const FRONTMATTER = (overrides: Record<string, string> = {}): string => {
	const fields: Record<string, string> = {
		id: 'f114',
		kind: 'feat',
		title: 'A sufficiently long title',
		status: 'ready',
		date: '2026-06-20',
		track: 'proposals',
		...overrides,
	};
	const lines = Object.entries(fields)
		.filter(([, v]) => v !== '')
		.map(([k, v]) => `${k}: ${v}`);
	return `---\n${lines.join('\n')}\n---\n`;
};

const TERSE_SLICE = `### S1 — Do the thing
- **Status**: pending
- **Files**: [\`a.ts\`]
- **Command**: \`bun run test\`
- **Expect**: exit0
`;

const NARRATIVE_SLICE = (
	heading = '### S1 — Do the thing *(excl. `a.ts`)*',
): string => `${heading}
- **Status**: pending
- Free prose describing the steps.
- **Gate**: \`bun run test\`
- **Estimated work**: 1 session.
`;

const BODY = (sliceBlock: string = TERSE_SLICE): string => `
## Goal

One paragraph.

## Why

1-3 paragraphs.

## Non-goals

- not this.

## Slices

${sliceBlock}
## Acceptance

- [ ] done.
`;

const doc = (
	frontmatterOverrides: Record<string, string> = {},
	sliceBlock: string = TERSE_SLICE,
): string => FRONTMATTER(frontmatterOverrides) + BODY(sliceBlock);

describe('lintProposalMarkdown — happy paths', () => {
	it('accepts a minimal valid proposal with terse slices', () => {
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f114-do-the-thing.md',
			markdown: doc(),
		});
		expect(result.ok).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it('accepts the narrative slice form (Gate + excl-files heading)', () => {
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f114-do-the-thing.md',
			markdown: doc({}, NARRATIVE_SLICE()),
		});
		expect(result.ok).toBe(true);
	});

	it('accepts numbered headings as equivalent to bare names', () => {
		const numbered = doc()
			.replace('## Goal', '## 0. Goal')
			.replace('## Why\n', '## 1. Why\n');
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f114-do-the-thing.md',
			markdown: numbered,
		});
		expect(result.ok).toBe(true);
	});

	it('accepts all four optional sections in their fixed slots', () => {
		const withOptional = `${FRONTMATTER()}
## Goal

p.

## Why

p.

## Why this design

p.

## Non-goals

- x

## Architecture

p.

## Slices

${TERSE_SLICE}
## Dependency graph

p.

## Acceptance

- [ ] done.

## Risks and mitigations

p.

## Notes

p.
`;
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f114-do-the-thing.md',
			markdown: withOptional,
		});
		expect(result.ok).toBe(true);
	});

	it('resolves filename/folder/kind/status consistently', () => {
		const result = lintProposalMarkdown({
			path: 'docs/proposals/in-progress/x042-fix-the-bug.md',
			markdown: doc({ id: 'x042', kind: 'fix', status: 'in-progress' }),
		});
		expect(result.ok).toBe(true);
	});

	it('resolves the retired legacy "p" prefix against kind: legacy', () => {
		const result = lintProposalMarkdown({
			path: 'docs/proposals/done/p099-old-thing.md',
			markdown: doc({ id: 'p099', kind: 'legacy', status: 'done' }),
		});
		expect(result.ok).toBe(true);
	});

	it('ignores illustrative headings/slices written inside a fenced code block (regression: f113 §4.5 documents the scaffold using literal "## Goal" lines inside a ```markdown fence — the linter must not parse those as real structure)', () => {
		const withExampleFence = `${FRONTMATTER()}
## Goal

One paragraph.

## Why

p.

Example of the format other proposals should follow:

\`\`\`markdown
## Goal
## Why
## Non-goals
## Slices
### S1 — example only, not a real slice
## Acceptance
\`\`\`

## Non-goals

- not this.

## Slices

${TERSE_SLICE}
## Acceptance

- [ ] done.
`;
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f114-do-the-thing.md',
			markdown: withExampleFence,
		});
		expect(result.ok).toBe(true);
	});
});

describe('lintProposalMarkdown — negative cases', () => {
	const lint = (
		markdown: string,
		path = 'docs/proposals/ready/f114-do-the-thing.md',
	) => lintProposalMarkdown({ path, markdown });

	it('flags a missing required section', () => {
		const result = lint(doc().replace(/## Acceptance[\s\S]*$/, ''));
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('missing required section "acceptance"'),
			),
		).toBe(true);
	});

	it('flags an out-of-order section', () => {
		const swapped = `${FRONTMATTER()}
## Why

p.

## Goal

p.

## Non-goals

- x

## Slices

${TERSE_SLICE}
## Acceptance

- [ ] done.
`;
		const result = lint(swapped);
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('out of canonical order'),
			),
		).toBe(true);
	});

	it('flags an unrecognized section heading', () => {
		const result = lint(
			doc().replace('## Non-goals', '## Random Section\n\n## Non-goals'),
		);
		expect(
			result.issues.some((i) =>
				i.message.includes('unrecognized section heading'),
			),
		).toBe(true);
	});

	it('flags a duplicate section', () => {
		const result = lint(`${doc()}\n## Goal\n\nagain.\n`);
		expect(
			result.issues.some((i) => i.message.includes('duplicate section')),
		).toBe(true);
	});

	it('flags a missing frontmatter field', () => {
		const result = lint(doc({ track: '' }));
		expect(
			result.issues.some((i) =>
				i.message.includes('missing required field "track"'),
			),
		).toBe(true);
	});

	it('flags an invalid kind', () => {
		const result = lint(doc({ kind: 'nonsense' }));
		expect(
			result.issues.some((i) =>
				i.message.includes('not one of the 13 known kinds'),
			),
		).toBe(true);
	});

	it('flags an invalid status', () => {
		const result = lint(doc({ status: 'nonsense' }));
		expect(
			result.issues.some((i) =>
				i.message.includes('not one of the 7 known statuses'),
			),
		).toBe(true);
	});

	it('flags an invalid id pattern', () => {
		const result = lint(doc({ id: 'F114' }));
		expect(
			result.issues.some((i) => i.message.includes('does not match')),
		).toBe(true);
	});

	it('flags a too-short title', () => {
		const result = lint(doc({ title: 'short' }));
		expect(
			result.issues.some((i) =>
				i.message.includes('shorter than 8 characters'),
			),
		).toBe(true);
	});

	it('flags a missing frontmatter block entirely', () => {
		const result = lint(BODY());
		expect(
			result.issues.some((i) =>
				i.message.includes('no YAML frontmatter block'),
			),
		).toBe(true);
	});

	it('flags a filename prefix that disagrees with frontmatter kind', () => {
		const result = lint(
			doc({ kind: 'fix' }),
			'docs/proposals/ready/f114-do-the-thing.md',
		);
		expect(
			result.issues.some((i) => i.message.includes('frontmatter.kind')),
		).toBe(true);
	});

	it('flags a folder that disagrees with frontmatter status', () => {
		const result = lint(
			doc({ status: 'done' }),
			'docs/proposals/ready/f114-do-the-thing.md',
		);
		expect(
			result.issues.some((i) =>
				i.message.includes('expects folder "done"'),
			),
		).toBe(true);
	});

	// f119: terminal statuses (`done`, `retired`) may live under a kind
	// sub-folder. The check is status-driven: walk ancestors, find the
	// nearest status folder, compare to expected.
	describe('terminal-status sub-folders (f119)', () => {
		it('accepts done/audits/foo.md with status: done', () => {
			const result = lint(
				doc({ status: 'done' }),
				'docs/proposals/done/audits/a001-15-06-2026-foo.md',
			);
			expect(
				result.issues.some((i) => i.message.includes('expects folder')),
			).toBe(false);
		});

		it('accepts done/feats/foo.md with status: done', () => {
			const result = lint(
				doc({ status: 'done' }),
				'docs/proposals/done/feats/f114-do-the-thing.md',
			);
			expect(
				result.issues.some((i) => i.message.includes('expects folder')),
			).toBe(false);
		});

		it('accepts done/audits/2024/q1/foo.md (deeply nested)', () => {
			const result = lint(
				doc({ status: 'done' }),
				'docs/proposals/done/audits/2024/q1/a001-foo.md',
			);
			expect(
				result.issues.some((i) => i.message.includes('expects folder')),
			).toBe(false);
		});

		it('accepts retired/foo.md with status: retired', () => {
			const result = lint(
				doc({ status: 'retired' }),
				'docs/proposals/retired/x001-foo.md',
			);
			expect(
				result.issues.some((i) => i.message.includes('expects folder')),
			).toBe(false);
		});

		it('rejects ready/audits/foo.md with status: done (non-terminal)', () => {
			const result = lint(
				doc({ status: 'done' }),
				'docs/proposals/ready/audits/f114-foo.md',
			);
			expect(
				result.issues.some((i) => i.message.includes('expects folder')),
			).toBe(true);
		});

		it('uses nearest status ancestor, not first occurrence', () => {
			// If a file lives in `ready/audits/done/foo.md`, the nearest
			// status ancestor is `ready`, not `done`. status: ready matches.
			const result = lint(
				doc({ status: 'ready' }),
				'docs/proposals/ready/audits/done/f114-foo.md',
			);
			expect(
				result.issues.some((i) => i.message.includes('expects folder')),
			).toBe(false);
		});
	});

	it('flags a slice with no Status field', () => {
		const badSlice = `### S1 — Do the thing\n- **Files**: [\`a.ts\`]\n- **Gate**: \`bun run test\`\n`;
		const result = lint(doc({}, badSlice));
		expect(
			result.issues.some((i) =>
				i.message.includes('no **Status** field'),
			),
		).toBe(true);
	});

	it('flags a slice that resolves no Files field', () => {
		const badSlice = `### S1 — Do the thing\n- **Status**: pending\n- **Gate**: \`bun run test\`\n`;
		const result = lint(doc({}, badSlice));
		expect(
			result.issues.some((i) =>
				i.message.includes('does not resolve a Files field'),
			),
		).toBe(true);
	});

	it('flags a slice that resolves no Command+Expect/Gate', () => {
		const badSlice = `### S1 — Do the thing *(excl. \`a.ts\`)*\n- **Status**: pending\n`;
		const result = lint(doc({}, badSlice));
		expect(
			result.issues.some((i) =>
				i.message.includes('does not resolve Command+Expect'),
			),
		).toBe(true);
	});

	it('flags an empty Slices section', () => {
		const empty = `${FRONTMATTER()}
## Goal

p.

## Why

p.

## Non-goals

- x

## Slices

(nothing here)

## Acceptance

- [ ] done.
`;
		const result = lint(empty);
		expect(
			result.issues.some((i) => i.message.includes('no `### S<N>')),
		).toBe(true);
	});

	it('flags an unknown filename prefix', () => {
		const result = lint(doc(), 'docs/proposals/ready/z114-do-the-thing.md');
		expect(
			result.issues.some((i) =>
				i.message.includes('is not a known kind prefix'),
			),
		).toBe(true);
	});
});

describe('lintProposalMarkdown — audit format', () => {
	const AUDIT_FRONTMATTER = (
		overrides: Record<string, string> = {},
	): string => {
		const fields: Record<string, string> = {
			id: 'a021',
			kind: 'audit',
			title: 'Audit of some component',
			status: 'ready',
			date: '2026-06-20',
			track: 'archive',
			...overrides,
		};
		const lines = Object.entries(fields)
			.filter(([, v]) => v !== '')
			.map(([k, v]) => `${k}: ${v}`);
		return `---\n${lines.join('\n')}\n---\n`;
	};

	const AUDIT_BODY = (sliceBlock: string = TERSE_SLICE): string => `
## Goal

One paragraph.

## Why

1-3 paragraphs.

## Non-goals

- not this.

## Slices

${sliceBlock}
## Acceptance

- [ ] done.

## Verified State

LOC and test metrics.

## Findings

Prioritized list of findings.

## Scoreboard

Table of dimensions.
`;

	const auditDoc = (
		frontmatterOverrides: Record<string, string> = {},
		sliceBlock: string = TERSE_SLICE,
	): string =>
		AUDIT_FRONTMATTER(frontmatterOverrides) + AUDIT_BODY(sliceBlock);

	it('accepts a minimal valid audit proposal', () => {
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/a021-audit-report.md',
			markdown: auditDoc(),
		});
		expect(result.ok).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it('flags a missing required audit section (e.g. Scoreboard)', () => {
		const missingScoreboard = auditDoc().replace(
			'## Scoreboard',
			'## Unused',
		);
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/a021-audit-report.md',
			markdown: missingScoreboard,
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('missing required section "scoreboard"'),
			),
		).toBe(true);
	});

	it('flags out-of-order audit sections', () => {
		const swapped = auditDoc()
			.replace('## Findings', '## Temp')
			.replace('## Verified State', '## Findings')
			.replace('## Temp', '## Verified State');
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/a021-audit-report.md',
			markdown: swapped,
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('out of canonical order'),
			),
		).toBe(true);
	});
});

describe('lintProposalMarkdown — f00024 cascadeOverride / cascadeBoost', () => {
	// Builds a doc with arbitrary raw frontmatter lines (including numeric
	// or array values that the string-only `FRONTMATTER` helper above
	// cannot express — `cascadeOverride` is a number).
	const rawDoc = (extraFrontmatter: string): string => `---
id: f00024
kind: feat
title: f00024 cascade priority by kind with frontmatter override
status: ready
date: 2026-06-21
track: proposals-plugin+workflow
${extraFrontmatter}
---

## Goal

p.

## Why

p.

## Non-goals

- not this.

## Slices

### S1 — Slice one
- **Status**: pending
- **Files**: [\`x.ts\`]
- **Command**: \`bun run test\`
- **Expect**: exit0

## Acceptance

- [ ] done.
`;

	it('accepts cascadeOverride with a paired cascadeOverrideReason', () => {
		const markdown = rawDoc(
			'cascadeOverride: -1\ncascadeOverrideReason: urgent customer escalation',
		);
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f00024-do-the-thing.md',
			markdown,
		});
		expect(
			result.issues.some((i) => i.message.includes('cascadeOverride')),
		).toBe(false);
	});

	it('flags cascadeOverride without cascadeOverrideReason', () => {
		const markdown = rawDoc('cascadeOverride: -1');
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f00024-do-the-thing.md',
			markdown,
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('cascadeOverrideReason'),
			),
		).toBe(true);
	});

	it('flags cascadeOverrideReason without cascadeOverride (dangling audit trail)', () => {
		const markdown = rawDoc(
			'cascadeOverrideReason: this reason has no override',
		);
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f00024-do-the-thing.md',
			markdown,
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('cascadeOverride is missing'),
			),
		).toBe(true);
	});

	it('flags a non-numeric cascadeOverride', () => {
		const markdown = rawDoc(
			"cascadeOverride: '-1'\ncascadeOverrideReason: bad type",
		);
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f00024-do-the-thing.md',
			markdown,
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) =>
				i.message.includes('cascadeOverride must be a finite number'),
			),
		).toBe(true);
	});

	it('accepts each allowed cascadeBoost value', () => {
		for (const boost of [
			'shipped-blocking',
			'customer-reported',
			'security',
		]) {
			const markdown = rawDoc(`cascadeBoost: ${boost}`);
			const result = lintProposalMarkdown({
				path: 'docs/proposals/ready/f00024-do-the-thing.md',
				markdown,
			});
			expect(
				result.issues.some((i) => i.message.includes('cascadeBoost')),
			).toBe(false);
		}
	});

	it('flags an unknown cascadeBoost (would silently no-op at runtime)', () => {
		const markdown = rawDoc('cascadeBoost: urgent-please');
		const result = lintProposalMarkdown({
			path: 'docs/proposals/ready/f00024-do-the-thing.md',
			markdown,
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((i) => i.message.includes('cascadeBoost')),
		).toBe(true);
	});
});
