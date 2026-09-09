/**
 * startup-state-ports.ts — binds the startup reconciler's nine ports to
 * the real SQLite work model.
 *
 * WHY it lives in this package and not in `@delendai/core`: the ports are
 * declared in core because the reconciler must be testable without a
 * storage engine, and `core-runtime-deps` forbids core from importing
 * `bun:sqlite` at all. So core declares the questions and this package,
 * which owns the answers, supplies the binding. The reconciler receives
 * it as a collaborator; nothing in core learns that SQLite exists.
 *
 * WHY the repositories are handed over almost verbatim: they were shaped
 * to satisfy these interfaces structurally, so this file is composition
 * rather than translation. Where a port asks for something a repository
 * spells differently, the adapter is written out explicitly below rather
 * than hidden behind a cast — a cast would let a future signature drift
 * apart silently, which is the one thing a seam like this must not allow.
 *
 * WHY opening is a two-step: the database is a MATERIALIZED VIEW —
 * derived, rebuildable, gitignored, never synced between machines — so a
 * missing file is the normal first-boot state and never an error. When
 * creation is permitted the file is created and migrated; when it is not,
 * the absence is reported as such. And a file that exists but cannot be
 * opened is reported as `unreadable` WITHOUT being deleted or rebuilt:
 * the reconciler's repair path for a corrupt database proposes throwing
 * it away, so a wrong verdict here destroys real state.
 */

import { Database } from 'bun:sqlite';

import type { IStartupStatePorts } from '@delendai/core/public';

import { applyMigrations } from '../migrations';
import { ClaimsRepo } from './claims-repo';
import { ForgeRepo } from './forge-repo';
import { GenerationsRepo } from './generations-repo';
import { CoordinationJournalRepo } from './journal-repo';
import { LeasesRepo } from './leases-repo';
import { WorkReconciliationRepo } from './reconciliation-repo';
import { WorkRegistryRepo } from './registry-repo';
import { createStartupSchemaPort } from './startup-schema-port';
import { WorkUnitsRepo } from './work-units-repo';

/** What `openStartupStatePorts` may answer. Mirrors the core seam. */
export type TOpenStatePortsResult =
	| { readonly kind: 'opened'; readonly ports: IStartupStatePorts }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unreadable'; readonly reason: string };

export interface IOpenStatePortsOptions {
	readonly databasePath: string;
	/** False for a diagnose-only run: never create, never migrate. */
	readonly allowCreate: boolean;
}

/** SQLite's code for "this database could not be opened at all". */
const CANNOT_OPEN = 'SQLITE_CANTOPEN';

const errorCode = (error: unknown): string | undefined =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	typeof (error as { readonly code?: unknown }).code === 'string'
		? (error as { readonly code: string }).code
		: undefined;

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/** Compose the nine ports over one open handle. */
export const bindStatePorts = (db: Database): IStartupStatePorts => ({
	schema: createStartupSchemaPort(db),
	registry: new WorkRegistryRepo(db),
	workUnits: new WorkUnitsRepo(db),
	generations: new GenerationsRepo(db),
	forge: new ForgeRepo(db),
	journal: new CoordinationJournalRepo(db),
	leases: new LeasesRepo(db),
	claims: new ClaimsRepo(db),
	reconciliation: new WorkReconciliationRepo(db),
});

/**
 * Open the state database and bind the ports, or say why it could not be
 * done. Never throws for an expected condition.
 */
export const openStartupStatePorts = (
	options: IOpenStatePortsOptions,
): TOpenStatePortsResult => {
	let db: Database;
	try {
		db = new Database(options.databasePath, {
			create: options.allowCreate,
			readonly: false,
		});
	} catch (error) {
		// `SQLITE_CANTOPEN` with creation forbidden is the ordinary
		// "no database yet" case, not a fault in the file.
		if (errorCode(error) === CANNOT_OPEN && !options.allowCreate) {
			return { kind: 'absent' };
		}
		return { kind: 'unreadable', reason: describe(error) };
	}

	try {
		// Migrating on open is what makes a fresh clone usable without a
		// manual step. It runs only when this boot was permitted to
		// create, so a diagnose-only run cannot mutate the schema of a
		// database it was merely inspecting.
		if (options.allowCreate) applyMigrations(db);
		return { kind: 'opened', ports: bindStatePorts(db) };
	} catch (error) {
		// The handle is released, and the FILE IS LEFT EXACTLY AS IT WAS.
		db.close();
		return { kind: 'unreadable', reason: describe(error) };
	}
};
