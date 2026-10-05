import { describe, expect, it } from 'vitest';

import { asWorkItemId, type INewWorkEvent } from '../events/work-event';
import { AgentLeaseObserver } from './agent-lease-observer.service';
import type { ILeaseRef } from './contracts/interfaces/observer.interface';

const lease: ILeaseRef = {
	id: 'lease-1',
	workItemId: asWorkItemId('f00509/S5'),
	agentId: 'agent',
};

const INTERVAL = 1000;

const make = () => {
	const events: INewWorkEvent[] = [];
	let clock = 0;
	const observer = new AgentLeaseObserver({
		sink: {
			append: async (event) => {
				events.push(event);
			},
		},
		heartbeatIntervalMs: INTERVAL,
		now: () => clock,
	});
	return {
		events,
		observer,
		tick: (ms: number) => {
			clock += ms;
			return clock;
		},
	};
};

describe('AgentLeaseObserver (f00509 S5)', () => {
	it('claim, 4 heartbeats, release makes 6 events', async () => {
		const { events, observer, tick } = make();
		observer.claimed(lease);
		for (let i = 0; i < 4; i += 1) {
			tick(INTERVAL);
			observer.heartbeat(lease);
		}
		observer.released(lease);
		observer.check(tick(INTERVAL * 10));
		await observer.idle();
		expect(events).toHaveLength(6);
		expect(events.map((e) => e.kind)).toEqual([
			'lease_claimed',
			'lease_heartbeat',
			'lease_heartbeat',
			'lease_heartbeat',
			'lease_heartbeat',
			'lease_released',
		]);
	});

	it('reports silence once: claim, 5 heartbeats, silence, check', async () => {
		const { events, observer, tick } = make();
		observer.claimed(lease);
		for (let i = 0; i < 5; i += 1) {
			tick(INTERVAL);
			observer.heartbeat(lease);
		}
		observer.check(tick(INTERVAL * 2));
		await observer.idle();
		expect(events).toHaveLength(6);
		observer.check(tick(INTERVAL * 3));
		await observer.idle();
		expect(events).toHaveLength(7);
		expect(events[6]?.kind).toBe('lease_heartbeat_missed');
		observer.check(tick(INTERVAL * 10));
		await observer.idle();
		expect(events).toHaveLength(7);
	});

	it('does not report a lease that is still within three intervals', async () => {
		const { events, observer, tick } = make();
		observer.claimed(lease);
		observer.check(tick(INTERVAL * 3 - 1));
		await observer.idle();
		expect(events).toHaveLength(1);
	});
});
