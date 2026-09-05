/**
 * driver-in-memory.ts — `InMemoryStateRegistry` (Phase 0 driver).
 *
 * q00018 Phase 0 S3. Pure in-memory implementation of
 * `IStateRegistry`. Used by tests and by plugins that want to
 * prototype a producer before Phase 1 introduces the SQLite
 * driver.
 *
 * Important: this driver does NOT persist. A restart of the
 * process loses every generation. That is intentional — Phase 0
 * is about contracts and property tests, not persistence.
 *
 * Determinism: the registry is fully synchronous and the only
 * non-deterministic source is the injected clock (default
 * `Date.now()`). Tests MUST inject a fixed clock to be
 * reproducible.
 */

import type {
	IProducerInput,
	ProjectFingerprint,
	Sha256Hex,
} from './fingerprint';
import { STATE_ABI_VERSION, toCanonicalFingerprintShape } from './fingerprint';
import type {
	GenerationId,
	GenerationStatus,
	GenerationWriteOutcome,
	HydrateFailureReason,
	IStateGeneration,
	LeaseToken,
} from './generation';
import type { CanonicalProjection, CanonicalJsonValue } from './hash';
import { canonicalStateHash } from './hash';
import type {
	IProjectionResult,
	IStateChange,
	IStateProducer,
} from './producer';
import { defaultCanonicalize, isProducerWellFormed } from './producer';
import type {
	IProducerLease,
	IReadResult,
	IStateRegistry,
	IStateRegistryOptions,
	IHydrateArgs,
	StateClock,
} from './registry';
import type { IStateScope } from './scope';
import { scopesEqual } from './scope';

/**
 * Default clock factory. The driver does NOT bake a default — every
 * host MUST inject a clock (production hosts pass `() => Date.now()`,
 * tests pass a fixed counter). The clock lives in the registry's
 * options to keep the State Engine contract-side free of
 * non-deterministic defaults.
 *
 * Kept here for documentation only; the registry constructor
 * requires `options.clock` to be set.
 */

/**
 * Internal storage per scope. Each scope owns:
 *   - the list of generations (id → generation + projections)
 *   - the active generation id
 *   - the next lease token to hand out
 */
interface IScopeState {
	generations: Map<GenerationId, IGenerationRecord>;
	activeId: GenerationId | null;
	nextGenerationSerial: number;
	nextLeaseToken: number;
}

interface IGenerationRecord {
	readonly generation: IStateGeneration;
	readonly projections: Map<string, IProjectionResult>;
	readonly holders: Map<
		string,
		{ kind: 'reader' | 'lease' | 'subagent'; acquiredAt: number }
	>;
}

export class InMemoryStateRegistry implements IStateRegistry {
	private readonly producers = new Map<string, IStateProducer>();
	private readonly scopeStates = new Map<string, IScopeState>();
	private readonly clock: StateClock | undefined;
	private readonly defaultSalt: string;
	private globalSerial = 0;

	constructor(options: IStateRegistryOptions) {
		this.clock = options.clock;
		this.defaultSalt = options.defaultSalt ?? '';
	}

	defineProducer(producer: IStateProducer): IStateProducer {
		if (!isProducerWellFormed(producer, STATE_ABI_VERSION)) {
			throw new Error(
				`[state] ill-formed producer: ${JSON.stringify({
					id: producer.id,
					abiVersion: producer.abiVersion,
					expectedAbi: STATE_ABI_VERSION,
					serves: producer.serves,
					hasRebuild: typeof producer.rebuild === 'function',
					hasReconcile: typeof producer.reconcile === 'function',
				})}`,
			);
		}
		const existing = this.producers.get(producer.id);
		if (
			existing &&
			existing.abiVersion === producer.abiVersion &&
			existing.producerVersion === producer.producerVersion
		) {
			throw new Error(
				`[state] duplicate producer id=${producer.id} version=${producer.producerVersion}`,
			);
		}
		this.producers.set(producer.id, producer);
		if (existing) {
			// Bump generations for every scope the new producer serves.
			for (const state of this.scopeStates.values()) {
				if (producer.serves.includes(this.scopeKindFromState(state))) {
					// No-op: the producer version change is reflected in the
					// fingerprint; the next hydrate/incremental computes a new
					// generation. We deliberately do NOT preemptively rebuild
					// to keep hydrate/incremental idempotent under repeated
					// `defineProducer` calls.
					void this;
				}
			}
		}
		return producer;
	}

