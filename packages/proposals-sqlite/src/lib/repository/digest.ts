import { createHash } from 'node:crypto'

import type { IProposalCandidate } from '../reconciler'

const sha256 = (text: string): string =>
	createHash('sha256').update(text).digest('hex')

export const canonicalProposalCandidates = (
	proposals: readonly IProposalCandidate[],
): readonly IProposalCandidate[] =>
	proposals.map((proposal) => ({ ...proposal })).sort((a, b) =>
		a.uid.localeCompare(b.uid) || a.path.localeCompare(b.path),
	)

export const digestProposalCandidates = (
	proposals: readonly IProposalCandidate[],
): string => sha256(JSON.stringify({ proposals: canonicalProposalCandidates(proposals) }))