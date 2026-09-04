import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import {
	buildCreateProposalRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('create_proposal concurrency', () => {
	let root = '';
	let opts: IAuthoringToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'create-proposal-concurrency-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			peerReviewLogPathAbs: join(
				root,
				'.cache/mcp-vertex/proposals/peer-review.jsonl',
			),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			requirePeerReview: false,
		};
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('allocates distinct ids under concurrent create_proposal calls', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = await Promise.all(
			Array.from({ length: 5 }, (_, index) =>
				create({
					kind: 'feat',
					title: `Concurrent ${index + 1}`,
					goal: 'stress id allocation',
					slices: [
						{
							sliceId: `s${index + 1}`,
							files: [`src/${index + 1}.ts`],
						},
					],
				}),
			),
		);

		const bodies = created.map((result) => parse(result));
		expect(bodies.every((body) => body.ok === true)).toBe(true);

		const ids = bodies
			.map(
				(body) => String(body.file).match(/\/([a-z]\d{5})-/)?.[1] ?? '',
			)
			.sort();
		expect(new Set(ids).size).toBe(5);
		expect(ids).toEqual(['f00001', 'f00002', 'f00003', 'f00004', 'f00005']);

		for (const body of bodies) {
			const docPath = join(opts.proposalsDirAbs, body.file);
			const markdown = readFileSync(docPath, 'utf8');
			expect(markdown).toContain(
				`id: ${body.file.match(/([a-z]\d{5})-/)?.[1]}`,
			);
		}
	});
});
