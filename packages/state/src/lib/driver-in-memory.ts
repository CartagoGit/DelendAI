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
 *     `ctx.resolved`; the driver never reads `fs`.
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
import { canonicalStateHash, sha256BytesHex, sha256Hex } from './hash';
import type { ICanonicalProjectFingerprint } from './fingerprint';
import {
	STATE_ABI_VERSION,
	canonicalizeProducers,
	fingerprintEqual,
} from './fingerprint';
import type {
	GenerationFenceOutcome,
	IHydrateResult,
	IProjectLeaseToken,
	StateGeneration,
	ISwarmLeaseToken,
} from './generation';
import type {
	IResolvedInput,
	IResolvedProducerInput,
	IStateChange,
	IStateProducer,
	IProjectionResult,
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
	IProjectLeaseHandle,
	IReadResult,
	ISnapshotIssue,
	IStateClock,
	IStateRegistry,
	IStateRegistryOptions,
	ISwarmClaimHandle,
} from './registry';
import type { StateScope } from './scope';
import { scopesEqual } from './scope';
import type { IGenerationId, IGenerationStatus } from './generation';

interface IScopeState {
	generations: Map<IGenerationId, GenerationRecord>;
	activeId: IGenerationId | null;
	projectHolders: Map<string, IRegistryHolder>;
	swarmClaims: Map<string, SwarmClaimRecord>;
	nextGenerationSerial: number;
	nextProjectLeaseToken: number;
	nextProjectLeaseSerial: number;
	nextSwarmLeaseToken: number;
}

interface GenerationRecord {
	readonly generation: StateGeneration;
	readonly projections: ReadonlyMap<string, IProjectionResult>;
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
	readonly token: ISwarmLeaseToken;
	readonly holderId: string;
	readonly generationId: IGenerationId;
}

export class InMemoryStateRegistry implements IStateRegistry {
	private readonly producers = new Map<string, IStateProducer>();
	private readonly scopeStates = new Map<string, IScopeState>();
	private readonly clock: IStateClock;
	private globalSerial = 0;

