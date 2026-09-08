/**
 * work-event-store.facade.ts — chooses between the SQLite primary
 * backend and the NDJSON fallback based on
 * `delendai.config.json#state.parity.shadow.enabled`.
 *
 * The decision happens once at construction: if the config flag is
 * truthy AND the SQLite backend can boot, the facade is `sqlite`;
 * otherwise it is `ndjson`. The facade never throws at startup just
 * because the shadow is off — that is the whole point of the
 * graceful-degradation contract from `q00020`.
 */

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
	asWorkItemId,
	type INewWorkEvent,
	type IWorkEvent,
} from './work-event';
import {
	NdjsonWorkEventStore,
	type INdjsonWorkEventStoreOptions,
} from './work-event-store.ndjson';
import {
	SqliteWorkEventStore,
	type ISqliteWorkEventStoreOptions,
} from './work-event-store.sqlite';

export type TWorkEventBackend = 'sqlite' | 'ndjson';

export interface IWorkEventStoreFacadeOptions {
	readonly workspaceRoot: string;
	readonly configPath?: string;
	readonly sqlite?: ISqliteWorkEventStoreOptions;
	readonly ndjson?: INdjsonWorkEventStoreOptions;
	readonly forceBackend?: TWorkEventBackend;
}

const DEFAULT_SQLITE_PATH = '.cache/delendai/telemetry/work-events.sqlite';
const DEFAULT_NDJSON_PATH = '.cache/delendai/telemetry/work-events.ndjson';

const resolvePath = (root: string, value: string): string =>
	isAbsolute(value) ? value : resolve(root, value);

const readShadowEnabled = (
	workspaceRoot: string,
	configPath: string | undefined,
): boolean => {
	const candidates =
		configPath === undefined
			? [join(workspaceRoot, 'delendai.config.json')]
			: [resolve(workspaceRoot, configPath)];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
				state?: { parity?: { shadow?: { enabled?: unknown } } };
			};
			const enabled = parsed.state?.parity?.shadow?.enabled;
			if (typeof enabled === 'boolean') return enabled;
		} catch {
			// Malformed config must NOT crash the bus; the projector
			// already handles this. We silently fall back to ndjson.
			return false;
		}
	}
	return false;
};

const ensureParent = (path: string): void => {
	mkdirSync(dirname(path), { recursive: true });
};

const safeCloseSqlite = (store: SqliteWorkEventStore): void => {
	try {
		store.close();
	} catch {
		// Closing after a botched boot must not mask the original
		// reason the facade fell back to ndjson.
	}
};

export interface IAppendResult {
	readonly backend: TWorkEventBackend;
	readonly event: IWorkEvent;
}

export class WorkEventStoreFacade {
	private readonly backend: TWorkEventBackend;
	private readonly sqlite: SqliteWorkEventStore | undefined;
	private readonly ndjson: NdjsonWorkEventStore | undefined;

	constructor(options: IWorkEventStoreFacadeOptions) {
		const sqlitePath = resolvePath(
			options.workspaceRoot,
			options.sqlite?.path ?? DEFAULT_SQLITE_PATH,
		);
		const ndjsonPath = resolvePath(
			options.workspaceRoot,
			options.ndjson?.path ?? DEFAULT_NDJSON_PATH,
		);
		const shadowEnabled = readShadowEnabled(
			options.workspaceRoot,
			options.configPath,
		);
		const desired: TWorkEventBackend =
			options.forceBackend ?? (shadowEnabled ? 'sqlite' : 'ndjson');
		if (desired === 'sqlite') {
			try {
				ensureParent(sqlitePath);
				this.sqlite = new SqliteWorkEventStore({
					...options.sqlite,
					path: sqlitePath,
				});
				this.backend = 'sqlite';
				return;
			} catch {
				// Shadow was requested but the SQLite backend could not
				// boot. q00020 mandates that the bus never fails on
				// startup because the shadow is unstable: fall back.
			}
		}
		ensureParent(ndjsonPath);
		this.ndjson = new NdjsonWorkEventStore({
			...options.ndjson,
			path: ndjsonPath,
		});
		this.backend = 'ndjson';
	}

	get activeBackend(): TWorkEventBackend {
		return this.backend;
	}

	async append(event: INewWorkEvent): Promise<IAppendResult> {
		if (this.sqlite !== undefined) {
			return {
				backend: 'sqlite',
				event: this.sqlite.append(event),
			};
		}
		if (this.ndjson === undefined) {
			throw new Error('WorkEventStoreFacade has no backend');
		}
		return {
			backend: 'ndjson',
			event: await this.ndjson.append(event),
		};
	}

	async listByWorkItem(
		workItemId: IWorkEvent['work_item_id'],
	): Promise<readonly IWorkEvent[]> {
		if (this.sqlite !== undefined) {
			return this.sqlite.listByWorkItem(workItemId);
		}
		if (this.ndjson === undefined) return [];
		const all = await this.ndjson.list();
		return all.filter((event) => event.work_item_id === workItemId);
	}

	close(): void {
		if (this.sqlite !== undefined) safeCloseSqlite(this.sqlite);
		// NDJSON store keeps no native handle; we still touch the
		// reference so future refactors keep both backends symmetrical.
		this.ndjson === undefined;
		// Avoid a "unused import" lint for the brand helper until F2
		// wires it through the projector; keep the symbol exported.
		void asWorkItemId;
	}
}
