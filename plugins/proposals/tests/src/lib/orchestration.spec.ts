import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildDelegateRegistration,
	buildPlanRegistration,
} from '@mcp-vertex/proposals/lib/tools/orchestration.tool';
import type { IAgentNamesToolOptions } from '@mcp-vertex/proposals/lib/tools/agent-names.tool';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	return handler!;
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('plan tool', async () => {
	it('flags file overlap and lists claimable slices', async () => {
		const handler = await capture(buildPlanRegistration('proposals'));
		const out = parse(
			await handler({
				slices: [
					{ sliceId: 's1', files: ['a.ts'] },
					{ sliceId: 's2', files: ['a.ts', 'b.ts'] },
					{ sliceId: 's3', files: ['c.ts'] },
				],
			}),
		);
		expect(out.disjointnessIssues.length).toBeGreaterThan(0); // s1/s2 share a.ts
		expect(out.claimableSliceIds).toContain('s3');
	});
});

describe('delegate tool', async () => {
	let root = '';
	let opts: IAgentNamesToolOptions;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deleg-'));
		opts = {
			namespacePrefix: 'proposals',
			registryPathAbs: join(root, 'registry.json'),
			lockPathAbs: join(root, 'lock.json'),
			queuePathAbs: join(root, 'queue.json'),
			closedTasksPathAbs: join(root, 'closed.json'),
			workspaceRoot: root,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('assigns a name and locks the files in one handoff', async () => {
		const handler = await capture(
			buildDelegateRegistration({
				namespacePrefix: 'proposals',
				agentNames: opts,
				lockPathAbs: opts.lockPathAbs,
			}),
		);
		const out = parse(
			await handler({
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['src/x.ts'],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.locked).toBe(true);
		expect(typeof out.agent).toBe('string');
		expect(out.instruction).toContain('src/x.ts');
	});
});
