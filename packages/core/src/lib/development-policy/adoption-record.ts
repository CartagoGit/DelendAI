/**
 * adoption-record.ts — whether delendai wrote this project's `development`
 * block itself.
 *
 * WHY it is read and not stored in the block: the block must stay exactly
 * what a project would have written by hand, so that declaring it and
 * adopting it resolve to the same policy. The fact that delendai was the
 * author lives in the migration journal, which already records every
 * change the runtime made to a workspace.
 *
 * WHY the shared checkout's journal: the journal is runtime state under
 * `.delendai/`, which a work unit's worktree does not carry.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sharedCheckout } from '../shared/shared-checkout';
import { MIGRATION_JOURNAL_PATH } from '../workspace-migration/migration-journal-path.constant';
import {
	DEVELOPMENT_POLICY_CONFIG_FILE,
	DEVELOPMENT_POLICY_MIGRATOR_ID,
} from '../workspace-migration/migrators/development-policy.constant';
import type { IPolicyAdoption } from '../contracts/interfaces/policy-adoption.interface';

const journalIds = (root: string): readonly unknown[] => {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(join(root, ...MIGRATION_JOURNAL_PATH), 'utf8'),
		);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		// No journal, or an unreadable one: nothing was recorded.
		return [];
	}
};

/** The adoption delendai wrote into this workspace, or `undefined`. */
export const readAdoptionRecord = (
	workspaceRoot: string,
): IPolicyAdoption | undefined =>
	journalIds(sharedCheckout(workspaceRoot) ?? workspaceRoot).includes(
		DEVELOPMENT_POLICY_MIGRATOR_ID,
	)
		? { writtenTo: DEVELOPMENT_POLICY_CONFIG_FILE }
		: undefined;
