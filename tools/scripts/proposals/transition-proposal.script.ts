#!/usr/bin/env bun
/**
 * CLI counterpart to the `proposal_transition` MCP tool.
 *
 * The MCP host loads the proposals plugin once and keeps it in memory, so
 * a fix to the transition gates does not reach the live tools until the
 * host restarts. That is fine for a human who can restart it and fatal
 * for an agent that cannot: it keeps being refused by code that no
 * longer exists on disk, with no way to tell that from a real blocker.
 *
 * This runs the SAME `runProposalTransition` against the SAME on-disk
 * layout, just loaded fresh. It is not a bypass — every gate
 * (validate evidence, peer review, shipped-in, slice completeness,
 * dependents) applies exactly as it does through the tool. It is the
 * same door, opened from the terminal.
 *
 * Usage:
 *   bun tools/scripts/proposals/transition-proposal.script.ts <id> <to> [reason...]
 *
 * Exit codes:
 *   0 — the transition applied (or was an idempotent replay).
 *   1 — a gate refused it; the refusal envelope is printed verbatim so
 *       the `nextAction` is readable.
 *   2 — bad invocation.
 */
import { resolve } from 'node:path';

import { buildSwarmPaths } from '../../../plugins/proposals/src/lib/contracts/constants/default-path-layout.constant';
import { runProposalTransition } from '../../../plugins/proposals/src/lib/tools/proposal-transition.tool';

const CACHE_DIR = '.cache/mcp-vertex';
const DOCS_DIR = 'docs/mcp-vertex';

export interface ITransitionCliArgs {
	readonly id: string;
	readonly to: string;
	readonly reason: string;
}

/** Pure: split argv into the three fields the tool needs. */
export const parseTransitionArgs = (
	argv: readonly string[],
): ITransitionCliArgs | null => {
	const [id, to, ...rest] = argv;
	if (
		id === undefined ||
		to === undefined ||
		id.trim() === '' ||
		to.trim() === ''
	) {
		return null;
	}
	const reason = rest.join(' ').trim();
	return {
		id: id.trim(),
		to: to.trim(),
		reason: reason === '' ? 'closing via the transition CLI' : reason,
	};
};

/**
 * The option bag the plugin builds at register time, rebuilt here from
 * the same layout helper so the two cannot drift apart.
 */
export const buildTransitionOptions = (workspaceRoot: string) => {
	const layout = buildSwarmPaths(CACHE_DIR, DOCS_DIR);
	const abs = (relativePath: string): string =>
		resolve(workspaceRoot, relativePath);
	return {
		namespacePrefix: 'mcp-vertex',
		workspaceRoot,
		proposalsDirAbs: abs(layout.proposalsDir),
		indexPathAbs: abs(layout.proposalIndexFile),
		lockPathAbs: abs(layout.lockFile),
		peerReviewLogPathAbs: abs(layout.peerReviewLogFile),
		requirePeerReview: true,
		requireValidateEvidence: true,
	};
};

const main = async (argv: readonly string[]): Promise<number> => {
	const args = parseTransitionArgs(argv);
	if (args === null) {
		process.stderr.write(
			'usage: transition-proposal.script.ts <id> <to> [reason...]\n',
		);
		return 2;
	}
	const result = await runProposalTransition(
		{ id: args.id, to: args.to, reason: args.reason } as never,
		buildTransitionOptions(process.cwd()) as never,
	);
	const text = result.content?.[0]?.text ?? JSON.stringify(result);
	process.stdout.write(`${text}\n`);
	return result.isError === true ? 1 : 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
