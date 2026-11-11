/**
 * forge-event-bridge.spec.ts — a forge event written to the workspace's
 * store reaches the sessions subscribed to its pull request, and only
 * those, as a notification and as the answer of a waiting `forge_await`.
 *
 * The store is real (a temporary directory); the directory watcher is a
 * fake the spec fires by hand, and the await's bound runs on fake timers.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';
import {
	addForgeEventSubscription,
	appendForgeEventRecord,
	forgeEventsDir,
	readForgeEventSubscriptions,
} from '@delendai/core/runtime';

import {
	createForgeEventBridge,
	describeForgeOutcome,
	viewOfForgeEvent,
} from '../src/lib/services/forge-event-bridge';
import { buildForgeEventRegistrations } from '../src/lib/tools/forge-events.tool';

import type { IForgeNotice } from '../src/lib/contracts/interfaces/forge-event-bridge.interface';

const roots: string[] = [];
const storeDir = (): { root: string; dir: string } => {
	const root = mkdtempSync(join(tmpdir(), 'forge-event-bridge-'));
	roots.push(root);
	return { root, dir: forgeEventsDir(root, 'cache') };
};

afterEach(() => {
	vi.useRealTimers();
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

/**
 * Turn the event loop until `ready` holds: real file reads finish in their
 * own time, so a test waits for the state it needs, never a fixed count.
 */
const until = async (ready: () => boolean, what: string): Promise<void> => {
	for (let turn = 0; turn < 100_000; turn += 1) {
		if (ready()) return;
		await new Promise((resolve) => setImmediate(resolve));
	}
	throw new Error(`never happened: ${what}`);
};

const waiterArmed = (): boolean => vi.getTimerCount() === 1;

const setup = async () => {
	const { root, dir } = storeDir();
	const fires: Array<(name: string | undefined) => void> = [];
	let unwatched = 0;
	const notices: IForgeNotice[] = [];
	const bridge = createForgeEventBridge({
		dir,
		watch: (_dir, onChange) => {
			fires.push(onChange);
			return () => {
				unwatched += 1;
			};
		},
		notify: (notice) => notices.push(notice),
	});
	const write = async (event: Record<string, unknown>, at: number) => {
		const name = await appendForgeEventRecord(
			dir,
			{ kind: 'x', repository: 'octo/repo', ...event },
			at,
		);
		fires[0]?.(name);
		// The watcher's own call, awaited: delivery is once per file anyway.
		await bridge.handle(name);
		return name;
	};
	return {
		root,
		dir,
		bridge,
		notices,
		write,
		fires,
		unwatched: () => unwatched,
	};
};

describe('describeForgeOutcome', () => {
	const base = { repository: 'o/r', number: 4 };
	it('[<5ms] names merged, closed, a failed check by name, a label and land’s reason', () => {
		expect(describeForgeOutcome({ ...base, kind: 'pr.merged' })).toBe(
			'#4 merged',
		);
		expect(describeForgeOutcome({ ...base, kind: 'pr.closed' })).toBe(
			'#4 closed without merging',
		);
		expect(
			describeForgeOutcome({
				...base,
				kind: 'check.completed',
				check: 'delendai-validate',
				conclusion: 'failure',
			}),
		).toBe('#4: check delendai-validate failed (failure)');
		expect(
			describeForgeOutcome({
				...base,
				kind: 'check.completed',
				check: 'CodeQL',
				conclusion: 'success',
			}),
		).toBe('#4: check CodeQL passed');
		expect(describeForgeOutcome({ ...base, kind: 'check.completed' })).toBe(
			'#4: check a check failed (unknown)',
		);
		expect(
			describeForgeOutcome({
				...base,
				kind: 'pr.updated',
				change: 'labelled',
				label: 'delendai:needs-update',
			}),
		).toBe('#4 labelled delendai:needs-update');
		expect(
			describeForgeOutcome({
				...base,
				kind: 'pr.commented',
				comment: 'land: conflicts in src/a.ts. Update it.',
			}),
		).toBe('#4 land: conflicts in src/a.ts. Update it.');
		expect(
			describeForgeOutcome({
				...base,
				kind: 'review.submitted',
				review: 'approved',
			}),
		).toBe('#4: review approved');
		expect(
			describeForgeOutcome({ ...base, kind: 'review.submitted' }),
		).toBe('#4: review submitted');
		expect(describeForgeOutcome({ ...base, kind: 'issue.closed' })).toBe(
			'issue #4 closed',
		);
	});

	it('[<5ms] wakes nobody for what is no outcome', () => {
		expect(
			describeForgeOutcome({
				...base,
				kind: 'pr.updated',
				change: 'synchronized',
			}),
		).toBeUndefined();
		expect(
			describeForgeOutcome({
				...base,
				kind: 'pr.commented',
				comment: 'nice',
			}),
		).toBeUndefined();
		expect(
			describeForgeOutcome({ ...base, kind: 'pr.commented' }),
		).toBeUndefined();
		expect(
			describeForgeOutcome({ ...base, kind: 'pr.opened' }),
		).toBeUndefined();
	});
});

