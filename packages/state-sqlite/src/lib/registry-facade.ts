import type {
	GenerationFenceOutcome,
	StateGeneration,
} from '@delendai/state/generation';
import type {
	IResolvedProducerInput,
	IStateChange,
	IStateInputSnapshot,
	IStateProducer,
} from '@delendai/state/producer';
import type {
	IHydrateInput,
	IProjectLeaseHandle,
	IReadResult,
	ISnapshotIssue,
	IStateRegistry,
	ISwarmClaimHandle,
} from '@delendai/state/registry';
import type { ICanonicalProjectFingerprint } from '@delendai/state/fingerprint';
import type { StateScope } from '@delendai/state/scope';

import {
	canonicalRegistryStateHash,
	SqliteStateRegistry,
	type IParityMismatchRecorder,
} from './sqlite-driver';

export interface IStateParityIncident {
	readonly incidentType: 'state-parity-mismatch';
	readonly primaryHash: string;
	readonly shadowHash: string;
	readonly fingerprint?: string;
	readonly scopeKey?: string;
}

export interface IStateRegistryFacade extends IStateRegistry {
	readonly mismatches: readonly IStateParityIncident[];
	sampleNow(): readonly IStateParityIncident[];
	stopSampler(): void;
}

export interface IRegistryFacadeOptions {
	readonly primary: IStateRegistry;
	readonly shadow: IStateRegistry;
	readonly logger?: (incident: IStateParityIncident) => void;
	readonly samplerIntervalMs?: number;
	readonly sampleFactory?: {
		readonly primary: () => IStateRegistry;
		readonly shadow: () => IStateRegistry;
	};
}

export function createRegistryFacade(
	options: IRegistryFacadeOptions,
): IStateRegistryFacade {
	return new StateRegistryFacade(options);
}

class StateRegistryFacade implements IStateRegistryFacade {
	private readonly primary: IStateRegistry;
	private readonly shadow: IStateRegistry;
	private readonly logger?: (incident: IStateParityIncident) => void;
	private readonly sampleFactory?: IRegistryFacadeOptions['sampleFactory'];
	private readonly definedProducers = new Map<string, IStateProducer>();
	private readonly latestInputs = new Map<string, IHydrateInput>();
	private readonly incidents: IStateParityIncident[] = [];
	private readonly samplerId: Timer;

	constructor(options: IRegistryFacadeOptions) {
		this.primary = options.primary;
		this.shadow = options.shadow;
		this.logger = options.logger;
		this.sampleFactory = options.sampleFactory;
		this.samplerId = setInterval(() => {
			this.sampleNow();
		}, options.samplerIntervalMs ?? 1_000);
	}

	get mismatches(): readonly IStateParityIncident[] {
		return this.incidents;
	}

	defineProducer(producer: IStateProducer): IStateProducer {
		this.definedProducers.set(producer.id, producer);
		const primary = this.primary.defineProducer(producer);
		this.shadow.defineProducer(producer);
		this.compare();
		return primary;
	}

	hydrate(input: IHydrateInput) {
		this.latestInputs.set(scopeKey(input.scope), input);
		const primary = this.primary.hydrate(input);
		const shadow = this.shadow.hydrate(input);
		this.compare(input.scope, primary.ok ? primary.generation : undefined, shadow.ok ? shadow.generation : undefined);
		return primary;
	}

	incremental(input: IHydrateInput, change: IStateChange) {
		this.latestInputs.set(scopeKey(input.scope), input);
		const primary = this.primary.incremental(input, change);
		const shadow = this.shadow.incremental(input, change);
		this.compare(input.scope, primary.ok ? primary.generation : undefined, shadow.ok ? shadow.generation : undefined);
		return primary;
	}

