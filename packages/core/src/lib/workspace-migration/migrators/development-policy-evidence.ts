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

/** Which forge the origin remote points at, as far as its host tells us. */
const forgeOf = (remoteUrl: string | undefined): IForgeKind => {
	if (remoteUrl === undefined) return 'none';
	const host = remoteUrl.toLowerCase();
	if (host.includes('github.com')) return 'github';
	// Self-hosted GitLab is the common case and rarely says "gitlab.com",
	// so the marker is the word anywhere in the host or path.
	if (host.includes('gitlab')) return 'gitlab';
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
		const answer = stdout.trim();
		return answer === 'true'
			? true
			: answer === 'false'
				? false
				: undefined;
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
	const forge = forgeOf(remote);
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