describe('viewOfForgeEvent', () => {
	it('[<5ms] reads the fields it needs and refuses what is no event', () => {
		expect(viewOfForgeEvent(null)).toBeUndefined();
		expect(
			viewOfForgeEvent({ kind: 1, repository: 'o/r' }),
		).toBeUndefined();
		expect(
			viewOfForgeEvent({
				kind: 'pr.merged',
				repository: 'o/r',
				number: '3',
				label: 5,
			}),
		).toEqual({
			kind: 'pr.merged',
			repository: 'o/r',
			number: undefined,
			change: undefined,
			label: undefined,
			check: undefined,
			conclusion: undefined,
			review: undefined,
			comment: undefined,
		});
	});
});

describe('createForgeEventBridge', () => {
	it('[<500ms] tells only a session that serves the subscribed agent, once', async () => {
		const t = await setup();
		await addForgeEventSubscription(t.dir, {
			agent: 'me',
			repository: 'octo/repo',
			number: 7,
			since: 0,
		});
		await addForgeEventSubscription(t.dir, {
			agent: 'someone-else',
			repository: 'octo/repo',
			number: 7,
			since: 0,
		});
		await t.bridge.bind('me');
		const name = await t.write({ kind: 'pr.merged', number: 7 }, 100);
		await t.write({ kind: 'pr.merged', number: 8 }, 101);
		await t.write({ kind: 'pr.opened', number: 7 }, 102);
		t.fires[0]?.(name);
		await t.bridge.handle(name);
		await t.bridge.handle('not-a-record.tmp');
		expect(t.notices).toEqual([
			{
				agent: 'me',
				repository: 'octo/repo',
				number: 7,
				kind: 'pr.merged',
				outcome: '#7 merged',
				at: 100,
			},
		]);
	});

	it('[<500ms] a rescan delivers what it has not, and binding replays what was missed since subscribing', async () => {
		const t = await setup();
		await addForgeEventSubscription(t.dir, {
			agent: 'late',
			repository: 'octo/repo',
			number: 7,
			since: 50,
		});
		await t.write({ kind: 'pr.closed', number: 7 }, 10);
		await t.write({ kind: 'pr.merged', number: 7 }, 60);
		expect(t.notices).toEqual([]);
		await t.bridge.bind('late');
		await t.bridge.bind('late');
		expect(t.notices.map((n) => n.outcome)).toEqual(['#7 merged']);
		await t.write({ kind: 'issue.closed', number: 7 }, 70);
		await t.bridge.handle(undefined);
		expect(t.notices.map((n) => n.outcome)).toEqual([
			'#7 merged',
			'issue #7 closed',
		]);
	});

	it('[<500ms] next returns queued notices at once, or waits for the next, or times out empty', async () => {
		const t = await setup();
		await addForgeEventSubscription(t.dir, {
			agent: 'me',
			repository: 'octo/repo',
			number: 7,
			since: 0,
		});
		await t.bridge.bind('me');
		await t.write({ kind: 'pr.merged', number: 7 }, 1);
		expect(
			(await t.bridge.next('me', 1_000)).map((n) => n.outcome),
		).toEqual(['#7 merged']);

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const waiting = t.bridge.next('me', 1_000);
		await until(waiterArmed, 'the wait was armed');
		await t.write(
			{
				kind: 'check.completed',
				number: 7,
				check: 'ci',
				conclusion: 'failure',
			},
			2,
		);
		expect((await waiting).map((n) => n.outcome)).toEqual([
			'#7: check ci failed (failure)',
		]);

		const empty = t.bridge.next('me', 1_000);
		await until(waiterArmed, 'the empty wait was armed');
		vi.advanceTimersByTime(1_000);
		expect(await empty).toEqual([]);

		const aborted = new AbortController();
		const cut = t.bridge.next('me', 1_000, aborted.signal);
		await until(waiterArmed, 'the abortable wait was armed');
		aborted.abort();
		expect(await cut).toEqual([]);
	});

	it('[<500ms] stop ends the watch and releases every wait', async () => {
		const t = await setup();
		await t.bridge.bind('me');
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const waiting = t.bridge.next('me', 60_000);
		await until(waiterArmed, 'the wait was armed');
		t.bridge.stop();
		expect(await waiting).toEqual([]);
		expect(t.unwatched()).toBe(1);
		await t.bridge.handle('anything.json');
		expect(await t.bridge.next('me', 60_000)).toEqual([]);
	});
});

