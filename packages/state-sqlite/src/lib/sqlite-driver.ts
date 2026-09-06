import { Database } from 'bun:sqlite';

import { canonicalStateHash } from '@delendai/state/hash';
import type {
	IStateStoreFailure,
	IHydrateResult,
	StateGeneration,
	TDriftDirection,
	IProjectLeaseToken,
	ISwarmLeaseToken,
	GenerationFenceOutcome,
} from '@delendai/state/generation';
import { InMemoryStateRegistry } from '@delendai/state/driver-in-memory';
import type {
	IHydrateInput,
	IProjectLeaseHandle,
	IReadResult,
	ISnapshotIssue,
	IStateRegistry,
	IStateRegistryOptions,
	ISwarmClaimHandle,
} from '@delendai/state/registry';
import type {
	IResolvedProducerInput,
	IStateChange,
	IStateInputSnapshot,
	IStateProducer,
	IProjectionResult,
} from '@delendai/state/producer';
import type {
	ICanonicalProjectFingerprint,
	IStateStorageIdentity,
} from '@delendai/state/fingerprint';
import type { CanonicalProjection } from '@delendai/state/hash';
import type { StateScope } from '@delendai/state/scope';

import {
	mapSqliteError,
	stateStoreCorrupt,
	stateStoreSchemaUnsupported,
	stateStoreStale,
	stateStoreUnavailable,
	type ISqliteErrorSnapshot,
} from './fail-closed';
import {
	SQLITE_BOOT_PRAGMAS,
	STATE_SQLITE_SCHEMA_SQL,
	STATE_SQLITE_SCHEMA_VERSION,
} from './schema';

interface IPersistedContentEntry {
	readonly key: string;
	readonly valueBase64: string;
}

interface IPersistedResolvedEntry {
	readonly producerId: string;
	readonly resolved: readonly {
		readonly spec: IResolvedProducerInput['spec'];
		readonly digest: string;
		readonly contentBase64: string;
	}[];
}

interface IPersistedGenerationRecord {
	readonly generation: StateGeneration;
	readonly projections: Readonly<Record<string, CanonicalProjection>>;
	readonly snapshot: IPersistedSnapshot;
	readonly reconciledCommitSha?: string;
	readonly lastKnownState: 'primary' | 'shadow' | 'both';
	readonly updatedAt: number;
}

interface IPersistedSnapshot {
	readonly fingerprint: ICanonicalProjectFingerprint;
	readonly contents: readonly IPersistedContentEntry[];
	readonly declared: readonly IStateInputSnapshot['declared'];
	readonly byProducer: readonly IPersistedResolvedEntry[];
	readonly storageIdentity: IStateStorageIdentity;
	readonly scope: StateScope;
	readonly activeId?: string;
	readonly generationIds: readonly string[];
	readonly generations: readonly IPersistedGenerationRecord[];
	readonly projectorIds: readonly string[];
	readonly drift?: TDriftDirection;
	readonly headCommitSha?: string;
	readonly lastHydrateChange?: IStateChange;
	readonly forceIntegrityFailure?: boolean;
}

interface IScopeCache {
	readonly scope: StateScope;
	snapshot: IStateInputSnapshot;
	storageIdentity: IStateStorageIdentity;
	activeId?: string;
	generationIds: string[];
	generations: Map<string, IPersistedGenerationRecord>;
	projectorIds: string[];
	lastHydrateChange?: IStateChange;
	drift?: TDriftDirection;
	headCommitSha?: string;
	forceIntegrityFailure?: boolean;
}

interface IStoredRow {
	readonly scope_kind: string;
	readonly scope_locator_json: string;
	readonly snapshot_json: string;
	readonly fingerprint: string;
	readonly reconciled_commit_sha: string | null;
	readonly schema_version: number;
	readonly created_at: number;
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
	private readonly options: ISqliteStateRegistryOptions;

	constructor(options: ISqliteStateRegistryOptions) {
		this.options = options;
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
		if (failure) {
			return failure;
		}
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
		if (failure) {
			return failure;
		}
		this.restoreScopeIfNeeded(input.scope);
		try {
			const result = this.delegate.incremental(input, change);
			if (!result.ok) return result;
			this.captureGeneration(input, result.generation, change);
			this.persistScope(input.scope);
			return result;
		} catch (error) {
			return this.wrapStoreFailure(error);
		}
	}

