/**
 * review-procedure.ts — the reviewer's procedure, one paragraph, served by
 * `review_queue` so every host reads the same one.
 */

/** The procedure for a server whose tools are prefixed with `prefix`. */
export const procedureFor = (prefix: string): string =>
	'Reviewers work as a swarm. Take the first proposal with no `claimedBy`, claim it with its `claim` command BEFORE reading it, and do the whole review in that worktree: pass it as `checkout` on every ' +
	`${prefix}_proposal_review and ${prefix}_proposal_transition call, commit there, then \`delendai work publish\` it. If the claim is refused because another agent took it first, take the next one. Never review a proposal another agent holds. ` +
	'For each slice marked needs-verdict: read the diff of the delivering commit, run its gate, and check every acceptance item and the proposal non-goals against what that commit delivered; look for regressions and out-of-scope changes. ' +
	'A slice is judged on what it delivered, not on today’s code: if the code differs now and `changedSince` names a later commit that changed it (another proposal superseding, extending or reverting it), that is not a defect of this slice — approve on the delivered state and name those commits in the note. Request changes only for what the delivery itself got wrong. ' +
	`Record the verdict with ${prefix}_proposal_review only — approve with evidence, or request_changes with a note that says what is wrong, where, how to reproduce it and what must hold to approve. ` +
	'A delivery nobody signed is reviewed as unrecorded: independence cannot be verified, so say exactly what you checked. Never edit code, never submit on the implementer’s behalf, never move a proposal by hand. A blocked slice is reported with its missing datum and skipped; a proposal whose slices are all approved is closed with the call in its `close` field. ' +
	'Work oldest first and do not stop at the first finding: every proposal in review gets a verdict or a stated blocker.';
