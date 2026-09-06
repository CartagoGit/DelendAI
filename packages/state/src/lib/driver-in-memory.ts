/**
 * driver-in-memory.ts — `InMemoryStateRegistry` (Phase 0.1 driver).
 *
 * q00018 Phase 0.1. The Phase 0 driver had several structural
 * issues identified by the reviewer; this rewrite addresses them:
 *
 *   - holders are real (`IRegistryHolder`) and refcounted; GC
 *     actually reaps generations whose holder count is zero.
 *
 *   - the active generation is IMMUTABLE: there is no
 *     `__inline__` mutation hook. Every mutation publishes a new
 *     generation; the previous one transitions to `draining`.
 *
 *   - project leases and swarm claims live in separate index
 *     spaces. Holders are typed (`'project-lease'` vs
 *     `'swarm-claim'`).
 *
 *   - the input snapshot is supplied by the host on every
 *     `hydrate()` / `incremental()` call. Producers read from
 *     `ctx.snapshot.contents`; the driver never reads `fs`.
 *
 *   - validation runs after `rebuild` / `reconcile`. Producers
 *     without `validateProjection` are trusted; with it, a
 *     non-empty issue list fails the generation.
 *
 *   - the `defineProducer` upgrade path no longer throws
 *     `[state] unreachable`. Bumping `producerVersion` simply
 *     updates the registered producer; the next `hydrate`
 *     computes a new generation.
 *
 * The driver is still PURE: no persistence, no fs, no network.
 */

import type {
	CanonicalJsonValue,
	CanonicalProjection,
	Sha256Hex,
} from './hash';
import { canonicalStateHash } from './hash';
import type { CanonicalProjectFingerprint } from './fingerprint';
import {
	STATE_ABI_VERSION,
	canonicalizeProducers,
	fingerprintEqual,
} from './fingerprint';
import type {
	GenerationFenceOutcome,
	HydrateResult,
	ProjectLeaseToken,
	StateGeneration,
	SwarmLeaseToken,
} from './generation';
import type {
	IResolvedInput,
	IStateChange,
	IStateProducer,
	ProjectionResult,
} from './producer';
import {
	buildSnapshot,
	defaultCanonicalize,
	fingerprintFromProducers,
	inputKeyString,
	inputKeyOf,
	isProducerWellFormed,
} from './producer';
import type {
	IHydrateInput,
	ProjectLeaseHandle,
	ReadResult,
	StateClock,
	StateRegistry,
	StateRegistryOptions,
	SwarmClaimHandle,
} from './registry';
import type { StateScope } from './scope';
import { scopesEqual } from './scope';
import type { GenerationId, GenerationStatus } from './generation';

interface IScopeState {
	generations: Map<GenerationId, GenerationRecord>;
	activeId: GenerationId | null;
	projectHolders: Map<string, IRegistryHolder>;
	swarmClaims: Map<string, SwarmClaimRecord>;
	nextGenerationSerial: number;
	nextProjectLeaseToken: number;
	nextSwarmLeaseToken: number;
}

interface GenerationRecord {
	readonly generation: StateGeneration;
	readonly projections: ReadonlyMap<string, ProjectionResult>;
	holders: Map<string, IRegistryHolder>;
}

type HolderKind = 'reader' | 'project-lease' | 'swarm-claim' | 'subagent';

interface IRegistryHolder {
	readonly id: string;
	readonly acquiredAt: number;
	readonly kind: HolderKind;
}

interface SwarmClaimRecord {
	readonly slot: string;
	readonly token: SwarmLeaseToken;
	readonly holderId: string;
	readonly generationId: GenerationId;
}

export class InMemoryStateRegistry implements StateRegistry {
	private readonly producers = new Map<string, IStateProducer>();
	private readonly scopeStates = new Map<string, IScopeState>();
	private readonly clock: StateClock;
	private globalSerial = 0;

	constructor(options: StateRegistryOptions) {
		this.clock = options.clock;
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
		// Bumping producerVersion is allowed; the next hydrate
		// produces a new generation whose fingerprint differs. We
		// do NOT pre-emptively rebuild — the host drives that.
		void existing;
		return producer;
	}

