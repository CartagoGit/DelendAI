import { existsSync } from 'node:fs';

import { ProposalsSqliteDriver, resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

export interface IProposalConflict {
	readonly entityType: 'proposal' | 'plan' | 'slice';
	readonly entityUid: string;
	readonly currentRevision: number;
	readonly expectedRevision: number;
}

export interface IConflictsOutput {
	readonly conflicts: readonly IProposalConflict[];
	readonly checkedAt: number;
}

export const listProposalConflicts = (workspaceRoot: string): IConflictsOutput => {
	const checkedAt = Date.now();
	const databasePath = resolveProposalsDbPaths(workspaceRoot).databasePath;
	if (!existsSync(databasePath)) return { conflicts: [], checkedAt };
	const driver = new ProposalsSqliteDriver({ path: databasePath, readonly: true });
	try {
		const conflicts = driver.handle
			.query<IProposalConflict, []>(
				`SELECT 'proposal' AS entityType, p.uid AS entityUid,
					p.revision AS currentRevision,
					COALESCE(MAX(e.entity_revision), p.revision) AS expectedRevision
				 FROM proposals p
				 LEFT JOIN lifecycle_events e ON e.entity_type = 'proposal' AND e.entity_uid = p.uid
				 GROUP BY p.uid
				 HAVING currentRevision <> expectedRevision`,
			)
			.all();
		return { conflicts, checkedAt };
	} finally {
		driver.close();
	}
};