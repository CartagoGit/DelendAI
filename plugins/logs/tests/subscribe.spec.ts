import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import type { ILogEvent } from '../src/lib/services/normalize-event';
import { subscribeToBus } from '../src/lib/services/subscribe';

describe('subscribeToBus', () => {
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
		subscription.close();
		bus.emit('agent-dead', { agent: 'a2' });

		expect(events).toHaveLength(1);
		expect(events[0]?.kind).toBe('agent-dead');
		expect(events[0]?.outcome).toBe('dead');
		expect(events[0]?.summary).toContain('[REDACTED]');
	});
});
