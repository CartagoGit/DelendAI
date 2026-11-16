// effect-boundary-authorized: read-only existence probe of the paths a proposal declares, as the completeness guard does.
/**
 * Guards the move to `ready`: a proposal is ready only when nothing is
 * left to work out. The rules are the ones the `proposal-readiness` lint
 * applies to the tree, from the same function.
 */
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IReadyGuard } from '../contracts/interfaces/ready-guard.interface';
import {
	checkProposalReadiness,
	describeReadinessFinding,
	readinessPaths,
} from '../proposals/proposal-readiness';

/** How many findings a refusal names before it summarises the rest. */
const NAMED = 5;

const probe = async (root: string, path: string): Promise<boolean> =>
	stat(resolve(root, path)).then(
		() => true,
		() => false,
	);

export const guardTransitionToReady = async (input: {
	readonly markdown: string;
	readonly workspaceRoot: string;
}): Promise<IReadyGuard> => {
	const present = new Set<string>();
	await Promise.all(
		readinessPaths(input.markdown).map(async (path) => {
			if (await probe(input.workspaceRoot, path)) present.add(path);
		}),
	);
	const findings = checkProposalReadiness(input.markdown, {
		exists: (path) => present.has(path),
		newMustBeAbsent: true,
	});
	if (findings.length === 0) return { ok: true };
	const named = findings.slice(0, NAMED).map(describeReadinessFinding);
	const more = findings.length - named.length;
	return {
		ok: false,
		reason: `not ready, ${String(findings.length)} thing(s) left to work out: ${named.join('; ')}${more > 0 ? `; and ${String(more)} more` : ''}.`,
	};
};
