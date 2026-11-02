// effect-boundary-authorized: existsSync guards the bun:sqlite open. The
// driver opens the database file itself, outside ctx.effects, so mediating
// only the existence probe would suggest a supervision that does not exist.

import { existsSync } from 'node:fs';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

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

export const listProposalConflicts = (
	workspaceRoot: string,
): IConflictsOutput => {
	const checkedAt = Date.now();
	const databasePath = resolveProposalsDbPaths(workspaceRoot).databasePath;
	if (!existsSync(databasePath)) return { conflicts: [], checkedAt };
	const driver = new ProposalsSqliteDriver({
		path: databasePath,
		readonly: true,
	});
	try {
		const conflicts = driver.handle
			.query<IProposalConflict, []>(
				`SELECT entityType, entityUid, currentRevision, expectedRevision
				 FROM (
					SELECT 'proposal' AS entityType, p.uid AS entityUid,
						p.revision AS currentRevision,
						COALESCE(MAX(e.entity_revision), p.revision) AS expectedRevision
					FROM proposals p
					LEFT JOIN lifecycle_events e
						ON e.entity_type = 'proposal' AND e.entity_uid = p.uid
					GROUP BY p.uid
					UNION ALL
					SELECT 'plan', p.uid, p.revision,
						COALESCE(MAX(e.entity_revision), p.revision)
					FROM plans p
					LEFT JOIN lifecycle_events e
						ON e.entity_type = 'plan' AND e.entity_uid = p.uid
					GROUP BY p.uid
					UNION ALL
					SELECT 'slice', s.uid, s.revision,
						COALESCE(MAX(e.entity_revision), s.revision)
					FROM slices s
					LEFT JOIN lifecycle_events e
						ON e.entity_type = 'slice' AND e.entity_uid = s.uid
					GROUP BY s.uid
				 )
				 WHERE currentRevision <> expectedRevision`,
			)
			.all();
		return { conflicts, checkedAt };
	} finally {
		driver.close();
	}
};
