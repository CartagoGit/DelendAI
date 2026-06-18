import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAgentNames,
	type IAgentNamesToolOptions,
} from '@mcp-vertex/proposals/lib/tools/agent-names.tool';

const parse = (result: { content: Array<{ text: string }> }): unknown =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('agent_names (covers the orchestrator, not only subagents)', () => {
	let root = '';
	let options: IAgentNamesToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'agent-names-'));
		options = {
			namespacePrefix: 'proposals',
			registryPathAbs: join(root, 'registry.json'),
			lockPathAbs: join(root, 'agents.lock.json'),
			queuePathAbs: join(root, 'queue.json'),
			closedTasksPathAbs: join(root, 'closed.json'),
			workspaceRoot: root,
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('assigns a name to the root orchestrator (depth 0, no parent)', async () => {
		const result = await runAgentNames(
			{ action: 'assign', task_id: 'root', agent_slot: 'orchestrator' },
			options,
		);
		const assignment = parse(result) as {
			agent_name: string;
			depth: number;
			agent_slot: string;
		};
		expect(assignment.depth).toBe(0);
		expect(assignment.agent_slot).toBe('orchestrator');
		expect(assignment.agent_name.length).toBeGreaterThan(0);
	});

	it('assigns a distinct name to a child subagent and lists both', async () => {
		await runAgentNames(
			{ action: 'assign', task_id: 'root', agent_slot: 'orchestrator' },
			options,
		);
		await runAgentNames(
			{
				action: 'assign',
				task_id: 'child',
				agent_slot: 'implementation_runner',
				parent_task_id: 'root',
			},
			options,
		);
		const list = parse(
			await runAgentNames({ action: 'list' }, options),
		) as { summary: { active: number } };
		expect(list.summary.active).toBe(2);
	});

	it('honours a custom name pool from options', async () => {
		const result = await runAgentNames(
			{ action: 'assign', task_id: 'root', agent_slot: 'orchestrator' },
			{ ...options, pool: ['solo'] },
		);
		expect((parse(result) as { agent_name: string }).agent_name).toBe(
			'solo',
		);
	});

	// M10: a corrupt registry must NOT read as empty — that would let the
	// orchestrator hand out names already held by live agents.
	describe('corrupt registry (M10)', () => {
		const backupExists = (): boolean =>
			readdirSync(root).some((f) =>
				f.startsWith(`${basename(options.registryPathAbs)}.corrupt-`),
			);

		it('returns a structured error naming the backup instead of assigning', async () => {
			writeFileSync(options.registryPathAbs, '{ torn registry');
			const res = await runAgentNames(
				{
					action: 'assign',
					task_id: 'root',
					agent_slot: 'orchestrator',
				},
				options,
			);
			const body = parse(res) as {
				error?: string;
				backup?: string | null;
				nextAction?: string;
			};
			expect(res).toMatchObject({ isError: true });
			expect(body.error).toContain('corrupt');
			expect(body.backup).toContain('.corrupt-');
			expect(existsSync(options.registryPathAbs)).toBe(false);
			expect(backupExists()).toBe(true);
		});

		it('fails the read-only list action too (not just writes)', async () => {
			writeFileSync(options.registryPathAbs, 'not json');
			const res = await runAgentNames({ action: 'list' }, options);
			expect(res).toMatchObject({ isError: true });
			expect((parse(res) as { error?: string }).error).toContain(
				'corrupt',
			);
		});

		it('recovers once the corrupt backup is moved aside', async () => {
			writeFileSync(options.registryPathAbs, 'broken');
			await runAgentNames({ action: 'list' }, options); // quarantines
			const res = await runAgentNames(
				{
					action: 'assign',
					task_id: 'root',
					agent_slot: 'orchestrator',
				},
				options,
			);
			expect(
				(parse(res) as { agent_name?: string }).agent_name,
			).toBeDefined();
			expect(
				JSON.parse(readFileSync(options.registryPathAbs, 'utf8')),
			).toMatchObject({ assignments: expect.any(Array) });
		});
	});
});
