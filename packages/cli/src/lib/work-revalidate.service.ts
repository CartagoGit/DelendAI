/**
 * work-revalidate.service.ts — `work revalidate`: which shipped proposals
 * sent back for fresh evidence the batch re-validates.
 *
 * A ready proposal whose every live slice carries `shipped-in` and whose
 * review-state is `changes_requested` only needs fresh evidence, not new
 * code. The selection is a pure function over the parsed proposals; the
 * command prints what it chose before it changes anything.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import {
	IN_PROGRESS_PROPOSALS_DIR,
	READY_PROPOSALS_DIR,
} from '../contracts/constants/work-revalidate.constant';
import type {
	IRevalidateOutcome,
	IRevalidateProposal,
	IRevalidateRefusal,
	IRevalidateSelection,
	IRevalidateSlice,
	IWorkRevalidatePorts,
} from '../contracts/interfaces/work-revalidate.interface';
import { refusalOf } from './work-deliver.service';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';

const NOT_LIVE = new Set(['retired', 'dropped']);

const isLive = (slice: IRevalidateSlice): boolean =>
	!NOT_LIVE.has(slice.status.toLowerCase());

/** Why `proposal` is not for revalidation; undefined when it is. */
export const revalidateRefusalOf = (
	proposal: IRevalidateProposal,
	held: ReadonlySet<string> = new Set(),
): string | undefined => {
	if (proposal.stage !== 'ready' && proposal.stage !== 'in-progress') {
		return `it is in ${proposal.stage}, not ready or in-progress`;
	}
	// An in-progress proposal's delivery is judged by the hand-over's own
	// preflight, from commits: its slice lines may still say pending.
	if (proposal.stage === 'in-progress') {
		return held.has(proposal.id) ? 'a live unit holds it' : undefined;
	}
	const live = proposal.slices.filter(isLive);
	if (live.length === 0) return 'it has no live slice';
	const unshipped = live.find((slice) => slice.shippedIn === undefined);
	if (unshipped !== undefined) {
		return `slice ${unshipped.id} has no shipped-in`;
	}
	const other = live.find(
		(slice) => slice.reviewState !== 'changes_requested',
	);
	if (other !== undefined) {
		return `slice ${other.id} review-state is ${other.reviewState ?? 'unset'}, not changes_requested`;
	}
	return undefined;
};

/**
 * The proposals to re-validate. Without `named` every proposal that
 * satisfies the predicate; with it exactly those ids, each still checked,
 * a refused one reported with its reason and left out.
 */
export const selectRevalidation = (
	proposals: readonly IRevalidateProposal[],
	named?: readonly string[],
	held: ReadonlySet<string> = new Set(),
): IRevalidateSelection => {
	if (named === undefined) {
		const refused: IRevalidateRefusal[] = [];
		const chosen: string[] = [];
		for (const proposal of proposals) {
			const reason = revalidateRefusalOf(proposal, held);
			if (reason === undefined) chosen.push(proposal.id);
			else if (proposal.stage === 'in-progress') {
				refused.push({ id: proposal.id, reason });
			}
		}
		return { chosen, refused };
	}
	const chosen: string[] = [];
	const refused: IRevalidateRefusal[] = [];
	for (const id of named) {
		const proposal = proposals.find((candidate) => candidate.id === id);
		const reason =
			proposal === undefined
				? 'no such proposal'
				: revalidateRefusalOf(proposal, held);
		if (reason === undefined) chosen.push(id);
		else refused.push({ id, reason });
	}
	return { chosen, refused };
};

const FIELD =
	/^- (shipped-in|review-state|\*\*Status\*\*|\*\*Files\*\*):\s*(.*)$/;

