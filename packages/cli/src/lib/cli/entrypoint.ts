/**
 * entrypoint.ts — b00239 S2.
 *
 * The CLI-side seam every project-aware entrypoint consults before
 * loading the server and the plugins.
 *
 * ## Why this exists as a separate module
 *
 * `runHumanCli`, `__serve`, `init`, `status`, `doctor`, `overview`
 * and any future project-aware entrypoint all need to call the same
 * guard with the same registry. Inlining the call at every site
 * would duplicate four lines of plumbing (registry construction,
 * journal creation, error swallow, report forwarding) at every site
 * and let one of them drift. A single function exported from this
 * module is the contract.
 *
 * ## The contract this seam guarantees
 *
 *  - Returns a structured `IMigrationRunResult` that the caller may
 *    ignore (the engine already swallows the common "nothing to do"
 *    case) or surface as it sees fit.
 *  - On a workspace with no legacy identity, performs ONE file
 *    existence probe per registered migration and exits; no logging,
 *    no stdout/stderr, no journal writes. The probe is the entire
 *    cost of running on the happy path.
 *  - On a workspace that still carries the old identity, runs the
 *    registered migrations in order and reports through the optional
 *    `report` callback. Failures stop the run (the engine's first-
 *    failure rule) and the result reports which id failed and why.
 *
 * ## What this seam deliberately does not do
 *
 *  - It does NOT spawn the MCP server, load plugins, parse argv or
 *    touch the workspace in any way other than the migration. The
 *    caller is responsible for ordering.
 *  - It does NOT log or print: a guard that talks on the happy path
 *    gets disabled, and the common case is silence.
 */
import {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from '@delendai/core/lib/workspace-migration/migration-registry';
import { ensureWorkspaceMigrated } from '@delendai/core/lib/workspace-migration/legacy-migration.service';
import type { IMigrationRunResult } from '@delendai/core/lib/contracts/interfaces/workspace-migration.interface';

export type IEntrypointMigrationReport = (result: IMigrationRunResult) => void;

/**
 * The guard. Every project-aware CLI entrypoint calls this BEFORE
 * constructing its `ICliCommandContext` / stdio context, so the
 * migration runs against a workspace whose state the runtime has not
 * yet touched.
 *
 * The signature is deliberately narrow: the only input that varies
 * across entrypoints is the workspace root (already resolved by the
 * caller from argv/parser) and an optional report sink. Anything
 * else is a registry concern, not an entrypoint concern.
 */
export const ensureMigrated = async (
	workspaceRoot: string,
	report?: IEntrypointMigrationReport,
): Promise<IMigrationRunResult> =>
	ensureWorkspaceMigrated({
		migrations: DEFAULT_MIGRATIONS,
		journal: createFileSystemJournal(),
		workspaceRoot,
		...(report !== undefined ? { report } : {}),
	});

export { DEFAULT_MIGRATIONS } from '@delendai/core/lib/workspace-migration/migration-registry';