describe('buildForgeEventRegistrations', () => {
	const register = async (enabled: boolean) => {
		const { root, dir } = storeDir();
		const handlers = new Map<string, (args: unknown) => unknown>();
		const logged: unknown[] = [];
		const fires: Array<(name: string | undefined) => void> = [];
		const server = createFakeToolServer({
			onRegisterTool: ({ name, handler }) => handlers.set(name, handler),
			onSendLoggingMessage: (message) => {
				logged.push(message.data);
			},
		});
		for (const registration of buildForgeEventRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			cacheDir: 'cache',
			enabled,
			watch: (_dir, onChange) => {
				fires.push(onChange);
				return () => undefined;
			},
		}))
			await registration.register(server);
		return { root, dir, handlers, logged, fires, server };
	};

	it('[<500ms] subscribe then await returns the outcome, also pushed as a notification', async () => {
		const t = await register(true);
		const subscribed = (await t.handlers.get('delendai_forge_subscribe')?.({
			agent: 'me',
			repository: 'octo/repo',
			number: 7,
		})) as { structuredContent: unknown };
		expect(subscribed.structuredContent).toEqual({
			subscribed: true,
			agent: 'me',
			repository: 'octo/repo',
			number: 7,
		});
		expect(await readForgeEventSubscriptions(t.dir)).toHaveLength(1);
		const name = await appendForgeEventRecord(
			t.dir,
			{ kind: 'pr.merged', repository: 'octo/repo', number: 7 },
			Date.now() + 1,
		);
		t.fires[0]?.(name);
		await until(() => t.logged.length > 0, 'the notification was sent');
		expect(t.logged).toMatchObject([
			{ event: 'forge-event', agent: 'me', outcome: '#7 merged' },
		]);
		const answer = (await t.handlers.get('delendai_forge_await')?.({
			agent: 'me',
			timeoutMs: -5,
		})) as { structuredContent: { notices: unknown[]; timedOut: boolean } };
		expect(answer.structuredContent.timedOut).toBe(false);
		expect(answer.structuredContent.notices).toHaveLength(1);
	});

	it('[<200ms] await says at once that a project not opted in receives nothing', async () => {
		const t = await register(false);
		const answer = (await t.handlers.get('delendai_forge_await')?.({
			agent: 'me',
		})) as { structuredContent: { reason?: string; timedOut: boolean } };
		expect(answer.structuredContent.timedOut).toBe(false);
		expect(answer.structuredContent.reason).toContain('forgeEvents');
	});

	it('[<500ms] closing the server releases a pending await', async () => {
		const t = await register(true);
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const waiting = t.handlers.get('delendai_forge_await')?.({
			agent: 'me',
			timeoutMs: 10_000_000,
		}) as Promise<{ structuredContent: { timedOut: boolean } }>;
		await until(waiterArmed, 'the await was armed');
		t.server.server.onclose?.();
		expect((await waiting).structuredContent.timedOut).toBe(true);
	});
});