/** The backticked paths of a Files line's value. */
const declaredPathsOf = (value: string): readonly string[] =>
	[...value.matchAll(/`([^`]+)`/g)].flatMap((match) => match[1] ?? []);

/** `text` with `from` replaced by `to` in slice `sliceId`'s Files line; undefined when it is not there. */
export const rewriteDeclaredPath = (
	text: string,
	sliceId: string,
	from: string,
	to: string,
): string | undefined => {
	const lines = text.split('\n');
	let inSlice = false;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const heading = /^#{2,3} (\S+)/.exec(line);
		if (heading !== null)
			inSlice = line.startsWith('### ') && heading[1] === sliceId;
		if (!inSlice || !/^- \*\*Files\*\*:/.test(line)) continue;
		const next = line.split(`\`${from}\``).join(`\`${to}\``);
		if (next === line) return undefined;
		lines[index] = next;
		return lines.join('\n');
	}
	return undefined;
};

const unquote = (value: string): string =>
	value.trim().replace(/^`(.*)`$/, '$1');

/** The proposal in `text`: its id and its slices' facts. */
export const parseRevalidateProposal = (
	text: string,
	stage: string,
	file?: string,
): IRevalidateProposal | undefined => {
	const id = /^id:\s*(\S+)\s*$/m.exec(text)?.[1];
	if (id === undefined) return undefined;
	const slices: {
		id: string;
		status: string;
		shippedIn?: string;
		reviewState?: string;
		files?: readonly string[];
	}[] = [];
	let inSlices = false;
	for (const line of text.split('\n')) {
		if (line.startsWith('## ')) {
			inSlices = line.slice(3).trim().toLowerCase() === 'slices';
			continue;
		}
		if (!inSlices) continue;
		const heading = /^### (\S+)/.exec(line);
		if (heading?.[1] !== undefined) {
			slices.push({ id: heading[1], status: 'pending' });
			continue;
		}
		const slice = slices.at(-1);
		const field = FIELD.exec(line);
		if (slice === undefined || field?.[1] === undefined) continue;
		const value = unquote(field[2] ?? '');
		if (field[1] === '**Files**') {
			slice.files = declaredPathsOf(field[2] ?? '');
		} else if (field[1] === 'shipped-in') {
			if (value !== '') slice.shippedIn = value;
		} else if (field[1] === 'review-state') {
			slice.reviewState = value;
		} else slice.status = value;
	}
	return {
		id,
		stage,
		slices: slices.map((slice) => ({
			id: slice.id,
			status: slice.status,
			shippedIn: slice.shippedIn,
			reviewState: slice.reviewState,
			files: slice.files,
		})),
		...(file === undefined ? {} : { file }),
	};
};

const markdownFilesOf = async (dir: string): Promise<readonly string[]> => {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const nested = await Promise.all(
		entries.map(async (entry) =>
			entry.isDirectory()
				? markdownFilesOf(join(dir, entry.name))
				: entry.name.endsWith('.md')
					? [join(dir, entry.name)]
					: [],
		),
	);
	return nested.flat();
};

const readStage = async (
	root: string,
	dir: string,
	stage: string,
): Promise<readonly IRevalidateProposal[]> => {
	const files = await markdownFilesOf(join(root, dir));
	const parsed = await Promise.all(
		files.map(async (file) =>
			parseRevalidateProposal(
				await readFile(file, 'utf8'),
				stage,
				relative(root, file),
			),
		),
	);
	return parsed.filter(
		(proposal): proposal is IRevalidateProposal => proposal !== undefined,
	);
};

/** The ready proposals of the project at `root`. */
export const readReadyProposals = (
	root: string,
): Promise<readonly IRevalidateProposal[]> =>
	readStage(root, READY_PROPOSALS_DIR, 'ready');

/** The ready and the in-progress proposals of the project at `root`. */
export const readRevalidationProposals = async (
	root: string,
): Promise<readonly IRevalidateProposal[]> => [
	...(await readReadyProposals(root)),
	...(await readStage(root, IN_PROGRESS_PROPOSALS_DIR, 'in-progress')),
];

/** `--proposals=a,b` as ids; undefined when the flag is absent. */
export const namedProposalsOf = (
	value: string | undefined,
): readonly string[] | undefined =>
	value === undefined
		? undefined
		: value
				.split(',')
				.map((id) => id.trim())
				.filter((id) => id !== '');

