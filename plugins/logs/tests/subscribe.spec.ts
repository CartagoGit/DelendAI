import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import type { ILogEvent } from '../src/lib/services/normalize-event';
import { subscribeToBus } from '../src/lib/services/subscribe';

describe('subscribeToBus', async () => {
	it('normalizes bus events into log events and redacts payloads', async () => {
		const events: ILogEvent[] = [];
		const bus = new EventEmitter();
		const subscription = subscribeToBus(
			{
				on: (event, listener) => bus.on(event, listener),
				off: (event, listener) => bus.off(event, listener),
			},
			{
				appendEvent: async (event) => {
					events.push(event);
				},
			},
		);

		bus.emit('agent-dead', {
			agent: 'a1',
			taskId: 'f00015-s3',
			summary: 'token = ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL',
		});
		await subscription.close();
		bus.emit('agent-dead', { agent: 'a2' });

		expect(events).toHaveLength(1);
		expect(events[0]?.kind).toBe('agent-dead');
		expect(events[0]?.outcome).toBe('dead');
		expect(events[0]?.summary).toContain('[REDACTED]');
	});

	it('drains pending writes and observes append rejections on close', async () => {
		const bus = new EventEmitter();
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const subscription = subscribeToBus(
			{
				on: (event, listener) => bus.on(event, listener),
				off: (event, listener) => bus.off(event, listener),
			},
			{
				appendEvent: async () => {
					await blocked;
					throw new Error('disk unavailable');
				},
			},
		);

		bus.emit('agent-idle', { agent: 'a1' });
		let closed = false;
		const closing = subscription.close().then(() => {
			closed = true;
		});
		await Promise.resolve();
		expect(closed).toBe(false);
		release();
		await expect(closing).resolves.toBeUndefined();
		expect(closed).toBe(true);
	});
});