	lookup(args: { readonly scope: StateScope; readonly producerId: string }): IReadResult {
		this.restoreScopeIfNeeded(args.scope);
		return this.delegate.lookup(args);
	}

	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: string;
		readonly token: IProjectLeaseToken;
	}): IProjectLeaseHandle | import('@delendai/state/generation').IFenceRejected {
		this.restoreScopeIfNeeded(args.scope);
		const result = this.delegate.acquireProjectLease(args);
		this.syncScopeCache(args.scope);
		this.persistScope(args.scope);
		return result;
	}

	releaseProjectLease(args: { readonly scope: StateScope; readonly leaseId: string }): void {
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
		if (scope) {
			this.restoreScopeIfNeeded(scope);
		}
		const reaped = this.delegate.gc(scope);
		if (scope) {
			this.syncScopeCache(scope);
			this.persistScope(scope);
			return reaped;
		}
		for (const cachedScope of this.scopeCache.values()) {
			this.syncScopeCache(cachedScope.scope);
			this.persistScope(cachedScope.scope);
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
		const headCommitSha = cache?.headCommitSha ?? this.options.headCommitSha?.();
		const drift = cache?.drift;
		if (!reconciledCommitSha || !headCommitSha) return undefined;
		if (drift === 'equal' || reconciledCommitSha === headCommitSha) {
			return undefined;
		}
		return stateStoreStale({
			reconciledCommitSha,
			headCommitSha,
			drift,
		});
	}

	private latestReconciledCommitSha(scope: StateScope): string | undefined {
		const row = this.db
			.query(
				`SELECT reconciled_commit_sha
				 FROM generations
				 WHERE scope_kind = ? AND scope_locator_json = ?
				 ORDER BY updated_at DESC
				 LIMIT 1`,
			)
			.get(scope.kind, locatorJson(scope)) as
			| { readonly reconciled_commit_sha: string | null }
			| null;
		return row?.reconciled_commit_sha ?? undefined;
	}

	private readUserVersion(): number {
		const row = this.db.query('PRAGMA user_version;').get() as
			| { readonly user_version?: number }
			| { readonly userVersion?: number }
			| null;
		return row?.user_version ?? row?.userVersion ?? 0;
	}

	private integrityCheck(): string {
		const rows = this.db.query('PRAGMA integrity_check;').all() as ReadonlyArray<
			{ readonly integrity_check?: string }
		>;
		const values = rows
			.map((row) => row.integrity_check ?? '')
			.filter((value) => value.length > 0);
		if (values.every((value) => value === 'ok')) return 'ok';
		return values.join('\n') || 'integrity_check_failed';
	}

	private restorePersistedScopes(): void {
		const rows = this.db
			.query(
				`SELECT scope_kind, scope_locator_json, snapshot_json, fingerprint, reconciled_commit_sha, schema_version, created_at, updated_at
				 FROM generations
				 ORDER BY updated_at ASC, id ASC`,
			)
			.all() as readonly IStoredRow[];
		for (const row of rows) {
			const scope = parseScope(row.scope_kind, row.scope_locator_json);
			if (!scope) continue;
			this.loadScopeCache(scope, row);
		}
		for (const cache of this.scopeCache.values()) {
			this.restoreScopeIfNeeded(cache.scope);
		}
	}

	private loadScopeCache(scope: StateScope, row: IStoredRow): void {
		const parsed = JSON.parse(row.snapshot_json) as IPersistedGenerationRecord;
		const key = scopeKey(scope);
		let cache = this.scopeCache.get(key);
		if (!cache) {
			const snapshot = deserializeSnapshot(parsed.snapshot);
			cache = {
				scope,
				snapshot,
				storageIdentity: parsed.snapshot.storageIdentity,
				activeId: parsed.snapshot.activeId,
				generationIds: [...parsed.snapshot.generationIds],
				generations: new Map(),
				projectorIds: [...parsed.snapshot.projectorIds],
				lastHydrateChange: parsed.snapshot.lastHydrateChange,
				drift: parsed.snapshot.drift,
				headCommitSha: parsed.snapshot.headCommitSha,
				forceIntegrityFailure: parsed.snapshot.forceIntegrityFailure,
			};
			this.scopeCache.set(key, cache);
		}
		cache.generations.set(parsed.generation.id, parsed);
		cache.activeId = parsed.snapshot.activeId;
		cache.generationIds = [...parsed.snapshot.generationIds];
		cache.projectorIds = [...parsed.snapshot.projectorIds];
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
		const issues = this.delegate.validateSnapshot(active.snapshot);
		if (issues.length > 0) {
			this.restoredScopes.add(key);
			return;
		}
		void this.delegate.hydrate({
			scope,
			storageIdentity: active.snapshot.storageIdentity,
			snapshot: deserializeSnapshot(active.snapshot),
		});
		for (const generationId of cache.generationIds) {
			if (generationId === cache.activeId) continue;
			const stored = cache.generations.get(generationId);
			if (!stored) continue;
			cache.generations.set(generationId, stored);
		}
		this.restoredScopes.add(key);
	}

	private captureGeneration(
		input: IHydrateInput,
		generation: StateGeneration,
		change?: IStateChange,
	): void {
		const key = scopeKey(input.scope);
		const previous = this.scopeCache.get(key);
		const cache: IScopeCache = previous ?? {
			scope: input.scope,
			snapshot: input.snapshot,
			storageIdentity: input.storageIdentity,
			activeId: undefined,
			generationIds: [],
			generations: new Map(),
			projectorIds: [],
		};
		const previousActiveId = cache.activeId;
		cache.snapshot = input.snapshot;
		cache.storageIdentity = input.storageIdentity;
		cache.activeId = generation.id;
		cache.lastHydrateChange = change;
		cache.headCommitSha = this.options.headCommitSha?.();
		if (!cache.generationIds.includes(generation.id)) {
			cache.generationIds.push(generation.id);
		}
		if (previousActiveId && previousActiveId !== generation.id) {
			const previousRecord = cache.generations.get(previousActiveId);
			if (previousRecord) {
				cache.generations.set(previousActiveId, {
					...previousRecord,
					generation: {
						...previousRecord.generation,
						status: 'draining',
					},
					updatedAt: generation.createdAt,
				});
			}
		}
		const projections = this.captureActiveProjections(input.scope);
		cache.projectorIds = Object.keys(projections).sort();
		cache.generations.set(generation.id, {
			generation,
			projections,
			snapshot: serializeSnapshot(input.snapshot, input.storageIdentity, input.scope, {
				activeId: generation.id,
				generationIds: cache.generationIds,
				generations: Array.from(cache.generations.values()).map((record) => ({
					...record,
					snapshot: serializeSnapshot(
						record.snapshot,
						record.snapshot.storageIdentity,
						record.snapshot.scope,
						{
							activeId: cache.activeId,
							generationIds: cache.generationIds,
							generations: [],
							projectorIds: cache.projectorIds,
							lastHydrateChange: cache.lastHydrateChange,
							drift: cache.drift,
							headCommitSha: cache.headCommitSha,
							forceIntegrityFailure: cache.forceIntegrityFailure,
						},
						),
				})),
				projectorIds: cache.projectorIds,
				lastHydrateChange: cache.lastHydrateChange,
				drift: cache.drift,
				headCommitSha: cache.headCommitSha,
				forceIntegrityFailure: cache.forceIntegrityFailure,
			}),
			reconciledCommitSha: cache.headCommitSha,
			lastKnownState: this.options.lastKnownState ?? 'shadow',
			updatedAt: generation.createdAt,
		});
		this.scopeCache.set(key, cache);
		this.restoredScopes.add(key);
	}

	private captureActiveProjections(scope: StateScope): Record<string, CanonicalProjection> {
		const projections: Record<string, CanonicalProjection> = {};
		for (const [producerId, producer] of this.producers.entries()) {
			if (!producer.serves.includes(scope.kind)) continue;
			const read = this.delegate.lookup({ scope, producerId });
			if (read.ok) {
				projections[producerId] = read.projection;
			}
		}
		return projections;
	}

	private syncScopeCache(scope: StateScope): void {
		const key = scopeKey(scope);
		const cache = this.scopeCache.get(key);
		if (!cache) return;
		const diagnosed = new Map(
			this.delegate
				.diagnose()
				.filter((generation) => cache.generationIds.includes(generation.id))
				.map((generation) => [generation.id, generation] as const),
		);
		for (const generationId of [...cache.generationIds]) {
			const current = diagnosed.get(generationId);
			const stored = cache.generations.get(generationId);
			if (current && stored) {
				cache.generations.set(generationId, {
					...stored,
					generation: current,
					updatedAt: this.options.clock(),
				});
				continue;
			}
			if (!current && stored) {
				cache.generations.set(generationId, {
					...stored,
					generation: {
						...stored.generation,
						status: 'reaped',
						holderCount: 0,
					},
					updatedAt: this.options.clock(),
				});
			}
		}
	}

	private persistScope(scope: StateScope): void {
		const cache = this.scopeCache.get(scopeKey(scope));
		if (!cache) return;
		const now = this.options.clock();
		const serialisedRecords = cache.generationIds
			.map((generationId) => cache.generations.get(generationId))
			.filter((record): record is IPersistedGenerationRecord => Boolean(record));
		const write = this.db.transaction((records: readonly IPersistedGenerationRecord[]) => {
			this.db
				.query(
					'DELETE FROM generations WHERE scope_kind = ? AND scope_locator_json = ?',
				)
				.run(scope.kind, locatorJson(scope));
			for (const record of records) {
				const fingerprint = fingerprintKey(scope, record.generation.fingerprint);
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
						JSON.stringify({
							...record,
							snapshot: serializeSnapshot(cache.snapshot, cache.storageIdentity, scope, {
								activeId: cache.activeId,
								generationIds: cache.generationIds,
								generations: serialisedRecords,
								projectorIds: cache.projectorIds,
								lastHydrateChange: cache.lastHydrateChange,
								drift: cache.drift,
								headCommitSha: cache.headCommitSha,
								forceIntegrityFailure: cache.forceIntegrityFailure,
							}),
						}),
						fingerprint,
						record.reconciledCommitSha ?? null,
						STATE_SQLITE_SCHEMA_VERSION,
						record.generation.createdAt,
						now,
					);
				this.db
					.query(
						`INSERT INTO drivers (fingerprint, last_known_state, parity_mismatches)
						 VALUES (?, ?, 0)
						 ON CONFLICT(fingerprint)
						 DO UPDATE SET last_known_state = excluded.last_known_state`,
					)
					.run(fingerprint, this.options.lastKnownState ?? 'shadow');
			}
		});
		try {
			write(serialisedRecords);
		} catch (error) {
			throw mapSqliteError(error);
		}
	}

	private wrapStoreFailure(error: unknown): IHydrateResult {
		const storeFailure = mapSqliteError(error);
		const reason = hydrateReasonFromStoreFailure(storeFailure);
		return {
			ok: false,
			reason,
			storeFailure,
			detail: storeFailure.pragma ?? storeFailure.code,
		};
	}
}

