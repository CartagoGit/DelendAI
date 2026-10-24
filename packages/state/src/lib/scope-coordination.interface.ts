/**
 * scope-coordination.interface.ts
 *
 * What a scope holds beyond its generations: the counters its fencing
 * tokens and ids are minted from, who holds which generation, and the
 * swarm claims in force. A driver that persists generations but not
 * this restarts every counter at zero on a new process, so a token
 * handed out before the restart collides with one handed out after it
 * — the one thing a fencing token exists to make impossible.
 */
import type { IGenerationId, ISwarmLeaseToken } from './generation';

/** One holder of one generation. A project lease is a holder of its kind. */
export interface IStoredHolder {
	readonly generationId: IGenerationId;
	readonly id: string;
	readonly kind: 'reader' | 'project-lease' | 'swarm-claim' | 'subagent';
	readonly acquiredAt: number;
}

/** One swarm claim in force. */
export interface IStoredSwarmClaim {
	readonly slot: string;
	readonly token: ISwarmLeaseToken;
	readonly holderId: string;
	readonly generationId: IGenerationId;
}

/** A scope's coordination state, as a driver stores and restores it. */
export interface IScopeCoordination {
	/** The registry-wide serial generation ids are minted from. */
	readonly globalSerial: number;
	readonly nextGenerationSerial: number;
	readonly nextProjectLeaseToken: number;
	readonly nextProjectLeaseSerial: number;
	readonly nextSwarmLeaseToken: number;
	readonly holders: readonly IStoredHolder[];
	readonly swarmClaims: readonly IStoredSwarmClaim[];
}
