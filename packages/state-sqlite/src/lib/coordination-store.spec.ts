/**
 * coordination-store.spec.ts — what coordinates the generations survives
 * a restart: fencing tokens, lease serials, holders and swarm claims.
 */
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'vitest';

import {
	asRepositoryInstanceId,
	asWorktreeId,
	sha256BytesHex,
	STATE_ABI_VERSION,
	type IHydrateInput,
	type IStateInputSnapshot,
	type IStateProducer,
	type StateScope,
} from '@delendai/state';

import { CREATE_GENERATIONS_TABLE_SQL } from './schema';
import { SqliteStateRegistry } from './sqlite-driver';

const project: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

const swarm: StateScope = {
	kind: 'swarm',
	locator: {
		repositoryInstanceId: asRepositoryInstanceId('repo'),
		swarmRoot: '/repo/.cache/swarm',
	},
};

const SPEC = { kind: 'file', locator: 'n.txt' } as const;

const producer: IStateProducer = {
	id: 'n',
	abiVersion: STATE_ABI_VERSION,
	producerVersion: 1,
	serves: ['project'],
	inputs: [SPEC],
	rebuild: (ctx) => ({
		canonical: {
			n: new TextDecoder().decode(ctx.resolved[0]?.content),
		},
	}),
	reconcile: (ctx) => ({
		canonical: ctx.baseProjection?.canonical ?? { n: '' },
	}),
};

const snapshot = (text: string): IStateInputSnapshot => {
	const bytes = new TextEncoder().encode(text);
	const digest = sha256BytesHex(bytes);
	return {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: 'n',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [{ ...SPEC, digest }],
				},
			],
		},
		contents: new Map([['file|n.txt|', bytes]]),
		declared: [SPEC],
		byProducer: new Map([['n', [{ spec: SPEC, digest, content: bytes }]]]),
	};
};

const input = (text: string): IHydrateInput => ({
	scope: project,
	storageIdentity: { repositoryInstanceId: 'repo', worktreeId: 'wt-A' },
	snapshot: snapshot(text),
});

const tmpDbPath = (): string =>
	join(mkdtempSync(join(tmpdir(), 'state-coordination-')), 'state.sqlite');

const open = (
	path: string,
	checkpointEveryPublishes?: number,
): SqliteStateRegistry => {
	const registry = new SqliteStateRegistry({
		path,
		clock: () => 10,
		...(checkpointEveryPublishes === undefined
			? {}
			: { checkpointEveryPublishes }),
	});
	registry.defineProducer(producer);
	return registry;
};

describe('coordination kept across a restart', () => {
	it('brings a generation back as the one it was, holders included', () => {
		const path = tmpDbPath();
		const first = open(path);
		const hydrated = first.hydrate(input('one'));
		if (!hydrated.ok) throw new Error(hydrated.reason);
		const { id, projectLeaseToken } = hydrated.generation;
		const lease = first.acquireProjectLease({
			scope: project,
			generationId: id,
			token: projectLeaseToken,
		});
		expect('leaseId' in lease && lease.leaseId).toBe('p000001');
		first.close();

		const second = open(path);
		const [restored] = second.diagnose();
		expect(restored?.id).toBe(id);
		expect(restored?.projectLeaseToken).toBe(projectLeaseToken);
		expect(restored?.holderCount).toBe(1);
		// The token taken before the restart still fences the same
		// generation, and the next lease does not reuse the first's id.
		const again = second.acquireProjectLease({
			scope: project,
			generationId: id,
			token: projectLeaseToken,
		});
		expect('leaseId' in again && again.leaseId).toBe('p000002');
		second.close();
	});

	it('mints nothing after the restart that was handed out before it', () => {
		const path = tmpDbPath();
		const first = open(path);
		const before = first.hydrate(input('one'));
		if (!before.ok) throw new Error(before.reason);
		first.close();

		const second = open(path);
		const after = second.hydrate(input('two'));
		if (!after.ok) throw new Error(after.reason);
		expect(after.generation.id).not.toBe(before.generation.id);
		expect(after.generation.projectLeaseToken).toBeGreaterThan(
			before.generation.projectLeaseToken,
		);
		second.close();
	});

	it('stores a release made through the handle', () => {
		const path = tmpDbPath();
		const first = open(path);
		const hydrated = first.hydrate(input('one'));
		if (!hydrated.ok) throw new Error(hydrated.reason);
		const lease = first.acquireProjectLease({
			scope: project,
			generationId: hydrated.generation.id,
			token: hydrated.generation.projectLeaseToken,
		});
		if (!('leaseId' in lease)) throw new Error(lease.reason);
		lease.release();
		first.close();

		const second = open(path);
		expect(second.diagnose()[0]?.holderCount).toBe(0);
		second.close();
	});

	it('keeps a swarm claim of a scope that never had a generation', () => {
		const path = tmpDbPath();
		const first = open(path);
		const claim = first.acquireSwarmClaim({ scope: swarm, slot: 's1' });
		const renewed = claim.renew();
		first.close();

		const second = open(path);
		// The token the claim was acquired with was replaced by the
		// renewal, and stays replaced.
		expect(
			second.renewSwarmClaim({
				scope: swarm,
				slot: 's1',
				token: claim.token,
			}).ok,
		).toBe(false);
		const current = second.renewSwarmClaim({
			scope: swarm,
			slot: 's1',
			token: renewed,
		});
		expect(current.ok).toBe(true);
		const other = second.acquireSwarmClaim({ scope: swarm, slot: 's2' });
		expect(other.token).toBeGreaterThan(renewed);
		second.close();
	});

	it('forgets a claim released through the handle', () => {
		const path = tmpDbPath();
		const first = open(path);
		const claim = first.acquireSwarmClaim({ scope: swarm, slot: 's1' });
		claim.release();
		first.close();

		const second = open(path);
		expect(
			second.renewSwarmClaim({
				scope: swarm,
				slot: 's1',
				token: claim.token,
			}).ok,
		).toBe(false);
		second.close();
	});
});

describe('a store from before the coordination tables', () => {
	it('is brought forward on open', () => {
		const path = tmpDbPath();
		const old = new Database(path, { create: true });
		old.exec(CREATE_GENERATIONS_TABLE_SQL);
		old.exec('PRAGMA user_version = 2;');
		old.close(false);

		const registry = open(path);
		expect(registry.hydrate(input('one')).ok).toBe(true);
		registry.close();

		const reopened = new Database(path);
		const tables = (
			reopened
				.query(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'state_%' ORDER BY name",
				)
				.all() as readonly { name: string }[]
		).map((row) => row.name);
		expect(tables).toEqual([
			'state_fencing_tokens',
			'state_holders',
			'state_swarm_claims',
		]);
		reopened.close(false);
	});
});

describe('the WAL checkpoint cadence', () => {
	it('moves the log into the database every so many publishes', () => {
		const eager = tmpDbPath();
		const lazy = tmpDbPath();
		const everyPublish = open(eager, 1);
		const never = open(lazy, 1_000_000);
		for (const text of ['one', 'two', 'three']) {
			expect(everyPublish.hydrate(input(text)).ok).toBe(true);
			expect(never.hydrate(input(text)).ok).toBe(true);
		}
		// Same writes; only the registry that checkpointed has them in
		// the database file rather than in the log.
		expect(statSync(eager).size).toBeGreaterThan(statSync(lazy).size);
		everyPublish.close();
		never.close();
	});
});
