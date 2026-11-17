/**
 * land-git-process.helper.ts — how the integrator spawns git. Client-side
 * hooks (a hook manager's pre-push, a plain `.git/hooks` pre-commit) guard
 * people and agents; what the integrator produces is judged by the required
 * checks, so none of its merges, commits or pushes runs one.
 */
import { LAND_NO_HOOKS_ARGS } from '../contracts/constants/integration-pass.constant';

/** The arguments of one git call of the integrator, hooks off. */
export const landGitArgs = (args: readonly string[]): string[] => [
	...LAND_NO_HOOKS_ARGS,
	...args,
];

/** What a failed git call said: its stdout and stderr (a refusing hook speaks on either), else the error text. */
export const gitFailureText = (error: unknown): string => {
	const { stdout, stderr } = error as { stdout?: unknown; stderr?: unknown };
	const text = [stdout, stderr]
		.map((stream) =>
			typeof stream === 'string' || Buffer.isBuffer(stream)
				? String(stream).trim()
				: '',
		)
		.filter((part) => part.length > 0)
		.join('\n');
	return text.length > 0 ? text : String(error);
};
