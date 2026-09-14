import { describe, expect, it } from 'vitest';

import { deriveAuditTasks, parseAuditPlan } from '../../../src/lib/plan-reader';

describe('audit plan reader', () => {
	it('requires a type: plan document and derives ordered tasks', () => {
		const plan = parseAuditPlan(`---
id: q00001
status: ready
type: plan
kind: plan
title: Example implementation plan
contains:
    proposals:
        - id: x00001
          kind: fix
          required: true
          title: Repair boundary
---

# q00001

## Slices

### q00001-s1 — Fix: Repair boundary
- **Files**:
    - \`src/example.ts\`
- **Acceptance**: tests pass
`);

		expect(plan.id).toBe('q00001');
		expect(plan.children).toHaveLength(1);
		expect(deriveAuditTasks(plan)).toEqual([
			{
				id: 'q00001-q00001-s1',
				title: 'Repair boundary',
				description: expect.stringContaining('Plan: q00001.'),
				files: ['src/example.ts'],
				dependsOn: [],
			},
		]);
	});

	it('rejects valuation proposals', () => {
		expect(() =>
			parseAuditPlan('---\nid: x00001\ntype: proposal\ntitle: Fix\n---'),
		).toThrow('type: plan');
	});
});

describe('plan frontmatter and headings, read by hand', () => {
	// The three patterns that used to read these lines each put a `\s*`
	// next to something that also matches whitespace — polynomial
	// backtracking on a plan document, which is a file the workspace
	// happens to contain rather than an enum. What replaced them is a
	// scan for the first colon, so what it ACCEPTS has to be pinned.
	const plan = (frontmatter: string, body = '') =>
		parseAuditPlan(`---\n${frontmatter}\n---\n\n${body}`);

	it('reads a key whatever whitespace surrounds its colon', () => {
		const parsed = plan(
			[
				'id \t:   q00002',
				'type: plan',
				'title:   A title: with colons',
			].join('\n'),
		);

		expect(parsed.id).toBe('q00002');
		expect(parsed.title).toBe('A title: with colons');
	});

	it('ignores frontmatter lines that are not key/value at all', () => {
		const parsed = plan(
			[
				'id: q00003',
				'type: plan',
				'title: T',
				'no-colon-here',
				': no key',
				'not a key!: value',
			].join('\n'),
		);

		expect(parsed.id).toBe('q00003');
		expect(parsed.status).toBeUndefined();
		expect(parsed.kind).toBeUndefined();
	});

	it('takes a child id with and without its trailing comment title', () => {
		const parsed = plan(
			[
				'id: q00004',
				'type: plan',
				'title: T',
				'contains:',
				'    proposals:',
				'        - id: x00001 # Repair boundary',
				'        - id: x00002',
				'        - id: ',
				'        - name: not-an-id',
			].join('\n'),
		);

		expect(parsed.children).toEqual([
			{ id: 'x00001', title: 'Repair boundary' },
			{ id: 'x00002' },
		]);
	});

	it('returns no children when the plan declares none', () => {
		expect(
			plan(['id: q00005', 'type: plan', 'title: T'].join('\n')).children,
		).toEqual([]);
	});

	it('takes a slice heading only when it carries an id and a title', () => {
		const parsed = plan(
			['id: q00006', 'type: plan', 'title: T'].join('\n'),
			[
				'## Slices',
				'',
				'### q00006-s1 — Fix: Repair boundary',
				'- **Files**:',
				'    - `src/a.ts`',
				'    - `src/a.ts`',
				'',
				'### q00006-s2 — Implement:   ',
				'',
				'### not-a-slice heading',
				'',
				'### q00006-s3 — Task: Second one',
				'- **Acceptance**: `src/ignored.ts` stays out of the file list',
			].join('\n'),
		);

		// s2 has no title after the colon, so it is not a slice; the
		// duplicate file is listed once; an Acceptance line contributes no
		// files even though it contains a backticked path.
		expect(parsed.slices.map((slice) => slice.id)).toEqual([
			'q00006-s1',
			'q00006-s3',
		]);
		expect(parsed.slices[0]?.files).toEqual(['src/a.ts']);
		expect(parsed.slices[1]?.files).toEqual([]);
	});

	it('falls back to a generated instruction when a slice body is empty', () => {
		const parsed = plan(
			['id: q00007', 'type: plan', 'title: T'].join('\n'),
			['### q00007-s1 — Fix: Do the thing', ''].join('\n'),
		);

		expect(parsed.slices[0]?.instruction).toBe('Implement Do the thing.');
	});

	it('derives tasks from children when a plan declares no slices', () => {
		const parsed = plan(
			[
				'id: q00008',
				'type: plan',
				'title: T',
				'contains:',
				'    proposals:',
				'        - id: x00009 # Child work',
				'        - id: x00010',
			].join('\n'),
		);

		expect(
			deriveAuditTasks(parsed).map((task) => ({
				id: task.id,
				title: task.title,
			})),
		).toEqual([
			{ id: 'q00008-x00009', title: 'Child work' },
			// No comment title: the id stands in for one rather than
			// producing a task nobody can read.
			{ id: 'q00008-x00010', title: 'x00010' },
		]);
	});

	it('parses a pathological whitespace line in linear time', () => {
		const startedAt = performance.now();
		const parsed = plan(
			['id: q00009', 'type: plan', 'title: T', ' '.repeat(40_000)].join(
				'\n',
			),
		);

		expect(parsed.id).toBe('q00009');
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