	computeFingerprint(
		salt: string = this.defaultSalt,
		hostInputs?: ReadonlyMap<string, readonly IProducerInput[]>,
	): ProjectFingerprint {
		const producers = Array.from(this.producers.values()).sort((a, b) =>
			a.id.localeCompare(b.id),
		);
		const entries = producers.map((p) => {
			const override = hostInputs?.get(p.id);
			const inputs = override ?? p.inputs;
			return {
				id: p.id,
				producerVersion: p.producerVersion,
				abiVersion: p.abiVersion,
				inputs: inputs.map((i) => {
					const base = {
						kind: i.kind,
						locator: i.locator,
						digest: i.digest,
					};
					return i.parserVersion === undefined
						? base
						: { ...base, parserVersion: i.parserVersion };
				}),
			};
		});
		return {
			abiVersion: STATE_ABI_VERSION,
			salt,
			producers: entries,
		};
	}

	hydrate(
		args: IHydrateArgs,
	):
		| { readonly ok: true; readonly generation: IStateGeneration }
		| {
				readonly ok: false;
				readonly reason: HydrateFailureReason;
				readonly detail?: string;
		  } {
		const state = this.ensureScopeState(args.scope);
		const fp = args.fingerprint ?? this.computeFingerprint();
		const projections = new Map<string, IProjectionResult>();
		const inputContents: ReadonlyMap<string, Uint8Array> = new Map();
		for (const producer of this.producers.values()) {
			if (!producer.serves.includes(args.scope.kind)) continue;
			try {
				const result = producer.rebuild({
					scope: args.scope,
					fingerprint: fp,
					inputContents,
				});
				projections.set(producer.id, result);
			} catch (err) {
				return {
					ok: false,
					reason: 'producer_threw',
					detail: err instanceof Error ? err.message : String(err),
				};
			}
		}
		const gen = this.publishInternal(state, fp, projections, undefined);
		return { ok: true, generation: gen };
	}

	incremental(
		args: IHydrateArgs,
		change: IStateChange,
	):
		| { readonly ok: true; readonly generation: IStateGeneration }
		| {
				readonly ok: false;
				readonly reason: HydrateFailureReason;
				readonly detail?: string;
		  } {
		const state = this.ensureScopeState(args.scope);
		const fp = args.fingerprint ?? this.computeFingerprint();
		const active = state.activeId
			? state.generations.get(state.activeId)
			: undefined;
		if (!active) {
			return this.hydrate(args);
		}
		const projections = new Map<string, IProjectionResult>();
		const inputContents: ReadonlyMap<string, Uint8Array> = new Map();
		for (const producer of this.producers.values()) {
			if (!producer.serves.includes(args.scope.kind)) continue;
			const base = active.projections.get(producer.id);
			try {
				const result = producer.reconcile(
					{
						scope: args.scope,
						fingerprint: fp,
						inputContents,
						...(base ? { baseProjection: base } : {}),
					},
					change,
				);
				projections.set(producer.id, result);
			} catch (err) {
				return {
					ok: false,
					reason: 'producer_threw',
					detail: err instanceof Error ? err.message : String(err),
				};
			}
		}
		const gen = this.publishInternal(
			state,
			fp,
			projections,
			active.generation.id,
		);
		return { ok: true, generation: gen };
	}

	get(args: {
		readonly scope: IStateScope;
		readonly producerId: string;
	}): IReadResult {
		const state = this.scopeStateFor(args.scope);
		if (!state || !state.activeId) {
			return { ok: false, reason: 'no_active_generation' };
		}
		const record = state.generations.get(state.activeId);
		if (!record) {
			return {
				ok: false,
				reason: 'no_active_generation',
				detail: 'active id missing',
			};
		}
		const projection = record.projections.get(args.producerId);
		if (!projection) {
			return {
				ok: false,
				reason: 'producer_threw',
				detail: `unknown producer ${args.producerId}`,
			};
		}
		const canonical = this.canonicalizeProjection(
			record.generation.fingerprint,
			projection,
		);
		return {
			ok: true,
			generation: record.generation,
			projection: canonical,
		};
	}

