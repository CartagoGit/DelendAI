/**
 * land-fake.ts — a forge and its git in memory, for the specs of `land`.
 *
 * A tree is a map from path to content. A pull request carries the files
 * it writes; a batch carries the whole tree it was built to. Merging
 * applies a change when it does not collide with what landed since the
 * change's base (a collision in a derived file refuses a forge merge, as a
 * text conflict does; only a batch resolves it by regenerating). Nothing
 * here is random or timed: a spec scripts CI results with `ci()`.
 */
import {
	footprintFromReach,
	LAND_LABEL_NEEDS_UPDATE,
	LAND_WORKFLOW_TOKEN_ACTOR,
	type ITrainCandidate,
} from '@delendai/core/cli';

import type {
	ILandBatchBuild,
	ILandCheck,
	ILandConflict,
	ILandForge,
	ILandGit,
	ILandMerge,
	ILandPullRequest,
} from '@delendai/core/cli';

export const FAKE_DERIVED = 'catalog.generated.md';
/** The person who pushes a pull request's head in the fake world. */
export const FAKE_AUTHOR = 'author';

interface IFakePullRequest {
	number: number;
	headRef: string;
	headSha: string;
	draft: boolean;
	state: 'open' | 'closed';
	merged: boolean;
	labels: string[];
	body: string;
	testedBase: string;
	/** Who pushed its head; the workflow token's heads are never built. */
	headAuthor: string;
	crossRepository?: boolean;
	comments: string[];
	/** The files a plain pull request writes. */
	change: Record<string, string>;
	/** A batch: the full tree and the tip it was built on. */
	batch?: {
		tree: Record<string, string>;
		base: string;
		members: { number: number; sha: string }[];
	};
}

const treeKey = (tree: Readonly<Record<string, string>>): string =>
	JSON.stringify(Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)));

const regenerate = (tree: Record<string, string>, path: string): void => {
	const authored = Object.keys(tree).filter((p) => p !== path);
	tree[path] = `gen:${authored.sort().join(',')}`;
};