/** A declared path git followed through a rename that still exists. */
interface IRenamedPath {
	readonly sliceId: string;
	readonly from: string;
	readonly to: string;
}

/** What the declared files of one proposal need before it moves. */
type IFilesVerdict =
	| { readonly kind: 'ok'; readonly renames: readonly IRenamedPath[] }
	| {
			readonly kind: 'retire';
			readonly renames: readonly IRenamedPath[];
			readonly by: string;
			readonly commits: readonly string[];
	  }
	| { readonly kind: 'leave'; readonly lines: readonly string[] };

const PROPOSAL_ID = /\b[a-z]\d{5}\b/g;

/** One git answer's non-empty lines, none when git refused. */
const linesOf = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	args: readonly string[],
): readonly string[] => {
	const answer = ports.git(worktree, args);
	return answer.ok
		? answer.out.split('\n').filter((line) => line.trim() !== '')
		: [];
};

/** The commit (`sha<TAB>subject`) that removed `path` from the branch, when any. */
const removalOf = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	path: string,
): { readonly sha: string; readonly subject: string } | undefined => {
	const [header] = linesOf(ports, worktree, [
		'log',
		'--diff-filter=D',
		'-1',
		'--format=%H%x09%s',
		'--',
		path,
	]);
	if (header === undefined) return undefined;
	const [sha = '', ...subject] = header.split('\t');
	return { sha, subject: subject.join('\t') };
};

/**
 * Where a commit that removed `path` moved it: git pairs a rename only in
 * the commit's whole diff, never under a pathspec that names the old path.
 */
const renamedBy = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	sha: string,
	path: string,
): string | undefined =>
	linesOf(ports, worktree, ['show', '-M', '--name-status', '--format=', sha])
		.map((line) => line.split('\t'))
		.find((cells) => cells[0]?.startsWith('R') && cells[1] === path)?.[2];

/** The subject of the merge that brought `sha` into the branch, when it has one. */
const mergeSubjectOf = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	sha: string,
): string => {
	// The first-parent merges after `sha`, oldest first: once one contains
	// the commit every later one does, so the first is found by bisection.
	const merges = linesOf(ports, worktree, [
		'rev-list',
		'--first-parent',
		'--merges',
		'--reverse',
		`${sha}..HEAD`,
	]);
	let low = 0;
	let high = merges.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const contains = ports.git(worktree, [
			'merge-base',
			'--is-ancestor',
			sha,
			merges[middle] ?? '',
		]).ok;
		if (contains) high = middle;
		else low = middle + 1;
	}
	const first = merges[low];
	if (first === undefined) return '';
	return linesOf(ports, worktree, ['log', '-1', '--format=%s', first]).join(
		' ',
	);
};

/** What became of a declared path that is gone. */
type IPathFate =
	| { readonly kind: 'moved'; readonly to: string }
	| {
			readonly kind: 'deleted';
			readonly sha: string;
			readonly ids: readonly string[];
	  }
	| { readonly kind: 'unknown' };

const MAX_HOPS = 10;

/** Follow `path` through the renames that removed it until it exists, was deleted, or is unknown. */
const fateOf = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	path: string,
): IPathFate => {
	let current = path;
	for (let hop = 0; hop < MAX_HOPS; hop += 1) {
		const removal = removalOf(ports, worktree, current);
		if (removal === undefined) return { kind: 'unknown' };
		const target = renamedBy(ports, worktree, removal.sha, current);
		if (target === undefined) {
			const own = removal.subject.match(PROPOSAL_ID) ?? [];
			const ids =
				own.length > 0
					? own
					: (mergeSubjectOf(ports, worktree, removal.sha).match(
							PROPOSAL_ID,
						) ?? []);
			return {
				kind: 'deleted',
				sha: removal.sha.slice(0, 9),
				ids: [...new Set(ids)],
			};
		}
		if (ports.exists(worktree, target))
			return { kind: 'moved', to: target };
		current = target;
	}
	return { kind: 'unknown' };
};

/**
 * Judge the declared files of `proposal` in the batch's unit: a missing
 * path git followed through a rename is rewritten; when every other
 * missing path was deleted by commits naming one proposal id, the
 * proposal is retired under that id; anything else is left out and named.
 */
