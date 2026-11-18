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
import { join } from 'node:path';

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

const FIELD = /^- (shipped-in|review-state|\*\*Status\*\*):\s*(.*)$/;

const unquote = (value: string): string =>
	value.trim().replace(/^`(.*)`$/, '$1');

/** The proposal in `text`: its id and its slices' facts. */
export const parseRevalidateProposal = (
	text: string,
	stage: string,
): IRevalidateProposal | undefined => {
	const id = /^id:\s*(\S+)\s*$/m.exec(text)?.[1];
	if (id === undefined) return undefined;
	const slices: {
		id: string;
		status: string;
		shippedIn?: string;
		reviewState?: string;
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
		if (field[1] === 'shipped-in') {
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
		})),
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
			parseRevalidateProposal(await readFile(file, 'utf8'), 'ready'),
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
	const selection = selectRevalidation(
		await ports.proposals(),
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
	const failed: IRevalidateRefusal[] = [];
	for (const id of selection.chosen) {
		const mark = ports.mark(worktree);
		const reason = await transitionProposal(ports, id, worktree, sha);
		if (reason === undefined) {
			transitioned.push(id);
			continue;
		}
		if (mark !== undefined) ports.undo(worktree, mark);
		failed.push({ id, reason });
		ports.print(`failed ${id}: ${reason}`);
	}
	if (transitioned.length === 0) {
		return {
			code: EXIT_CODE.OK,
			data: { ...selection, worktree, transitioned, failed },
			suppressDefaultPrint: true,
		};
	}
	const published = await ports.publish();
	return {
		code: published.code === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		data: {
			...selection,
			worktree,
			transitioned,
			failed,
			publication: published.data,
		},
		...(published.error === undefined ? {} : { error: published.error }),
		suppressDefaultPrint: true,
	};
};
