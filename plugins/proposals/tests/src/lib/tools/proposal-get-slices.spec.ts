/**
 * proposal-get-slices.spec.ts — the slices view is what an agent reads
 * instead of the document: the open slices, with what each waits on,
 * changes and still has to meet.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProposalGetRegistration } from '@delendai/proposals/lib/tools/proposal-get.tool';
import { createFakeToolServer } from '@delendai/test-kit/public';

const DOCUMENT = [
	'---',
	'id: f00001',
	'title: "A plan"',
	'kind: feat',
	'status: in-progress',
	'---',
	'',
	'# A plan',
	'',
	`${'A long explanation of why. '.repeat(200)}`,
	'',
	'## Slices',
	'',
	'### S1 — delivered',
	'- **Status**: review',
	'- **Files**: `src/a.ts`',
	'- acceptance:',
	'  - "a holds"',
	'',
	'### S2 — open',
	'- **Status**: pending',
	'- **Files**: `src/b.ts`, `src/c.ts`',
	'- **DependsOn**: [S1]',
	'- acceptance:',
	'  - "b holds"',
	'  - "c holds"',
	'',
].join('\n');

/** The object a tool answered with, read from its text. */
const payloadOf = (result: unknown): unknown => {
	const content =
		typeof result === 'object' && result !== null && 'content' in result
			? result.content
			: undefined;
	const first: unknown = Array.isArray(content) ? content[0] : undefined;
	const text =
		typeof first === 'object' && first !== null && 'text' in first
			? first.text
			: undefined;
	if (typeof text !== 'string') return undefined;
	try {
		return JSON.parse(text);
	} catch {
		// A refusal is a sentence, not a payload.
		return text;
	}
};

describe('proposal_get { view: "slices" }', () => {
	let root = '';
	let read: (args: object) => Promise<unknown>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'proposal-slices-'));
		const proposalsDirAbs = join(root, 'docs/delendai/proposals');
		mkdirSync(join(proposalsDirAbs, 'in-progress'), { recursive: true });
		mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
		writeFileSync(
			join(proposalsDirAbs, 'in-progress', 'f00001-a-plan.md'),
			DOCUMENT,
		);
		let handler: ((args: object) => Promise<unknown>) | undefined;
		await buildProposalGetRegistration({
			namespacePrefix: 'proposals',
			proposalsDirAbs,
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
		}).register(
			createFakeToolServer({
				onRegisterTool: (call) => {
					handler = (args) => Promise.resolve(call.handler(args));
				},
			}),
		);
		read = async (args) => {
			if (handler === undefined)
				throw new Error('the tool never registered');
			return payloadOf(await handler(args));
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('gives an open slice what it waits on, what it changes and what is left to accept', async () => {
		const view = await read({ view: 'slices', proposalId: 'f00001' });
		expect(view).toMatchObject({
			view: 'slices',
			slices: [
				{ id: 'S1', status: 'review' },
				{
					id: 'S2',
					status: 'pending',
					dependsOn: ['S1'],
					files: ['src/b.ts', 'src/c.ts'],
					acceptance: ['b holds', 'c holds'],
				},
			],
		});
	});

	it('carries nothing more for a slice already delivered, and is a fraction of the document', async () => {
		const view = await read({ view: 'slices', proposalId: 'f00001' });
		const text = JSON.stringify(view);
		expect(text).not.toContain('a holds');
		expect(text).not.toContain('src/a.ts');
		expect(text.length).toBeLessThan(DOCUMENT.length / 10);
	});

	it('lists the proposals, filtered and paged', async () => {
		const all = await read({ view: 'list' });
		expect(all).toMatchObject({
			view: 'list',
			proposals: [
				{ id: 'f00001', status: 'in-progress', title: 'A plan' },
			],
			nextCursor: null,
		});
		expect(
			await read({ view: 'list', filters: { status: 'done' } }),
		).toMatchObject({ proposals: [] });
		expect(
			await read({ view: 'list', filters: { kind: 'feat' } }),
		).toMatchObject({ proposals: [{ id: 'f00001' }] });
	});

	it('gives the detail of one proposal', async () => {
		expect(
			await read({ view: 'detail', proposalId: 'f00001' }),
		).toMatchObject({
			view: 'detail',
			level: 'normal',
			proposal: { id: 'f00001', status: 'in-progress', priority: null },
		});
	});

	it('reads the history and the reviews from the review log', async () => {
		writeFileSync(
			join(root, '.cache/delendai/proposals/peer-review.jsonl'),
			[
				{
					kind: 'transition',
					ts: '2026-10-01T00:00:00.000Z',
					proposalId: 'f00001',
					from: 'ready',
					to: 'in-progress',
				},
				{
					kind: 'review',
					ts: '2026-10-02T00:00:00.000Z',
					proposalId: 'f00001',
					sliceId: 'S1',
					action: 'approve',
					implementer: 'agent-a',
					reviewer: 'agent-b',
					verdict: 'approved',
				},
				{
					kind: 'review',
					ts: '2026-10-03T00:00:00.000Z',
					proposalId: 'x00002',
					sliceId: 'S1',
					action: 'approve',
					implementer: 'agent-a',
					reviewer: 'agent-b',
				},
			]
				.map((entry) => JSON.stringify(entry))
				.join('\n'),
		);
		expect(
			await read({ view: 'history', proposalId: 'f00001' }),
		).toMatchObject({
			view: 'history',
			history: [
				{ action: 'transition', note: 'ready -> in-progress' },
				{ action: 'approve', note: 'approved' },
			],
		});
		expect(
			await read({ view: 'review', proposalId: 'f00001' }),
		).toMatchObject({
			view: 'review',
			reviews: [{ action: 'approve', note: 'approved' }],
		});
	});

	it('reads what a fuller document declares: its links, its priority, its paging', async () => {
		writeFileSync(
			join(
				root,
				'docs/delendai/proposals/in-progress',
				'f00002-linked.md',
			),
			[
				'---',
				'id: f00002',
				'kind: fix',
				'status: in-progress',
				'track: core',
				'priority: high',
				'parent-plan: q00001',
				'related:',
				'  - f00001',
				'audit-source:',
				'  section: "§3"',
				'---',
				'',
				'# Linked, titled by its heading',
				'',
			].join('\n'),
		);
		expect(
			await read({
				view: 'detail',
				proposalId: 'f00002',
				detail: 'full',
			}),
		).toMatchObject({
			level: 'full',
			proposal: {
				id: 'f00002',
				title: 'Linked, titled by its heading',
				priority: 'high',
				parentPlan: 'q00001',
				related: ['f00001'],
			},
		});
		expect(
			await read({ view: 'list', pagination: { limit: 1 } }),
		).toMatchObject({ proposals: [{ id: 'f00001' }], nextCursor: '1' });
		expect(
			await read({
				view: 'list',
				filters: { track: 'core' },
				pagination: { cursor: '0', limit: 5 },
			}),
		).toMatchObject({ proposals: [{ id: 'f00002' }], nextCursor: null });
	});

	it('answers nothing for a proposal that does not exist', async () => {
		expect(await read({ view: 'slices', proposalId: 'x99999' })).toBe(
			"proposal 'x99999' not found",
		);
	});
});
