/**
 * land-rehearsal-clone.ts — a rehearsal builds its batch in a clone of its
 * own, thrown away after, so the clone it is run from gains no ref and no
 * worktree.
 *
 * The rehearsal used to assemble in the clone it ran in: every run that
 * died before its cleanup left a `train/<sha>/1` branch and a registered
 * scratch worktree in the shared checkout. A `--shared` clone borrows the
 * objects (nothing is copied) and keeps its refs and worktrees to itself.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

/** A throwaway clone of `root` whose branches `rehearsal/<n>` are `heads`, in order. */
export const throwawayClone = (
	root: string,
	heads: readonly string[],
): { readonly dir: string; dispose(): void } => {
	const dir = mkdtempSync(join(tmpdir(), 'delendai-rehearsal-'));
	try {
		git(root, ['clone', '-q', '--shared', '--no-checkout', root, dir]);
		heads.forEach((sha, index) => {
			git(dir, [
				'update-ref',
				`refs/heads/rehearsal/${String(index + 1)}`,
				sha,
			]);
		});
	} catch (error) {
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
	return {
		dir,
		dispose: () => {
			rmSync(dir, { recursive: true, force: true });
		},
	};
};
