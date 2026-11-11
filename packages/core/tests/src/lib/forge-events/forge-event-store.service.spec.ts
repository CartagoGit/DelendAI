/**
 * forge-event-store.service.spec.ts — the store every server of a workspace
 * shares: one file per event, tidied by the next write and never by a
 * timer, and one file of subscriptions that `work publish` adds to.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	addForgeEventSubscription,
	appendForgeEventRecord,
	forgeEventRecordsDir,
	forgeEventsDir,
	pullRequestOfUrl,
	readForgeEventRecord,
	readForgeEventSubscriptions,
	subscribeAgentToPullRequest,
} from '@delendai/core/lib/forge-events/forge-event-store.service';
import {
	FORGE_EVENT_MAX_SUBSCRIPTIONS,
	FORGE_EVENT_RETENTION_MS,
} from '@delendai/core/lib/contracts/constants/forge-event-store.constant';

const roots: string[] = [];
const scratch = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'forge-event-store-'));
	roots.push(root);
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('forge event subscriptions', () => {
	it('[<200ms] adds once per agent and target, and reads none from a missing file', async () => {
		const dir = forgeEventsDir(scratch(), '.cache/delendai');
		expect(await readForgeEventSubscriptions(dir)).toEqual([]);
		const one = { agent: 'a', repository: 'o/r', number: 1, since: 10 };
		await addForgeEventSubscription(dir, one);
		await addForgeEventSubscription(dir, { ...one, since: 20 });
		await addForgeEventSubscription(dir, { ...one, agent: 'b' });
		expect(await readForgeEventSubscriptions(dir)).toEqual([
			{ ...one, since: 20 },
			{ ...one, agent: 'b' },
		]);
	});

	it('[<500ms] keeps the newest within the bound', async () => {
		const dir = forgeEventsDir(scratch(), 'cache');
		await addForgeEventSubscription(dir, {
			agent: 'first',
			repository: 'o/r',
			number: 0,
			since: 0,
		});
		writeFileSync(
			join(dir, 'subscriptions.json'),
			JSON.stringify(
				Array.from(
					{ length: FORGE_EVENT_MAX_SUBSCRIPTIONS },
					(_, i) => ({
						agent: 'a',
						repository: 'o/r',
						number: i,
						since: i,
					}),
				),
			),
		);
		await addForgeEventSubscription(dir, {
			agent: 'last',
			repository: 'o/r',
			number: 1,
			since: 1,
		});
		const kept = await readForgeEventSubscriptions(dir);
		expect(kept).toHaveLength(FORGE_EVENT_MAX_SUBSCRIPTIONS);
		expect(kept[0]?.number).toBe(1);
		expect(kept.at(-1)?.agent).toBe('last');
	});

	it('[<50ms] reads nothing from a file that is not a list', async () => {
		const dir = forgeEventsDir(scratch(), 'cache');
		await addForgeEventSubscription(dir, {
			agent: 'a',
			repository: 'o/r',
			number: 1,
			since: 1,
		});
		writeFileSync(join(dir, 'subscriptions.json'), '{"not":"a list"}');
		expect(await readForgeEventSubscriptions(dir)).toEqual([]);
		writeFileSync(join(dir, 'subscriptions.json'), '[{"agent":1},null]');
		expect(await readForgeEventSubscriptions(dir)).toEqual([]);
	});
});

describe('forge event records', () => {
	it('[<200ms] writes one file per event and reads it back', async () => {
		const dir = forgeEventsDir(scratch(), 'cache');
		const name = await appendForgeEventRecord(
			dir,
			{ kind: 'pr.merged', repository: 'o/r', number: 3 },
			1_000,
		);
		expect(name.startsWith('1000-')).toBe(true);
		expect(await readForgeEventRecord(dir, name)).toEqual({
			at: 1_000,
			event: { kind: 'pr.merged', repository: 'o/r', number: 3 },
		});
		expect(await readForgeEventRecord(dir, 'missing.json')).toBeUndefined();
		expect(await readForgeEventRecord(dir, `${name}.tmp`)).toBeUndefined();
	});

	it('[<200ms] a write removes what is past the retention, and only that', async () => {
		const dir = forgeEventsDir(scratch(), 'cache');
		const old = await appendForgeEventRecord(
			dir,
			{ kind: 'pr.opened', repository: 'o/r' },
			1_000,
		);
		const kept = await appendForgeEventRecord(
			dir,
			{ kind: 'pr.opened', repository: 'o/r' },
			2_000,
		);
		const newest = await appendForgeEventRecord(
			dir,
			{ kind: 'pr.opened', repository: 'o/r' },
			1_500 + FORGE_EVENT_RETENTION_MS,
		);
		expect(readdirSync(forgeEventRecordsDir(dir)).sort()).toEqual(
			[kept, newest].sort(),
		);
		expect(old).not.toBe(kept);
	});

	it('[<50ms] a file that is not a record reads as none', async () => {
		const dir = forgeEventsDir(scratch(), 'cache');
		await appendForgeEventRecord(dir, { kind: 'x', repository: 'o/r' }, 1);
		writeFileSync(join(forgeEventRecordsDir(dir), '5-a.json'), '"text"');
		writeFileSync(
			join(forgeEventRecordsDir(dir), '6-a.json'),
			'{"at":"x"}',
		);
		expect(await readForgeEventRecord(dir, '5-a.json')).toBeUndefined();
		expect(await readForgeEventRecord(dir, '6-a.json')).toBeUndefined();
	});
});

describe('pullRequestOfUrl', () => {
	it('[<5ms] reads GitHub and GitLab addresses and nothing else', () => {
		expect(
			pullRequestOfUrl('https://github.com/octo/repo/pull/12'),
		).toEqual({
			repository: 'octo/repo',
			number: 12,
		});
		expect(
			pullRequestOfUrl(
				'https://gitlab.com/group/sub/repo/-/merge_requests/4/',
			),
		).toEqual({ repository: 'group/sub/repo', number: 4 });
		expect(pullRequestOfUrl('https://github.com/octo/repo/issues/12')).toBe(
			undefined,
		);
	});
});

describe('subscribeAgentToPullRequest', () => {
	it('[<200ms] subscribes the publisher under the workspace cache', async () => {
		const root = scratch();
		expect(
			await subscribeAgentToPullRequest({
				root,
				agent: 'claude-opus-5-5',
				pullRequest: {
					status: 'opened',
					url: 'https://github.com/octo/repo/pull/7',
				},
				now: 5,
			}),
		).toBe(true);
		expect(
			await readForgeEventSubscriptions(
				forgeEventsDir(root, '.cache/delendai'),
			),
		).toEqual([
			{
				agent: 'claude-opus-5-5',
				repository: 'octo/repo',
				number: 7,
				since: 5,
			},
		]);
	});

	it('[<50ms] subscribes nothing for an address it cannot read, or a store it cannot write', async () => {
		const root = scratch();
		expect(
			await subscribeAgentToPullRequest({
				root,
				agent: 'a',
				pullRequest: { status: 'opened', url: 'not a url' },
			}),
		).toBe(false);
		expect(
			await subscribeAgentToPullRequest({
				root,
				agent: 'a',
				pullRequest: { status: 'skipped', reason: 'no forge' },
			}),
		).toBe(false);
		expect(
			await subscribeAgentToPullRequest({
				root,
				agent: 'a',
				pullRequest: undefined,
			}),
		).toBe(false);
		writeFileSync(join(root, '.cache'), 'a file where a directory goes');
		expect(
			await subscribeAgentToPullRequest({
				root,
				agent: 'a',
				pullRequest: {
					status: 'existing',
					url: 'https://github.com/octo/repo/pull/7',
				},
			}),
		).toBe(false);
	});
});
