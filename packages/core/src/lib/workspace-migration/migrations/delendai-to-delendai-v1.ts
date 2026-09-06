/**
 * delendai-to-delendai-v1.ts — b00239 S2.
 *
 * The first concrete migration registered with the
 * `LegacyMigrationManager`. Versioned, idempotent, deliberately tiny.
 *
 * ## Why this is intentionally small
 *
 * The full rebrand (scope renames, package manifest updates, lockfile
 * regeneration, host config migration, residual classification) is a
 * multi-slice effort (S4–S8). S2 only ships the **engine seam and one
 * registered migration** so every project-aware entrypoint can call
 * the guard and produce the right "already migrated / nothing to do"
 * answer on the happy path. The migrators that actually rewrite
 * `package.json`, `bun.lock` and the host configs arrive in S4 — this
 * slice proves the engine works against a real workspace, not just
 * against in-memory stubs.
 *
 * ## What this migrator actually does
 *
 * Three path renames from the proposal's "Contratos públicos
 * afectados" list (items 3, 4, 5): the config file, the cache
 * directory and the docs directory. The detector walks the same three
 * paths; if none of them is present the workspace is considered
 * already on the new identity and the engine skips without ever
 * calling `plan` (the cheap probe is the whole point of the slice).
 *
 * ## What this migrator does NOT do
 *
 *  - Rewrite `package.json` (`@delendai/*` → `@delendai/*`) — S4
 *  - Touch lockfiles — S7
 *  - Scan for residual mentions of the old identity — S8
 *  - Migrate global host configs outside the workspace — S5
 *  - Wire the bridge binaries — S3
 *
 * The id `delendaiToDelendAI:v1` is a STABLE string. Recording
 * completion uses this id, not a numeric version, because a workspace
 * that started at v2 has nothing to record against v1 and a number
 * cannot express that. Future migrations chain by id: a S4-bundled
 * `delendaiToDelendAI:v2` runs only if `delendaiToDelendAI:v1` is
 * already recorded.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

/** Stable id recorded in the journal. NOT a number, by design (see header). */
export const DELENDAI_TO_DELENDAI_V1_ID = 'delendaiToDelendAI:v1';

/**
 * The three path renames a workspace needs to be loadable under the
 * new identity. Kept as a const so the detector, the planner and the
 * applier walk the same list — the asymmetry a rename lives or dies
 * by (a migrator that detects one spelling but renames another
 * reports itself complete while leaving the workspace half-
 * converted).
 */
export const DELENDAI_TO_DELENDAI_V1_RENAMES = [
	{
		from: 'delendai.config.json',
		to: 'delendai.config.json',
		label: 'config file',
	},
	{
		from: '.cache/delendai',
		to: '.cache/delendai',
		label: 'cache directory',
	},
	{
		from: 'docs/delendai',
		to: 'docs/delendai',
		label: 'docs directory',
	},
] as const;

/** A path exists iff `access` resolves. One stat call, no surprises. */
const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

/**
 * `delendaiToDelendAI:v1` migrator.
 *
 * Detect is O(3) `access` calls: a no-op for every project that has
 * already migrated (the common case, and the case that runs on every
 * server start of every project forever).
 *
 * ## S2 STUB APPLIER (will be replaced by S4)
 *
 * The applier is intentionally a no-op in S2 — the slice only proves
 * the engine seam works against a real workspace, not that the
 * rename surface is complete. S4 will replace the applier with the
 * concrete migrators (config-file, package-manifest, host-config,
 * cache-and-docs, agent-files, vscode) that the proposal's "Migradores
 * estructurados por formato" section enumerates. The detection logic
 * and the journal contract stay the same so S4 can swap the body in
 * without touching the registry, the entrypoint or the tests pinned
 * here.
 *
 * Why a no-op rather than the obvious `rename(from, to)`? The
 * applier would be one line, but its observable behaviour — moving
 * bytes on disk — is exactly the contract S4 has to own. Shipping
 * it in S2 would let a half-finished rename land in a workspace
 * before the rollback story (S6) and the validation (S8) exist. A
 * no-op is the only honest stub: it detects legacy presence, plans
 * the rename, records the migration, and leaves the actual bytes
 * alone until the migrators that own them are ready.
 */
export const delendaiToDelendAIV1: IMigration = {
	id: DELENDAI_TO_DELENDAI_V1_ID,

	detect: async (ctx: IMigrationContext): Promise<boolean> => {
		for (const { from } of DELENDAI_TO_DELENDAI_V1_RENAMES) {
			if (await pathExists(join(ctx.workspaceRoot, from))) return true;
		}
		return false;
	},

	plan: async (
		ctx: IMigrationContext,
	): Promise<readonly IMigrationPlanStep[]> => {
		const steps: IMigrationPlanStep[] = [];
		for (const { from, to, label } of DELENDAI_TO_DELENDAI_V1_RENAMES) {
			if (await pathExists(join(ctx.workspaceRoot, from))) {
				steps.push({
					kind: 'rename',
					detail: `${label}: ${from} → ${to}`,
				});
			}
		}
		return steps;
	},

	apply: async (_ctx: IMigrationContext): Promise<void> => {
		// Intentionally empty: see the S2 STUB APPLIER comment above.
		// S4 will replace this body with the concrete migrators.
	},
};
