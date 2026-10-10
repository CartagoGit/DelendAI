/**
 * agent-lease-observer.service.ts — publishes to the Work Event Bus the
 * life of an agent lease: claimed, heartbeat, released, and the silence
 * that follows a killed agent. A pure component: the consumer calls
 * `claimed()`, `heartbeat()`, `released()` and `check(now)`.
 *
 * Contract:
 * - There are no timers. `check(now)` takes the clock from the caller and
 *   emits `lease_heartbeat_missed` once per lease when three heartbeat
 *   intervals passed with neither a heartbeat nor a release.
 * - A lease that was released is forgotten; a missed lease is reported
 *   once, and a later heartbeat re-arms it.
 * - Fire-and-forget: nothing awaits, nothing throws into the caller.
 */

import {
	LEASE_HEARTBEAT_INTERVAL_MS,
	LEASE_MISSED_HEARTBEATS,
} from './contracts/constants/observer.constant';
import type {
	IAgentLeaseObserverOptions,
	ILeaseRef,
} from './contracts/interfaces/observer.interface';
import { hashProjection, ObserverEmitter } from './observer-emitter.service';

interface ITrackedLease {
	readonly lease: ILeaseRef;
	lastSeenAt: number;
	reported: boolean;
}

export class AgentLeaseObserver {
	private readonly emitter: ObserverEmitter;
	private readonly now: () => number;
	private readonly intervalMs: number;
	private readonly leases = new Map<string, ITrackedLease>();

	constructor(options: IAgentLeaseObserverOptions) {
		this.now = options.now ?? Date.now;
		this.intervalMs =
			options.heartbeatIntervalMs ?? LEASE_HEARTBEAT_INTERVAL_MS;
		this.emitter = new ObserverEmitter(options.sink, this.now);
	}

	claimed(lease: ILeaseRef): void {
		this.leases.set(lease.id, {
			lease,
			lastSeenAt: this.now(),
			reported: false,
		});
		this.emit('lease_claimed', lease);
	}

	heartbeat(lease: ILeaseRef): void {
		const tracked = this.leases.get(lease.id);
		if (tracked !== undefined) {
			tracked.lastSeenAt = this.now();
			tracked.reported = false;
		} else {
			this.leases.set(lease.id, {
				lease,
				lastSeenAt: this.now(),
				reported: false,
			});
		}
		this.emit('lease_heartbeat', lease);
	}

	released(lease: ILeaseRef): void {
		this.leases.delete(lease.id);
		this.emit('lease_released', lease);
	}

	/** Report every lease silent for three intervals, once each. */
	check(now: number): void {
		const limit = this.intervalMs * LEASE_MISSED_HEARTBEATS;
		for (const tracked of this.leases.values()) {
			if (tracked.reported || now - tracked.lastSeenAt < limit) continue;
			tracked.reported = true;
			this.emit('lease_heartbeat_missed', tracked.lease, now);
		}
	}

	/** Resolves once nothing is queued. Meant for tests and shutdown. */
	idle(): Promise<void> {
		return this.emitter.idle();
	}

	private emit(
		kind:
			| 'lease_claimed'
			| 'lease_heartbeat'
			| 'lease_released'
			| 'lease_heartbeat_missed',
		lease: ILeaseRef,
		createdAt?: number,
	): void {
		this.emitter.emit(
			kind,
			lease.workItemId,
			lease.agentId,
			hashProjection({ lease: lease.id, agent: lease.agentId, kind }),
			createdAt,
		);
	}
}
