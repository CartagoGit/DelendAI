/**
 * forge-event-follow.service.spec.ts — the host reacts to the forge, not to
 * a clock: a push to the integration branch follows it, a pull request
 * labelled for update (or synchronized by a bot) runs `--on=event`, a
 * reconnection asks once, and no timer runs while events can arrive.
 *
 * The receiver is the real one over a fake transport, so a delivery here
 * travels the same path, signature check included, as one from GitHub.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createForgeEventReceiver } from '@delendai/forge/public';
import { createGitHubEventAdapter } from '@delendai/github';

import {
	createSwitchableSchedule,
	forgeEventReceiverFor,
	routeForgeEvent,
	startForgeEventFollow,
} from './forge-event-follow.service';

import type {
	IForgeEvent,
	IForgeEventTransportHandlers,
} from '@delendai/forge/public';

const scope = {
	repository: 'octo/repo',
	integrationBranch: 'develop',
	needsUpdateLabel: 'delendai:needs-update',
};

const event = (extra: Partial<IForgeEvent>): IForgeEvent => ({
	kind: 'pr.updated',
	repository: 'octo/repo',
	...extra,
});

describe('routeForgeEvent', () => {
	it('[<5ms] a push to the integration branch follows; to another branch, nothing', () => {
		expect(
			routeForgeEvent(
				event({ kind: 'branch.pushed', branch: 'develop' }),
				scope,
			),
		).toBe('follow');
		expect(
			routeForgeEvent(
				event({ kind: 'branch.pushed', branch: 'feature' }),
				scope,
			),
		).toBeUndefined();
	});

	it('[<5ms] the needs-update label or a bot synchronize runs the event follow-ups', () => {
		expect(
			routeForgeEvent(
				event({ change: 'labelled', label: 'delendai:needs-update' }),
				scope,
			),
		).toBe('event');
		expect(
			routeForgeEvent(event({ change: 'labelled', label: 'bug' }), scope),
		).toBeUndefined();
		expect(
			routeForgeEvent(
				event({
					change: 'synchronized',
					actor: { name: 'bot', bot: true },
				}),
				scope,
			),
		).toBe('event');
		expect(
			routeForgeEvent(
				event({
					change: 'synchronized',
					actor: { name: 'ana', bot: false },
				}),
				scope,
			),
		).toBeUndefined();
	});

	it('[<5ms] ignores another repository and every other kind', () => {
		expect(
			routeForgeEvent(
				event({
					kind: 'branch.pushed',
					branch: 'develop',
					repository: 'x/y',
				}),
				scope,
			),
		).toBeUndefined();
		expect(
			routeForgeEvent(event({ kind: 'pr.merged' }), scope),
		).toBeUndefined();
	});
});

describe('forgeEventReceiverFor', () => {
	it('[<5ms] hears GitHub, and no forge it has no source for', () => {
		const receiver = forgeEventReceiverFor(
			'github',
			'octo/repo',
			() => undefined,
		);
		expect(receiver?.connected()).toBe(false);
		expect(
			forgeEventReceiverFor('gitlab', 'octo/repo', () => undefined),
		).toBeUndefined();
	});
});

describe('createSwitchableSchedule', () => {
	it('[<5ms] arms the timer once the watch registers, runs now on demand, and disarms', () => {
		const timers: Array<{
			run: () => void;
			ms: number;
			cancelled: boolean;
		}> = [];
		let ticks = 0;
		let passes = 0;
		const schedule = createSwitchableSchedule({
			recurring: (run, ms) => {
				const timer = { run, ms, cancelled: false };
				timers.push(timer);
				return () => {
					timer.cancelled = true;
				};
			},
			onTick: () => {
				ticks += 1;
			},
		});
		schedule.runNow();
		expect(passes).toBe(0);
		const cancel = schedule.schedule(() => {
			passes += 1;
		}, 60_000);
		expect(schedule.armed()).toBe(true);
		expect(timers.map((t) => t.ms)).toEqual([60_000]);
		timers[0]?.run();
		expect([ticks, passes]).toEqual([1, 1]);

		schedule.disarm();
		expect(timers[0]?.cancelled).toBe(true);
		expect(schedule.armed()).toBe(false);
		schedule.runNow();
		expect([ticks, passes]).toEqual([1, 2]);

		schedule.arm();
		schedule.arm();
		expect(timers).toHaveLength(2);
		cancel();
		expect(timers[1]?.cancelled).toBe(true);
		schedule.arm();
		expect(timers).toHaveLength(2);
	});

	it('[<5ms] a schedule disarmed before the watch registers starts no timer', () => {
		let started = 0;
		const schedule = createSwitchableSchedule({
			recurring: () => {
				started += 1;
				return () => undefined;
			},
		});
		schedule.disarm();
		schedule.schedule(() => undefined, 1_000);
		expect(started).toBe(0);
	});
});

const SECRET_PREFIX = 'per-connection-';

const setup = (standing: { reason: string | undefined }) => {
	const opens: Array<{
		handlers: IForgeEventTransportHandlers;
		secret: string;
		resolve: () => void;
	}> = [];
	const retries: Array<() => void> = [];
	let drawn = 0;
	const receiver = createForgeEventReceiver({
		adapter: createGitHubEventAdapter(),
		secret: () => {
			drawn += 1;
			return `${SECRET_PREFIX}${String(drawn)}`;
		},
		delay: (run) => {
			retries.push(run);
			return () => undefined;
		},
		transport: {
			open: ({ secret, onDelivery, onClosed }) =>
				new Promise((resolve) => {
					opens.push({
						secret,
						handlers: { onDelivery, onClosed },
						resolve: () => {
							resolve({ close: async () => undefined });
						},
					});
				}),
		},
	});
	const timers: Array<{ run: () => void; cancelled: boolean }> = [];
	const calls: string[] = [];
	const lines: string[] = [];
	const schedule = createSwitchableSchedule({
		recurring: (run) => {
			const timer = { run, cancelled: false };
			timers.push(timer);
			return () => {
				timer.cancelled = true;
			};
		},
	});
	schedule.schedule(() => calls.push('follow'), 60_000);
	const follow = startForgeEventFollow({
		receiver,
		scope,
		follow: () => schedule.runNow(),
		followUp: () => calls.push('event'),
		fallback: schedule,
		standDown: async () => standing.reason,
		report: (line) => lines.push(line),
	});
	const deliver = (name: string, payload: unknown): void => {
		const open = opens.at(-1);
		if (open === undefined) return;
		const body = JSON.stringify(payload);
		open.handlers.onDelivery({
			headers: {
				'x-github-event': name,
				'x-hub-signature-256': `sha256=${createHmac('sha256', open.secret).update(body).digest('hex')}`,
			},
			body,
		});
	};
	const armedTimers = () => timers.filter((t) => !t.cancelled).length;
	return {
		follow,
		receiver,
		opens,
		retries,
		calls,
		lines,
		schedule,
		deliver,
		armedTimers,
	};
};

const flush = async (): Promise<void> => {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const repository = { full_name: 'octo/repo' };

describe('startForgeEventFollow', () => {
	it('[<20ms] while connected no timer runs; a push follows and a label runs --on=event', async () => {
		const t = setup({ reason: undefined });
		expect(t.lines[0]).toContain('fallback timer');
		expect(t.armedTimers()).toBe(1);
		await t.follow.reconsider();
		t.opens[0]?.resolve();
		await flush();
		expect(t.armedTimers()).toBe(0);
		expect(t.lines.at(-1)).toContain('the timer is off');
		// The first connection asks once for what happened before it.
		expect(t.calls).toEqual(['follow', 'event']);

		t.deliver('push', {
			ref: 'refs/heads/develop',
			after: 'abc',
			repository,
			sender: { login: 'ana', type: 'User' },
		});
		t.deliver('pull_request', {
			action: 'labeled',
			label: { name: 'delendai:needs-update' },
			pull_request: { number: 9 },
			repository,
			sender: { login: 'land[bot]', type: 'Bot' },
		});
		t.deliver('pull_request', {
			action: 'opened',
			pull_request: { number: 9 },
			repository,
			sender: { login: 'ana', type: 'User' },
		});
		await flush();
		expect(t.calls).toEqual(['follow', 'event', 'follow', 'event']);
		expect(t.armedTimers()).toBe(0);
	});

	it('[<20ms] a drop arms the fallback and says so; the reconnect asks once', async () => {
		const t = setup({ reason: undefined });
		await t.follow.reconsider();
		t.opens[0]?.resolve();
		await flush();
		t.calls.length = 0;

		t.opens[0]?.handlers.onClosed('websocket closed');
		expect(t.armedTimers()).toBe(1);
		expect(t.lines.at(-1)).toContain(
			'fallback timer: the forge event connection is down',
		);

		t.retries[0]?.();
		t.opens[1]?.resolve();
		await flush();
		expect(t.armedTimers()).toBe(0);
		expect(t.calls).toEqual(['follow', 'event']);
	});

	it('[<20ms] a server without the lease never receives, and one that loses it stops', async () => {
		const standing: { reason: string | undefined } = {
			reason: 'another server maintains',
		};
		const t = setup(standing);
		await t.follow.reconsider();
		expect(t.opens).toHaveLength(0);
		expect(t.armedTimers()).toBe(1);

		standing.reason = undefined;
		await t.follow.reconsider();
		await t.follow.reconsider();
		expect(t.opens).toHaveLength(1);
		t.opens[0]?.resolve();
		await flush();
		t.calls.length = 0;

		standing.reason = 'another server maintains';
		t.deliver('push', {
			ref: 'refs/heads/develop',
			repository,
			sender: { login: 'ana', type: 'User' },
		});
		await flush();
		expect(t.calls).toEqual([]);
		expect(t.receiver.connected()).toBe(false);
		expect(t.armedTimers()).toBe(1);
		expect(t.lines.at(-1)).toContain('another server maintains');

		await t.follow.reconsider();
		expect(t.opens).toHaveLength(1);
	});

	it('[<20ms] stop ends receiving and ignores a later reconsider', async () => {
		const t = setup({ reason: undefined });
		await t.follow.reconsider();
		t.opens[0]?.resolve();
		await flush();
		await t.follow.stop();
		await t.follow.stop();
		expect(t.receiver.connected()).toBe(false);
		await t.follow.reconsider();
		expect(t.opens).toHaveLength(1);
	});
});
