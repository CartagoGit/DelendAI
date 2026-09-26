#!/usr/bin/env bun
/**
 * pr-head-shape.script.ts — a pull request is opened from a publication
 * ref with the project's shape (f00644).
 *
 * The git guard judges refs where git runs; a pull request can be opened
 * from any branch the forge holds, by any host, hooks or not. On
 * 2026-09-26 reviewers opened pull requests straight from work refs named
 * `minimax-m3-review-20260926/x00558-review-g1/review` — no publication,
 * the task typed into the agent. This check runs in CI on every pull
 * request, whatever opened it, with core's parser for the project's own
 * template.
 */
import { compileWorkRefParser } from '@delendai/core/lib/startup-reconciler/work-ref-identity';
import { kindsInAgentId } from '@delendai/core/lib/development-policy/work-ref-placeholders';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/monorepo-paths';

const shortRef = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** Why `head` is not a well-shaped publication ref, or `undefined`. */
export const prHeadProblem = (
	head: string,
	branches: {
		readonly workRefTemplate: string;
		readonly workRefPrefix: string;
		readonly publicationRefPrefix: string;
	},
): string | undefined => {
	const publication = shortRef(branches.publicationRefPrefix);
	const work = shortRef(branches.workRefPrefix);
	if (publication === '' || branches.workRefTemplate === '') return undefined;
	if (!head.startsWith(publication)) {
		return head.startsWith(work)
			? `\`${head}\` is a work ref: a pull request is opened from its publication, which \`delendai work publish\` creates and names.`
			: `\`${head}\` is outside \`${publication}\`: a pull request is opened from a publication ref, which \`delendai work publish\` creates and names.`;
	}
	// Strict about the separators; a publication written before the shape
	// named its kind is still in flight, and is read with its kind derived.
	const parser = compileWorkRefParser(
		branches.workRefTemplate,
		branches.workRefPrefix,
		{ strict: true, requireKind: false },
	);
	const identity = parser?.parse(
		`refs/heads/${work}${head.slice(publication.length)}`,
	);
	if (identity === undefined) {
		return `\`${head}\` does not have the shape of the work it publishes (\`${branches.workRefTemplate}\` under \`${publication}\`).`;
	}
	const kinds = kindsInAgentId(identity.agent);
	return kinds.length === 0
		? undefined
		: `\`${head}\` names its agent \`${identity.agent}\`, which spells the kind of work (${kinds.join(', ')}); the agent is the model, and the kind has its own segment.`;
};

const main = (): number => {
	const head = process.env.GITHUB_HEAD_REF ?? '';
	if (process.env.GITHUB_EVENT_NAME !== 'pull_request' || head === '') {
		console.log(
			'✓ pr-head-shape: NOT_APPLICABLE — not a pull request run, so there is no head to judge.',
		);
		return 0;
	}
	const problem = prHeadProblem(head, declaredBranches(repoRoot()));
	if (problem === undefined) {
		console.log(
			`✓ pr-head-shape: \`${head}\` is a well-shaped publication.`,
		);
		return 0;
	}
	console.error(`✖ pr-head-shape: ${problem}`);
	return 1;
};

if (import.meta.main) process.exit(main());
