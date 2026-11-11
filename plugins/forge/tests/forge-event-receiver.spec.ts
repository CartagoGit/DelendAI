/**
 * forge-event-receiver.spec.ts — the receiver connects out, refuses what is
 * not signed with its connection's secret, and after a drop reconnects and
 * asks the forge once for the gap, with no timer while it is connected.
 *
 * The transport and the delay are fakes: a test opens, drops and delivers
 * by hand, and every scheduled retry is visible in `delays`.
 */

import { describe, expect, it } from 'vitest';

import { createForgeEventReceiver } from '../src/lib/services/forge-event-receiver';

import type {
	IForgeEvent,
	IForgeEventAdapter,
	IForgeEventGap,
	IForgeEventTransport,
	IForgeEventTransportHandlers,
} from '../src/lib/contracts/interfaces/forge-event-port.interface';

/** An adapter whose signature is the secret itself, in a header. */
const adapter: IForgeEventAdapter = {
	forge: 'fake',
	verify: (delivery, secret) => delivery.headers.signature === secret,
	eventName: (delivery) => delivery.headers.event,
	map: (name) =>
		name === 'push'
			? {
					events: [
						{
							kind: 'branch.pushed',
							repository: 'o/r',
							branch: 'develop',
						},
					],
				}
			: { dropped: `unmapped:${name}` },
};

interface IFakeTransport extends IForgeEventTransport {
	readonly opens: Array<{
		readonly secret: string;
		readonly handlers: IForgeEventTransportHandlers;
		readonly resolve: () => void;
		readonly reject: (error: Error) => void;
		closed: boolean;
	}>;
}

const fakeTransport = (): IFakeTransport => {
	const opens: IFakeTransport['opens'] = [];
	return {
		opens,
		open: ({ secret, onDelivery, onClosed }) =>
			new Promise((resolve, reject) => {
				const entry = {
					secret,
					handlers: { onDelivery, onClosed },
					closed: false,
					resolve: () => {
						resolve({
							close: async () => {
								entry.closed = true;
							},
						});
					},
					reject,
				};
				opens.push(entry);
			}),
	};
};

