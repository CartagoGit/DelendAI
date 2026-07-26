import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createRecoveryEventBuffer,
	runAgentLockReleaseOrphan,
	runProposalDiagnose,
	runProposalReconcileFolder,
	runProposalStaleList,
	type IRecoveryToolOptions,
} from '@mcp-vertex/proposals/lib/tools/recovery-tools';

const json = (result: { content: Array<{ text: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

const proposal = (id: string, status: string) => `---
id: ${id}
kind: feat
title: Recovery test proposal
status: ${status}
date: 2026-06-20T00:00:00.000Z
track: test
---

# ${id} — Recovery test proposal

## Goal

Exercise recovery.

## Why

Keep recovery deterministic.

## Non-goals

- None.

## Slices

### S1 — Do it *(excl. \`a.ts\`)*

- **Status**: pending
- **Gate**: \`bun run test\`

## Acceptance

- [ ] Tests pass.
`;

describe('recovery tools (f00016 S9)', async () => {
	let dir = '';
	let proposalsDir = '';
	let lockPath = '';
	let registryPath = '';
	let options: IRecoveryToolOptions;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'recovery-tools-'));
		proposalsDir = join(dir, 'docs', 'proposals');
		lockPath = join(dir, '.cache', 'agents.lock.json');
		registryPath = join(dir, '.cache', 'subagent-registry.json');
		for (const folder of ['ready', 'blocked']) {
			mkdirSync(join(proposalsDir, folder), { recursive: true });
		}
		mkdirSync(join(dir, '.cache'), { recursive: true });
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f200',
						agent: 'falcon',
						ownership: ['a.ts'],
						started_at: '2026-06-20T00:00:00.000Z',
						last_seen: '2026-06-20T00:00:00.000Z',
					},
				],
			}),
		);
		writeFileSync(
			registryPath,
			JSON.stringify({
				version: 1,
				adopted: [],
				assignments: [{ task_id: 'f200', agent_name: 'falcon' }],
			}),
		);
		const eventBuffer = createRecoveryEventBuffer();
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: proposalsDir,
			lockPathAbs: lockPath,
			agentRegistryPathAbs: registryPath,
			workspaceRoot: dir,
			eventBuffer,
			gitRunner: async () => ({
				ok: false,
				reason: 'test no git',
				output: '',
			}),
		};
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('proposal_stale_list reads dead agents from the event buffer', async () => {
		options.eventBuffer?.add({
			kind: 'agent-dead',
			agent: 'falcon',
			taskId: 'f200',
			ts: '2026-06-20T00:00:03.000Z',
			lastSeen: '2026-06-20T00:00:00.000Z',
			missedBeats: 3,
		});

		const payload = json(
			runProposalStaleList(options, new Date('2026-06-20T00:00:04Z')),
		);

		expect(payload.count).toBe(1);
		expect(payload.zombies).toEqual([
			expect.objectContaining({ agent: 'falcon', taskId: 'f200' }),
		]);
	});

	it('agent_lock_release_orphan refuses without agent-dead and releases with it', async () => {
		const refused = await runAgentLockReleaseOrphan(
			{ taskId: 'f200', agent: 'falcon', reason: 'test' },
			options,
		);
		expect(refused.isError).toBe(true);

		options.eventBuffer?.add({
			kind: 'agent-dead',
			agent: 'falcon',
			taskId: 'f200',
			ts: '2026-06-20T00:00:03.000Z',
			lastSeen: '2026-06-20T00:00:00.000Z',
			missedBeats: 3,
		});
		const released = json(
			await runAgentLockReleaseOrphan(
				{ taskId: 'f200', agent: 'falcon', reason: 'test' },
				options,
			),
		);
		const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

		expect(released.released).toBe(true);
		expect(lock.in_flight).toEqual([]);
	});

	it('proposal_reconcile_folder moves one proposal to the folder matching status', async () => {
		writeFileSync(
			join(proposalsDir, 'blocked', 'f200-test.md'),
			proposal('f200', 'ready'),
		);

		const dryRun = json(
			await runProposalReconcileFolder(
				{ id: 'f200', dryRun: true },
				options,
			),
		);
		expect(dryRun).toMatchObject({
			changed: true,
			from: 'blocked/f200-test.md',
			to: 'ready/f200-test.md',
		});

		const moved = json(
			await runProposalReconcileFolder({ id: 'f200' }, options),
		);

		expect(moved).toMatchObject({
			changed: true,
			movedTo: 'ready/f200-test.md',
		});
	});

	it('proposal_reconcile_folder blocks done -> review without force', async () => {
		mkdirSync(join(proposalsDir, 'done'), { recursive: true });
		mkdirSync(join(proposalsDir, 'review'), { recursive: true });
		writeFileSync(
			join(proposalsDir, 'done', 'f201-test.md'),
			proposal('f201', 'review'),
		);

		const result = await runProposalReconcileFolder(
			{ id: 'f201' },
			options,
		);
		expect(result.isError).toBe(true);
		const body = json(result);
		expect(JSON.stringify(body)).toContain('invalid-regression');
	});

	it('proposal_reconcile_folder allows done -> review with force + reason', async () => {
		mkdirSync(join(proposalsDir, 'done'), { recursive: true });
		mkdirSync(join(proposalsDir, 'review'), { recursive: true });
		writeFileSync(
			join(proposalsDir, 'done', 'f202-test.md'),
			proposal('f202', 'review'),
		);

		const moved = json(
			await runProposalReconcileFolder(
				{ id: 'f202', force: true, reason: 'repair folder drift' },
				options,
			),
		);

		expect(moved).toMatchObject({
			changed: true,
			movedTo: 'review/f202-test.md',
		});
	});

	it('proposal_diagnose matches stale slice locks for the requested proposal', async () => {
		writeFileSync(
			join(proposalsDir, 'ready', 'f00126-test.md'),
			proposal('f00126', 'ready'),
		);
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'impl-runner-perf-s3',
						ownership: ['a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const payload = json(
			await runProposalDiagnose({ id: 'f00126' }, options),
		);

		expect(payload).toMatchObject({
			lockOwners: ['impl-runner-perf-s3'],
			staleTaskIds: ['f00126-S3'],
			suggestedActions: ['agent_lock_release_orphan'],
		});
	});

	it('proposal_diagnose keeps direct calls strict to the requested proposal', async () => {
		writeFileSync(
			join(proposalsDir, 'ready', 'f00128-test.md'),
			proposal('f00128', 'ready'),
		);
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'impl-runner-perf-s3',
						ownership: ['a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
					{
						task_id: 'f00127-S2',
						agent: 'impl-runner-b',
						ownership: ['b.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const payload = json(
			await runProposalDiagnose({ id: 'f00128' }, options),
		);

		expect(payload.lockOwners).toEqual([]);
		expect(payload.staleTaskIds).toEqual([]);
		expect(payload.crossProposal).toBeUndefined();
	});

	it('proposal_diagnose reports cross-proposal zombies for auto_work', async () => {
		writeFileSync(
			join(proposalsDir, 'ready', 'f00128-test.md'),
			proposal('f00128', 'ready'),
		);
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'impl-runner-perf-s3',
						ownership: ['a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
					{
						task_id: 'f00127-S2',
						agent: 'impl-runner-docs-s2',
						ownership: ['b.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const payload = json(
			await runProposalDiagnose(
				{ id: 'f00128', caller: 'auto_work' },
				options,
			),
		);

		expect(payload).toMatchObject({
			crossProposal: true,
			staleTaskIds: ['f00126-S3', 'f00127-S2'],
			suggestedActions: ['agent_lock_release_orphan'],
		});
		expect(payload.lockOwners).toEqual([
			'impl-runner-perf-s3',
			'impl-runner-docs-s2',
		]);
	});
});
describe('a00072 S1.a (F148) proposal_diagnose cross-proposal stale detection', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'recovery-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const baseOptions = (): IRecoveryToolOptions => ({
		namespacePrefix: 'test',
		proposalsDirAbs: join(dir, 'docs/mcp-vertex/proposals'),
		lockPathAbs: join(dir, '.cache/mcp-vertex/agents.lock.json'),
		agentRegistryPathAbs: join(
			dir,
			'.cache/mcp-vertex/agent-registry.json',
		),
		workspaceRoot: dir,
		eventBuffer: createRecoveryEventBuffer(),
	});

	it('proposal_diagnose surfaces cross-proposal stale locks for auto_work and suggests agent_lock_release_orphan', async () => {
		const opts = baseOptions();
		mkdirSync(join(opts.proposalsDirAbs, 'ready'), { recursive: true });
		writeFileSync(
			join(opts.proposalsDirAbs, 'ready/f00128-database-plugin.md'),
			'---\nid: f00128\nstatus: ready\n---\n# body',
		);
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'impl-runner-perf-s3',
						ownership: ['src/a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
					{
						task_id: 'f00127-S2',
						agent: 'impl-runner-eval-s2',
						ownership: ['src/b.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const result = await runProposalDiagnose(
			{ id: 'f00128', caller: 'auto_work' },
			opts,
		);
		const parsed = JSON.parse(result.content[0]?.text ?? '{}');
		expect(parsed.crossProposal).toBe(true);
		expect(parsed.crossProposalStaleTaskIds).toEqual([
			'f00126-S3',
			'f00127-S2',
		]);
		expect(parsed.crossProposalStaleAgents).toEqual([
			'impl-runner-perf-s3',
			'impl-runner-eval-s2',
		]);
		expect(parsed.inconsistencies).toContain('cross-proposal-stale-locks');
		expect(parsed.suggestedActions).toContain('agent_lock_release_orphan');
	});

	it('proposal_diagnose suggests state_repair when auto_work sees many cross-proposal zombies', async () => {
		const opts = baseOptions();
		mkdirSync(join(opts.proposalsDirAbs, 'ready'), { recursive: true });
		writeFileSync(
			join(opts.proposalsDirAbs, 'ready/f00128-database-plugin.md'),
			'---\nid: f00128\nstatus: ready\n---\n# body',
		);
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		const inFlight = Array.from({ length: 5 }, (_, i) => ({
			task_id: `f-other-${i}-S${i}`,
			agent: `impl-runner-other-${i}`,
			ownership: ['src/a.ts'],
			started_at: '2000-01-01T00:00:00.000Z',
			last_seen: '2000-01-01T00:00:00.000Z',
		}));
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: inFlight,
			}),
		);

		const result = await runProposalDiagnose(
			{ id: 'f00128', caller: 'auto_work' },
			opts,
		);
		const parsed = JSON.parse(result.content[0]?.text ?? '{}');
		expect(parsed.crossProposal).toBe(true);
		expect(parsed.crossProposalStaleTaskIds).toHaveLength(5);
		expect(parsed.suggestedActions).toContain('state_repair');
	});

	it('proposal_diagnose does not flag a fresh cross-proposal lock', async () => {
		const opts = baseOptions();
		mkdirSync(join(opts.proposalsDirAbs, 'ready'), { recursive: true });
		writeFileSync(
			join(opts.proposalsDirAbs, 'ready/f00128-database-plugin.md'),
			'---\nid: f00128\nstatus: ready\n---\n# body',
		);
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		const freshNow = new Date().toISOString();
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f-other-S1',
						agent: 'copilot',
						ownership: ['src/a.ts'],
						started_at: freshNow,
						last_seen: freshNow,
					},
				],
			}),
		);

		const result = await runProposalDiagnose({ id: 'f00128' }, opts);
		const parsed = JSON.parse(result.content[0]?.text ?? '{}');
		expect(parsed.crossProposal).toBeUndefined();
		expect(parsed.crossProposalStaleTaskIds ?? []).toEqual([]);
	});
});
