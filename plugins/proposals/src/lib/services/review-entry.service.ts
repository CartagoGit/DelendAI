/**
 * review-entry.service.ts — a proposal enters review only in a state a
 * reviewer can act on.
 *
 * On 2026-09-28, 36 of 53 proposals in review could not be judged, and 5
 * approved ones could not be closed. Each was a gap nothing checked when
 * the proposal was handed to review:
 *
 * - a slice delivered by commits that neither went through a unit's pull
 *   request nor cited the proposal: the queue found no delivering commit,
 *   and no reviewer could name one;
 * - a slice declaring files that do not exist: it could be approved, and
 *   then never closed.
 *
 * The hand-off is the one moment the delivering commits are certainly at
 * hand: they are on the branch being handed over. So each slice records
 * the last commit on it that changed its declared files, and a slice with
 * none, or with declared files that do not exist, keeps the proposal out
 * of review with the step that fixes it.
 *
 * A proposal delivered over several pull requests hands over a branch that
 * holds only its last slice: the earlier ones are already in the
 * integration branch. Their delivery is the merge of their publication:
 * its message names the slice's unit, or the whole proposal's, decoded with
 * the project's own ref template, and it changed the slice's files.
 */
import type { IReviewEntry } from '../contracts/interfaces/review-entry.interface';
import type {
	IIntegrationRecord,
	IWorkRefShape,
} from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import { readIntegrationHistory, unitKey } from './delivery-history.service';
import { findWorkRefMention } from './work-ref-mention';
import {
	readShippingCommit,
	recordShippingCommit,
} from '../swarm/slice-shipping-record';
import {
	collectSliceStatuses,
	isRetiredSlice,
	missingDeclaredFiles,
} from './proposal-completeness';
import { listShippedIn } from './review-attribution';