	hydrate(input: IHydrateInput): HydrateResult {
		const state = this.ensureScopeState(input.scope);
		const projections = new Map<string, ProjectionResult>();
		for (const producer of this.producers.values()) {
			if (!producer.serves.includes(input.scope.kind)) continue;
			let result: ProjectionResult;
			try {
				result = producer.rebuild({
					scope: input.scope,
					fingerprint: input.snapshot.fingerprint,
					snapshot: input.snapshot,
				});
			} catch (err) {
				return {
					ok: false,
					reason: 'producer_threw',
					detail: err instanceof Error ? err.message : String(err),
				};
			}
			if (producer.validateProjection) {
				const v = producer.validateProjection(result.canonical);
				if (v.issues.length > 0) {
					return {
						ok: false,
						reason: 'projection_invalid',
						detail: `${producer.id}: ${v.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
					};
				}
			}
			projections.set(producer.id, result);
		}
		const gen = this.publishInternal(state, input, projections, undefined);
		return { ok: true, generation: gen };
	}

	incremental(input: IHydrateInput, change: IStateChange): HydrateResult {
		const state = this.ensureScopeState(input.scope);
		const active = state.activeId
			? state.generations.get(state.activeId)
			: undefined;
		if (!active) {
			return this.hydrate(input);
		}
		const projections = new Map<string, ProjectionResult>();
		for (const producer of this.producers.values()) {
			if (!producer.serves.includes(input.scope.kind)) continue;
			const base = active.projections.get(producer.id);
			let result: ProjectionResult;
			try {
				result = producer.reconcile(
					{
						scope: input.scope,
						fingerprint: input.snapshot.fingerprint,
						snapshot: input.snapshot,
						...(base ? { baseProjection: base } : {}),
					},
					change,
				);
			} catch (err) {
				return {
					ok: false,
					reason: 'producer_threw',
					detail: err instanceof Error ? err.message : String(err),
				};
			}
			if (producer.validateProjection) {
				const v = producer.validateProjection(result.canonical);
				if (v.issues.length > 0) {
					return {
						ok: false,
						reason: 'projection_invalid',
						detail: `${producer.id}: ${v.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
					};
				}
			}
			projections.set(producer.id, result);
		}
		const gen = this.publishInternal(
			state,
			input,
			projections,
			active.generation.id,
		);
		return { ok: true, generation: gen };
	}

	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): ReadResult {
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
			return { ok: false, reason: 'producer_not_found' };
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

	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: GenerationId;
		readonly token: ProjectLeaseToken;
	}): GenerationFenceOutcome {
		const state = this.scopeStateFor(args.scope);
		if (!state || !state.activeId) {
			return {
				ok: false,
				reason: 'STALE_PROJECT_GENERATION',
				currentGenerationId: '',
				currentToken: 0,
			};
		}
		const record = state.generations.get(args.generationId);
		if (!record || record.generation.id !== state.activeId) {
			return {
				ok: false,
				reason: 'STALE_PROJECT_GENERATION',
				currentGenerationId: state.activeId,
				currentToken: record?.generation.projectLeaseToken ?? 0,
			};
		}
		if (record.generation.status !== 'active') {
			return {
				ok: false,
				reason: 'PROJECT_GENERATION_NOT_ACTIVE',
				currentGenerationId: record.generation.id,
				currentToken: record.generation.projectLeaseToken,
			};
		}
		if (record.generation.projectLeaseToken !== args.token) {
			return {
				ok: false,
				reason: 'STALE_PROJECT_GENERATION',
				currentGenerationId: record.generation.id,
				currentToken: record.generation.projectLeaseToken,
			};
		}
		const leaseId = `project:${args.generationId}:${String(args.token)}`;
		state.projectHolders.set(leaseId, {
			id: leaseId,
			acquiredAt: this.clock ? this.clock() : 0,
			kind: 'project-lease',
		});
		record.holders.set(leaseId, {
			id: leaseId,
			acquiredAt: this.clock ? this.clock() : 0,
			kind: 'project-lease',
		});
		return {
			ok: true,
			generationId: args.generationId,
			token: args.token,
		};
	}

	releaseProjectLease(args: {
		readonly scope: StateScope;
		readonly leaseId: string;
	}): void {
		const state = this.scopeStateFor(args.scope);
		if (!state) return;
		const holder = state.projectHolders.get(args.leaseId);
		state.projectHolders.delete(args.leaseId);
		if (!holder) return;
		for (const record of state.generations.values()) {
			record.holders.delete(args.leaseId);
		}
	}

	acquireSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
	}): SwarmClaimHandle {
		const state = this.ensureScopeState(args.scope);
		state.nextSwarmLeaseToken += 1;
		const token = state.nextSwarmLeaseToken;
		const holderId = `swarm:${args.slot}:${String(token)}`;
		state.swarmClaims.set(args.slot, {
			slot: args.slot,
			token,
			holderId,
			generationId: state.activeId ?? '',
		});
		if (state.activeId) {
			const record = state.generations.get(state.activeId);
			if (record) {
				record.holders.set(holderId, {
					id: holderId,
					acquiredAt: this.clock ? this.clock() : 0,
					kind: 'swarm-claim',
				});
			}
		}
		const registry = this;
		const handle: SwarmClaimHandle = {
			slot: args.slot,
			token,
			renew(): SwarmLeaseToken {
				const renewed = registry.renewSwarmClaim({
					scope: args.scope,
					slot: args.slot,
					token: handle.token,
				});
				if (!renewed.ok) {
					throw new Error(
						`[state] swarm claim renewal failed: ${renewed.reason}`,
					);
				}
				return renewed.token as SwarmLeaseToken;
			},
			release(): void {
				const s = registry.scopeStateFor(args.scope);
				if (!s) return;
				const claim = s.swarmClaims.get(args.slot);
				if (claim && claim.token === handle.token) {
					s.swarmClaims.delete(args.slot);
					if (claim.generationId) {
						const rec = s.generations.get(claim.generationId);
						if (rec) rec.holders.delete(claim.holderId);
					}
				}
			},
		};
		return handle;
	}

	renewSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
		readonly token: SwarmLeaseToken;
	}): GenerationFenceOutcome {
		const state = this.scopeStateFor(args.scope);
		if (!state) {
			return {
				ok: false,
				reason: 'STALE_SWARM_LEASE',
				currentGenerationId: '',
				currentToken: 0,
			};
		}
		const claim = state.swarmClaims.get(args.slot);
		if (!claim || claim.token !== args.token) {
			return {
				ok: false,
				reason: 'STALE_SWARM_LEASE',
				currentGenerationId: claim?.generationId ?? '',
				currentToken: claim?.token ?? 0,
			};
		}
		state.nextSwarmLeaseToken += 1;
		const newToken = state.nextSwarmLeaseToken;
		const oldHolderId = claim.holderId;
		const newHolderId = `swarm:${args.slot}:${String(newToken)}`;
		state.swarmClaims.set(args.slot, {
			slot: args.slot,
			token: newToken,
			holderId: newHolderId,
			generationId: claim.generationId,
		});
		// Move the holder to the new generation if any.
		if (claim.generationId) {
			const oldRec = state.generations.get(claim.generationId);
			oldRec?.holders.delete(oldHolderId);
			oldRec?.holders.set(newHolderId, {
				id: newHolderId,
				acquiredAt: this.clock ? this.clock() : 0,
				kind: 'swarm-claim',
			});
		}
		return { ok: true, generationId: claim.generationId, token: newToken };
	}

	gc(scope?: StateScope): number {
		let reaped = 0;
		const states = scope
			? [this.scopeStateFor(scope)].filter(Boolean)
			: Array.from(this.scopeStates.values());
		for (const s of states) {
			if (!s) continue;
			for (const [id, record] of Array.from(s.generations.entries())) {
				if (
					record.generation.status === 'draining' &&
					record.holders.size === 0
				) {
					s.generations.delete(id);
					// Mutate the generation's status to 'reaped' via a
					// double cast that erases the `readonly` modifier.
					// The gc pre-condition (draining + holders.size
					// === 0) guarantees no other reader can observe
					// the change.
					const mutable = record.generation as unknown as {
						status: GenerationStatus;
					};
					mutable.status = 'reaped';
					reaped += 1;
				}
			}
		}
		return reaped;
	}

	diagnose(): readonly StateGeneration[] {
		const out: StateGeneration[] = [];
		for (const s of this.scopeStates.values()) {
			for (const record of s.generations.values()) {
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

	// --- internals -----------------------------------------------------

	private ensureScopeState(scope: StateScope): IScopeState {
		const key = scopeStateKey(scope);
		let state = this.scopeStates.get(key);
		if (!state) {
			state = {
				generations: new Map(),
				activeId: null,
				projectHolders: new Map(),
				swarmClaims: new Map(),
				nextGenerationSerial: 0,
				nextProjectLeaseToken: 0,
				nextSwarmLeaseToken: 0,
			};
			this.scopeStates.set(key, state);
		}
		return state;
	}

	private scopeStateFor(scope: StateScope): IScopeState | undefined {
		return this.scopeStates.get(scopeStateKey(scope));
	}

	private publishInternal(
		state: IScopeState,
		input: IHydrateInput,
		projections: ReadonlyMap<string, ProjectionResult>,
		parentId: GenerationId | undefined,
	): StateGeneration {
		state.nextGenerationSerial += 1;
		state.nextProjectLeaseToken += 1;
		const serial = String(state.nextGenerationSerial).padStart(4, '0');
		this.globalSerial += 1;
		const id = `g${String(this.globalSerial).padStart(6, '0')}-${serial}`;
		const fingerprint = input.snapshot.fingerprint;
		const canonicalHash = this.compositeCanonicalHash(
			fingerprint,
			projections,
		);
		const ts = this.clock ? this.clock() : 0;
		const previousActiveId = state.activeId;
		const generation: StateGeneration = {
			id,
			...(parentId ? { parentId } : {}),
			fingerprint,
			canonicalHash,
			status: 'active',
			createdAt: ts,
			projectLeaseToken: state.nextProjectLeaseToken,
			storageIdentity: input.storageIdentity,
			holderCount: 0,
		};
		const record: GenerationRecord = {
			generation,
			projections: new Map(projections),
			holders: new Map(),
		};
		state.generations.set(id, record);
		state.activeId = id;
		if (previousActiveId) {
			const previous = state.generations.get(previousActiveId);
			if (previous) {
				const mutableGen = previous.generation as unknown as {
					status: StateGeneration['status'];
				};
				mutableGen.status = 'draining';
			}
		}
		return generation;
	}

	private compositeCanonicalHash(
		fingerprint: CanonicalProjectFingerprint,
		projections: ReadonlyMap<string, ProjectionResult>,
	): Sha256Hex {
		const merged: CanonicalJsonValue = {
			kind: 'state-generation',
			fingerprint: {
				abiVersion: fingerprint.abiVersion,
				producers: canonicalizeProducers(fingerprint.producers).map(
					(p) => {
						const base: Record<string, CanonicalJsonValue> = {
							id: p.id,
							producerVersion: p.producerVersion,
							abiVersion: p.abiVersion,
						};
						base.inputs = p.inputs.map((i) => {
							const inputBase: Record<
								string,
								CanonicalJsonValue
							> = {
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
					},
				),
			},
			projections: this.mergeProjections(projections),
		};
		return canonicalStateHash(merged);
	}

	private mergeProjections(
		projections: ReadonlyMap<string, ProjectionResult>,
	): Record<string, CanonicalProjection> {
		const out: Record<string, CanonicalProjection> = {};
		const ids = Array.from(projections.keys()).sort();
		for (const id of ids) {
			const p = projections.get(id) as ProjectionResult;
			const canonicalize =
				this.producers.get(id)?.canonicalize ?? defaultCanonicalize;
			out[id] = canonicalize(p);
		}
		return out;
	}

	private canonicalizeProjection(
		_fingerprint: CanonicalProjectFingerprint,
		projection: ProjectionResult,
	): CanonicalProjection {
		return defaultCanonicalize(projection);
	}

	/** Test-only helper to seed a producer and compute its fingerprint. */
	seedFingerprint(): CanonicalProjectFingerprint {
		const list = Array.from(this.producers.values());
		return fingerprintFromProducers(list, STATE_ABI_VERSION);
	}
}

function scopeStateKey(scope: StateScope): string {
	// Identity is the kind + every identity-relevant field of the
	// typed locator. swarm / shared-content-cache share by
	// repositoryInstanceId, NOT by workspaceRoot.
	switch (scope.kind) {
		case 'project':
			return `project|${scope.locator.workspaceRoot}|${scope.locator.worktreeId}|${scope.locator.cacheRoot}|${scope.locator.docsRoot}`;
		case 'swarm':
			return `swarm|${scope.locator.repositoryInstanceId}|${scope.locator.swarmRoot}`;
		case 'shared-content-cache':
			return `shared-content-cache|${scope.locator.repositoryInstanceId}|${scope.locator.swarmRoot}|${scope.locator.cacheNamespace}`;
		case 'worktree-cache':
			return `worktree-cache|${scope.locator.workspaceRoot}|${scope.locator.worktreeId}|${scope.locator.cacheRoot}`;
		default:
			return `unknown`;
	}
}

/** Compare two scopes by structural equality (re-export for tests). */
export { scopesEqual };

/** Factory mirroring the `defineX` style used elsewhere. */
export function defineInMemoryStateRegistry(
	options: StateRegistryOptions,
): StateRegistry {
	return new InMemoryStateRegistry(options);
}

/**
 * Helper used by tests + the host: bundle a list of resolved
 * inputs into an `IStateInputSnapshot` paired with a fingerprint
 * computed from the producers the registry knows about.
 */
export function snapshotFromResolved(
	resolved: readonly IResolvedInput[],
	registry: StateRegistry,
): import('./producer').IStateInputSnapshot {
	const fingerprint = registry.seedFingerprint();
	return buildSnapshot(resolved, fingerprint);
}

void inputKeyString;
void inputKeyOf;
void fingerprintEqual;
