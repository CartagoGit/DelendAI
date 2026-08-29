import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildClosePlanRegistration,
	type IClosePlanToolOptions,
} from '@mcp-vertex/proposals/lib/tools/close-plan.tool';

const capture = async (options: IClosePlanToolOptions) => {
	let handler:
		| ((args: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	let definition: { dryRunSupported?: boolean } | undefined;
	const registration = buildClosePlanRegistration(options);
	await registration.register({
		registerTool: (
			_name: string,
			registeredDefinition: unknown,
			registered: typeof handler,
		) => {
			definition = registeredDefinition as typeof definition;
			handler = registered;
		},
	} as never);
	return {
		dryRunSupported: registration.dryRunSupported,
		definition: definition!,
		handler: handler!,
	};
};

describe('proposals_close_plan dryRun contract', () => {
	let root = '';
	let options: IClosePlanToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'close-plan-'));
		const proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		const indexPathAbs = join(
			root,
			'.cache/mcp-vertex/proposals/index.json',
		);
		await mkdir(join(proposalsDirAbs, 'in-progress'), { recursive: true });
		await mkdir(join(indexPathAbs, '..'), { recursive: true });
		await writeFile(
			join(proposalsDirAbs, 'in-progress/q99999-fixture.md'),
			'---\nid: q99999\ntype: plan\nstatus: in-progress\n---\n\n# q99999\n',
			'utf8',
		);
		await writeFile(
			indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'q99999',
						file: 'in-progress/q99999-fixture.md',
						status: 'in-progress',
						type: 'plan',
					},
				],
			}),
			'utf8',
		);
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs,
			indexPathAbs,
			workspaceRoot: root,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('declares support and returns the canonical envelope without mutating the plan', async () => {
		const planPath = join(
			options.proposalsDirAbs,
			'in-progress/q99999-fixture.md',
		);
		const before = await readFile(planPath, 'utf8');
		const { dryRunSupported, handler } = await capture(options);
		const result = await handler({ planId: 'q99999', dryRun: true });
		const body = JSON.parse(result.content[0]?.text ?? '{}');

		expect(dryRunSupported).toBe(true);
		expect(body).toMatchObject({
			dryRun: true,
			wouldChange: [
				{
					kind: 'rename',
					summary: 'move q99999 from in-progress to done',
				},
			],
			wouldRun: [
				{
					shape: 'mcp',
					target: 'proposal_transition',
				},
			],
			risk: 'medium',
		});
		expect(await readFile(planPath, 'utf8')).toBe(before);
	});
});
