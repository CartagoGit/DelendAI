/**
 * lifecycle-readers.ts — read a proposal's, plan's or slice's lifecycle
 * state out of the proposals database, without ever writing to it.
 *
 * WHY this is its own module: these readers open a real `bun:sqlite`
 * handle. That is a Bun builtin with no node resolution, so the specs
 * that exercise them can only run under `bun test` (see the
 * `test:sqlite` script). Living inside the plugin's `index.ts` they were
 * database access inlined into plugin wiring — untestable by the runner
 * that measures `index.ts`, and mixed in with option parsing and tool
 * registration. Here they are one seam with one job, mirrored by
 * `tests/src/lib/sql/lifecycle-readers.spec.ts`.
 *
 * Every read degrades to `null` (or zeroes) rather than throwing: a
 * missing, unreadable or not-yet-migrated database is the normal state
 * of a fresh checkout, and a lifecycle lookup must never be the reason a
 * tool call fails.
 */
import { access } from 'node:fs/promises';
import { relative } from 'node:path';

import {
	PlanRepo,
	ProposalRepo,
	ProposalsSqliteDriver,
	SliceRepo,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

type TSqlLifecycleRow = {
	readonly uid: string;
	readonly source_path: string | null;
	readonly status: string;
	readonly closed_at: number | null;
};

/**
 * Failures that mean "there is no database to read", not "something is
 * wrong". Each one is a state a workspace legitimately sits in before
 * the first reconcile, so each maps to an absent answer.
 */
const EXPECTED_SQL_LIFECYCLE_ERRORS = [
	/unable to open database file/i,
	/attempt to write a readonly database/i,
	/no such table: (proposals|plans|slices)\b/i,
	/file is not a database/i,
	/database disk image is malformed/i,
];

const toLifecycleState = (row: TSqlLifecycleRow) => ({
	status: row.status,
	sourcePath: row.source_path,
	closedAt: row.closed_at,
});

const toExplicitLifecycleState = (row: {
	readonly status: string;
	readonly sourcePath: string | null;
	readonly closedAt: number | null;
}) => ({
	status: row.status,
	sourcePath: row.sourcePath,
	closedAt: row.closedAt,
});

const isExpectedSqlLifecycleError = (error: unknown): boolean =>
	error instanceof Error &&
	EXPECTED_SQL_LIFECYCLE_ERRORS.some((pattern) =>
		pattern.test(error.message),
	);

const normalizeSqlPath = (path: string): string => path.replaceAll('\\', '/');

/**
 * Every spelling of one proposal's path a caller might hold: absolute,
 * workspace-relative, and relative to the proposals directory. The
 * database stores one of them, and which one depends on who wrote the
 * row, so the lookup accepts all of them rather than guessing.
 */
export const buildSqlPathCandidates = (
	workspaceRoot: string,
	path: string | undefined,
): readonly string[] => {
	if (path === undefined || path.length === 0) return [];
	const normalizedPath = normalizeSqlPath(path);
	const normalizedRoot = normalizeSqlPath(workspaceRoot);
	const candidates = new Set<string>([normalizedPath]);
	const relativeToWorkspace = normalizeSqlPath(relative(workspaceRoot, path));
	if (
		relativeToWorkspace.length > 0 &&
		relativeToWorkspace !== '.' &&
		!relativeToWorkspace.startsWith('../')
	) {
		candidates.add(relativeToWorkspace);
	}
	const rootPrefix = `${normalizedRoot}/`;
	if (normalizedPath.startsWith(rootPrefix)) {
		candidates.add(normalizedPath.slice(rootPrefix.length));
	}
	const proposalsMarker = '/proposals/';
	const proposalsIndex = normalizedPath.lastIndexOf(proposalsMarker);
	if (proposalsIndex !== -1) {
		candidates.add(
			normalizedPath.slice(proposalsIndex + proposalsMarker.length),
		);
	}
	return [...candidates];
};

const readPathScopedLifecycleRow = (
	driver: ProposalsSqliteDriver,
	input: {
		table: 'proposals' | 'plans' | 'slices';
		pathCandidates: readonly string[];
		exactUid: string;
		prefixUid?: string;
		uidColumn?: 'uid';
	},
): TSqlLifecycleRow | null => {
	if (input.pathCandidates.length === 0) return null;
	const placeholders = input.pathCandidates.map(() => '?').join(', ');
	const whereParts = [`source_path IN (${placeholders})`, 'uid = ?'];
	const params: string[] = [...input.pathCandidates, input.exactUid];
	if (input.prefixUid !== undefined) {
		whereParts.push('uid GLOB ?');
		params.push(input.prefixUid);
	}
	params.push(input.exactUid);
	const rows = driver.handle
		.query<TSqlLifecycleRow, string[]>(
			`SELECT uid, source_path, status, closed_at
			 FROM ${input.table}
			 WHERE ${whereParts.join(' AND (').includes('uid GLOB ?') ? `source_path IN (${placeholders}) AND (uid = ? OR uid GLOB ?)` : `source_path IN (${placeholders}) AND uid = ?`}
			 ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, uid
			 LIMIT 2`,
		)
		.all(...params);
	const exact = rows.find(
		(row: TSqlLifecycleRow) => row.uid === input.exactUid,
	);
	if (exact) return exact;
	return rows.length === 1 ? (rows[0] ?? null) : null;
};

/**
 * Open the database read-only for one read, and close it again.
 *
 * An absent file, or any of the expected "no database here" failures,
 * answers `null`. Anything else is a real fault and is rethrown.
 */
const withReadonlySqlDriver = async <T>(
	sqlitePath: string,
	read: (driver: ProposalsSqliteDriver) => T,
): Promise<T | null> => {
	try {
		await access(sqlitePath);
	} catch {
		return null;
	}
	let driver: ProposalsSqliteDriver | null = null;
	try {
		driver = new ProposalsSqliteDriver({
			path: sqlitePath,
			readonly: true,
		});
		return read(driver);
	} catch (error) {
		if (isExpectedSqlLifecycleError(error)) return null;
		throw error;
	} finally {
		driver?.close();
	}
};

export const buildSqlLifecycleReaders = (workspaceRoot: string) => {
	const sqlitePath = resolveProposalsDbPaths(workspaceRoot).databasePath;
	return {
		count: async (): Promise<{
			readonly proposals: number;
			readonly plans: number;
			readonly slices: number;
		}> =>
			(await withReadonlySqlDriver(sqlitePath, (driver) => ({
				proposals:
					driver.handle
						.query<{ readonly total: number }, []>(
							'SELECT COUNT(*) AS total FROM proposals',
						)
						.get()?.total ?? 0,
				plans:
					driver.handle
						.query<{ readonly total: number }, []>(
							'SELECT COUNT(*) AS total FROM plans',
						)
						.get()?.total ?? 0,
				slices:
					driver.handle
						.query<{ readonly total: number }, []>(
							'SELECT COUNT(*) AS total FROM slices',
						)
						.get()?.total ?? 0,
			}))) ?? { proposals: 0, plans: 0, slices: 0 },
		lastSync: async (): Promise<{
			readonly at: number | undefined;
			readonly sourceCommit: string | undefined;
		}> => {
			const row = await withReadonlySqlDriver(sqlitePath, (driver) =>
				driver.handle
					.query<
						{
							readonly completed_at: number | null;
							readonly source_commit: string | null;
						},
						[]
					>(
						`SELECT completed_at, source_commit
						 FROM reconciliation_runs
						 WHERE completed_at IS NOT NULL
						 ORDER BY id DESC
						 LIMIT 1`,
					)
					.get(),
			);
			return {
				at: row?.completed_at ?? undefined,
				sourceCommit: row?.source_commit ?? undefined,
			};
		},
		getProposalState: async ({
			proposalId,
			path,
		}: {
			readonly proposalId: string;
			readonly path?: string | undefined;
		}) => {
			const pathCandidates = buildSqlPathCandidates(workspaceRoot, path);
			return withReadonlySqlDriver(sqlitePath, (driver) => {
				const direct = new ProposalRepo(driver.handle).getByUid(
					proposalId,
				);
				if (direct) return toExplicitLifecycleState(direct);
				const byPath = readPathScopedLifecycleRow(driver, {
					table: 'proposals',
					pathCandidates,
					exactUid: proposalId,
					prefixUid: `${proposalId}.*`,
				});
				return byPath ? toLifecycleState(byPath) : null;
			});
		},
		getPlanState: async ({
			planId,
			path,
		}: {
			readonly planId: string;
			readonly path?: string | undefined;
		}) => {
			const pathCandidates = buildSqlPathCandidates(workspaceRoot, path);
			return withReadonlySqlDriver(sqlitePath, (driver) => {
				const direct = new PlanRepo(driver.handle).getByUid(planId);
				if (direct) return toExplicitLifecycleState(direct);
				const byPath = readPathScopedLifecycleRow(driver, {
					table: 'plans',
					pathCandidates,
					exactUid: planId,
					prefixUid: `${planId}.*`,
				});
				return byPath ? toLifecycleState(byPath) : null;
			});
		},
		getSliceState: async (input: {
			readonly proposalId: string;
			readonly sliceId: string;
			readonly path?: string | undefined;
		}) => {
			const exactUid = `${input.proposalId}.${input.sliceId}`;
			const pathCandidates = buildSqlPathCandidates(
				workspaceRoot,
				input.path,
			);
			return withReadonlySqlDriver(sqlitePath, (driver) => {
				const direct = new SliceRepo(driver.handle).getByUid(exactUid);
				if (direct) return toExplicitLifecycleState(direct);
				const byPath = readPathScopedLifecycleRow(driver, {
					table: 'slices',
					pathCandidates,
					exactUid,
					// Some persisted slice UIDs are nested under a plan-owned UID
					// (for example `<proposal>.<slice>.<child>`), so path scope keeps
					// the compatibility fallback explicit instead of guessing globally.
					prefixUid: `${exactUid}.*`,
				});
				return byPath ? toLifecycleState(byPath) : null;
			});
		},
	};
};
