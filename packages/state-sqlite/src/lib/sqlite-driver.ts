import { Database } from 'bun:sqlite';

import {
	canonicalStateHash,
	InMemoryStateRegistry,
	type CanonicalProjection,
	type GenerationFenceOutcome,
	type ICanonicalProjectFingerprint,
	type IFenceRejected,
	type IHydrateFailureReason,
	type IHydrateInput,
	type IHydrateResult,
	type IProjectLeaseHandle,
	type IProjectLeaseToken,
	type IReadResult,
	type IResolvedProducerInput,
	type ISnapshotIssue,
	type IStateChange,
	type IStateInputSnapshot,
	type IStateProducer,
	type IStateRegistry,
	type IStateRegistryOptions,
	type IStateStorageIdentity,
	type IStateStoreFailure,
	type ISwarmClaimHandle,
	type ISwarmLeaseToken,
	type StateGeneration,
	type StateScope,
	type TDriftDirection,
} from '@delendai/state';

import {
	mapSqliteError,
	stateStoreCorrupt,
	stateStoreSchemaUnsupported,
	stateStoreStale,
} from './fail-closed';
import {
	SQLITE_BOOT_PRAGMAS,
	STATE_SQLITE_SCHEMA_SQL,
	STATE_SQLITE_SCHEMA_VERSION,
} from './schema';

interface ISerializedContentEntry {
	readonly key: string;
	readonly valueBase64: string;
}

interface ISerializedResolvedEntry {
	readonly producerId: string;
	readonly resolved: readonly {
		readonly spec: IResolvedProducerInput['spec'];
		readonly digest: string;
		readonly contentBase64: string;
	}[];
}

interface ISerializedSnapshot {
	readonly fingerprint: ICanonicalProjectFingerprint;
	readonly contents: readonly ISerializedContentEntry[];
	readonly declared: IStateInputSnapshot['declared'];
	readonly byProducer: readonly ISerializedResolvedEntry[];
}

interface IPersistedGenerationRecord {
	readonly scope: StateScope;
	readonly storageIdentity: IStateStorageIdentity;
	readonly generation: StateGeneration;
	readonly projections: Readonly<Record<string, CanonicalProjection>>;
	readonly snapshot: ISerializedSnapshot;
	readonly activeId: string | undefined;
	readonly generationIds: readonly string[];
	readonly reconciledCommitSha: string | undefined;
	readonly headCommitSha: string | undefined;
	readonly drift: TDriftDirection | undefined;
	readonly forceIntegrityFailure: boolean | undefined;
	readonly lastKnownState: 'primary' | 'shadow' | 'both';
	readonly updatedAt: number;
}

interface IScopeCache {
	readonly scope: StateScope;
	storageIdentity: IStateStorageIdentity;
	snapshot: IStateInputSnapshot;
	activeId: string | undefined;
	generationIds: string[];
	generations: Map<string, IPersistedGenerationRecord>;
	headCommitSha: string | undefined;
	drift: TDriftDirection | undefined;
	forceIntegrityFailure: boolean | undefined;
}

interface IStoredRow {
	readonly scope_kind: string;
	readonly scope_locator_json: string;
	readonly snapshot_json: string;
	readonly reconciled_commit_sha: string | null;
	readonly updated_at: number;
}

export interface ISqliteStateRegistryOptions extends IStateRegistryOptions {
	readonly path: string;
	readonly lastKnownState?: 'primary' | 'shadow' | 'both';
	readonly headCommitSha?: () => string | undefined;
}

export interface IParityMismatchRecorder {
	recordParityMismatch(fingerprint: string): void;
}

