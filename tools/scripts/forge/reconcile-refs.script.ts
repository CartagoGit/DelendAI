#!/usr/bin/env bun
/**
 * reconcile-refs.script.ts — one reconciler pass against the real forge.
 *
 *   bun tools/scripts/forge/reconcile-refs.script.ts [--apply] [--trigger=<event>]
 *
 * The forge-side adapter of `RefReconcilerService`: it maps `IRefForge`
 * onto `gh` and `git`, reusing the helpers `ref-lifecycle-guard` already
 * exports (containment, retiring a tip, deleting a branch), so the rule
 * that says what may go is the core classifier's and the way it goes is
 * the guard's. A tip that could not be kept is never deleted: its
 * deletion is skipped and the next pass tries again.
 *
 * Without `--apply` it reports what it would do and changes nothing.
 */
import { execFileSync } from 'node:child_process';

import { REPOSITORY_SLUG } from '@delendai/core/lib/contracts/constants/repository-identity.constant';
import type { IPolicyBranches } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';
import type {
	IReconcileAction,
	IRefForge,
	IRefSnapshot,
} from '@delendai/core/lib/contracts/interfaces/ref-reconciler.interface';
import { branchesForRef } from '@delendai/core/lib/development-policy/owned-work-ref-parser';
import {
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	retiredMachineryPrefixes,
	shortName as shortRef,
} from '@delendai/core/lib/integration/decisions/namespaces.helper';
import type {
	IObservedPullRequest,
	IObservedRef,
} from '@delendai/core/lib/ref-lifecycle/reconcile.interface';
import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';
import { RefReconcilerService } from '@delendai/core/lib/ref-reconciler/reconciler.service';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/monorepo-paths';
import {
	closedPublicationRetirement,
	deleteForgeBranch,
	holdsNothingOfItsOwn,
	ownedUnitReader,
	publishedInFor,
	retireOnForge,
	type IBranchTip,
	type ICommandRunner,
} from '../lint/ref-lifecycle-guard.script';
import {
	inProgressOrUnknown,
	keepInProgressWorkRefs,
} from '../lint/in-progress-work-refs.helper';

/** What the adapter reads and does; the real ones are below, a spec injects fakes. */
export interface IForgeRefsDeps {
	readonly observed: () => readonly IBranchTip[];
	readonly pullRequests: () => readonly IObservedPullRequest[];
	/** Whether `base` contains `head`. */
	readonly contains: (base: string, head: string) => boolean;
	/** Whether proposal `id` is in progress in the tree of `sha`. */
	readonly inProgressAt: (id: string, sha: string) => boolean;
	readonly run: ICommandRunner;
	readonly now: () => number;
	/** Where a line for the operator goes. */
	readonly report: (line: string) => void;
}

/** `IRefForge` over gh and git. */
export class GitForgeRefs implements IRefForge {
	private onForge: ReadonlySet<string> = new Set();
	private readonly notKept = new Set<string>();

	constructor(
		private readonly branches: IPolicyBranches,
		private readonly deps: IForgeRefsDeps,
		private readonly applying = true,
	) {}

	snapshot(): Promise<IRefSnapshot> {
		const { deps, branches } = this;
		const observed = deps.observed();
		this.onForge = new Set(observed.map((branch) => branch.name));
		const workPrefixes = ownedWorkRefPrefixes(branches)
			.map(shortRef)
			.filter((prefix) => prefix !== '');
		const publicationPrefixes = ownedPublicationRefPrefixes(branches)
			.map(shortRef)
			.filter((prefix) => prefix !== '');
		const under = (name: string, prefixes: readonly string[]): boolean =>
			prefixes.some((prefix) => name.startsWith(prefix));
		const containers = observed.filter(
			(branch) =>
				branch.name === branches.integration ||
				under(branch.name, publicationPrefixes),
		);
		const holders = observed
			.filter(
				(branch) =>
					branch.name === branches.integration ||
					under(branch.name, workPrefixes) ||
					under(branch.name, publicationPrefixes),
			)
			.map((branch) => branch.sha);
		const retiredPrefixes = retiredMachineryPrefixes(branches);
		const refs: IObservedRef[] = observed.map((branch) => {
			if (under(branch.name, retiredPrefixes)) {
				return {
					...branch,
					contained: holdsNothingOfItsOwn(branch.sha, holders),
				};
			}
			if (!under(branch.name, workPrefixes)) return branch;
			const publishedIn = publishedInFor(
				branch,
				containers,
				deps.contains,
			);
			return publishedIn === undefined
				? branch
				: { ...branch, publishedIn };
		});
		const pullRequests = deps.pullRequests();
		const now = deps.now();
		// A proposal in progress keeps its one work branch, whatever its
		// publication holds: its next slice is committed there.
		const readUnit = ownedUnitReader(branches);
		const shaOf = new Map(
			observed.map((branch) => [branch.name, branch.sha]),
		);
		const integration =
			shaOf.get(branches.integration) ?? branches.integration;
		const { kept } = keepInProgressWorkRefs({
			reapable: reconcileRefs(refs, pullRequests, branches, { now })
				.reapable,
			workPrefix: workPrefixes,
			idOf: (name) => readUnit(name)?.id,
			tipOf: (name) => shaOf.get(name),
			integration,
			landed: (sha) =>
				sha === integration || deps.contains(integration, sha),
			inProgressAt: deps.inProgressAt,
		});
		const keptNames = new Set(kept.map((verdict) => verdict.name));
		return Promise.resolve({
			units: [],
			refs: refs.map((ref) => {
				if (!keptNames.has(ref.name)) return ref;
				const { publishedIn: _published, ...rest } = ref;
				return rest;
			}),
			// A closed publication is retired only once its work branch has
			// left the forge: the author may still hold the unit.
			pullRequests: pullRequests.map((request) =>
				request.state === 'closed' &&
				closedPublicationRetirement(
					request.headRefName,
					branchesForRef(branches, request.headRefName),
					this.onForge,
				) === undefined
					? { ...request, closedAt: undefined }
					: request,
			),
			now,
		});
	}

