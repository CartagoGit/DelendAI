/**
 * forge-event-receiver.ts — the port's live end: a connection this machine
 * opens out to the forge, deliveries checked against a secret drawn for that
 * connection, and events handed to every subscriber.
 *
 * NOTHING HERE POLLS. Events arrive when the forge sends them. When the
 * connection drops, the receiver opens it again after a delay that doubles,
 * and once it is back each subscriber is asked ONCE to catch up on the gap
 * (`onGap`): that is the only question asked of the forge about the time it
 * could not speak. After `maxAttempts` failures in a row it stops trying and
 * says so, so a missing forge CLI or login costs a bounded number of tries.
 *
 * THE SECRET is drawn per connection, held in this closure, given to the
 * transport (which registers it with the forge) and to the adapter's verify.
 * It never reaches a report line, a subscriber or a config file.
 */

import { randomBytes } from 'node:crypto';

import {
	FORGE_EVENT_DROP_REASONS,
	FORGE_EVENT_RETRY_DEFAULTS,
	FORGE_EVENT_SECRET_BYTES,
} from '../contracts/constants/forge-event.constant';
import { createForgeEventNormaliser } from './forge-event-normaliser';

import type {
	IForgeEventCancel,
	IForgeEventConnection,
	IForgeEventDelay,
	IForgeEventDelivery,
	IForgeEventReceiver,
	IForgeEventReceiverInput,
	IForgeEventSubscriber,
} from '../contracts/interfaces/forge-event-port.interface';

const randomSecret = (): string =>
	randomBytes(FORGE_EVENT_SECRET_BYTES).toString('hex');

const timerDelay: IForgeEventDelay = (run, delayMs) => {
	const handle = setTimeout(run, delayMs);
	// A retry must never be what keeps a process alive.
	handle.unref?.();
	return () => {
		clearTimeout(handle);
	};
};

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const createForgeEventReceiver = (
	input: IForgeEventReceiverInput,
): IForgeEventReceiver => {
	const retry = { ...FORGE_EVENT_RETRY_DEFAULTS, ...input.retry };
	const delay = input.delay ?? timerDelay;
	const now = input.now ?? Date.now;
	const drawSecret = input.secret ?? randomSecret;
	const report = input.report ?? (() => undefined);
	const normaliser = createForgeEventNormaliser(input.adapter);
	const subscribers = new Set<IForgeEventSubscriber>();

	let started = false;
	let up = false;
	let connection: IForgeEventConnection | undefined;
	let pendingRetry: IForgeEventCancel | undefined;
	let failures = 0;
	let openedAt = 0;
	let droppedAt: number | undefined;
	// Each open gets a generation; a late callback of an older one is ignored.
	let generation = 0;

	const each = (
		call: (subscriber: IForgeEventSubscriber) => unknown,
	): void => {
		for (const subscriber of [...subscribers]) {
			try {
				const result = call(subscriber);
				if (result instanceof Promise)
					result.catch((error: unknown) => {
						report(
							`a forge event subscriber failed: ${describeError(error)}`,
						);
					});
			} catch (error) {
				report(
					`a forge event subscriber failed: ${describeError(error)}`,
				);
			}
		}
	};

	const receive = (delivery: IForgeEventDelivery, secret: string): void => {
		if (!input.adapter.verify(delivery, secret)) {
			normaliser.count(FORGE_EVENT_DROP_REASONS.signatureRefused);
			report(
				`refused a ${input.adapter.forge} delivery whose signature does not verify`,
			);
			return;
		}
		for (const event of normaliser.normalise(delivery))
			each((subscriber) => subscriber.onEvent(event));
	};

	const lost = (reason: string): void => {
		connection = undefined;
		if (up) {
			up = false;
			droppedAt = now();
			if (now() - openedAt >= retry.stableMs) failures = 0;
			each((subscriber) => subscriber.onConnection?.(false));
		}
		failures += 1;
		if (!started) return;
		if (failures >= retry.maxAttempts) {
			report(
				`${input.adapter.forge} events: ${String(failures)} connections failed in a row (${reason}); no more retries until restarted`,
			);
			return;
		}
		const wait = Math.min(
			retry.firstDelayMs * 2 ** (failures - 1),
			retry.maxDelayMs,
		);
		report(
			`${input.adapter.forge} events disconnected (${reason}); reconnecting in ${String(wait)} ms`,
		);
		pendingRetry = delay(() => {
			pendingRetry = undefined;
			open();
		}, wait);
	};

	const open = (): void => {
		if (!started) return;
		generation += 1;
		const mine = generation;
		const secret = drawSecret();
		const current = (): boolean => started && mine === generation;
		input.transport
			.open({
				secret,
				onDelivery: (delivery) => {
					if (current()) receive(delivery, secret);
				},
				onClosed: (reason) => {
					if (current()) lost(reason);
				},
			})
			.then((opened) => {
				if (!current()) {
					void opened.close();
					return;
				}
				connection = opened;
				up = true;
				openedAt = now();
				const gap = { from: droppedAt, to: openedAt };
				report(`${input.adapter.forge} events connected`);
				each((subscriber) => subscriber.onConnection?.(true));
				each((subscriber) => subscriber.onGap?.(gap));
			})
			.catch((error: unknown) => {
				if (current()) lost(describeError(error));
			});
	};

	return {
		subscribe: (subscriber) => {
			subscribers.add(subscriber);
			return () => {
				subscribers.delete(subscriber);
			};
		},
		connected: () => up,
		start: () => {
			if (started) return;
			started = true;
			failures = 0;
			open();
		},
		stop: async () => {
			if (!started) return;
			started = false;
			generation += 1;
			pendingRetry?.();
			pendingRetry = undefined;
			const closing = connection;
			connection = undefined;
			if (up) {
				up = false;
				each((subscriber) => subscriber.onConnection?.(false));
			}
			await closing?.close();
		},
		drops: normaliser.drops,
	};
};
