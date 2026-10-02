/**
 * landing-certification-record.service.ts — the proof that a landed merge
 * was certified, kept where `close_slice` can find it.
 *
 * Under a merge route the local gate IS the certification, and it runs
 * once, inside `work publish`. Its report used to be printed and lost, so
 * a slice closed afterwards re-ran the whole gate to learn what was
 * already known. This writes one small file per certified tree under the
 * git directory (shared by every worktree, never part of any tree):
 *
 *   <git-common-dir>/delendai-certify/passed/<tree>.json
 *
 * Two trees are keyed to the same certification: the merge candidate's
 * (exactly what the gate ran on) and the unit's own tip (what the unit's
 * worktree still holds once it has landed). `coveredTree` names the second
 * so a reader knows the gate saw this content only as part of the merge.
 * `close_slice` in plugins/proposals reads the same layout.
 */
import { join } from 'node:path';

import { writeFileAtomic } from '../shared/atomic-write';
import { readGit } from './work-unit-shared.service';

/** Where the records live, relative to the git directory (the proposals plugin reads the same layout). */
const LANDING_CERTIFICATION_DIRECTORY = 'delendai-certify/passed';

export interface IRecordLandingCertificationRequest {
	readonly root: string;
	readonly candidateSha: string;
	readonly integrationSha: string;
	/** The unit's work ref (its tip's tree is covered by the merge). */
	readonly workRef: string;
}

/** Record that the candidate passed the gate; `true` when a record was written. */
export const recordLandingCertification = async (
	request: IRecordLandingCertificationRequest,
): Promise<boolean> => {
	const { root, candidateSha, integrationSha, workRef } = request;
	const gitDir = readGit(root, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	const candidateTree = readGit(root, [
		'rev-parse',
		'-q',
		'--verify',
		`${candidateSha}^{tree}`,
	]);
	if (!gitDir || !candidateTree) return false;
	const unitTree = readGit(root, [
		'rev-parse',
		'-q',
		'--verify',
		`${workRef}^{tree}`,
	]);
	const certifiedAt = new Date().toISOString();
	const keys = new Map<string, string | undefined>([
		[candidateTree, undefined],
	]);
	if (unitTree && unitTree !== candidateTree) keys.set(unitTree, unitTree);
	for (const [tree, coveredTree] of keys) {
		await writeFileAtomic(
			join(gitDir, LANDING_CERTIFICATION_DIRECTORY, `${tree}.json`),
			JSON.stringify({
				tree,
				...(coveredTree === undefined ? {} : { coveredTree }),
				candidateSha,
				integrationSha,
				certifiedAt,
			}),
		);
	}
	return true;
};