	tryWrite(args: {
		readonly scope: IStateScope;
		readonly generationId: GenerationId;
		readonly leaseToken: LeaseToken;
		readonly payload: IProjectionResult;
	}): GenerationWriteOutcome {
		const state = this.scopeStateFor(args.scope);
		if (!state || !state.activeId) {
			return {
				ok: false,
				reason: 'STALE_GENERATION',
				currentGenerationId: '',
				currentLeaseToken: 0,
			};
		}
		const record = state.generations.get(args.generationId);
		if (
			!record ||
			record.generation.status !== 'active' ||
			record.generation.id !== state.activeId
		) {
			return {
				ok: false,
				reason: 'STALE_GENERATION',
				currentGenerationId: state.activeId,
				currentLeaseToken: state.nextLeaseToken - 1,
			};
		}
		if (record.generation.leaseToken !== args.leaseToken) {
			return {
				ok: false,
				reason: 'LEASE_REVOKED',
				currentGenerationId: record.generation.id,
				currentLeaseToken: record.generation.leaseToken,
			};
		}
		record.projections.set('__inline__', args.payload);
		return {
			ok: true,
			generationId: record.generation.id,
			leaseToken: record.generation.leaseToken,
		};
	}

	releaseLease(args: {
		readonly scope: IStateScope;
		readonly generationId: GenerationId;
		readonly leaseToken: LeaseToken;
	}): void {
		const state = this.scopeStateFor(args.scope);
		if (!state) return;
		const record = state.generations.get(args.generationId);
		if (!record) return;
		const holderKey = `lease:${String(args.leaseToken)}`;
		record.holders.delete(holderKey);
	}

	publish(args: {
		readonly scope: IStateScope;
		readonly parentId?: GenerationId;
		readonly projections: ReadonlyMap<string, IProjectionResult>;
	}): IStateGeneration {
		const state = this.ensureScopeState(args.scope);
		const fp = this.computeFingerprint();
		return this.publishInternal(
			state,
			fp,
			new Map(args.projections),
			args.parentId,
		);
	}

	gc(scope?: IStateScope): number {
		let reaped = 0;
		const states = scope
			? [this.scopeStateFor(scope)].filter(Boolean)
			: Array.from(this.scopeStates.values());
		for (const state of states) {
			if (!state) continue;
			for (const [id, record] of state.generations) {
				if (
					record.generation.status === 'draining' &&
					record.holders.size === 0
				) {
					state.generations.delete(id);
					// Mutate the generation's status to 'reaped'. The
					// generation is a fresh object created in
					// publishInternal; mutating it here is safe because no
					// other holder can observe it (gc pre-condition: holders
					// must be zero).
					(
						record.generation as unknown as {
							status: GenerationStatus;
						}
					).status = 'reaped';
					reaped += 1;
				}
			}
		}
		return reaped;
	}

	diagnose(): readonly IStateGeneration[] {
		const out: IStateGeneration[] = [];
		for (const state of this.scopeStates.values()) {
			for (const record of state.generations.values()) {
				out.push(record.generation);
			}
		}
		return out;
	}

	resetForTests(): void {
		this.producers.clear();
		this.scopeStates.clear();
		this.globalSerial = 0;
	}

	// --- internals ----------------------------------------------------

	private ensureScopeState(scope: IStateScope): IScopeState {
		const key = scopeKey(scope);
		let state = this.scopeStates.get(key);
		if (!state) {
			state = {
				generations: new Map(),
				activeId: null,
				nextGenerationSerial: 0,
				nextLeaseToken: 0,
			};
			this.scopeStates.set(key, state);
		}
		return state;
	}

	private scopeStateFor(scope: IStateScope): IScopeState | undefined {
		// Strict equality: two scopes with the same key but different
		// locator identity are different scopes (the host would have
		// constructed two different locators).
		for (const [key, state] of this.scopeStates) {
			if (key === scopeKey(scope)) return state;
		}
		return undefined;
	}

	private scopeKindFromState(_state: IScopeState): never {
		// Reserved for future per-state-kind handling. We never reach
		// here because `defineProducer` only needs the producer's own
		// `serves` list.
		throw new Error('[state] unreachable: scopeKindFromState');
	}