/** How much of a hash a recorded delivery keeps. */
const RECORDED_HASH_LENGTH = 12;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const blockOf = (sliceId: string): RegExp =>
	new RegExp(
		`(^### ${escapeRegExp(sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
		'mu',
	);

/** The integration ref this branch's own commits are counted from. */
const baseOf = async (
	run: IGitRunner,
	integration: string,
): Promise<string | undefined> => {
	for (const ref of [`refs/remotes/origin/${integration}`, integration]) {
		if ((await run(['rev-parse', '--verify', '--quiet', ref])).ok)
			return ref;
	}
	return undefined;
};

/** The id in a proposal's frontmatter. */
const proposalIdOf = (markdown: string): string | undefined =>
	/^id:\s*["']?([A-Za-z]\d+)["']?\s*$/mu.exec(markdown)?.[1];

/** The slice's own unit, then the whole proposal's. */
const WHOLE_PROPOSAL_SLICE = 'all';

/**
 * The integration commit that delivered this slice: the merge whose message
 * names the slice's unit (or the whole proposal's), decoded with the
 * project's ref template, and whose change touched the slice's files.
 */
const deliveringMergeOf = async (
	run: IGitRunner,
	history: readonly IIntegrationRecord[],
	shape: IWorkRefShape,
	proposalId: string,
	sliceId: string,
	files: readonly string[],
): Promise<string | undefined> => {
	const units = new Set([
		unitKey(proposalId, sliceId),
		unitKey(proposalId, WHOLE_PROPOSAL_SLICE),
	]);
	for (const record of history) {
		if (record.commit === undefined || record.commit === record.delivered)
			continue;
		const mention = findWorkRefMention(record.message, shape);
		if (mention === undefined) continue;
		if (!units.has(unitKey(mention.proposal, mention.slice))) continue;
		const changed = await run([
			'diff',
			'--name-only',
			`${record.commit}^1`,
			record.commit,
			'--',
			...files,
		]);
		if (changed.ok && changed.output.trim().length > 0)
			return record.commit;
	}
	return deliveringMergeByCitation(run, history, proposalId, files);
};

/**
 * The delivery of a slice whose unit was named after something else: the
 * newest merge in which a commit that cites the proposal changed the
 * slice's files, or that created the proposal's own document beside the
 * work. A later pull request that touched the files for its own reasons
 * and only moved the document is not a delivery of the slice.
 *
 * A proposal written and implemented in one unit, or delivered from a unit
 * opened for another id, lands through a merge that names that unit and
 * not the proposal. Its slices were then "delivered by nothing": seven
 * proposals merged weeks earlier could not be handed to review, and the
 * only way forward was to write the commit into the document by hand.
 */
const deliveringMergeByCitation = async (
	run: IGitRunner,
	history: readonly IIntegrationRecord[],
	proposalId: string,
	files: readonly string[],
): Promise<string | undefined> => {
	for (const record of history) {
		// A merge only: a commit made on the branch itself delivers itself.
		if (record.commit === undefined || record.commit === record.delivered)
			continue;
		const changed = await run([
			'diff',
			'--name-only',
			`${record.commit}^1`,
			record.commit,
			'--',
			...files,
		]);
		if (!changed.ok || changed.output.trim().length === 0) continue;
		const cited = await run([
			'log',
			'-1',
			'--format=%H',
			'--fixed-strings',
			'--regexp-ignore-case',
			`--grep=${proposalId}`,
			`${record.commit}^1..${record.commit}^2`,
			'--',
			...files,
		]);
		if (cited.ok && cited.output.trim().length > 0) return record.commit;
		// Or the pull request that wrote the proposal: it created the
		// proposal's own document beside the work. Created, not moved: a
		// later pull request that carries the document to another status
		// renames it.
		const wrote = await run([
			'diff',
			'--name-status',
			'-M',
			'--diff-filter=A',
			`${record.commit}^1`,
			record.commit,
			'--',
			`:(glob)**/${proposalId.toLowerCase()}-*.md`,
		]);
		if (wrote.ok && wrote.output.trim().length > 0) return record.commit;
	}
	return undefined;
};

export const prepareReviewEntry = async (input: {
	readonly markdown: string;
	readonly workspaceRoot: string;
	readonly run: IGitRunner;
	readonly integration: string;
	/** Decodes the unit a merge names; without it, only the branch counts. */
	readonly refShape?: IWorkRefShape;
}): Promise<IReviewEntry> => {
	const slices = collectSliceStatuses(input.markdown);
	const missing = await missingDeclaredFiles(
		input.markdown,
		input.workspaceRoot,
	);
	if (missing.length > 0) {
		return {
			ok: false,
			code: 'missing-declared-files',
			reason: `declared files do not exist: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${String(missing.length - 5)} more` : ''}. A reviewer could approve the slice, and the proposal could then never close.`,
			nextAction:
				'Deliver those files, or correct the slice’s Files to what was delivered, then hand the proposal to review again.',
		};
	}
	const base = await baseOf(input.run, input.integration);
	const proposalShipped = listShippedIn(input.markdown).length > 0;
	let markdown = input.markdown;
	const recorded: { slice: string; commit: string }[] = [];
	let history: readonly IIntegrationRecord[] | undefined;
	const undelivered: string[] = [];
	for (const slice of slices) {
		const re = blockOf(slice.id);
		const match = markdown.match(re);
		if (match === null || slice.files.length === 0) continue;
		// A retired slice delivered nothing, and a reviewer judges nothing
		// of it: no commit is owed.
		if (isRetiredSlice(slice.status)) continue;
		const block = match[2] ?? '';
		if (readShippingCommit(block) !== undefined) continue;
		const last =
			base === undefined
				? undefined
				: await input.run([
						'log',
						'-1',
						'--format=%H',
						`${base}..HEAD`,
						'--',
						...slice.files,
					]);
		const onBranch = last?.ok === true ? last.output.trim() : '';
		const id = proposalIdOf(markdown);
		history ??=
			input.refShape === undefined || base === undefined
				? []
				: await readIntegrationHistory(input.run, base);
		const commit =
			onBranch.length > 0 ||
			input.refShape === undefined ||
			id === undefined
				? onBranch
				: ((await deliveringMergeOf(
						input.run,
						history,
						input.refShape,
						id,
						slice.id,
						slice.files,
					)) ?? '');
		if (commit.length === 0) {
			if (!proposalShipped) undelivered.push(slice.id);
			continue;
		}
		const short = commit.slice(0, RECORDED_HASH_LENGTH);
		const written = recordShippingCommit(block, short);
		markdown = markdown.replace(re, `${match[1] ?? ''}${written.block}`);
		recorded.push({ slice: slice.id, commit: short });
	}
	if (undelivered.length > 0) {
		return {
			ok: false,
			code: 'undelivered-slices',
			reason: `${undelivered.join(', ')}: no commit on this branch changes the slice’s declared files, and nothing records which commit delivered it. A reviewer would have nothing to judge.`,
			nextAction:
				'Commit the slice’s work on this branch first, or, when it was delivered earlier, record `- shipped-in: `<sha>`` on the slice; then hand the proposal to review again.',
		};
	}
	return { ok: true, markdown, recorded };
};