export const createFakeWorld = (
	initial: Record<string, string> = {},
	options: {
		/** The project's section function: the section a path belongs to. */
		readonly sectionOf?: (path: string) => string;
		/** The derived file the project regenerates; none when it has none. */
		readonly derived?: string | undefined;
	} = {},
) => {
	const sectionOf =
		options.sectionOf ?? ((path: string) => path.split('/')[0] ?? path);
	const derivedPath = 'derived' in options ? options.derived : FAKE_DERIVED;
	let counter = 0;
	const sha = (): string => `c${String(++counter).padStart(11, '0')}`;
	const trees = new Map<string, Record<string, string>>();
	const log: { sha: string; files: string[] }[] = [];
	const root = sha();
	trees.set(root, { ...initial });
	log.push({ sha: root, files: [] });
	let tip = root;
	const pulls = new Map<number, IFakePullRequest>();
	const refs = new Map<
		string,
		{ sha: string; tree: Record<string, string>; base: string }
	>();
	const results = new Map<string, ILandCheck[]>();
	/** The heads the identity reopened: the forge builds them. */
	const reopened = new Set<string>();
	let next = 1;
	let mutations = 0;
	let crashAt = Number.POSITIVE_INFINITY;
	const world = {
		mergeCalls: [] as { number: number; sha: string }[],
		/** Called before every merge: a spec moves a head here. */
		beforeMerge: undefined as undefined | ((n: number) => void),
		/** Which check names fail for a batch of these members, per spec. */
		failBatch: (_members: readonly number[]): readonly string[] => [],
		failPull: (_n: number): readonly string[] => [],
		requiredNames: ['tests: a'],
		pulls,
		refs,
		get tip(): string {
			return tip;
		},
		tree: (): Record<string, string> => trees.get(tip) ?? {},
		/** Dies on the n-th mutating forge call from now (1 = the next). */
		crashOnMutation(n: number): void {
			mutations = 0;
			crashAt = n;
		},
		addPull(
			change: Record<string, string>,
			options: {
				base?: string;
				draft?: boolean;
				author?: string;
				crossRepository?: boolean;
			} = {},
		): number {
			const number = next++;
			pulls.set(number, {
				number,
				headRef: `delendai/pr/a/implement/x${String(number)}/work`,
				headSha: sha(),
				draft: options.draft ?? false,
				state: 'open',
				merged: false,
				labels: [],
				body: '',
				testedBase: options.base ?? tip,
				headAuthor: options.author ?? FAKE_AUTHOR,
				...(options.crossRepository === true
					? { crossRepository: true }
					: {}),
				comments: [],
				change,
			});
			return number;
		},
		/**
		 * The author's own update, as the host does it with the person's
		 * credentials: the tip merged into the pull request, a new head the
		 * forge builds, its label gone.
		 */
		bringForward(number: number): void {
			const pr = get(number);
			pr.headSha = sha();
			pr.testedBase = tip;
			pr.headAuthor = FAKE_AUTHOR;
			pr.labels = pr.labels.filter((l) => l !== LAND_LABEL_NEEDS_UPDATE);
		},
		/** An integration commit that is not a pull request (another push). */
		push(change: Record<string, string>): string {
			const tree = { ...world.tree(), ...change };
			const commit = sha();
			trees.set(commit, tree);
			log.push({ sha: commit, files: Object.keys(change) });
			tip = commit;
			return commit;
		},
		/** CI finishes for every head that has no result yet. */
		ci(): void {
			for (const pr of pulls.values()) {
				if (pr.state !== 'open' || results.has(pr.headSha)) continue;
				// The forge builds nothing the workflow token pushed, unless the
				// identity reopened the pull request on that head.
				if (
					pr.headAuthor === LAND_WORKFLOW_TOKEN_ACTOR &&
					!reopened.has(pr.headSha)
				)
					continue;
				const failing = pr.batch
					? world.failBatch(
							(
								JSON.parse(
									/^land-record: (\{.*\})$/mu.exec(
										pr.body,
									)?.[1] ?? '{"members":[]}',
								) as {
									members: { number: number }[];
								}
							).members.map((m) => m.number),
						)
					: world.failPull(pr.number);
				results.set(
					pr.headSha,
					world.requiredNames.map((name) => ({
						name,
						conclusion: failing.includes(name)
							? 'failure'
							: 'success',
						url: `https://forge.invalid/runs/${pr.headSha}`,
					})),
				);
			}
		},
		since: (base: string): { sha: string; files: string[] }[] => {
			const at = log.findIndex((entry) => entry.sha === base);
			return log.slice(at + 1);
		},
	};
	/** The workflows the integrator started, as `file@ref`, in order. */
	const dispatched: string[] = [];
	const mutate = (): void => {
		mutations += 1;
		if (mutations >= crashAt) throw new Error('crash');
	};
	const view = (pr: IFakePullRequest): ILandPullRequest => ({
		number: pr.number,
		headRef: pr.headRef,
		headSha: pr.headSha,
		draft: pr.draft,
		state: pr.state,
		merged: pr.merged,
		labels: [...pr.labels],
		body: pr.body,
		testedBase: pr.testedBase,
		headAuthor: pr.headAuthor,
		...(pr.crossRepository === true ? { crossRepository: true } : {}),
	});
	const get = (number: number): IFakePullRequest => {
		const pr = pulls.get(number);
		if (pr === undefined)
			throw new Error(`no pull request #${String(number)}`);
		return pr;
	};
	const collides = (
		change: Record<string, string>,
		base: string,
	): boolean => {
		const landed = new Set(
			world.since(base).flatMap((entry) => entry.files),
		);
		return Object.keys(change).some((path) => landed.has(path));
	};
	const forge: ILandForge = {
		integrationTip: async () => tip,
		requiredChecks: async () => world.requiredNames,
		openPullRequests: async () =>
			[...pulls.values()]
				.filter((pr) => pr.state === 'open' && pr.batch === undefined)
				.map(view),
		batchPullRequests: async (prefix) =>
			[...pulls.values()]
				.filter(
					(pr) =>
						pr.batch !== undefined && pr.headRef.startsWith(prefix),
				)
				.map(view),
		pullRequest: async (number) => view(get(number)),
		checks: async (head) => results.get(head) ?? [],
		merge: async (number, head): Promise<ILandMerge> => {
			mutate();
			world.mergeCalls.push({ number, sha: head });
			world.beforeMerge?.(number);
			const pr = get(number);
			if (pr.headSha !== head) return 'head-moved';
			if (pr.state !== 'open') return 'refused';
			const next = { ...world.tree() };
			if (pr.batch === undefined) {
				if (collides(pr.change, pr.testedBase)) return 'refused';
				Object.assign(next, pr.change);
				world.push(pr.change);
			} else {
				// The batch's own commits: what differs from the tip it was built on.
				const base = trees.get(pr.batch.base) ?? {};
				for (const member of pr.batch.members) {
					const m = pulls.get(member.number);
					if (m?.state === 'open' && m.headSha === member.sha) {
						m.state = 'closed';
						m.merged = true;
					}
				}
				const delta = Object.fromEntries(
					Object.entries(pr.batch.tree).filter(
						([p, v]) => base[p] !== v,
					),
				);
				world.push(delta);
			}
			pr.state = 'closed';
			pr.merged = true;
			return 'merged';
		},
		addLabel: async (number, label) => {
			mutate();
			const pr = get(number);
			if (!pr.labels.includes(label)) pr.labels.push(label);
		},
		removeLabel: async (number, label) => {
			mutate();
			const pr = get(number);
			pr.labels = pr.labels.filter((l) => l !== label);
		},
		comment: async (number, text) => {
			mutate();
			get(number).comments.push(text);
		},
		comments: async (number) => [...get(number).comments],
		openPullRequest: async ({ head, title: _title, body }) => {
			mutate();
			const ref = refs.get(head);
			if (ref === undefined) throw new Error(`no branch ${head}`);
			const number = next++;
			pulls.set(number, {
				number,
				headRef: head,
				headSha: ref.sha,
				draft: false,
				state: 'open',
				merged: false,
				labels: [],
				body,
				testedBase: ref.base,
				headAuthor: FAKE_AUTHOR,
				comments: [],
				change: {},
				batch: {
					tree: ref.tree,
					base: ref.base,
					members: (
						JSON.parse(
							/^land-record: (\{.*\})$/mu.exec(body)?.[1] ??
								'{"members":[]}',
						) as {
							members: { number: number; sha: string }[];
						}
					).members,
				},
			});
			return number;
		},
		updatePullRequest: async (number, body) => {
			mutate();
			get(number).body = body;
		},
		closePullRequest: async (number) => {
			mutate();
			get(number).state = 'closed';
		},
		reopenPullRequest: async (number, headSha) => {
			mutate();
			if (reopened.has(headSha)) return false;
			reopened.add(headSha);
			get(number).state = 'open';
			return true;
		},
		dispatchWorkflow: async (workflow, ref, inputs) => {
			mutate();
			dispatched.push(
				`${workflow}@${ref}${inputs === undefined ? '' : ` ${JSON.stringify(inputs)}`}`,
			);
			return true;
		},
	};
	const footprintOf = (files: readonly string[]) =>
		footprintFromReach({
			files: new Set(files),
			reach: {
				zones: new Set(files.map(sectionOf)),
				readOnly: new Set(),
			},
			creates: false,
		});
	const conflictAgainst = (
		change: Record<string, string>,
		base: string,
	): ILandConflict => {
		const landed = new Set(
			world.since(base).flatMap((entry) => entry.files),
		);
		const hit = Object.keys(change).filter((p) => landed.has(p));
		if (hit.length === 0) return 'none';
		return hit.every((p) => p === derivedPath) ? 'derived' : 'authored';
	};
	const git: ILandGit = {
		footprint: (pr) => footprintOf(Object.keys(get(pr.number).change)),
		landedSince: (base, at) => {
			// A batch head is not on the integration log: what it changed is
			// the difference of its tree from the tree it was built on.
			const batch = [...refs.values()].find((ref) => ref.sha === at);
			if (batch === undefined)
				return footprintOf(
					world.since(base).flatMap((entry) => entry.files),
				);
			const before = trees.get(base) ?? {};
			return footprintOf(
				Object.entries(batch.tree)
					.filter(([path, value]) => before[path] !== value)
					.map(([path]) => path),
			);
		},
		conflictOf: (pr, at) => {
			void at;
			return conflictAgainst(get(pr.number).change, pr.testedBase);
		},
		buildBatch: ({
			ref,
			tip: at,
			members,
		}: {
			ref: string;
			tip: string;
			members: readonly ITrainCandidate[];
		}): ILandBatchBuild => {
			const tree = { ...(trees.get(at) ?? {}) };
			const touched = new Set<string>();
			const conflicting: number[] = [];
			let regenerated = false;
			for (const member of members) {
				const pr = get(member.number);
				const kind = conflictAgainst(pr.change, pr.testedBase);
				const clash = Object.keys(pr.change).some(
					(p) => p !== derivedPath && touched.has(p),
				);
				if (kind === 'authored' || clash) {
					conflicting.push(member.number);
					continue;
				}
				for (const [path, content] of Object.entries(pr.change)) {
					tree[path] = content;
					touched.add(path);
				}
				if (
					kind === 'derived' ||
					(derivedPath !== undefined && derivedPath in pr.change)
				)
					regenerated = true;
			}
			if (conflicting.length > 0)
				return { conflicting, regenerated: false };
			if (regenerated && derivedPath !== undefined)
				regenerate(tree, derivedPath);
			const head = sha();
			trees.set(head, tree);
			refs.set(ref, { sha: head, tree, base: at });
			return { conflicting, sha: head, regenerated };
		},
		treeOf: (head) => treeKey(trees.get(head) ?? {}),
		mergedTree: ({ tip: at, members }) => {
			const tree = { ...(trees.get(at) ?? {}) };
			for (const member of members) {
				const pr = get(member.number);
				if (conflictAgainst(pr.change, pr.testedBase) === 'authored')
					return undefined;
				Object.assign(tree, pr.change);
			}
			return treeKey(tree);
		},
		mergedFiles: ({ members }) => {
			const files = new Set<string>();
			for (const member of members) {
				const pr = get(member.number);
				if (conflictAgainst(pr.change, pr.testedBase) === 'authored')
					return undefined;
				for (const path of Object.keys(pr.change)) files.add(path);
			}
			return files;
		},
	};
	return { world, forge, git, dispatched };
};