	lookup(args: { readonly scope: StateScope; readonly producerId: string }): IReadResult {
		const primary = this.primary.lookup(args);
		this.shadow.lookup(args);
		this.compare(args.scope);
		return primary;
	}

	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: string;
		readonly token: number;
	}): IProjectLeaseHandle | import('@delendai/state/generation').IFenceRejected {
		const primary = this.primary.acquireProjectLease(args);
		this.shadow.acquireProjectLease(args);
		this.compare(args.scope);
		return primary;
	}

	releaseProjectLease(args: { readonly scope: StateScope; readonly leaseId: string }): void {
		this.primary.releaseProjectLease(args);
		this.shadow.releaseProjectLease(args);
		this.compare(args.scope);
	}

	acquireSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
	}): ISwarmClaimHandle {
		const primary = this.primary.acquireSwarmClaim(args);
		this.shadow.acquireSwarmClaim(args);
		this.compare(args.scope);
		return primary;
	}

	renewSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
		readonly token: number;
	}): GenerationFenceOutcome {
		const primary = this.primary.renewSwarmClaim(args);
		this.shadow.renewSwarmClaim(args);
		this.compare(args.scope);
		return primary;
	}

	gc(scope?: StateScope): number {
		const primary = this.primary.gc(scope);
		this.shadow.gc(scope);
		this.compare(scope);
		return primary;
	}

	diagnose(): readonly StateGeneration[] {
		const primary = this.primary.diagnose();
		this.compare();
		return primary;
	}

	seedFingerprint(
		resolved?: ReadonlyMap<string, readonly IResolvedProducerInput[]>,
	): ICanonicalProjectFingerprint {
		return this.primary.seedFingerprint(resolved);
	}

	validateSnapshot(snapshot: IStateInputSnapshot): readonly ISnapshotIssue[] {
		const primary = this.primary.validateSnapshot(snapshot);
		this.shadow.validateSnapshot(snapshot);
		return primary;
	}

	validateSnapshotIntegrity(
		snapshot: IStateInputSnapshot,
	): readonly ISnapshotIssue[] {
		const primary = this.primary.validateSnapshotIntegrity(snapshot);
		this.shadow.validateSnapshotIntegrity(snapshot);
		return primary;
	}

	validateSnapshotAgainstRegistry(
		snapshot: IStateInputSnapshot,
		scope?: StateScope,
	): readonly ISnapshotIssue[] {
		const primary = this.primary.validateSnapshotAgainstRegistry(snapshot, scope);
		this.shadow.validateSnapshotAgainstRegistry(snapshot, scope);
		return primary;
	}

	resetForTests(): void {
		this.primary.resetForTests();
		this.shadow.resetForTests();
		this.latestInputs.clear();
		this.incidents.length = 0;
	}

	sampleNow(): readonly IStateParityIncident[] {
		if (this.sampleFactory) {
			for (const input of this.latestInputs.values()) {
				const primary = this.sampleFactory.primary();
				const shadow = this.sampleFactory.shadow();
				for (const producer of this.definedProducers.values()) {
					primary.defineProducer(producer);
					shadow.defineProducer(producer);
				}
				primary.hydrate(input);
				shadow.hydrate(input);
				this.compare(input.scope, undefined, undefined, primary, shadow);
			}
			return this.incidents;
		}
		for (const input of this.latestInputs.values()) {
			this.compare(input.scope);
		}
		return this.incidents;
	}

	stopSampler(): void {
		clearInterval(this.samplerId);
	}

	private compare(
		scope?: StateScope,
		primaryGeneration?: StateGeneration,
		shadowGeneration?: StateGeneration,
		primaryRegistry: IStateRegistry = this.primary,
		shadowRegistry: IStateRegistry = this.shadow,
	): void {
		const primaryHash = canonicalRegistryStateHash(primaryRegistry);
		const shadowHash = canonicalRegistryStateHash(shadowRegistry);
		if (primaryHash === shadowHash) return;
		const fingerprint = primaryGeneration?.canonicalHash ?? shadowGeneration?.canonicalHash;
		const incident: IStateParityIncident = {
			incidentType: 'state-parity-mismatch',
			primaryHash,
			shadowHash,
			fingerprint,
			scopeKey: scope ? scopeKey(scope) : undefined,
		};
		this.incidents.push(incident);
		this.logger?.(incident);
		const recorder = this.shadow as Partial<IParityMismatchRecorder>;
		if (fingerprint && typeof recorder.recordParityMismatch === 'function') {
			recorder.recordParityMismatch(fingerprint);
		}
	}
}

function scopeKey(scope: StateScope): string {
	return `${scope.kind}|${JSON.stringify(scope.locator)}`;
}

void SqliteStateRegistry;