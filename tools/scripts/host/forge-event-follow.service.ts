/**
 * forge-event-follow.service.ts — the host follows the integration branch
 * and brings labelled pull requests forward when the forge says so, not on
 * a timer.
 *
 * WHAT REACTS TO WHAT:
 * - a push to the integration branch runs one follow pass (fetch and
 *   fast-forward), and the pass's own move runs the follow-ups `--on=move`;
 * - a pull request labelled for update, or synchronized by a bot, runs the
 *   follow-ups `--on=event`;
 * - a connection that comes up (the first, or one after a drop) asks the
 *   forge once for what it missed: one follow pass and one `--on=event`.
 *
 * THE TIMER is the fallback. It is armed while no connection is up and
 * disarmed while one is, and every change says which is in force. While it
 * runs, each tick also asks whether this server now holds the maintenance
 * lease, so a server that takes the lease over starts receiving.
 *
 * ONLY THE LEASE HOLDER RECEIVES. Before acting on an event the lease is
 * asked again; a server that lost it stops receiving and goes back to the
 * fallback, which stands down while another server maintains.
 */

import { createForgeEventReceiver } from '@delendai/forge/public';
import {
	createGhWebhookForwardTransport,
	createGitHubEventAdapter,
} from '@delendai/github';

import type {
	IForgeEvent,
	IForgeEventAdapter,
	IForgeEventReceiver,
	IForgeEventTransport,
} from '@delendai/forge/public';

import type {
	IFallbackTimer,
	IForgeEventFollow,
	IForgeEventFollowAction,
	IForgeEventFollowInput,
	IForgeEventFollowScope,
	IRecurring,
	ISwitchableSchedule,
} from './forge-event-follow.interface';

/** What `event` asks of this host, or `undefined` when nothing. Pure. */
export const routeForgeEvent = (
	event: IForgeEvent,
	scope: IForgeEventFollowScope,
): IForgeEventFollowAction | undefined => {
	if (event.repository !== scope.repository) return undefined;
	if (event.kind === 'branch.pushed')
		return event.branch === scope.integrationBranch ? 'follow' : undefined;
	if (event.kind !== 'pr.updated') return undefined;
	if (event.change === 'labelled')
		return event.label === scope.needsUpdateLabel ? 'event' : undefined;
	if (event.change === 'synchronized' && event.actor?.bot === true)
		return 'event';
	return undefined;
};

/**
 * The forges this host can hear, by the provider name the forge plugin
 * detects. A forge missing here is followed on the timer alone.
 */
const FORGE_EVENT_SOURCES: Readonly<
	Record<
		string,
		(repository: string) => {
			readonly adapter: IForgeEventAdapter;
			readonly transport: IForgeEventTransport;
		}
	>
> = {
	github: (repository) => ({
		adapter: createGitHubEventAdapter(),
		transport: createGhWebhookForwardTransport({ repository }),
	}),
};

/** A receiver for `provider`'s events of `repository`, or none it can hear. */
export const forgeEventReceiverFor = (
	provider: string,
	repository: string,
	report: (line: string) => void,
): IForgeEventReceiver | undefined => {
	const source = FORGE_EVENT_SOURCES[provider]?.(repository);
	return source === undefined
		? undefined
		: createForgeEventReceiver({ ...source, report });
};

const realRecurring: IRecurring = (run, everyMs) => {
	const handle = setInterval(run, everyMs);
	handle.unref?.();
	return () => {
		clearInterval(handle);
	};
};

/**
 * A schedule for the hydration watch whose timer can be switched off while
 * events drive it. Armed from the start: until a connection is up, the
 * timer is all there is. `onTick` runs before each timer pass.
 */
export const createSwitchableSchedule = (
	input: {
		readonly recurring?: IRecurring | undefined;
		readonly onTick?: (() => void) | undefined;
	} = {},
): ISwitchableSchedule => {
	const recurring = input.recurring ?? realRecurring;
	let pass: (() => void) | undefined;
	let everyMs = 0;
	let cancel: (() => void) | undefined;
	let wanted = true;
	const start = (): void => {
		if (pass === undefined || cancel !== undefined) return;
		const run = pass;
		cancel = recurring(() => {
			input.onTick?.();
			run();
		}, everyMs);
	};
	return {
		schedule: (run, ms) => {
			pass = run;
			everyMs = ms;
			if (wanted) start();
			return () => {
				wanted = false;
				cancel?.();
				cancel = undefined;
				pass = undefined;
			};
		},
		runNow: () => pass?.(),
		arm: () => {
			wanted = true;
			start();
		},
		disarm: () => {
			wanted = false;
			cancel?.();
			cancel = undefined;
		},
		armed: () => cancel !== undefined,
	};
};

export const startForgeEventFollow = (
	input: IForgeEventFollowInput,
): IForgeEventFollow => {
	const { receiver, fallback, report } = input;
	let receiving = false;
	let stopped = false;

	const useFallback = (timer: IFallbackTimer, why: string): void => {
		if (timer.armed()) return;
		timer.arm();
		report(
			`following the integration branch on the fallback timer: ${why}`,
		);
	};

	const stopReceiving = async (why: string): Promise<void> => {
		if (!receiving) return;
		receiving = false;
		// Said first, so the line names why, not only that it disconnected.
		useFallback(fallback, why);
		await receiver.stop();
	};

	const reconsider = async (): Promise<void> => {
		if (stopped) return;
		const reason = await input.standDown();
		if (stopped) return;
		if (reason !== undefined) {
			await stopReceiving(reason);
			return;
		}
		if (receiving) return;
		receiving = true;
		receiver.start();
	};

	const act = (action: IForgeEventFollowAction): void => {
		void input.standDown().then(async (reason) => {
			if (reason !== undefined) {
				await stopReceiving(reason);
				return;
			}
			if (action === 'follow') input.follow();
			else input.followUp();
		});
	};

	if (fallback.armed())
		report(
			'following the integration branch on the fallback timer until forge events connect',
		);

	const unsubscribe = receiver.subscribe({
		onEvent: (event) => {
			const action = routeForgeEvent(event, input.scope);
			if (action !== undefined) act(action);
		},
		onGap: () => {
			act('follow');
			act('event');
		},
		onConnection: (up) => {
			if (!up) {
				useFallback(fallback, 'the forge event connection is down');
				return;
			}
			if (!fallback.armed()) return;
			fallback.disarm();
			report(
				'forge events connected: the integration branch is followed on events, the timer is off',
			);
		},
	});

	return {
		reconsider,
		stop: async () => {
			if (stopped) return;
			stopped = true;
			unsubscribe();
			receiving = false;
			await receiver.stop();
		},
	};
};