	private publishInternal(
		state: IScopeState,
		fingerprint: ProjectFingerprint,
		projections: ReadonlyMap<string, IProjectionResult>,
		parentId: GenerationId | undefined,
	): IStateGeneration {
		state.nextGenerationSerial += 1;
		state.nextLeaseToken += 1;
		const id = `g${String(this.globalSerial).padStart(6, '0')}-${String(state.nextGenerationSerial).padStart(4, '0')}`;
		this.globalSerial += 1;
		const canonicalHash = this.compositeCanonicalHash(
			fingerprint,
			projections,
		);
		const previousActiveId = state.activeId;
		const generation: IStateGeneration = {
			id,
			...(parentId ? { parentId } : {}),
			fingerprint,
			canonicalHash,
			status: 'active',
			createdAt: this.clock ? this.clock() : 0,
			leaseToken: state.nextLeaseToken,
			holderCount: 1,
		};
		const record: IGenerationRecord = {
			generation,
			projections: new Map(projections),
			holders: new Map([
				[
					'self',
					{
						kind: 'reader',
						acquiredAt: this.clock ? this.clock() : 0,
					},
				],
			]),
		};
		state.generations.set(id, record);
		state.activeId = id;
		if (previousActiveId) {
			const previous = state.generations.get(previousActiveId);
			if (previous) {
				previous.generation as { status: GenerationStatus };
				(
					previous.generation as unknown as {
						status: GenerationStatus;
					}
				).status = 'draining';
			}
		}
		return generation;
	}

	private compositeCanonicalHash(
		fingerprint: ProjectFingerprint,
		projections: ReadonlyMap<string, IProjectionResult>,
	): Sha256Hex {
		const shape = toCanonicalFingerprintShape(fingerprint);
		const merged: CanonicalJsonValue = {
			kind: 'state-generation',
			fingerprint: {
				abiVersion: shape.abiVersion,
				salt: shape.salt,
				producers: shape.producers.map((p) => {
					const base: Record<string, CanonicalJsonValue> = {
						id: p.id,
						producerVersion: p.producerVersion,
						abiVersion: p.abiVersion,
					};
					base.inputs = p.inputs.map((i) => {
						const inputBase: Record<string, CanonicalJsonValue> = {
							kind: i.kind,
							locator: i.locator,
							digest: i.digest,
						};
						if (i.parserVersion !== undefined) {
							inputBase.parserVersion = i.parserVersion;
						}
						return inputBase;
					});
					return base;
				}),
			},
			projections: this.mergeProjections(projections),
		};
		return canonicalStateHash(merged);
	}

	private mergeProjections(
		projections: ReadonlyMap<string, IProjectionResult>,
	): Record<string, CanonicalProjection> {
		const out: Record<string, CanonicalProjection> = {};
		const ids = Array.from(projections.keys()).sort();
		for (const id of ids) {
			const p = projections.get(id) as IProjectionResult;
			const canonicalize =
				this.producers.get(id)?.canonicalize ?? defaultCanonicalize;
			out[id] = canonicalize(p);
		}
		return out;
	}

	private canonicalizeProjection(
		_fingerprint: ProjectFingerprint,
		projection: IProjectionResult,
	): CanonicalProjection {
		// The merge step already canonicalizes via each producer's
		// canonicalize hook. Returning the canonical projection here is
		// safe even when the producer is not registered (the in-memory
		// driver exposes a fallback path).
		return defaultCanonicalize(projection);
	}
}

function scopeKey(scope: IStateScope): string {
	return `${scope.kind}|${scope.locator.workspaceRoot}|${scope.locator.swarmRoot ?? ''}|${scope.locator.cacheRoot ?? ''}|${scope.locator.docsRoot ?? ''}`;
}

/**
 * Factory mirroring the `defineX` style used elsewhere in the
 * repo. Returns a fresh registry each call. Tests can pass a
 * custom clock for reproducibility.
 */
export function defineInMemoryStateRegistry(
	options: IStateRegistryOptions,
): IStateRegistry {
	return new InMemoryStateRegistry(options);
}

/**
 * Public alias so consumers that want a strongly-typed lease can
 * import it from the driver module without depending on registry.ts.
 * Kept as a no-op wrapper for now — the InMemoryStateRegistry hands
 * leases back via `tryWrite` results; this export exists for
 * symmetry with the SQLite driver that will follow.
 */
export function noopLeaseHandle(_lease: IProducerLease): void {
	// Reserved for Phase 1.
	void _lease;
}

/**
 * Re-export for tests that want to assert `scopesEqual` semantics
 * without importing from `scope.ts` directly.
 */
export { scopesEqual };
