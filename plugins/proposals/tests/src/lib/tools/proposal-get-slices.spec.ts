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
	return typeof text === 'string' ? JSON.parse(text) : undefined;
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
});
