/**
 * land-follow-ups.ts — this repository's workflows, read as the triggers
 * `followUpWorkflows` decides from: which start on a push to the
 * integration branch, which can be started on request, and which follow the
 * completion of other workflows.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ILandWorkflowTriggers } from '@delendai/core/cli';
import { parse } from 'yaml';

type IOn = Record<string, unknown> | string | readonly string[] | null;

const branchesOf = (event: unknown): readonly string[] | undefined => {
	if (event === null || typeof event !== 'object') return undefined;
	const branches = (event as { branches?: unknown }).branches;
	return Array.isArray(branches) ? branches.map(String) : undefined;
};

/** One workflow's triggers, from its YAML text. Pure. */
export const workflowTriggersOf = (
	file: string,
	text: string,
	integration: string,
): ILandWorkflowTriggers => {
	const on = (parse(text) as { on?: IOn } | null)?.on ?? null;
	const events: Record<string, unknown> =
		typeof on === 'string'
			? { [on]: null }
			: Array.isArray(on)
				? Object.fromEntries(on.map((name) => [String(name), null]))
				: ((on as Record<string, unknown> | null) ?? {});
	const push = Object.hasOwn(events, 'push');
	// A push with no branch filter starts on every branch, the integration
	// branch included.
	const pushBranches = branchesOf(events.push);
	const run = events.workflow_run as { workflows?: unknown } | undefined;
	return {
		file,
		pushesIntegration:
			push &&
			(pushBranches === undefined || pushBranches.includes(integration)),
		dispatchable: Object.hasOwn(events, 'workflow_dispatch'),
		afterWorkflows: Array.isArray(run?.workflows)
			? run.workflows.map(String)
			: [],
	};
};

/** Every workflow of `dir`, read as triggers. */
export const readWorkflowTriggers = (
	dir: string,
	integration: string,
): readonly ILandWorkflowTriggers[] =>
	readdirSync(dir)
		.filter((name) => /\.ya?ml$/u.test(name))
		.sort()
		.map((name) =>
			workflowTriggersOf(
				name,
				readFileSync(join(dir, name), 'utf8'),
				integration,
			),
		);