const judgeFiles = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	proposal: IRevalidateProposal,
): IFilesVerdict => {
	const renames: IRenamedPath[] = [];
	const deleted: { path: string; sha: string; ids: readonly string[] }[] = [];
	const unknown: string[] = [];
	for (const slice of proposal.slices.filter(isLive)) {
		for (const path of slice.files ?? []) {
			if (path.includes('*') || ports.exists(worktree, path)) continue;
			const fate = fateOf(ports, worktree, path);
			if (fate.kind === 'moved') {
				renames.push({ sliceId: slice.id, from: path, to: fate.to });
			} else if (fate.kind === 'deleted') {
				deleted.push({ path, sha: fate.sha, ids: fate.ids });
			} else unknown.push(path);
		}
	}
	if (unknown.length === 0 && deleted.length === 0) {
		return { kind: 'ok', renames };
	}
	const ids = new Set(deleted.flatMap(({ ids: named }) => named));
	const [only] = [...ids];
	if (unknown.length === 0 && ids.size === 1 && only !== undefined) {
		return {
			kind: 'retire',
			renames,
			by: only,
			commits: [...new Set(deleted.map(({ sha }) => sha))],
		};
	}
	return {
		kind: 'leave',
		lines: [
			...deleted.map(({ path, sha }) => `${path} was deleted by ${sha}`),
			...unknown.map((path) => `${path} is not known to git`),
		],
	};
};

/** The steps a proposal takes: ready goes to in-progress then review; in-progress only to review. */
const stepsOf = (stage: string): readonly ('in-progress' | 'review')[] =>
	stage === 'in-progress' ? ['review'] : ['in-progress', 'review'];

/**
 * Move one proposal through its steps, once each, stopping at the first
 * refusal or failure. The reason carries the integration commit the batch
 * is validated at: the service's own field for why it moved.
 */
const transitionProposal = async (
	ports: IWorkRevalidatePorts,
	id: string,
	worktree: string,
	sha: string | undefined,
	stage: string,
): Promise<string | undefined> => {
	const why =
		stage === 'in-progress'
			? 'every slice shipped and no unit holds it'
			: 'the slices shipped and their review round was stale';
	const reason = `Re-validated with fresh evidence${sha === undefined ? '' : ` at ${sha.slice(0, 12)}`}: ${why}.`;
	for (const to of stepsOf(stage)) {
		try {
			const refusal = refusalOf(
				await ports.transition({ id, to, reason, worktree }),
			);
			if (refusal !== undefined) return refusal;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}
	return undefined;
};

/** Rewrite each renamed declared path in its slice's Files line; the first refusal. */
const rewriteRenames = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	file: string | undefined,
	renames: readonly IRenamedPath[],
): string | undefined => {
	if (renames.length === 0) return undefined;
	if (file === undefined) return 'the proposal document is not known';
	for (const rename of renames) {
		const refusal = ports.rewriteDeclared({ worktree, file, ...rename });
		if (refusal !== undefined) return refusal;
	}
	return undefined;
};

