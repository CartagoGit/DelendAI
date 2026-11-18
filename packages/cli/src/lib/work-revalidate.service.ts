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
import { READY_PROPOSALS_DIR } from '../contracts/constants/work-revalidate.constant';
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
): string | undefined => {
	if (proposal.stage !== 'ready') {
		return `it is in ${proposal.stage}, not ready`;
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
): IRevalidateSelection => {
	if (named === undefined) {
		return {
			chosen: proposals
				.filter(
					(proposal) => revalidateRefusalOf(proposal) === undefined,
				)
				.map((proposal) => proposal.id),
			refused: [],
		};
	}
	const chosen: string[] = [];
	const refused: IRevalidateRefusal[] = [];
	for (const id of named) {
		const proposal = proposals.find((candidate) => candidate.id === id);
		const reason =
			proposal === undefined
				? 'no such proposal'
				: revalidateRefusalOf(proposal);
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
		const next = line.replace(`\`${from}\``, `\`${to}\``);
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

/** The ready proposals of the project at `root`. */
export const readReadyProposals = async (
	root: string,
): Promise<readonly IRevalidateProposal[]> => {
	const files = await markdownFilesOf(join(root, READY_PROPOSALS_DIR));
	const parsed = await Promise.all(
		files.map(async (file) =>
			parseRevalidateProposal(
				await readFile(file, 'utf8'),
				'ready',
				relative(root, file),
			),
		),
	);
	return parsed.filter(
		(proposal): proposal is IRevalidateProposal => proposal !== undefined,
	);
};

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

/** The commit (`sha<TAB>subject`) the latest deletion of `path`, when any. */
const commitOf = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	path: string,
): { readonly sha: string; readonly subject: string } | undefined => {
	const answer = ports.git(worktree, [
		'log',
		'-M',
		'--diff-filter=D',
		'--name-status',
		'-1',
		'--format=%h%x09%s',
		'--',
		path,
	]);
	if (!answer.ok) return undefined;
	const header = answer.out.split('\n').find((line) => line.trim() !== '');
	if (header === undefined) return undefined;
	const [sha = '', ...subject] = header.split('\t');
	return { sha, subject: subject.join('\t') };
};

/** The renamed target of `path` when git recorded one that exists; its absence otherwise. */
const renameTargetOf = (
	ports: IWorkRevalidatePorts,
	worktree: string,
	path: string,
): string | undefined => {
	const answer = ports.git(worktree, [
		'log',
		'-M',
		'--diff-filter=R',
		'--name-status',
		'-1',
		'--format=',
		'--',
		path,
	]);
	if (!answer.ok) return undefined;
	const row = answer.out
		.split('\n')
		.map((line) => line.split('\t'))
		.find((cells) => cells[0]?.startsWith('R') && cells[1] === path);
	return row?.[2];
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
	const deleted: { path: string; sha: string; subject: string }[] = [];
	const unknown: string[] = [];
	for (const slice of proposal.slices.filter(isLive)) {
		for (const path of slice.files ?? []) {
			if (path.includes('*') || ports.exists(worktree, path)) continue;
			const target = renameTargetOf(ports, worktree, path);
			if (target !== undefined && ports.exists(worktree, target)) {
				renames.push({ sliceId: slice.id, from: path, to: target });
				continue;
			}
			const gone = commitOf(ports, worktree, target ?? path);
			if (gone === undefined) unknown.push(path);
			else deleted.push({ path, ...gone });
		}
	}
	if (unknown.length === 0 && deleted.length === 0) {
		return { kind: 'ok', renames };
	}
	const ids = new Set(
		deleted.flatMap(({ subject }) => subject.match(PROPOSAL_ID) ?? []),
	);
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

/** The steps a proposal takes: ready to in-progress, then to review. */
const STEPS = ['in-progress', 'review'] as const;

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
): Promise<string | undefined> => {
	const reason = `Re-validated with fresh evidence${sha === undefined ? '' : ` at ${sha.slice(0, 12)}`}: the slices shipped and their review round was stale.`;
	for (const to of STEPS) {
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
	const selection = selectRevalidation(
		proposals,
		namedProposalsOf(proposalsFlag),
	);
	for (const { id, reason } of selection.refused) {
		ports.print(`left out ${id}: ${reason}`);
	}
	if (selection.chosen.length === 0) ports.print('chose none');
	for (const id of selection.chosen) ports.print(id);
	if (selection.chosen.length === 0) {
		return {
			code: EXIT_CODE.OK,
			data: { ...selection, transitioned: [], failed: [] },
			suppressDefaultPrint: true,
		};
	}
	const worktree = await ports.enter();
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
				: await transitionProposal(ports, id, worktree, sha));
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
