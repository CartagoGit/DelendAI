import type {
	IForeignLockHolding,
	ForeignLockProvider,
} from '../contracts/foreign-lock';

/**
 * Keep another agent's in-flight edits out of this commit.
 *
 * This is the one safeguard that holds no matter how the policy is
 * configured, which is what makes it worth having. `sliceScoping: false`
 * plus `allowForeignChanges: true` plus an interval trigger plus
 * `push.onCommit` — a combination a swarm host may legitimately choose —
 * means "commit everything dirty, every N minutes, and push it to the
 * shared branch". No amount of care inside that policy can avoid
 * catching a file another agent is midway through writing, because the
 * policy is explicitly asking for the whole worktree.
 *
 * Unless the worktree can say which parts of it are spoken for. That is
 * exactly what the agent lock file records, and consulting it costs one
 * read. A file another agent holds is not "foreign changes the operator
 * opted into" — it is an edit that is not finished yet, and committing
 * it is how a shared branch goes red without anyone breaking it.
 *
 * Deliberately advisory in one direction only: it can shrink a commit,
 * never grow one, and it never blocks. An empty result after filtering
 * is a refusal with a next step, not a silent no-op.
 */

export interface IForeignLockFilterResult {
	/** Files safe to stage. */
	readonly files: readonly string[];
	/** What was withheld, and who holds it. Empty when nothing was. */
	readonly withheld: readonly IForeignLockHolding[];
}

const normalize = (path: string): string => path.replace(/^\.\//u, '');

export const filterForeignLockedFiles = async (input: {
	readonly files: readonly string[];
	readonly selfAgent: string | undefined;
	readonly provider: ForeignLockProvider | undefined;
}): Promise<IForeignLockFilterResult> => {
	if (input.provider === undefined || input.files.length === 0) {
		return { files: input.files, withheld: [] };
	}
	let holdings: readonly IForeignLockHolding[];
	try {
		holdings = await input.provider({
			files: input.files,
			selfAgent: input.selfAgent,
		});
	} catch {
		// A provider that fails must not cost the commit. Degrading to
		// "nothing is locked" is exactly the behaviour of a host with no
		// proposals plugin at all, which is a supported configuration.
		return { files: input.files, withheld: [] };
	}
	if (holdings.length === 0) {
		return { files: input.files, withheld: [] };
	}
	const held = new Map(
		holdings.map((holding) => [normalize(holding.file), holding]),
	);
	const files: string[] = [];
	const withheld: IForeignLockHolding[] = [];
	for (const file of input.files) {
		const holding = held.get(normalize(file));
		if (holding === undefined) files.push(file);
		else withheld.push(holding);
	}
	return { files, withheld };
};

/**
 * The refusal, when every file this commit would have touched belongs to
 * someone else. Names a holder and their task so the caller can wait on
 * the right lock instead of retrying blind.
 */
export const buildForeignLockRefusal = (
	withheld: readonly IForeignLockHolding[],
): string => {
	const first = withheld[0];
	const others = withheld.length > 1 ? ` (+${withheld.length - 1} more)` : '';
	return (
		`FOREIGN_LOCK_HELD: every file this commit would stage is claimed by another agent — ` +
		`${first?.file ?? 'unknown'} is held by ${first?.agent ?? 'unknown'} as ${first?.taskId ?? 'unknown'}${others}. ` +
		`Nothing was committed, which is correct: their edits are not finished. ` +
		`Wait for the release (await_lock on their task id) or let their own commit land; do not retry immediately and do not stage past the lock.`
	);
};
