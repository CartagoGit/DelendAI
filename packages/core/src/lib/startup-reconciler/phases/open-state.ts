/**
 * open-state.ts — phase 2: the state database, from "does it exist?" to
 * "its schema is current and its projections are fresh".
 *
 * WHY the probe comes before the open: the normal experience this whole
 * subsystem exists for is a machine that has NEVER seen this workspace.
 * It has no database. Letting the driver discover that produces
 * "unable to open database file", a message that describes a filesystem
 * error rather than the situation, and that is exactly what makes people
 * type `run doctor`. So the absence is detected first and named:
 * "database absent / not initialized" — a normal, expected, repairable
 * state on a first boot, and a structured blocker when the caller
 * explicitly asked to diagnose without creating anything.
 *
 * WHY migrations are SAFE but a corrupt database is not: a shipped
 * migration is a deterministic function this build carries with it, and
 * applying it twice is a no-op. A corrupt file has no determined repair —
 * "rebuild it" might be right, and might throw away the only copy of a
 * journal that was never exported. So it degrades, keeps the file, and
 * generates repair work.
 */

import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IStartupEnvironment, IStartupRepositoryKey } from '../seams';
import type { IStartupStatePorts, IStateDatabaseSeam } from '../state-ports';

/** What phase 2 produced. */
export interface IStatePhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly migrationsApplied: number;
		readonly projectionsRebuilt: number;
	};
	readonly ports?: IStartupStatePorts | undefined;
	readonly repositoryId?: number | undefined;
	readonly schemaVersion: number;
	readonly ok: boolean;
}

export interface IStatePhaseInput {
	readonly database: IStateDatabaseSeam;
	readonly environment: IStartupEnvironment;
	readonly repository: IStartupRepositoryKey;
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	/** False for a diagnose-only run: never bring a database into being. */
	readonly allowCreate: boolean;
	readonly now: number;
}

const blocked = (findings: readonly IStartupFinding[]): IStatePhaseResult => ({
	findings,
	counters: { migrationsApplied: 0, projectionsRebuilt: 0 },
	schemaVersion: 0,
	ok: false,
});

export const runStateDatabasePhase = (
	input: IStatePhaseInput,
): IStatePhaseResult => {
	const findings: IStartupFinding[] = [];
	const probe = input.database.probe();

	if (probe.kind === 'unreadable') {
		return blocked([
			finding({
				code: 'state-database.corrupt',
				phase: 'state-database',
				kind: 'blocker',
				subject: probe.path,
				message: `The state database is present but unreadable: ${probe.reason}. It has NOT been deleted or rebuilt.`,
			}),
		]);
	}
	if (probe.kind === 'absent' && !input.allowCreate) {
		return blocked([
			finding({
				code: 'state-database.absent',
				phase: 'state-database',
				kind: 'blocker',
				subject: probe.path,
				message:
					'database absent / not initialized: this workspace has no state database yet, and this run was not permitted to create one.',
			}),
		]);
	}
	if (probe.kind === 'absent') {
		findings.push(
			finding({
				code: 'state-database.created',
				phase: 'state-database',
				kind: 'repaired',
				subject: probe.path,
				message:
					'No state database on this machine; an empty one was created and will be rebuilt from refs, the forge and the journal.',
			}),
		);
	}

	const opened = input.database.open({ allowCreate: input.allowCreate });
	if (opened.kind === 'absent') {
		return blocked([
			...findings,
			finding({
				code: 'state-database.absent',
				phase: 'state-database',
				kind: 'blocker',
				subject: probe.path,
				message:
					'database absent / not initialized: the state database could not be created.',
			}),
		]);
	}
	if (opened.kind === 'unverifiable') {
		// NOT `corrupt`. Nothing was learned about the database, so
		// asserting a defect in it would be a fabricated verdict — and a
		// dangerous one, since the repair task for `corrupt` proposes
		// rebuilding the file. This blocks READY and generates no work.
		return blocked([
			...findings,
			finding({
				code: 'state-database.unverifiable',
				phase: 'state-database',
				kind: 'blocker',
				subject: probe.path,
				message: `The state database could not be examined: ${opened.reason}. Nothing was read, written, deleted or rebuilt, and no conclusion about the file's health follows from this.`,
			}),
		]);
	}
	if (opened.kind === 'unreadable') {
		return blocked([
			...findings,
			finding({
				code: 'state-database.corrupt',
				phase: 'state-database',
				kind: 'blocker',
				subject: probe.path,
				message: `The state database could not be opened: ${opened.reason}. The file was left untouched.`,
			}),
		]);
	}

	const { ports } = opened;
	const integrity = ports.schema.integrityCheck();
	if (!integrity.ok) {
		return blocked([
			...findings,
			finding({
				code: 'state-database.corrupt',
				phase: 'state-database',
				kind: 'blocker',
				subject: probe.path,
				message: `Integrity check failed: ${integrity.problems.join('; ')}. Nothing was rebuilt or deleted.`,
			}),
		]);
	}

	const pending = ports.schema.pendingMigrations();
	const sweep =
		pending.length > 0
			? ports.schema.applyMigrations()
			: { applied: [], ambiguous: [] };
	for (const name of sweep.applied) {
		findings.push(
			finding({
				code: 'state-database.migration-applied',
				phase: 'state-database',
				kind: 'repaired',
				subject: name,
				message: `Applied pending schema migration ${name}.`,
			}),
		);
	}
	for (const name of sweep.ambiguous) {
		findings.push(
			finding({
				code: 'state-database.ambiguous-migration',
				phase: 'state-database',
				kind: 'blocker',
				subject: name,
				message: `Migration ${name} cannot be applied deterministically to this data; it was NOT applied.`,
			}),
		);
	}

	const stale = ports.schema.staleProjections();
	const rebuilt =
		stale.length > 0 ? ports.schema.rebuildProjections(stale) : [];
	for (const name of rebuilt) {
		findings.push(
			finding({
				code: 'state-database.projection-rebuilt',
				phase: 'state-database',
				kind: 'repaired',
				subject: name,
				message: `Rebuilt the derived projection ${name} after a source-digest change.`,
			}),
		);
	}

	ports.registry.registerMachine({
		machineId: input.environment.machineId,
		hostname: input.environment.hostname,
		platform: input.environment.platform,
		now: input.now,
	});
	ports.registry.registerAgent({
		id: input.environment.agentId,
		host: input.environment.hostname,
		machineId: input.environment.machineId,
		now: input.now,
	});
	const repository = ports.registry.registerRepository({
		forge: input.repository.forge,
		owner: input.repository.owner,
		name: input.repository.name,
		integrationBranch: input.integrationBranch,
		releaseBranch: input.releaseBranch,
		now: input.now,
	});

	const blockers = findings.filter((item) => item.kind === 'blocker');
	return {
		findings,
		counters: {
			migrationsApplied: sweep.applied.length,
			projectionsRebuilt: rebuilt.length,
		},
		ports,
		repositoryId: repository.id,
		schemaVersion: ports.schema.currentVersion(),
		ok: blockers.length === 0,
	};
};
