import { announceLines } from '@delendai/core/public';

import type {
	ISlicePersistenceOwner,
	ISlicePersistenceResolution,
} from './contracts/interfaces/slice-persistence.interface';
import type { IAutoWorkPersistMode } from './tools/auto-work-persist';

/**
 * Who, if anyone, actually commits a finished slice.
 *
 * `proposals` and `commit-policy` are deliberately agnostic of each
 * other: either can run without the other, and neither imports the
 * other. They only have to agree on one thing — that exactly one of
 * them persists a slice — because both doing it means duplicate
 * commits, and neither doing it means an agent's work never reaches
 * git.
 *
 * The handoff itself was already right: when `commit-policy` is enabled
 * with a slice trigger it owns persistence and `proposals` stands down.
 * What was missing is the third case. With `commit-policy` absent (or
 * its `commit.enabled` false) and `proposals.persist.mode` unset, the
 * resolution is `'none'` — a legitimate configuration, and also
 * indistinguishable from a misconfiguration.
 *
 * That gap is expensive for an agent specifically. It finishes slice
 * after slice, every one of them succeeds, and nothing is committed;
 * the closing gates then refuse forever because no `shipped-in` SHA can
 * exist. The agent has no way to see why, so it retries the only thing
 * it knows how to do — more slices — and never closes anything.
 *
 * So the resolution now carries WHO owns it and WHY, and a host that
 * ends up with no owner is told at boot, in terms of the two options it
 * actually has. The configuration is still obeyed exactly as written:
 * this changes what is said, never what is done.
 */
export type { ISlicePersistenceOwner, ISlicePersistenceResolution };

export const resolveSlicePersistence = (input: {
	readonly configuredMode: IAutoWorkPersistMode | undefined;
	readonly commitPolicyOwnsSlices: boolean;
}): ISlicePersistenceResolution => {
	if (input.commitPolicyOwnsSlices) {
		return { mode: 'none', owner: 'commit-policy', lines: [] };
	}
	const mode = input.configuredMode ?? 'none';
	if (mode !== 'none') {
		return { mode, owner: 'proposals', lines: [] };
	}
	return {
		mode,
		owner: 'nobody',
		lines: [
			'[mcp-vertex] No component commits finished slices: `commit-policy` is not persisting them (absent, or `commit.enabled` false / no slice trigger) and `proposals.persist.mode` is unset or "none".',
			'[mcp-vertex] Slices will complete and their work will stay uncommitted, so no proposal can produce the `shipped-in` SHA its closing gate requires. Either enable `plugins.commit-policy.options.commit` with a slice trigger, or set `plugins.proposals.options.persist.mode` to "commit" (or "commit-and-push"). If you commit by hand, this is expected.',
		],
	};
};

/** Write the notice. Never throws. */
export const announceSlicePersistence = (
	resolution: ISlicePersistenceResolution,
	write?: (line: string) => void,
): void => {
	announceLines(resolution.lines, write);
};