export function defineSqliteStateRegistry(
	options: ISqliteStateRegistryOptions,
): IStateRegistry {
	return new SqliteStateRegistry(options);
}

export function canonicalRegistryStateHash(
	registry: IStateRegistry,
): string {
	const generations = registry.diagnose().map((generation) => ({
		id: generation.id,
		parentId: generation.parentId,
		canonicalHash: generation.canonicalHash,
		status: generation.status,
		projectLeaseToken: generation.projectLeaseToken,
		holderCount: generation.holderCount,
		storageIdentity: generation.storageIdentity,
		fingerprint: generation.fingerprint,
	}));
	return canonicalStateHash({ kind: 'registry-state', generations });
}

function hydrateReasonFromStoreFailure(
	storeFailure: IStateStoreFailure,
): IHydrateResult['reason'] {
	if (storeFailure.supportedSchemaRange) {
		return 'state_store_schema_unsupported';
	}
	if (storeFailure.drift) {
		return 'state_store_stale';
	}
	if (storeFailure.pragma) {
		return 'state_store_corrupt';
	}
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
		return {
			kind: kind as StateScope['kind'],
			locator: JSON.parse(locator) as StateScope['locator'],
		};
	} catch {
		return undefined;
	}
}

function serializeSnapshot(
	snapshot: IStateInputSnapshot,
	storageIdentity: IStateStorageIdentity,
	scope: StateScope,
	meta: {
		readonly activeId?: string;
		readonly generationIds: readonly string[];
		readonly generations: readonly IPersistedGenerationRecord[];
		readonly projectorIds: readonly string[];
		readonly lastHydrateChange?: IStateChange;
		readonly drift?: TDriftDirection;
		readonly headCommitSha?: string;
		readonly forceIntegrityFailure?: boolean;
	},
): IPersistedSnapshot {
	return {
		fingerprint: snapshot.fingerprint,
		contents: Array.from(snapshot.contents.entries()).map(([key, value]) => ({
			key,
			valueBase64: bytesToBase64(value),
		})),
		declared: [...snapshot.declared],
		byProducer: Array.from(snapshot.byProducer?.entries() ?? []).map(
			([producerId, resolved]) => ({
				producerId,
				resolved: resolved.map((entry) => ({
					spec: entry.spec,
					digest: entry.digest,
					contentBase64: bytesToBase64(entry.content),
				})),
			}),
		),
		storageIdentity,
		scope,
		activeId: meta.activeId,
		generationIds: [...meta.generationIds],
		generations: meta.generations,
		projectorIds: [...meta.projectorIds],
		lastHydrateChange: meta.lastHydrateChange,
		drift: meta.drift,
		headCommitSha: meta.headCommitSha,
		forceIntegrityFailure: meta.forceIntegrityFailure,
	};
}

function deserializeSnapshot(snapshot: IPersistedSnapshot): IStateInputSnapshot {
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