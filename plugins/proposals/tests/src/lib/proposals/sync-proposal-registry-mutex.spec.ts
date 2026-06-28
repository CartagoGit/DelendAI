import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	type IAuthoringToolOptions,
} from '@mcp-vertex/proposals/lib/tools/authoring.tool';

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

describe('proposal serialization withFileMutex', () => {
	let root = '';
	let opts: IAuthoringToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'authoring-mutex-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('serializes concurrent close_slice operations', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00001',
				title: 'Add features',
				goal: 'Feature goal',
				slices: [
					{ sliceId: 'S1', files: ['src/a.ts'] },
					{ sliceId: 'S2', files: ['src/b.ts'] },
				],
			}),
		);
		expect(created.ok).toBe(true);

		const close = await capture(buildCloseSliceRegistration(opts));

		// Run concurrent slice closure requests
		const [r1, r2] = await Promise.all([
			close({ proposalId: 'f00001', sliceId: 'S1' }),
			close({ proposalId: 'f00001', sliceId: 'S2' }),
		]);

		expect(parse(r1).ok).toBe(true);
		expect(parse(r2).ok).toBe(true);
	});
});