	apply(action: IReconcileAction): Promise<void> {
		const { deps } = this;
		if (!this.applying) {
			deps.report(`would ${action.kind} ${action.ref}`);
			return Promise.resolve();
		}
		switch (action.kind) {
			case 'keep-tip': {
				// Keeps the tip under the retired namespace, then deletes the branch.
				const retiredRef = closedPublicationRetirement(
					action.ref,
					branchesForRef(this.branches, action.ref),
					this.onForge,
				);
				if (
					retiredRef === undefined ||
					!retireOnForge(action.ref, action.sha, retiredRef, deps.run)
				) {
					this.notKept.add(action.ref);
					deps.report(
						`could not keep the tip of ${action.ref}; kept as it is`,
					);
				} else {
					deps.report(
						`retired ${action.ref}, tip kept at ${retiredRef}`,
					);
				}
				return Promise.resolve();
			}
			case 'delete-forge-ref': {
				if (this.notKept.has(action.ref)) return Promise.resolve();
				const outcome = deleteForgeBranch(
					action.ref,
					(args) => {
						deps.run('gh', args);
					},
					(name) => {
						try {
							deps.run('gh', [
								'api',
								`repos/${REPOSITORY_SLUG}/git/ref/heads/${name}`,
								'--jq',
								'.object.sha',
							]);
							return true;
						} catch {
							return false;
						}
					},
				);
				deps.report(`${outcome} ${action.ref}`);
				return Promise.resolve();
			}
			default:
				// A unit's branch and worktree live in a clone, not on the forge.
				return Promise.reject(
					new Error(
						`${action.kind} is not a forge action (${action.ref})`,
					),
				);
		}
	}
}

const ghLines = (path: string, jq: string): readonly unknown[] =>
	execFileSync('gh', ['api', '--paginate', path, '--jq', jq], {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	})
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as unknown);

const runCommand: ICommandRunner = (file, args) =>
	execFileSync(file, [...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

const PROPOSALS_IN_PROGRESS = 'docs/delendai/proposals/in-progress';

/** The live deps: the forge through gh, ancestry through this clone. */
export const liveDeps = (): IForgeRefsDeps => ({
	observed: () =>
		(
			ghLines(
				`repos/${REPOSITORY_SLUG}/branches?per_page=100`,
				'.[] | {name, sha: .commit.sha}',
			) as readonly IBranchTip[]
		).slice(),
	pullRequests: () =>
		(
			ghLines(
				`repos/${REPOSITORY_SLUG}/pulls?state=all&per_page=100`,
				'.[] | {number, state, merged_at, closed_at, head: {ref: .head.ref, sha: .head.sha}}',
			) as readonly {
				readonly number: number;
				readonly state: string;
				readonly merged_at: string | null;
				readonly closed_at?: string | null;
				readonly head: { readonly ref: string; readonly sha: string };
			}[]
		).map((request) => {
			const closed = Date.parse(request.closed_at ?? '');
			return {
				number: request.number,
				headRefName: request.head.ref,
				headSha: request.head.sha,
				state:
					request.state === 'open'
						? 'open'
						: request.merged_at === null
							? 'closed'
							: 'merged',
				...(Number.isNaN(closed)
					? {}
					: { closedAt: Math.floor(closed / 1000) }),
			};
		}),
	contains: (base, head) => {
		try {
			runCommand('git', ['merge-base', '--is-ancestor', head, base]);
			return true;
		} catch {
			return false;
		}
	},
	// Cannot tell: the work ref is kept.
	inProgressAt: (id, sha) =>
		inProgressOrUnknown(id, () =>
			runCommand('gh', [
				'api',
				`repos/${REPOSITORY_SLUG}/contents/${PROPOSALS_IN_PROGRESS}?ref=${sha}`,
				'--jq',
				'.[].name',
			]).split('\n'),
		),
	run: runCommand,
	now: () => Math.floor(Date.now() / 1000),
	report: (line) => {
		console.log(`reconcile-refs: ${line}`);
	},
});

const main = async (): Promise<void> => {
	const branches = declaredBranches(repoRoot());
	const deps = liveDeps();
	const forge = new GitForgeRefs(
		branches,
		deps,
		process.argv.includes('--apply'),
	);
	const desired = await new RefReconcilerService(forge, branches).pass();
	for (const entry of desired.reported) {
		deps.report(`${entry.ref} — ${entry.reason}`);
	}
	deps.report(
		`${String(desired.actions.length)} action(s), ${String(desired.reported.length)} reported`,
	);
};

if (import.meta.main) {
	await main();
}
