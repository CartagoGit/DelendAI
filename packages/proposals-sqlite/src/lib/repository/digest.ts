import { createHash } from 'node:crypto';

import type { IProposalCandidate } from '../reconciler';
import { compareCodeUnits } from '@delendai/state';

const sha256 = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

export const canonicalProposalCandidates = (
	proposals: readonly IProposalCandidate[],
): readonly IProposalCandidate[] =>
	proposals
		.map((proposal) => ({ ...proposal }))
		.sort(
			(a, b) =>
				compareCodeUnits(a.uid, b.uid) ||
				compareCodeUnits(a.path, b.path),
		);

export const digestProposalCandidates = (
	proposals: readonly IProposalCandidate[],
): string =>
	sha256(
		JSON.stringify({ proposals: canonicalProposalCandidates(proposals) }),
	);