	constructor(options: IStateRegistryOptions) {
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

	hydrate(input: IHydrateInput): IHydrateResult {
		const state = this.ensureScopeState(input.scope);
		const snapshot = this.materialiseSnapshot(input.snapshot);
		const issues = [
			...this.validateSnapshotIntegrity(snapshot),
			...this.validateSnapshotAgainstRegistry(snapshot, input.scope),
		];
		if (issues.length > 0) {
			return {
				ok: false,
				reason: 'snapshot_invalid',
				detail: issues
					.map(
						(i) =>
							`${i.kind}${i.producerId ? `(${i.producerId})` : ''}${i.key ? `[${i.key}]` : ''}${i.detail ? `: ${i.detail}` : ''}`,
					)
					.join('; '),
			};
		}
		const projections = new Map<string, IProjectionResult>();
		for (const producer of this.producers.values()) {
			if (!producer.serves.includes(input.scope.kind)) continue;
			const resolved = this.resolveInputsFor(snapshot, producer.id);
			let result: IProjectionResult;
			try {
				result = producer.rebuild({
					scope: input.scope,
					fingerprint: snapshot.fingerprint,
					resolved,
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
		const gen = this.publishInternal(
			state,
			input,
			snapshot,
			projections,
			undefined,
		);
		return { ok: true, generation: gen };
	}

	incremental(input: IHydrateInput, change: IStateChange): IHydrateResult {
		const state = this.ensureScopeState(input.scope);
		const snapshot = this.materialiseSnapshot(input.snapshot);
		const issues = [
			...this.validateSnapshotIntegrity(snapshot),
			...this.validateSnapshotAgainstRegistry(snapshot, input.scope),
		];
		if (issues.length > 0) {
			return {
				ok: false,
				reason: 'snapshot_invalid',
				detail: issues
					.map(
						(i) =>
							`${i.kind}${i.producerId ? `(${i.producerId})` : ''}${i.key ? `[${i.key}]` : ''}${i.detail ? `: ${i.detail}` : ''}`,
					)
					.join('; '),
			};
		}
		const active = state.activeId
			? state.generations.get(state.activeId)
			: undefined;
		if (!active) {
			return this.hydrate(input);
		}
		const projections = new Map<string, IProjectionResult>();
		for (const producer of this.producers.values()) {
			if (!producer.serves.includes(input.scope.kind)) continue;
			const base = active.projections.get(producer.id);
			const resolved = this.resolveInputsFor(snapshot, producer.id);
			let result: IProjectionResult;
			try {
				result = producer.reconcile(
					{
						scope: input.scope,
						fingerprint: snapshot.fingerprint,
						resolved,
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
			snapshot,
			projections,
			active.generation.id,
		);
		return { ok: true, generation: gen };
	}

	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): IReadResult {
		const state = this.scopeStateFor(args.scope);
		if (!state?.activeId) {
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
		readonly generationId: IGenerationId;
		readonly token: IProjectLeaseToken;
	}): IProjectLeaseHandle | import('./generation').IFenceRejected {
		const state = this.scopeStateFor(args.scope);
		if (!state?.activeId) {
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
		// Phase 0.2 (x00502 S4): the leaseId derives from a
		// monotonic per-scope serial — NOT from
		// `${kind}:${gen}:${token}`. Two agents that capture the
		// same (generationId, token) obtain DIFFERENT lease ids
		// and count as two independent holders; releasing one
		// never removes the other.
		state.nextProjectLeaseSerial += 1;
		const leaseId = `p${String(state.nextProjectLeaseSerial).padStart(6, '0')}`;
		const holder: IRegistryHolder = {
			id: leaseId,
			acquiredAt: this.clock ? this.clock() : 0,
			kind: 'project-lease',
		};
		state.projectHolders.set(leaseId, holder);
		record.holders.set(leaseId, holder);
		const registry = this;
		return {
			generationId: args.generationId,
			token: args.token,
			leaseId,
			release(): void {
				registry.releaseProjectLease({
					scope: args.scope,
					leaseId,
				});
			},
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
	}): ISwarmClaimHandle {
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
		// Phase 0.2: the handle keeps the ORIGINAL `token` for
		// backward-compat; a mutable internal `state.currentToken`
		// tracks what the registry holds after `renew()`. `release()`
		// uses `currentToken` so it matches the registry's current
		// state, even after renewals.
		const handleState: {
			currentToken: ISwarmLeaseToken;
		} = { currentToken: token };
		const handle: ISwarmClaimHandle = {
			slot: args.slot,
			token,
			get currentToken(): ISwarmLeaseToken {
				return handleState.currentToken;
			},
			renew(): ISwarmLeaseToken {
				const renewed = registry.renewSwarmClaim({
					scope: args.scope,
					slot: args.slot,
					token: handleState.currentToken,
				});
				if (!renewed.ok) {
					throw new Error(
						`[state] swarm claim renewal failed: ${renewed.reason}`,
					);
				}
				handleState.currentToken = renewed.token as ISwarmLeaseToken;
				return handleState.currentToken;
			},
			release(): void {
				const s = registry.scopeStateFor(args.scope);
				if (!s) return;
				const claim = s.swarmClaims.get(args.slot);
				if (claim && claim.token === handleState.currentToken) {
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
		readonly token: ISwarmLeaseToken;
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

	validateSnapshot(
		snapshot: import('./producer').IStateInputSnapshot,
	): readonly ISnapshotIssue[] {
		return [
			...this.validateSnapshotIntegrity(snapshot),
			...this.validateSnapshotAgainstRegistry(snapshot),
		];
	}

	/**
	 * Phase 0.2 (x00502 S3): integrity half — the snapshot is
	 * self-consistent. Digest ↔ contents, no duplicates, no
	 * orphan contents, byProducer coherent with declared specs.
	 */
	validateSnapshotIntegrity(
		snapshot: import('./producer').IStateInputSnapshot,
	): readonly ISnapshotIssue[] {
		const issues: ISnapshotIssue[] = [];
		const producers = Array.from(this.producers.values());
		const byProducer =
			snapshot.byProducer ??
			new Map<string, readonly IResolvedProducerInput[]>();
		// 1. Producers that DO declare inputs MUST have a
		//    corresponding byProducer bucket with at least one
		//    entry. Empty-declared producers (`inputs.length ===
		//    0`) skip this check, matching Phase 0.1 semantics.
		for (const p of producers) {
			const bucket = byProducer.get(p.id);
			const declared = p.inputs.length;
			if (declared === 0) continue;
			if (!bucket || bucket.length === 0) {
				issues.push({
					kind: 'producer_missing_inputs',
					producerId: p.id,
					detail: `declared ${String(declared)} inputs but none resolved`,
				});
			}
		}
		// 2. byProducer entries correspond to declared inputs.
		const declaredKeys = new Set<string>();
		for (const p of producers) {
			for (const inp of p.inputs) {
				declaredKeys.add(inputKeyString(inputKeyOf(inp)));
			}
		}
		const seenKeys = new Set<string>();
		for (const [producerId, list] of byProducer.entries()) {
			if (producerId === '__unscoped__') continue; // backward-compat bucket
			for (const entry of list) {
				const key = inputKeyString(inputKeyOf(entry.spec));
				if (seenKeys.has(key)) {
					issues.push({
						kind: 'duplicate_input',
						producerId,
						key,
						detail: 'input appears in byProducer more than once',
					});
				}
				seenKeys.add(key);
				if (!snapshot.contents.has(key)) {
					issues.push({
						kind: 'producer_orphan_inputs',
						producerId,
						key,
						detail: 'declared in byProducer but no content',
					});
				}
				if (!declaredKeys.has(key)) {
					issues.push({
						kind: 'producer_orphan_inputs',
						producerId,
						key,
						detail: 'in byProducer but no producer declared it',
					});
				}
				// Phase 0.3 (x00504 S2 / reviewer): a host cannot
				// claim "this content is at digest D" while
				// supplying bytes that hash to a different D.
				// The driver MUST reject the snapshot — otherwise
				// two hosts storing completely different bytes
				// could ship snapshots with the same fingerprint
				// and the cache would treat them as identical.
				// Bytes are canonicalised through sha256BytesHex
				// (raw bytes, no TextDecoder) so the equality
				// holds for binary content too.
				const claimed = entry.digest;
				if (claimed === ('' as Sha256Hex)) continue; // host declined to pre-compute
				const expected = this.digestOf(key, entry.content);
				if (claimed !== expected) {
					issues.push({
						kind: 'digest_mismatch',
						producerId,
						key,
						detail: `digest claimed ${String(claimed)} but sha256(content) === ${String(expected)}`,
					});
				}
			}
		}
		// 3. contents may carry inputs declared by any producer OR
		//    undeclared ones (backward-compat bucket). The
		//    `__unscoped__` bucket's entries use the RAW content
		//    key (no `kind|` prefix), so we cross-check keys
		//    directly.
		const unscopedKeys = new Set<string>();
		for (const entry of byProducer.get('__unscoped__') ?? []) {
			unscopedKeys.add(entry.spec.locator);
		}
		for (const key of snapshot.contents.keys()) {
			if (declaredKeys.has(key)) continue;
			if (unscopedKeys.has(key)) continue;
			issues.push({
				kind: 'orphan_contents',
				key,
				detail: 'in contents but no producer declared it',
			});
		}
		// 4. Internal consistency of the snapshot's fingerprint:
		//    every entry the fingerprint mentions (by producerId +
		//    input key) MUST be present in `contents`.
		const fpKeys = new Set<string>();
		for (const p of snapshot.fingerprint.producers) {
			for (const inp of p.inputs) {
				fpKeys.add(inputKeyString(inputKeyOf(inp)));
			}
		}
		for (const key of fpKeys) {
			if (!snapshot.contents.has(key)) {
				issues.push({
					kind: 'fingerprint_mismatch',
					key,
					detail: 'snapshot.fingerprint references input but no content',
				});
			}
		}
		return issues;
	}

	/**
	 * Phase 0.2 (x00502 S3): registry half — the snapshot's
	 * fingerprint must match what the registry computes from its
	 * registered producers + the snapshot's OWN resolved inputs.
	 * This closes the contract/behaviour divergence the external
	 * review flagged: the `IStateRegistry` contract documented
	 * this comparison; the Phase 0.1 driver skipped it.
	 *
	 * The comparison is scope-relevant: only producers that
	 * SERVE the snapshot's scope participate. A snapshot that
	 * legitimately carries producers the registry does not serve
	 * (cross-scope re-use) is compared only on the intersection.
	 */
	validateSnapshotAgainstRegistry(
		snapshot: import('./producer').IStateInputSnapshot,
		scope?: StateScope,
	): readonly ISnapshotIssue[] {
		const issues: ISnapshotIssue[] = [];
		const resolvedByProducer =
			snapshot.byProducer ??
			new Map<string, readonly IResolvedProducerInput[]>();
		const relevant = Array.from(this.producers.values()).filter(
			(p) => scope === undefined || p.serves.includes(scope.kind),
		);
		const expected = fingerprintFromProducers(
			relevant,
			STATE_ABI_VERSION,
			resolvedByProducer,
		);
		// Phase 0.3 (x00504 S5 / reviewer): decision is (A)
		// snapshot-is-scope-local. Cross-scope producers in
		// `actual` are stripped BEFORE the equality comparison so
		// they don't pollute the mismatch report. The pre-fix code
		// compared whole fingerprints and emitted false
		// "snapshot fingerprint mentions a producer the registry
		// does not serve" issues for every scope-irrelevant
		// producer a host packed in for re-use.
		const relevantIds = new Set(relevant.map((p) => p.id));
		const actualFingerprint = scope === undefined
			? snapshot.fingerprint
			: {
					...snapshot.fingerprint,
					producers: snapshot.fingerprint.producers.filter((p) =>
						relevantIds.has(p.id),
					),
				};
		const actual = actualFingerprint;
		if (!fingerprintEqual(expected, actual)) {
			// Identify the divergence precisely for diagnostics.
			const expectedProducers = new Map(
				expected.producers.map((p) => [p.id, p] as const),
			);
			const actualProducers = new Map(
				actual.producers.map((p) => [p.id, p] as const),
			);
			for (const [id, entry] of expectedProducers) {
				const act = actualProducers.get(id);
				if (act === undefined) {
					issues.push({
						kind: 'fingerprint_mismatch',
						producerId: id,
						detail: 'registry expects this producer in the fingerprint but it is absent',
					});
				} else if (
					entry.producerVersion !== act.producerVersion ||
					entry.abiVersion !== act.abiVersion ||
					entry.inputs.length !== act.inputs.length
				) {
					issues.push({
						kind: 'fingerprint_mismatch',
						producerId: id,
						detail: `fingerprint entry diverges (registry v${String(entry.producerVersion)}/${String(entry.inputs.length)} inputs vs snapshot v${String(act.producerVersion)}/${String(act.inputs.length)})`,
					});
				}
			}
			for (const id of actualProducers.keys()) {
				if (!expectedProducers.has(id)) {
					issues.push({
						kind: 'fingerprint_mismatch',
						producerId: id,
						detail: 'snapshot fingerprint mentions a producer the registry does not serve',
					});
				}
			}
		}
		return issues;
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
						status: IGenerationStatus;
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
				// Phase 0.2: holderCount is derived from
				// `record.holders.size`. We return a projection
				// rather than mutate the readonly field.
				const derived = record.holders.size;
				if (record.generation.holderCount !== derived) {
					out.push({
						...record.generation,
						holderCount: derived,
					});
				} else {
					out.push(record.generation);
				}
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

	/**
	 * Phase 0.2 (x00502 S1): resolve the inputs a producer may
	 * see. Reads `byProducer` (already materialised by
	 * `materialiseSnapshot`) and returns ONLY the producer's
	 * slice — spec + digest + content, already joined. A producer
	 * never receives the global snapshot, so cross-producer input
	 * visibility is closed at the type level, not by convention.
	 */
	private resolveInputsFor(
		snapshot: import('./producer').IStateInputSnapshot,
		producerId: string,
	): import('./producer').IResolvedProducerInput[] {
		return [...(snapshot.byProducer?.get(producerId) ?? [])];
	}

	private materialiseSnapshot(
		input: import('./producer').IStateInputSnapshot,
	): import('./producer').IStateInputSnapshot {
		if (input.byProducer && input.byProducer.size > 0) return input;
		// Backward-compat: if `byProducer` is absent, the driver
		// synthesises one by matching declared inputs against
		// producers that declare them, joining each with its
		// content + digest. Anything left over lands in the
		// `__unscoped__` bucket; `validateSnapshot` treats that
		// bucket as "host accepts responsibility".
		const out = new Map<string, IResolvedProducerInput[]>();
		const producers = Array.from(this.producers.values());
		const claimed = new Set<string>();
		for (const p of producers) {
			const declaredKeys = new Set(
				p.inputs.map((i) => inputKeyString(inputKeyOf(i))),
			);
			const bucket: IResolvedProducerInput[] = [];
			for (const spec of input.declared) {
				const key = inputKeyString(inputKeyOf(spec));
				const content = input.contents.get(key);
				if (content === undefined) continue;
				if (declaredKeys.has(key) && !claimed.has(key)) {
					const digest = this.digestOf(key, content);
					bucket.push({ spec, digest, content });
					claimed.add(key);
				}
			}
			if (bucket.length > 0) out.set(p.id, bucket);
		}
		const unclaimed: IResolvedProducerInput[] = [];
		for (const [key, content] of input.contents.entries()) {
			if (claimed.has(key)) continue;
			unclaimed.push({
				spec: { kind: 'opaque', locator: key },
				digest: this.digestOf(key, content),
				content,
			});
		}
		if (unclaimed.length > 0) out.set('__unscoped__', unclaimed);
		return { ...input, byProducer: out };
	}

	/**
	 * Phase 0.2 (x00502 S2): derive the digest of a content
	 * entry. Hosts that pre-computed digests pass them via
	 * `byProducer`; this fallback hashes the bytes so the
	 * synthesised buckets stay honest. Uses the canonical
	 * sha256 over the content bytes.
	 */
	private digestOf(key: string, content: string | Uint8Array): Sha256Hex {
		void key;
		// Phase 0.3 (x00504 / reviewer): the digest MUST be the
		// sha256 of the actual content bytes — byte for byte, not
		// via TextDecoder replacement. Bytes-as-UTF-8 with
		// `fatal: false` substitutes replacement characters for
		// invalid sequences, which would let two hosts that
		// disagree on the same opaque content (binary blobs, git
		// objects, anything that is not pure UTF-8) produce the
		// same digest. For string content we hash the UTF-8
		// encoding; for bytes we hash the raw bytes. The `key`
		// parameter is preserved in the signature for a future
		// variant that wants to mix it intentionally.
		if (typeof content === 'string') {
			return sha256Hex(content);
		}
		return sha256BytesHex(content);
	}

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
				nextProjectLeaseSerial: 0,
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
		snapshot: import('./producer').IStateInputSnapshot,
		projections: ReadonlyMap<string, IProjectionResult>,
		parentId: IGenerationId | undefined,
	): StateGeneration {
		state.nextGenerationSerial += 1;
		state.nextProjectLeaseToken += 1;
		const serial = String(state.nextGenerationSerial).padStart(4, '0');
		this.globalSerial += 1;
		const id = `g${String(this.globalSerial).padStart(6, '0')}-${serial}`;
		const fingerprint = snapshot.fingerprint;
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
			_holderCountSource: 'derived',
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
		fingerprint: ICanonicalProjectFingerprint,
		projections: ReadonlyMap<string, IProjectionResult>,
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
		_fingerprint: ICanonicalProjectFingerprint,
		projection: IProjectionResult,
	): CanonicalProjection {
		return defaultCanonicalize(projection);
	}

	/**
	 * Phase 0.2 (x00502 S2) + Phase 0.3 (x00504 S4): compute the
	 * canonical fingerprint from the registered producers +
	 * optionally the host's RESOLVED inputs. This is the source
	 * `validateSnapshotAgainstRegistry` compares against and the
	 * form `hydrate` publishes. Optional argument so callers can
	 * pre-compute the empty-resolved fingerprint cheaply
	 * (matches the previous `seedFingerprint()` shape).
	 */
	seedFingerprint(
		resolved?: ReadonlyMap<
			string,
			readonly IResolvedProducerInput[]
		>,
	): ICanonicalProjectFingerprint {
		const list = Array.from(this.producers.values());
		return fingerprintFromProducers(
			list,
			STATE_ABI_VERSION,
			resolved ?? new Map(),
		);
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
	options: IStateRegistryOptions,
): IStateRegistry {
	return new InMemoryStateRegistry(options);
}

/**
 * Helper used by tests + the host: bundle a list of resolved
 * inputs into an `IStateInputSnapshot` paired with a fingerprint
 * derived from the RESOLVED inputs (x00502 S2 — the fingerprint
 * follows the resolved digests, never a frozen registration-time
 * digest).
 */
export function snapshotFromResolved(
	resolved: readonly IResolvedInput[],
	registry: IStateRegistry,
): import('./producer').IStateInputSnapshot {
	const snapshot = buildSnapshot(resolved, {
		abiVersion: STATE_ABI_VERSION,
		producers: [],
	});
	// Phase 0.3 (x00504 S4 / reviewer): was previously
	// `if (registry instanceof InMemoryStateRegistry) { ... }`,
	// which hard-coded a dependency on the in-memory driver and
	// would silently fall back to `registry.seedFingerprint()`
	// (no resolved digests) for every other driver. SQLite /
	// future drivers now produce fingerprints via the same
	// surface, so this helper is driver-neutral.
	return {
		...snapshot,
		fingerprint: registry.seedFingerprint(snapshot.byProducer),
	};
}

void inputKeyString;
void inputKeyOf;
void fingerprintEqual;
