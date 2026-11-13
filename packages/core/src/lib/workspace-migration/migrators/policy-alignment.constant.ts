/**
 * policy-alignment.constant.ts — the migration that removes settings the
 * project's development policy contradicts.
 */
import type { IMigrationId } from '../../contracts/interfaces/workspace-migration.interface';

export const POLICY_ALIGNMENT_MIGRATOR_ID: IMigrationId =
	'policyAlignmentMigrator:v1' as IMigrationId;

/** The automatic push settings a profile that never pushes the integration branch refuses. */
export const CONTRADICTED_PUSH_KEYS: readonly string[] = [
	'onCommit',
	'everyNCommits',
	'everyNMinutes',
];
