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

// The tool declares an `outputSchema`, so the MCP SDK requires
// `structuredContent` on every response (see M45 in the master audit:
// a sibling tool's local json() helper omitted it and crashed at the
// transport layer). Assert it here too so a regression fails the suite.
const parse = (result: {
	content: Array<{ text: string }>;
	structuredContent?: unknown;
}): unknown => {
	const value = JSON.parse(result.content[0]?.text ?? '{}');
	expect(result.structuredContent).toEqual(value);
	return value;
};

describe('agent_names (covers the orchestrator, not only subagents)', async () => {
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

	it('fires onAgentReleased for the released name (loop-detector reset seam)', async () => {
		const releasedNames: string[] = [];
		const opts: IAgentNamesToolOptions = {
			...options,
			onAgentReleased: (name) => releasedNames.push(name),
		};
		const assigned = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'root',
					agent_slot: 'orchestrator',
				},
				opts,
			),
		) as { agent_name: string };

		await runAgentNames({ action: 'release', task_id: 'root' }, opts);
		expect(releasedNames).toContain(assigned.agent_name);
	});

	it('f00082 S3: persists host/model on assign (unknown host coerced)', async () => {
		const known = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'k',
					agent_slot: 'orchestrator',
					host: 'vscode-copilot',
					model: 'm3',
				},
				options,
			),
		) as { host: string; model: string };
		expect(known.host).toBe('vscode-copilot');
		expect(known.model).toBe('m3');

		const coerced = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'u',
					agent_slot: 'implementation_runner',
					parent_task_id: 'k',
					host: 'some-future-ide',
					model: 'gpt-9',
				},
				options,
			),
		) as { host: string; model: string };
		// unknown host coerces to 'unknown'; model is free-form
		expect(coerced.host).toBe('unknown');
		expect(coerced.model).toBe('gpt-9');
	});

	it('f00082 S3: assign without host/model stores null (backwards compat)', async () => {
		const a = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'legacy',
					agent_slot: 'orchestrator',
				},
				options,
			),
		) as { host: string | null; model: string | null };
		expect(a.host).toBeNull();
		expect(a.model).toBeNull();
	});

	it('creates a renewable subscription lease and requires its token', async () => {
		const assigned = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'leased',
					agent_slot: 'orchestrator',
				},
				options,
			),
		) as {
			subscription_id: string;
			lease_until: string;
			last_seen: string;
		};
		expect(assigned.subscription_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(Date.parse(assigned.lease_until)).toBeGreaterThan(
			Date.parse(assigned.last_seen),
		);

		const rejected = await runAgentNames(
			{
				action: 'heartbeat',
				task_id: 'leased',
				subscription_id: 'wrong-token',
			},
			options,
		);
		expect(rejected).toMatchObject({ isError: true });

		const renewed = parse(
			await runAgentNames(
				{
					action: 'heartbeat',
					task_id: 'leased',
					subscription_id: assigned.subscription_id,
					now: new Date(Date.now() + 1_000).toISOString(),
				},
				options,
			),
		) as { subscription_id: string; lease_until: string };
		expect(renewed.subscription_id).toBe(assigned.subscription_id);
		expect(Date.parse(renewed.lease_until)).toBeGreaterThan(
			Date.parse(assigned.lease_until),
		);
	});

	it('invalidates the old subscription token when the task is released', async () => {
		const assigned = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'released-lease',
					agent_slot: 'orchestrator',
				},
				options,
			),
		) as { subscription_id: string };

		const released = parse(
			await runAgentNames(
				{ action: 'release', task_id: 'released-lease' },
				options,
			),
		) as { released: string[] };
		expect(released.released).toContain('released-lease');

		const heartbeat = await runAgentNames(
			{
				action: 'heartbeat',
				task_id: 'released-lease',
				subscription_id: assigned.subscription_id,
			},
			options,
		);
		expect(heartbeat).toMatchObject({ isError: true });
	});

	it('expires a pooled subscription automatically when no heartbeat renews it', async () => {
		const assigned = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'expired',
					agent_slot: 'orchestrator',
					now: '2026-08-29T00:00:00.000Z',
				},
				{ ...options, pool: ['solo'] },
			),
		) as { lease_until: string };
		expect(assigned.lease_until).toBe('2026-08-29T00:10:00.000Z');

		const next = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'replacement',
					agent_slot: 'orchestrator',
					now: '2026-08-29T00:10:01.000Z',
				},
				{ ...options, pool: ['solo'] },
			),
		) as { agent_name: string };
		expect(next.agent_name).toBe('solo');
	});

	it('f00082 S3: defaults host/model from options.defaultIdentity when the caller omits them', async () => {
		const a = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'boot',
					agent_slot: 'orchestrator',
				},
				{
					...options,
					defaultIdentity: { host: 'claude-code', model: 'opus' },
				},
			),
		) as { host: string; model: string };
		expect(a.host).toBe('claude-code');
		expect(a.model).toBe('opus');
	});

	it('f00082 S3: an explicit host/model arg overrides options.defaultIdentity', async () => {
		const a = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'override',
					agent_slot: 'orchestrator',
					host: 'cursor',
					model: 'sonnet',
				},
				{
					...options,
					defaultIdentity: { host: 'claude-code', model: 'opus' },
				},
			),
		) as { host: string; model: string };
		expect(a.host).toBe('cursor');
		expect(a.model).toBe('sonnet');
	});

	it('f00082 S3: an unknown default host coerces to `unknown` (same rule as an explicit arg)', async () => {
		const a = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'coerce',
					agent_slot: 'orchestrator',
				},
				{
					...options,
					defaultIdentity: { host: 'some-cli', model: 'x' },
				},
			),
		) as { host: string; model: string };
		expect(a.host).toBe('unknown');
		expect(a.model).toBe('x');
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
	describe('corrupt registry (M10)', async () => {
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
