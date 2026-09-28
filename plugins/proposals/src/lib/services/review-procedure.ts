/**
 * review-procedure.ts — the reviewer's procedure, one paragraph, served by
 * `review_queue` so every host reads the same one.
 */

/** The procedure for a server whose tools are prefixed with `prefix`. */
export const procedureFor = (prefix: string): string =>
	'Review with four commands, from a terminal in this repository. `delendai review next --agent=<your model id>` enters your review unit (once: pass the `--session` it prints on every later call), claims the next proposal nobody holds, and lists each slice to judge with the exact approve and changes commands. ' +
	'For each slice: read the diff of its delivering commit, run its gate, and check every acceptance item and the proposal non-goals against what that commit delivered; look for regressions and out-of-scope changes. ' +
	'A slice is judged on what it delivered, not on today\u2019s code: if the code differs now and `changedSince` names a later commit that changed it (another proposal superseding, extending or reverting it), that is not a defect of this slice \u2014 approve on the delivered state and name those commits in the note. When `changedSinceTruncated` is set, the list is only the newest of them: read the rest with `git log` on the slice files before judging. Request changes only for what the delivery itself got wrong. ' +
	'Answer with `delendai review approve` (the gate\u2019s exit code and test counts are its evidence) or `delendai review changes` with a note that says what is wrong, where, how to reproduce it and what must hold to approve. Each verdict is committed to your unit as it is recorded; the last approval closes the proposal and a change request reopens it. Then `delendai review next` again; when nothing waits, `delendai review finish` publishes your verdicts as one pull request. ' +
	`Without a terminal the steps are the same: enter with \`work enter --kind=review --proposal=batch --slice=all\`, claim it with the proposal\u2019s \`claim\` commit, call this queue again with \`proposalId\` for its evidence, and record each verdict with ${prefix}_proposal_review with your unit\u2019s worktree as \`checkout\`. ` +
	'A delivery nobody signed is reviewed as unrecorded: independence cannot be verified, so say exactly what you checked. Never edit code, never submit on the implementer\u2019s behalf, never move a proposal by hand, never review a proposal another agent holds. A blocked slice is reported with its missing datum and skipped. ' +
	'Work oldest first and do not stop at the first finding: every proposal in review gets a verdict or a stated blocker.';