export class SqliteStateRegistry
	implements IStateRegistry, IParityMismatchRecorder
{
	private readonly db: Database;
	private readonly delegate: InMemoryStateRegistry;
	private readonly producers = new Map<string, IStateProducer>();
	private readonly scopeCache = new Map<string, IScopeCache>();
	private readonly restoredScopes = new Set<string>();

	constructor(private readonly options: ISqliteStateRegistryOptions) {
		this.db = new Database(options.path, { create: true, strict: true });
		this.delegate = new InMemoryStateRegistry({ clock: options.clock });
		this.bootstrap();
	}

	defineProducer(producer: IStateProducer): IStateProducer {
		const defined = this.delegate.defineProducer(producer);
		this.producers.set(producer.id, defined);
		this.restorePersistedScopes();
		return defined;
	}

	hydrate(input: IHydrateInput): IHydrateResult {
		const failure = this.preflightStore(input.scope);
		if (failure) return failure;
		try {
			const result = this.delegate.hydrate(input);
			if (!result.ok) return result;
			this.captureGeneration(input, result.generation);
			this.persistScope(input.scope);
			return result;
		} catch (error) {
			return this.wrapStoreFailure(error);
		}
	}

	incremental(input: IHydrateInput, change: IStateChange): IHydrateResult {
		const failure = this.preflightStore(input.scope);
		if (failure) return failure;
		this.restoreScopeIfNeeded(input.scope);
		try {
			const result = this.delegate.incremental(input, change);
			if (!result.ok) return result;
			this.captureGeneration(input, result.generation);
			this.persistScope(input.scope);
			return result;
		} catch (error) {
			return this.wrapStoreFailure(error);
		}
	}

	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): IReadResult {
		this.restoreScopeIfNeeded(args.scope);
		return this.delegate.lookup(args);
	}

	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: string;
		readonly token: IProjectLeaseToken;
	}): IProjectLeaseHandle | IFenceRejected {
		this.restoreScopeIfNeeded(args.scope);
		const result = this.delegate.acquireProjectLease(args);
		this.syncScopeCache(args.scope);
		this.persistScope(args.scope);
		return result;
	}

	releaseProjectLease(args: {
		readonly scope: StateScope;
		readonly leaseId: string;
	}): void {
		this.restoreScopeIfNeeded(args.scope);
		this.delegate.releaseProjectLease(args);
		this.syncScopeCache(args.scope);
		this.persistScope(args.scope);
	}

	acquireSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
	}): ISwarmClaimHandle {
		this.restoreScopeIfNeeded(args.scope);
		const claim = this.delegate.acquireSwarmClaim(args);
		this.syncScopeCache(args.scope);
		this.persistScope(args.scope);
		return claim;
	}

	renewSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
		readonly token: ISwarmLeaseToken;
	}): GenerationFenceOutcome {
		this.restoreScopeIfNeeded(args.scope);
		const outcome = this.delegate.renewSwarmClaim(args);
		this.syncScopeCache(args.scope);
		this.persistScope(args.scope);
		return outcome;
	}

	gc(scope?: StateScope): number {
		if (scope) this.restoreScopeIfNeeded(scope);
		const reaped = this.delegate.gc(scope);
		if (scope) {
			this.syncScopeCache(scope);
			this.persistScope(scope);
			return reaped;
		}
		for (const cache of this.scopeCache.values()) {
			this.syncScopeCache(cache.scope);
			this.persistScope(cache.scope);
		}
		return reaped;
	}

	diagnose(): readonly StateGeneration[] {
		this.restorePersistedScopes();
		return this.delegate.diagnose();
	}

	seedFingerprint(
		resolved?: ReadonlyMap<string, readonly IResolvedProducerInput[]>,
	): ICanonicalProjectFingerprint {
		return this.delegate.seedFingerprint(resolved);
	}

	validateSnapshot(snapshot: IStateInputSnapshot): readonly ISnapshotIssue[] {
		return this.delegate.validateSnapshot(snapshot);
	}

	validateSnapshotIntegrity(
		snapshot: IStateInputSnapshot,
	): readonly ISnapshotIssue[] {
		return this.delegate.validateSnapshotIntegrity(snapshot);
	}

	validateSnapshotAgainstRegistry(
		snapshot: IStateInputSnapshot,
		scope?: StateScope,
	): readonly ISnapshotIssue[] {
		return this.delegate.validateSnapshotAgainstRegistry(snapshot, scope);
	}

	resetForTests(): void {
		this.delegate.resetForTests();
		this.scopeCache.clear();
		this.restoredScopes.clear();
		this.db.exec('DELETE FROM generations;');
		this.db.exec('DELETE FROM drivers;');
	}

	recordParityMismatch(fingerprint: string): void {
		this.db
			.query(
				`INSERT INTO drivers (fingerprint, last_known_state, parity_mismatches)
				 VALUES (?, ?, 1)
				 ON CONFLICT(fingerprint)
				 DO UPDATE SET
					last_known_state = excluded.last_known_state,
					parity_mismatches = drivers.parity_mismatches + 1`,
			)
			.run(fingerprint, this.options.lastKnownState ?? 'shadow');
	}

	forceIntegrityFailureForTests(scope: StateScope, enabled = true): void {
		const cache = this.scopeCache.get(scopeKey(scope));
		if (!cache) return;
		cache.forceIntegrityFailure = enabled;
		this.persistScope(scope);
	}

	setDriftForTests(
		scope: StateScope,
		args: {
			readonly drift: TDriftDirection;
			readonly headCommitSha: string;
		},
	): void {
		const cache = this.scopeCache.get(scopeKey(scope));
		if (!cache) return;
		cache.drift = args.drift;
		cache.headCommitSha = args.headCommitSha;
		this.persistScope(scope);
	}

	close(): void {
		this.db.close(false);
	}

	private bootstrap(): void {
		for (const pragma of SQLITE_BOOT_PRAGMAS) {
			this.db.exec(pragma);
		}
		for (const statement of STATE_SQLITE_SCHEMA_SQL) {
			this.db.exec(statement);
		}
	}

	private preflightStore(scope: StateScope): IHydrateResult | undefined {
		const schemaVersion = this.readUserVersion();
		if (schemaVersion > STATE_SQLITE_SCHEMA_VERSION) {
			return {
				ok: false,
				reason: 'state_store_schema_unsupported',
				storeFailure: stateStoreSchemaUnsupported(schemaVersion),
			};
		}
		const cache = this.scopeCache.get(scopeKey(scope));
		if (cache?.forceIntegrityFailure) {
			return {
				ok: false,
				reason: 'state_store_corrupt',
				storeFailure: stateStoreCorrupt('forced-failure'),
			};
		}
		const integrity = this.integrityCheck();
		if (integrity !== 'ok') {
			return {
				ok: false,
				reason: 'state_store_corrupt',
				storeFailure: stateStoreCorrupt(integrity),
			};
		}
		const stale = this.staleFailure(scope);
		if (stale) {
			return {
				ok: false,
				reason: 'state_store_stale',
				storeFailure: stale,
			};
		}
		return undefined;
	}

	private staleFailure(scope: StateScope): IStateStoreFailure | undefined {
		const cache = this.scopeCache.get(scopeKey(scope));
		const reconciledCommitSha = this.latestReconciledCommitSha(scope);
		const headCommitSha =
			cache?.headCommitSha ?? this.options.headCommitSha?.();
		const drift = cache?.drift;
		if (!reconciledCommitSha || !headCommitSha) return undefined;
		if (drift === 'equal' || reconciledCommitSha === headCommitSha) {
			return undefined;
		}
		return stateStoreStale({
			reconciledCommitSha,
			headCommitSha,
			...(drift ? { drift } : {}),
		});
	}

	private latestReconciledCommitSha(scope: StateScope): string | undefined {
		const row = this.db
			.query(
				`SELECT reconciled_commit_sha
				 FROM generations
				 WHERE scope_kind = ? AND scope_locator_json = ?
				 ORDER BY updated_at DESC, id DESC
				 LIMIT 1`,
			)
			.get(scope.kind, locatorJson(scope)) as {
			readonly reconciled_commit_sha: string | null;
		} | null;
		return row?.reconciled_commit_sha ?? undefined;
	}

	private readUserVersion(): number {
		const row = this.db.query('PRAGMA user_version;').get() as Record<
			string,
			number
		> | null;
		if (!row) return 0;
		return row.user_version ?? row.userVersion ?? 0;
	}

	private integrityCheck(): string {
		const rows = this.db
			.query('PRAGMA integrity_check;')
			.all() as ReadonlyArray<Record<string, string>>;
		const values = rows
			.map((row) => row.integrity_check ?? '')
			.filter(Boolean);
		if (values.every((value) => value === 'ok')) return 'ok';
		return values.join('\n') || 'integrity_check_failed';
	}

	private restorePersistedScopes(): void {
		const rows = this.db
			.query(
				`SELECT scope_kind, scope_locator_json, snapshot_json, reconciled_commit_sha, updated_at
				 FROM generations
				 ORDER BY updated_at ASC, id ASC`,
			)
			.all() as readonly IStoredRow[];
		for (const row of rows) {
			const scope = parseScope(row.scope_kind, row.scope_locator_json);
			if (!scope) continue;
			const parsed = JSON.parse(
				row.snapshot_json,
			) as IPersistedGenerationRecord;
			const key = scopeKey(scope);
			const cache = this.scopeCache.get(key) ?? {
				scope,
				storageIdentity: parsed.storageIdentity,
				snapshot: deserializeSnapshot(parsed.snapshot),
				activeId: parsed.activeId,
				generationIds: [...parsed.generationIds],
				generations: new Map<string, IPersistedGenerationRecord>(),
				headCommitSha: parsed.headCommitSha,
				drift: parsed.drift,
				forceIntegrityFailure: parsed.forceIntegrityFailure,
			};
			cache.storageIdentity = parsed.storageIdentity;
			cache.snapshot = deserializeSnapshot(parsed.snapshot);
			cache.activeId = parsed.activeId;
			cache.generationIds = [...parsed.generationIds];
			cache.headCommitSha = parsed.headCommitSha;
			cache.drift = parsed.drift;
			cache.forceIntegrityFailure = parsed.forceIntegrityFailure;
			cache.generations.set(parsed.generation.id, {
				...parsed,
				reconciledCommitSha:
					row.reconciled_commit_sha ?? parsed.reconciledCommitSha,
				updatedAt: row.updated_at,
			});
			this.scopeCache.set(key, cache);
		}
		for (const cache of this.scopeCache.values()) {
			this.restoreScopeIfNeeded(cache.scope);
		}
	}

	private restoreScopeIfNeeded(scope: StateScope): void {
		const key = scopeKey(scope);
		if (this.restoredScopes.has(key)) return;
		const cache = this.scopeCache.get(key);
		if (!cache || !cache.activeId) {
			this.restoredScopes.add(key);
			return;
		}
		const active = cache.generations.get(cache.activeId);
		if (!active) {
			this.restoredScopes.add(key);
			return;
		}
		const snapshot = deserializeSnapshot(active.snapshot);
		if (this.delegate.validateSnapshot(snapshot).length > 0) return;
		const restored = this.delegate.hydrate({
			scope,
			storageIdentity: active.storageIdentity,
			snapshot,
		});
		if (restored.ok) this.restoredScopes.add(key);
	}

	private captureGeneration(
		input: IHydrateInput,
		generation: StateGeneration,
	): void {
		const key = scopeKey(input.scope);
		const cache = this.scopeCache.get(key) ?? {
			scope: input.scope,
			storageIdentity: input.storageIdentity,
			snapshot: input.snapshot,
			activeId: undefined,
			generationIds: [],
			generations: new Map<string, IPersistedGenerationRecord>(),
			headCommitSha: this.options.headCommitSha?.(),
			drift: undefined,
			forceIntegrityFailure: undefined,
		};
		const previousActiveId = cache.activeId;
		cache.storageIdentity = input.storageIdentity;
		cache.snapshot = input.snapshot;
		cache.activeId = generation.id;
		cache.headCommitSha = this.options.headCommitSha?.();
		if (!cache.generationIds.includes(generation.id)) {
			cache.generationIds.push(generation.id);
		}
		if (previousActiveId && previousActiveId !== generation.id) {
			const previous = cache.generations.get(previousActiveId);
			if (previous) {
				cache.generations.set(previousActiveId, {
					...previous,
					generation: { ...previous.generation, status: 'draining' },
					activeId: generation.id,
					generationIds: [...cache.generationIds],
					updatedAt: generation.createdAt,
				});
			}
		}
		cache.generations.set(generation.id, {
			scope: input.scope,
			storageIdentity: input.storageIdentity,
			generation,
			projections: this.captureActiveProjections(input.scope),
			snapshot: serializeSnapshot(input.snapshot),
			activeId: generation.id,
			generationIds: [...cache.generationIds],
			reconciledCommitSha: cache.headCommitSha,
			headCommitSha: cache.headCommitSha,
			drift: cache.drift,
			forceIntegrityFailure: cache.forceIntegrityFailure,
			lastKnownState: this.options.lastKnownState ?? 'shadow',
			updatedAt: generation.createdAt,
		});
		this.scopeCache.set(key, cache);
		this.restoredScopes.add(key);
	}

	private captureActiveProjections(
		scope: StateScope,
	): Record<string, CanonicalProjection> {
		const projections: Record<string, CanonicalProjection> = {};
		for (const [producerId, producer] of this.producers.entries()) {
			if (!producer.serves.includes(scope.kind)) continue;
			const read = this.delegate.lookup({ scope, producerId });
			if (read.ok) projections[producerId] = read.projection;
		}
		return projections;
	}

	private syncScopeCache(scope: StateScope): void {
		const cache = this.scopeCache.get(scopeKey(scope));
		if (!cache) return;
		const diagnosed = new Map(
			this.delegate
				.diagnose()
				.filter((generation: StateGeneration) =>
					cache.generationIds.includes(generation.id),
				)
				.map(
					(generation: StateGeneration) =>
						[generation.id, generation] as const,
				),
		);
		for (const generationId of cache.generationIds) {
			const stored = cache.generations.get(generationId);
			if (!stored) continue;
			const current = diagnosed.get(generationId);
			cache.generations.set(generationId, {
				...stored,
				generation: current
					? current
					: {
							...stored.generation,
							status: 'reaped',
							holderCount: 0,
						},
				projections:
					generationId === cache.activeId
						? this.captureActiveProjections(scope)
						: stored.projections,
				activeId: cache.activeId,
				generationIds: [...cache.generationIds],
				headCommitSha: cache.headCommitSha,
				drift: cache.drift,
				forceIntegrityFailure: cache.forceIntegrityFailure,
				updatedAt: this.options.clock(),
			});
		}
	}

	private persistScope(scope: StateScope): void {
		const cache = this.scopeCache.get(scopeKey(scope));
		if (!cache) return;
		const now = this.options.clock();
		const records = cache.generationIds
			.map((generationId) => cache.generations.get(generationId))
			.filter(
				(record): record is IPersistedGenerationRecord =>
					record !== undefined,
			)
			.map((record) => ({
				...record,
				activeId: cache.activeId,
				generationIds: [...cache.generationIds],
				headCommitSha: cache.headCommitSha,
				drift: cache.drift,
				forceIntegrityFailure: cache.forceIntegrityFailure,
				updatedAt: now,
			}));
		const write = this.db.transaction(
			(rows: readonly IPersistedGenerationRecord[]) => {
				this.db
					.query(
						'DELETE FROM generations WHERE scope_kind = ? AND scope_locator_json = ?',
					)
					.run(scope.kind, locatorJson(scope));
				for (const row of rows) {
					const fingerprint = fingerprintKey(
						scope,
						row.generation.fingerprint,
					);
					this.db
						.query(
							`INSERT INTO generations (
							scope_kind,
							scope_locator_json,
							snapshot_json,
							fingerprint,
							reconciled_commit_sha,
							schema_version,
							created_at,
							updated_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						)
						.run(
							scope.kind,
							locatorJson(scope),
							JSON.stringify(row),
							fingerprint,
							row.reconciledCommitSha ?? null,
							STATE_SQLITE_SCHEMA_VERSION,
							row.generation.createdAt,
							now,
						);
					this.db
						.query(
							`INSERT INTO drivers (fingerprint, last_known_state, parity_mismatches)
						 VALUES (?, ?, 0)
						 ON CONFLICT(fingerprint)
						 DO UPDATE SET last_known_state = excluded.last_known_state`,
						)
						.run(
							fingerprint,
							this.options.lastKnownState ?? 'shadow',
						);
				}
			},
		);
		try {
			write(records);
		} catch (error) {
			throw mapSqliteError(error);
		}
	}

	private wrapStoreFailure(error: unknown): IHydrateResult {
		const storeFailure = mapSqliteError(error);
		const detail = storeFailure.pragma ?? storeFailure.code;
		return {
			ok: false,
			reason: hydrateReasonFromStoreFailure(storeFailure),
			storeFailure,
			...(detail ? { detail } : {}),
		};
	}
}

export function defineSqliteStateRegistry(
	options: ISqliteStateRegistryOptions,
): IStateRegistry {
	return new SqliteStateRegistry(options);
}

export function canonicalRegistryStateHash(registry: IStateRegistry): string {
	const generations = registry
		.diagnose()
		.map((generation: StateGeneration) => ({
			id: generation.id,
			...(generation.parentId ? { parentId: generation.parentId } : {}),
			canonicalHash: generation.canonicalHash,
			status: generation.status,
			projectLeaseToken: generation.projectLeaseToken,
			holderCount: generation.holderCount,
			storageIdentityJson: JSON.stringify(generation.storageIdentity),
			fingerprintJson: JSON.stringify(generation.fingerprint),
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
	return canonicalStateHash({ kind: 'registry-state', generations });
}

function hydrateReasonFromStoreFailure(
	storeFailure: IStateStoreFailure,
): IHydrateFailureReason {
	if (storeFailure.supportedSchemaRange)
		return 'state_store_schema_unsupported';
	if (storeFailure.drift) return 'state_store_stale';
	if (storeFailure.pragma) return 'state_store_corrupt';
	return 'state_store_unavailable';
}

function scopeKey(scope: StateScope): string {
	return `${scope.kind}|${locatorJson(scope)}`;
}

function locatorJson(scope: StateScope): string {
	return JSON.stringify(scope.locator);
}

function parseScope(kind: string, locator: string): StateScope | undefined {
	try {
		const parsed = JSON.parse(locator);
		switch (kind) {
			case 'project':
				return {
					kind: 'project',
					locator: parsed as Extract<
						StateScope,
						{ kind: 'project' }
					>['locator'],
				};
			case 'swarm':
				return {
					kind: 'swarm',
					locator: parsed as Extract<
						StateScope,
						{ kind: 'swarm' }
					>['locator'],
				};
			case 'shared-content-cache':
				return {
					kind: 'shared-content-cache',
					locator: parsed as Extract<
						StateScope,
						{ kind: 'shared-content-cache' }
					>['locator'],
				};
			case 'worktree-cache':
				return {
					kind: 'worktree-cache',
					locator: parsed as Extract<
						StateScope,
						{ kind: 'worktree-cache' }
					>['locator'],
				};
			default:
				return undefined;
		}
	} catch {
		return undefined;
	}
}

function serializeSnapshot(snapshot: IStateInputSnapshot): ISerializedSnapshot {
	return {
		fingerprint: snapshot.fingerprint,
		contents: Array.from(snapshot.contents.entries()).map(
			([key, value]: [string, string | Uint8Array]) => ({
				key,
				valueBase64: bytesToBase64(value),
			}),
		),
		declared: [...snapshot.declared],
		byProducer: Array.from(snapshot.byProducer?.entries() ?? []).map(
			([producerId, resolved]: [
				string,
				readonly IResolvedProducerInput[],
			]) => ({
				producerId,
				resolved: resolved.map((entry: IResolvedProducerInput) => ({
					spec: entry.spec,
					digest: entry.digest,
					contentBase64: bytesToBase64(entry.content),
				})),
			}),
		),
	};
}

function deserializeSnapshot(
	snapshot: ISerializedSnapshot,
): IStateInputSnapshot {
	return {
		fingerprint: snapshot.fingerprint,
		contents: new Map(
			snapshot.contents.map((entry) => [
				entry.key,
				base64ToBytes(entry.valueBase64),
			]),
		),
		declared: [...snapshot.declared],
		byProducer: new Map(
			snapshot.byProducer.map((bucket) => [
				bucket.producerId,
				bucket.resolved.map((entry) => ({
					spec: entry.spec,
					digest: entry.digest as IResolvedProducerInput['digest'],
					content: base64ToBytes(entry.contentBase64),
				})),
			]),
		),
	};
}

function fingerprintKey(
	scope: StateScope,
	fingerprint: ICanonicalProjectFingerprint,
): string {
	return `${scopeKey(scope)}|${JSON.stringify(fingerprint)}`;
}

function bytesToBase64(value: string | Uint8Array): string {
	if (typeof value === 'string') {
		return Buffer.from(value, 'utf8').toString('base64');
	}
	return Buffer.from(value).toString('base64');
}

function base64ToBytes(value: string): Uint8Array {
	return Uint8Array.from(Buffer.from(value, 'base64'));
}
