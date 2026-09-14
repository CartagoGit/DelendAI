/**
 * development-policy-evidence.ts — read the workspace, answer the four
 * questions adoption asks, and never guess generously.
 *
 * Kept apart from the migrator because it is the only part that touches
 * git and the forge, and apart from `adopt.ts` because that module must
 * stay pure. The split is what lets the CHOICE be tested without a
 * repository and the READING be tested without a decision.
 *
 * Every probe fails to `undefined` rather than to a plausible value.
 * `canRequireChecks: undefined` means "nobody could find out", which
 * adoption treats as "cannot" — the opposite convention would hand a
 * project a policy demanding gates nobody can enforce, which is exactly
 * how this repository's own `main` branch became unmergeable.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
	IAdoptionEvidence,
	IForgeKind,
} from '../../development-policy/adopt';

import { parseRepositoryKey } from '../../startup-gate/environment-seam';

import type { IEvidenceInput } from './development-policy.interface';

export type { IEvidenceInput } from './development-policy.interface';

const run = promisify(execFile);

/** Trimmed stdout, or `undefined` when the command could not answer. */
const git = async (
	cwd: string,
	args: readonly string[],
): Promise<string | undefined> => {
	try {
		const { stdout } = await run('git', [...args], { cwd, timeout: 5_000 });
		const value = stdout.trim();
		return value === '' ? undefined : value;
	} catch {
		return undefined;
	}
};

/**
 * Which forge the origin remote points at, as far as its host tells us.
 *
 * This used to ask `remoteUrl.includes('github.com')` — a substring, not
 * a host, so it also matched `github.com.evil.example` and any path
 * segment somebody named that way
 * (`js/incomplete-url-substring-sanitization`). The classification
 * decides which governance a migrated workspace is given, so being
 * approximately right about it is worse than saying `other`.
 *
 * The parsing is NOT repeated here: `parseRepositoryKey` already reads
 * both shapes a git remote is written in and already curates the short
 * names, so this maps its answer onto the closed kind this migrator
 * speaks. Named `forgeKindOf`, not `forgeOf`, because the seam's own
 * `forgeOf` returns a free-form string and a shared name would hide
 * that difference at every call site.
 *
 * Exported for its spec: it is a pure function of one string.
 */
export const forgeKindOf = (remoteUrl: string | undefined): IForgeKind => {
	if (remoteUrl === undefined) return 'none';
	const key = parseRepositoryKey(remoteUrl);
	if (key === undefined) return 'other';
	if (key.forge === 'github') return 'github';
	// Self-hosted GitLab is the common case and rarely says "gitlab.com",
	// so the marker is the word anywhere in the host — deliberately
	// loose, and now loose about the host rather than about the URL.
	if (key.forge.includes('gitlab')) return 'gitlab';
	return 'other';
};

/**
 * Can this project REQUIRE a status check on a pull request?
 *
 * Deliberately answered only for GitHub, and only through an
 * already-authenticated `gh`. Anything else is `undefined`: no network
 * probe, no credential prompt, and no assumption that an absent answer
 * means yes.
 */
/**
 * What `gh api … .permissions.admin` said, as a tri-state.
 *
 * `undefined` is not "no": it is "the forge did not answer", which is
 * what an unauthenticated `gh`, a repository the token cannot see, or a
 * field that moved all produce. Collapsing it to `false` would tell a
 * migrating workspace it may not require checks when nobody asked.
 *
 * Exported for its spec: the tri-state is the whole content of this
 * function and the effect around it is one `gh` call.
 */
export const adminAnswerOf = (stdout: string): boolean | undefined => {
	const answer = stdout.trim();
	return answer === 'true' ? true : answer === 'false' ? false : undefined;
};

const canRequireChecks = async (
	cwd: string,
	forge: IForgeKind,
): Promise<boolean | undefined> => {
	if (forge !== 'github') return undefined;
	try {
		const { stdout } = await run(
			'gh',
			['api', 'repos/{owner}/{repo}', '--jq', '.permissions.admin'],
			{ cwd, timeout: 10_000 },
		);
		return adminAnswerOf(stdout);
	} catch {
		return undefined;
	}
};

/** Everything `proposeAdoption` needs, read from the workspace. */
export const gatherAdoptionEvidence = async (
	input: IEvidenceInput,
): Promise<IAdoptionEvidence> => {
	const cwd = input.workspaceRoot;
	const remote = await git(cwd, ['remote', 'get-url', 'origin']);
	const forge = forgeKindOf(remote);
	const branch = await git(cwd, [
		'symbolic-ref',
		'--quiet',
		'--short',
		'HEAD',
	]);
	const branches = await git(cwd, [
		'for-each-ref',
		'--format=%(refname:short)',
		'refs/heads',
	]);

	return {
		hasDevelopmentBlock: input.hasDevelopmentBlock,
		forge,
		...(input.agentWorktree === undefined
			? {}
			: { agentWorktree: input.agentWorktree }),
		...(branch === undefined ? {} : { currentBranch: branch }),
		...(branches === undefined
			? {}
			: { existingBranches: branches.split('\n') }),
		...(await canRequireChecks(cwd, forge).then((can) =>
			can === undefined ? {} : { canRequireChecks: can },
		)),
	};
};
