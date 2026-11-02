import { access } from 'node:fs/promises';
import { join } from 'node:path';

/** The old standalone audit store must never coexist with the proposal store. */
export const assertNoLegacyAuditDirectory = async (
	root: string,
): Promise<void> => {
	const legacyPath = join(root, 'docs', 'delendai', 'audits');
	try {
		await access(legacyPath);
	} catch {
		return;
	}
	throw new Error(
		`legacy audit directory found at ${legacyPath}; move audit reports into docs/delendai/proposals/<status>/audits/ and run sync_proposals`,
	);
};
