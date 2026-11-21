/**
 * legacy-residue-report.helper.ts — one line per thing a residue run
 * changed, asked or could not read; nothing when the machine is clean.
 */
import type { IUserHostConfigReport } from '../../contracts/interfaces/user-host-config.interface';

const PREFIX = 'legacy residue:';

/** The key a question is recorded under, so it is asked once. */
export const questionKey = (file: string, entry: string): string =>
	`${file}::${entry}`;

export const renderLegacyResidueReport = (
	report: IUserHostConfigReport,
	alreadyAsked: ReadonlySet<string>,
): { readonly lines: readonly string[]; readonly asked: readonly string[] } => {
	const lines: string[] = [];
	for (const change of report.changes) {
		lines.push(
			`${PREFIX} ${change.entries.join(', ')} in ${change.file} migrated; backup ${change.backup}`,
		);
	}
	const asked: string[] = [];
	for (const question of report.questions) {
		const key = questionKey(question.file, question.entry);
		if (alreadyAsked.has(key)) continue;
		asked.push(key);
		lines.push(
			`${PREFIX} ${question.entry} in ${question.file} mentions the retired name but is not delendai's own; left as it is, decide whether to remove it`,
		);
	}
	for (const failure of report.failures) {
		lines.push(
			`${PREFIX} ${failure.file} was not migrated: ${failure.reason}`,
		);
	}
	return { lines, asked };
};
