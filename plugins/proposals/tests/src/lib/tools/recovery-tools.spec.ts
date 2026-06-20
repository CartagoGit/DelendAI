import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createRecoveryEventBuffer,
	runAgentLockReleaseOrphan,
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

describe('recovery tools (f113 S9)', () => {
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

	it('proposal_stale_list reads dead agents from the event buffer', () => {
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
});
