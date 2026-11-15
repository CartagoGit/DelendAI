// effect-boundary-authorized: this is the forge adapter itself, run by the
// host server that holds the maintenance lease, not by a plugin tool;
// `IPluginEffectsCapability` declares only `git`, and the `gh` runner is an
// injected seam its spec replaces. Every call it makes is a read.
/**
 * catch-up-source.service.ts — GitHub's half of the host's catch-up: one
 * `gh` read of each subscribed pull request (its state, head and labels),
 * and one of its required checks, answered as forge-neutral events. It
 * writes nothing to the forge.
 */

import type {
	IForgeCatchUpEvent,
	IForgeCatchUpSource,
	IForgeCatchUpTarget,
} from '@delendai/core/runtime';
import type {
	IGitHubCatchUpInput,
	IGitHubCatchUpRun,
} from './contracts/interfaces/catch-up-source.interface';

const FAILED_BUCKETS: ReadonlySet<string> = new Set(['fail', 'cancel']);

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const names = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.flatMap((entry: unknown) =>
				isRecord(entry) && typeof entry.name === 'string'
					? [entry.name]
					: [],
			)
		: [];

const read = async (
	run: IGitHubCatchUpRun,
	args: readonly string[],
): Promise<unknown> => parseJson((await run(args)).stdout);

const eventsOf = async (
	input: IGitHubCatchUpInput,
	target: IForgeCatchUpTarget,
): Promise<readonly IForgeCatchUpEvent[]> => {
	const number = String(target.number);
	const view = await read(input.run, [
		'pr',
		'view',
		number,
		'--repo',
		target.repository,
		'--json',
		'state,headRefOid,labels',
	]);
	if (!isRecord(view)) return [];
	const base = { repository: target.repository, number: target.number };
	const sha =
		typeof view.headRefOid === 'string' ? view.headRefOid : undefined;
	const events: IForgeCatchUpEvent[] = [];
	if (view.state === 'MERGED')
		events.push({ ...base, kind: 'pr.merged', sha });
	if (view.state === 'CLOSED')
		events.push({ ...base, kind: 'pr.closed', sha });
	if (view.state !== 'OPEN') return events;
	for (const label of names(view.labels))
		if (input.labels.includes(label))
			events.push({
				...base,
				kind: 'pr.updated',
				change: 'labelled',
				label,
				sha,
			});
	// `gh pr checks` exits non-zero while a check fails; what it printed still counts.
	const checks = await read(input.run, [
		'pr',
		'checks',
		number,
		'--repo',
		target.repository,
		'--required',
		'--json',
		'name,bucket',
	]);
	if (Array.isArray(checks))
		for (const check of checks)
			if (
				isRecord(check) &&
				typeof check.name === 'string' &&
				typeof check.bucket === 'string' &&
				FAILED_BUCKETS.has(check.bucket)
			)
				events.push({
					...base,
					kind: 'check.completed',
					check: check.name,
					conclusion:
						check.bucket === 'cancel' ? 'cancelled' : 'failure',
					sha,
				});
	return events;
};

export const createGitHubCatchUpSource = (
	input: IGitHubCatchUpInput,
): IForgeCatchUpSource => ({
	missed: async (targets) => {
		const events: IForgeCatchUpEvent[] = [];
		for (const target of targets) {
			try {
				events.push(...(await eventsOf(input, target)));
			} catch {
				// One pull request that cannot be read must not hide the others.
			}
		}
		return events;
	},
});
