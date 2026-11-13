import type { IDoctorCheck, IDoctorCheckContext } from '../../db-doctor';

export const checkCommandReceipts = ({
	db,
}: IDoctorCheckContext): IDoctorCheck => {
	const rows = db
		.query<{ entity_uid: string }, []>(`SELECT DISTINCT command.entity_uid
			FROM mutation_commands command
			LEFT JOIN proposals proposal
				ON command.entity_type = 'proposal' AND proposal.uid = command.entity_uid
			LEFT JOIN plans plan
				ON command.entity_type = 'plan' AND plan.uid = command.entity_uid
			LEFT JOIN slices slice
				ON command.entity_type = 'slice' AND slice.uid = command.entity_uid
			WHERE
				(proposal.uid IS NULL AND plan.uid IS NULL AND slice.uid IS NULL)
				OR (command.status = 'started' AND (
					command.revision_after IS NOT NULL
					OR command.outcome_kind IS NOT NULL
					OR command.response_json IS NOT NULL
					OR command.completed_at IS NOT NULL
				))
				OR (command.status IN ('completed', 'failed') AND (
					command.outcome_kind IS NULL
					OR command.response_json IS NULL
					OR command.completed_at IS NULL
				))
			ORDER BY command.entity_uid`)
		.all();
	const affectedUids = rows.map((row) => row.entity_uid);
	return {
		name: 'command_receipts',
		severity: affectedUids.length === 0 ? 'ok' : 'warning',
		message:
			affectedUids.length === 0
				? 'No issues detected.'
				: `${String(affectedUids.length)} orphaned or inconsistent command receipts detected.`,
		...(affectedUids.length > 0 ? { affectedUids } : {}),
	};
};
