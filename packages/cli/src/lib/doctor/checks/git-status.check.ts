/**
 * doctor/checks/git-status.check.ts — f00191 / q00006 Track I.
 *
 * Warns (does NOT fail) when the working tree is dirty. A clean
 * tree is a CI pre-condition, not a runtime one — agents routinely
 * run with in-flight slices — so we keep this strictly warn-only and
 * keep the `mcpv doctor` exit code at zero.
 */
import type { DoctorCheck, IDoctorFs } from '../types';

export interface IGitStatusProbe {
	/**
	 * Returns one of: `clean` | `dirty` | `no-git`.
	 * Implementations: spawn `git status --porcelain` (production),
	 * or short-circuit on the `git-ok` flag (tests).
	 */
	readonly status: () => Promise<'clean' | 'dirty' | 'no-git'>;
}

/** The default probe: spawns `git status --porcelain`. */
export const defaultGitProbe: IGitStatusProbe = {
	status: async () => {
		try {
			const proc = Bun.spawn(['git', 'status', '--porcelain'], {
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const exit = await proc.exited;
			if (exit !== 0) return 'no-git';
			const stdout = proc.stdout;
			if (stdout === undefined || typeof stdout === 'number') {
				return 'no-git';
			}
			const out = await new Response(stdout).text();
			return out.trim().length === 0 ? 'clean' : 'dirty';
		} catch {
			return 'no-git';
		}
	},
};

export const checkGitStatus = (
	probe: IGitStatusProbe = defaultGitProbe,
): DoctorCheck => {
	return async (_ctx: Parameters<DoctorCheck>[0]) => {
		const status = await probe.status();
		if (status === 'no-git') {
			return {
				name: 'git-status',
				status: 'ok',
				findings: ['not a git repository — skipping'],
			};
		}
		if (status === 'clean') {
			return {
				name: 'git-status',
				status: 'ok',
				findings: ['working tree clean'],
			};
		}
		// dirty — warn, never error.
		return {
			name: 'git-status',
			status: 'warn',
			findings: [
				'working tree has uncommitted changes — commit before slicing to keep the lock clean',
			],
		};
	};
};

/** Allow the test to inject a probe without crossing the fs boundary. */
export const _testing = { checkGitStatus };

// Re-export so call sites in the doctor group file only import this
// module, not the fs type directly.
export type { IDoctorFs };