const flush = async (): Promise<void> => {
	for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const setup = (retry = {}) => {
	const transport = fakeTransport();
	const delays: Array<{ run: () => void; ms: number; cancelled: boolean }> =
		[];
	const lines: string[] = [];
	let clock = 1_000;
	let secrets = 0;
	const receiver = createForgeEventReceiver({
		transport,
		adapter,
		secret: () => `secret-${String((secrets += 1))}`,
		delay: (run, ms) => {
			const entry = { run, ms, cancelled: false };
			delays.push(entry);
			return () => {
				entry.cancelled = true;
			};
		},
		now: () => clock,
		retry,
		report: (line) => lines.push(line),
	});
	const events: IForgeEvent[] = [];
	const gaps: IForgeEventGap[] = [];
	const states: boolean[] = [];
	receiver.subscribe({
		onEvent: (event) => events.push(event),
		onGap: (gap) => {
			gaps.push(gap);
		},
		onConnection: (up) => states.push(up),
	});
	return {
		receiver,
		transport,
		delays,
		lines,
		events,
		gaps,
		states,
		advance: (ms: number) => {
			clock += ms;
		},
	};
};

const push = (signature: string) => ({
	headers: { event: 'push', signature },
	body: '{}',
});

describe('createForgeEventReceiver', () => {
	it('[<10ms] opens out on start and delivers verified events to subscribers', async () => {
		const t = setup();
		t.receiver.start();
		t.receiver.start();
		expect(t.transport.opens).toHaveLength(1);
		t.transport.opens[0]?.resolve();
		await flush();
		expect(t.receiver.connected()).toBe(true);
		expect(t.states).toEqual([true]);
		t.transport.opens[0]?.handlers.onDelivery(push('secret-1'));
		expect(t.events).toEqual([
			{ kind: 'branch.pushed', repository: 'o/r', branch: 'develop' },
		]);
		// Connected: no timer of any kind is armed.
		expect(t.delays).toEqual([]);
	});

	it('[<10ms] refuses a delivery signed with any other secret, and never reports the secret', async () => {
		const t = setup();
		t.receiver.start();
		t.transport.opens[0]?.resolve();
		await flush();
		t.transport.opens[0]?.handlers.onDelivery(push('forged'));
		expect(t.events).toEqual([]);
		expect(t.receiver.drops()).toEqual({ 'signature-refused': 1 });
		expect(t.lines.join('\n')).not.toContain('secret-1');
		expect(t.lines.join('\n')).toContain('signature does not verify');
	});

	it('[<10ms] after a drop reconnects with a new secret and asks once for the gap', async () => {
		const t = setup();
		t.receiver.start();
		t.transport.opens[0]?.resolve();
		await flush();
		expect(t.gaps).toEqual([{ from: undefined, to: 1_000 }]);

		t.advance(500);
		t.transport.opens[0]?.handlers.onClosed('socket closed');
		expect(t.receiver.connected()).toBe(false);
		expect(t.states).toEqual([true, false]);
		expect(t.delays.map((d) => d.ms)).toEqual([1_000]);

		t.advance(1_000);
		t.delays[0]?.run();
		expect(t.transport.opens).toHaveLength(2);
		expect(t.transport.opens[1]?.secret).toBe('secret-2');
		t.transport.opens[1]?.resolve();
		await flush();
		expect(t.gaps).toEqual([
			{ from: undefined, to: 1_000 },
			{ from: 1_500, to: 2_500 },
		]);
		// Asked once: nothing more while it stays up.
		t.transport.opens[1]?.handlers.onDelivery(push('secret-2'));
		expect(t.gaps).toHaveLength(2);
		expect(t.delays).toHaveLength(1);
		// The old connection's secret no longer verifies anything.
		t.transport.opens[0]?.handlers.onDelivery(push('secret-1'));
		expect(t.events).toHaveLength(1);
	});

	it('[<10ms] doubles the delay of failed opens and stops after the bound', async () => {
		const t = setup({ maxAttempts: 3, firstDelayMs: 10 });
		t.receiver.start();
		t.transport.opens[0]?.reject(new Error('gh: not logged in'));
		await flush();
		t.delays[0]?.run();
		t.transport.opens[1]?.reject(new Error('gh: not logged in'));
		await flush();
		t.delays[1]?.run();
		t.transport.opens[2]?.reject(new Error('gh: not logged in'));
		await flush();
		expect(t.delays.map((d) => d.ms)).toEqual([10, 20]);
		expect(t.transport.opens).toHaveLength(3);
		expect(t.lines.at(-1)).toContain('no more retries');
		expect(t.gaps).toEqual([]);
	});

	it('[<10ms] a connection that stayed up resets the failure count', async () => {
		const t = setup({ maxAttempts: 2, firstDelayMs: 10, stableMs: 100 });
		t.receiver.start();
		t.transport.opens[0]?.reject(new Error('flaky'));
		await flush();
		t.delays[0]?.run();
		t.transport.opens[1]?.resolve();
		await flush();
		t.advance(100);
		t.transport.opens[1]?.handlers.onClosed('network');
		// One failure since the healthy connection, under the bound of 2.
		expect(t.delays.map((d) => d.ms)).toEqual([10, 10]);
	});

	it('[<10ms] stop closes the connection, cancels a pending retry and ignores late callbacks', async () => {
		const t = setup();
		t.receiver.start();
		t.transport.opens[0]?.resolve();
		await flush();
		await t.receiver.stop();
		expect(t.transport.opens[0]?.closed).toBe(true);
		expect(t.states).toEqual([true, false]);
		t.transport.opens[0]?.handlers.onClosed('late');
		expect(t.delays).toEqual([]);

		t.receiver.start();
		t.transport.opens[1]?.reject(new Error('down'));
		await flush();
		await t.receiver.stop();
		expect(t.delays[0]?.cancelled).toBe(true);
		await t.receiver.stop();
	});

	it('[<10ms] closes a connection that opened after it was stopped', async () => {
		const t = setup();
		t.receiver.start();
		await t.receiver.stop();
		t.transport.opens[0]?.resolve();
		await flush();
		expect(t.transport.opens[0]?.closed).toBe(true);
		expect(t.receiver.connected()).toBe(false);
	});

	it('[<10ms] a failing subscriber neither stops delivery nor the others', async () => {
		const t = setup();
		t.receiver.subscribe({
			onEvent: () => {
				throw new Error('boom');
			},
			onGap: async () => {
				throw new Error('gap boom');
			},
		});
		const unsubscribe = t.receiver.subscribe({ onEvent: () => undefined });
		unsubscribe();
		t.receiver.start();
		t.transport.opens[0]?.resolve();
		await flush();
		t.transport.opens[0]?.handlers.onDelivery(push('secret-1'));
		expect(t.events).toHaveLength(1);
		expect(
			t.lines.filter((l) => l.includes('subscriber failed')),
		).toHaveLength(2);
	});
});