/** Retire a proposal whose declared files a later change deleted, under that change's proposal. */
const retireProposal = async (
	ports: IWorkRevalidatePorts,
	id: string,
	worktree: string,
	verdict: { readonly by: string; readonly commits: readonly string[] },
): Promise<string | undefined> => {
	const reason = `Declared files were deleted by ${verdict.commits.join(', ')} (${verdict.by}), which superseded this proposal.`;
	try {
		return refusalOf(
			await ports.transition({
				id,
				to: 'retired',
				reason,
				worktree,
				supersededBy: verdict.by,
			}),
		);
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
};

/** Drop the in-progress proposals the hand-over's preflight refuses, with its reason. */
const settleHandovers = async (
	ports: IWorkRevalidatePorts,
	selection: IRevalidateSelection,
	proposals: readonly IRevalidateProposal[],
	worktree: string,
): Promise<IRevalidateSelection> => {
	const chosen: string[] = [];
	const refused = [...selection.refused];
	for (const id of selection.chosen) {
		const stage = proposals.find((candidate) => candidate.id === id)?.stage;
		if (stage !== 'in-progress') {
			chosen.push(id);
			continue;
		}
		let reason: string | undefined;
		try {
			reason = await ports.handoverRefusal(id, worktree);
		} catch (error) {
			reason = error instanceof Error ? error.message : String(error);
		}
		if (reason === undefined) chosen.push(id);
		else refused.push({ id, reason });
	}
	return { chosen, refused };
};

/**
 * Select, print what was chosen before anything changes, then enter one
 * unit for the batch and move each proposal through the transition
 * service, one at a time. A proposal that fails is reported and undone;
 * the rest go on. Nothing retries.
 */
export const revalidateBatch = async (
	ports: IWorkRevalidatePorts,
	proposalsFlag: string | undefined,
): Promise<ICliCommandResult & { readonly data: IRevalidateOutcome }> => {
	const proposals = await ports.proposals();
	const picked = selectRevalidation(
		proposals,
		namedProposalsOf(proposalsFlag),
		await ports.heldByUnits(),
	);
	// The hand-over's preflight runs in the batch's unit: the tool refuses
	// a call that would write into the shared checkout.
	const inProgress = picked.chosen.some(
		(id) => proposals.find((p) => p.id === id)?.stage === 'in-progress',
	);
	let entered: string | undefined;
	if (inProgress) entered = await ports.enter();
	const selection =
		entered === undefined
			? picked
			: await settleHandovers(ports, picked, proposals, entered);
	for (const { id, reason } of selection.refused) {
		ports.print(`left out ${id}: ${reason}`);
	}
	if (selection.chosen.length === 0) ports.print('chose none');
	for (const id of selection.chosen) ports.print(id);
	if (selection.chosen.length === 0) {
		if (entered !== undefined) await ports.release(entered);
		return {
			code: EXIT_CODE.OK,
			data: { ...selection, transitioned: [], failed: [] },
			suppressDefaultPrint: true,
		};
	}
	const worktree = entered ?? (await ports.enter());
	const sha = await ports.developSha(worktree);
	const transitioned: string[] = [];
	const retired: string[] = [];
	const failed: IRevalidateRefusal[] = [];
	const refused: IRevalidateRefusal[] = [...selection.refused];
	for (const id of selection.chosen) {
		const mark = ports.mark(worktree);
		const proposal = proposals.find((candidate) => candidate.id === id);
		const verdict =
			proposal === undefined
				? ({ kind: 'ok', renames: [] } as const)
				: judgeFiles(ports, worktree, proposal);
		if (verdict.kind === 'leave') {
			const reason = `declared files are gone: ${verdict.lines.join('; ')}`;
			refused.push({ id, reason });
			ports.print(`left out ${id}: ${reason}`);
			continue;
		}
		const renamed = rewriteRenames(
			ports,
			worktree,
			proposal?.file,
			verdict.renames,
		);
		const reason =
			renamed ??
			(verdict.kind === 'retire'
				? await retireProposal(ports, id, worktree, verdict)
				: await transitionProposal(
						ports,
						id,
						worktree,
						sha,
						proposal?.stage ?? 'ready',
					));
		if (reason === undefined) {
			(verdict.kind === 'retire' ? retired : transitioned).push(id);
			continue;
		}
		if (mark !== undefined) ports.undo(worktree, mark);
		failed.push({ id, reason });
		ports.print(`failed ${id}: ${reason}`);
	}
	const outcome = {
		...selection,
		refused,
		worktree,
		transitioned,
		retired,
		failed,
	};
	if (transitioned.length === 0 && retired.length === 0) {
		return {
			code: EXIT_CODE.OK,
			data: outcome,
			suppressDefaultPrint: true,
		};
	}
	const published = await ports.publish();
	return {
		code: published.code === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		data: { ...outcome, publication: published.data },
		...(published.error === undefined ? {} : { error: published.error }),
		suppressDefaultPrint: true,
	};
};
