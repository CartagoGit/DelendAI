import type {
	GenerationFenceOutcome,
	ICanonicalProjectFingerprint,
	IFenceRejected,
	IHydrateInput,
	IProjectLeaseHandle,
	IReadResult,
	IResolvedProducerInput,
	ISnapshotIssue,
	IStateChange,
	IStateInputSnapshot,
	IStateProducer,
	IStateRegistry,
	ISwarmClaimHandle,
	IStateGeneration,
	StateScope,
} from '@delendai/state';

import {
	canonicalRegistryStateHash,
	SqliteStateRegistry,
	type IParityMismatchRecorder,
} from './sqlite-driver';

export interface IStateParityIncident {
	readonly incidentType: 'state-parity-mismatch';
	readonly primaryHash: string;
	readonly shadowHash: string;
	readonly fingerprint?: string | undefined;
	readonly scopeKey?: string | undefined;
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
	private readonly logger:
		| ((incident: IStateParityIncident) => void)
		| undefined;
	private readonly sampleFactory:
		| IRegistryFacadeOptions['sampleFactory']
		| undefined;
	private readonly definedProducers = new Map<string, IStateProducer>();
	private readonly latestInputs = new Map<string, IHydrateInput>();
	private readonly incidents: IStateParityIncident[] = [];
	private readonly samplerId: ReturnType<typeof setInterval>;

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
		this.compare(
			input.scope,
			primary.ok ? primary.generation : undefined,
			shadow.ok ? shadow.generation : undefined,
		);
		return primary;
	}

	incremental(input: IHydrateInput, change: IStateChange) {
		this.latestInputs.set(scopeKey(input.scope), input);
		const primary = this.primary.incremental(input, change);
		const shadow = this.shadow.incremental(input, change);
		this.compare(
			input.scope,
			primary.ok ? primary.generation : undefined,
			shadow.ok ? shadow.generation : undefined,
		);
		return primary;
	}

	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): IReadResult {
		const primary = this.primary.lookup(args);
		this.shadow.lookup(args);
		this.compare(args.scope);
		return primary;
	}

	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: string;
		readonly token: number;
	}): IProjectLeaseHandle | IFenceRejected {
		const primary = this.primary.acquireProjectLease(args);
		this.shadow.acquireProjectLease(args);
		this.compare(args.scope);
		return primary;
	}

	releaseProjectLease(args: {
		readonly scope: StateScope;
		readonly leaseId: string;
	}): void {
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

	diagnose(): readonly IStateGeneration[] {
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
		const primary = this.primary.validateSnapshotAgainstRegistry(
			snapshot,
			scope,
		);
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
				this.compare(
					input.scope,
					undefined,
					undefined,
					primary,
					shadow,
				);
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

	/**
	 * Parity for ONE operation, when that operation produced a generation
	 * on both sides.
	 *
	 * A generation's `canonicalHash` is the digest of what the operation
	 * actually produced, so comparing the two is exactly the parity
	 * question for this write — and it is O(1), where hashing both whole
	 * registries is O(generations) and therefore O(n²) across a run.
	 * Measured before this split: 4.7ms per registry hash at 101
	 * generations, 71.6ms at 401, which is why a 1000-operation parity
	 * test exceeded a 180s timeout in CI. That cost was paid on the
	 * write path of the running system, not only in tests.
	 *
	 * This does NOT reduce what is checked. Whole-registry parity is the
	 * sampler's job — it re-derives both sides from the recorded inputs
	 * on an interval and compares everything, which is the only check
	 * that can catch drift in a generation no recent write touched. The
	 * per-write check answers the per-write question; the periodic check
	 * answers the global one.
	 */
	private generationParity(
		primaryGeneration?: IStateGeneration,
		shadowGeneration?: IStateGeneration,
	): { readonly primaryHash: string; readonly shadowHash: string } | null {
		// One side producing a generation while the other did not IS a
		// divergence, but it is not one these two hashes can describe —
		// fall back to the whole-registry comparison so the incident
		// carries meaningful hashes.
		if (primaryGeneration === undefined || shadowGeneration === undefined)
			return null;
		return {
			primaryHash: primaryGeneration.canonicalHash,
			shadowHash: shadowGeneration.canonicalHash,
		};
	}

	private compare(
		scope?: StateScope,
		primaryGeneration?: IStateGeneration,
		shadowGeneration?: IStateGeneration,
		primaryRegistry: IStateRegistry = this.primary,
		shadowRegistry: IStateRegistry = this.shadow,
	): void {
		const perOperation = this.generationParity(
			primaryGeneration,
			shadowGeneration,
		);
		const primaryHash =
			perOperation?.primaryHash ??
			canonicalRegistryStateHash(primaryRegistry);
		const shadowHash =
			perOperation?.shadowHash ??
			canonicalRegistryStateHash(shadowRegistry);
		if (primaryHash === shadowHash) return;
		const fingerprint =
			primaryGeneration?.canonicalHash ?? shadowGeneration?.canonicalHash;
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
		if (
			fingerprint &&
			typeof recorder.recordParityMismatch === 'function'
		) {
			recorder.recordParityMismatch(fingerprint);
		}
	}
}

function scopeKey(scope: StateScope): string {
	return `${scope.kind}|${JSON.stringify(scope.locator)}`;
}

void SqliteStateRegistry;
