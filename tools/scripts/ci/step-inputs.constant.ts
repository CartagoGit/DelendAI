/**
 * step-inputs.constant.ts — the files a proof step reads, as data.
 *
 * A step listed here may be skipped when a pass of the same step, the same
 * command and the same changed-file list is on record for byte-identical
 * inputs (`step-reuse.ts`). A step that is not listed always runs. Only a
 * step whose verdict is a pure function of tracked files is listed; the
 * rest, and why:
 *
 * - `lint-security` runs `bun audit` and judges advisory exceptions by
 *   today's date: the same files give a different verdict next week.
 * - `lint-governance` reads the pull request's labels from the forge.
 * - `quality-gate` runs every lint, the two above among them.
 * - `land rehearsal` assembles its batch from the remote's refs.
 */

/** Step label to the pathspecs (`git ls-files -s -- <spec>`) it reads. */
export const STEP_INPUTS: Readonly<Record<string, readonly string[]>> = {
	// Measured by tracing every file the job's scripts open: 9,161 of the
	// 9,884 tracked files, across every package, plugin, app and doc, so
	// the inputs are the whole tree.
	'lint-docs': ['.'],
};
