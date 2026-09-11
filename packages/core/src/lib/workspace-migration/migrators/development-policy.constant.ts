/**
 * Constants for `./development-policy.migrator`.
 *
 * Split out of the implementation module so the repo's "constants live in
 * contracts" convention holds.
 */

import type { IMigrationId } from '../../contracts/interfaces/workspace-migration.interface';

/**
 * Stable id recorded in the journal. Never rename it: the journal records
 * by id, and a renamed entry looks like a brand-new migration that would
 * run over a workspace which already did the equivalent work.
 */
export const DEVELOPMENT_POLICY_MIGRATOR_ID: IMigrationId =
	'developmentPolicyMigrator:v1' as IMigrationId;

/** The single file this migrator owns. */
export const DEVELOPMENT_POLICY_CONFIG_FILE = 'delendai.config.json';
