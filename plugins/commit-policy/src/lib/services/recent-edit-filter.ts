/**
 * Keep an edit that is still being typed out of an automatic commit.
 *
 * `filterForeignLockedFiles` beside this one answers "is another agent
 * holding this file?" by reading the agent lock file. That covers DECLARED
 * ownership, and it is the stronger signal — but only agents that claim
 * work through `proposals` appear in it. An agent working directly, a
 * second host, or the maintainer editing in an editor hold no lock at all,
 * and the interval sweep treats their half-written file as fair game.
 *
 * That is not hypothetical. On 2026-09-04 the five-minute sweep claimed an
 * agent's in-flight work four times in one session and committed it as
 * `chore: update <filenames>` — each time replacing the explanation its
 * author was about to write with a list of paths. In a repository whose
 * whole discipline is that a commit says WHY, a safety net that files the
 * work first and destroys the reasoning is a net that costs more than the
 * accident it prevents.
 *
 * So: a file whose last modification is younger than the quiet period is
 * withheld from a workspace-derived commit. Someone is probably still
 * working on it, and the next sweep — minutes away — will take it once
 * they stop. The window is deliberately short, because the sweep exists to
 * stop work being LOST in a shared worktree and delaying it by minutes
 * does not endanger that, while claiming it mid-edit does.
 *
 * Same contract as its sibling, for the same reasons: it can shrink a
 * commit, never grow one, and it never blocks. If every candidate is too
 * recent, the answer is "nothing to commit yet", not a refusal — there is
 * no error here, only a file someone has their hands on.
 */

export interface IRecentEditFilterResult {
	readonly files: readonly string[];
	/** Withheld paths, each with how long ago it was touched (ms). */
	readonly withheld: ReadonlyArray<{
		readonly file: string;
		readonly ageMs: number;
	}>;
}

/** Reads a file's last-modified time, or `undefined` if it cannot. */
export type IModifiedAtReader = (
	file: string,
) => Promise<number | undefined> | number | undefined;

/**
 * Default quiet period.
 *
 * Shorter than the smallest sensible sweep interval, so a file left alone
 * is picked up by the very next sweep rather than lingering: the point is
 * to miss the edit in progress, not to postpone the commit.
 */
export const DEFAULT_QUIET_PERIOD_MS = 90_000;

export const filterRecentlyEditedFiles = async (input: {
	readonly files: readonly string[];
	readonly modifiedAt: IModifiedAtReader;
	readonly quietPeriodMs?: number | undefined;
	readonly now?: number | undefined;
}): Promise<IRecentEditFilterResult> => {
	const quietPeriodMs = input.quietPeriodMs ?? DEFAULT_QUIET_PERIOD_MS;
	if (quietPeriodMs <= 0 || input.files.length === 0)
		return { files: input.files, withheld: [] };

	const now = input.now ?? Date.now();
	const kept: string[] = [];
	const withheld: Array<{ file: string; ageMs: number }> = [];

	for (const file of input.files) {
		const modified = await input.modifiedAt(file);
		// A path we cannot stat is one we cannot judge, and refusing to
		// commit what we failed to measure would let a transient fs error
		// silently shrink a commit. Unmeasurable means "not withheld".
		if (modified === undefined) {
			kept.push(file);
			continue;
		}
		const ageMs = now - modified;
		if (ageMs >= quietPeriodMs) {
			kept.push(file);
			continue;
		}
		withheld.push({ file, ageMs });
	}

	return { files: kept, withheld };
};
