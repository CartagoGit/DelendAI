import {
	DEFAULT_DURATION_ACTOR,
	DEFAULT_DURATION_TASK_KIND,
	DURATION_TARGET_STATUSES,
	LAST_TRANSITION_AT_FIELD,
} from '../contracts/constants/transition-duration.constant';
import type {
	IMeasuredTransition,
	IProposalDurationRecorder,
	ITransitionDurationSample,
	ITransitionFeatureInputs,
} from '../contracts/interfaces/transition-duration.interface';
import { BACKTICKED } from '../proposals/expand-declared-files';
import { readFrontmatterField } from '../proposals/proposal-frontmatter-writer';
import { appendPeerReviewJsonl } from '../shared/peer-review-log';

const SLICE_HEADING = /^### S\d+/gm;
const FILES_LINE = /^- \*\*Files\*\*:(.*)$/gm;
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$|\/tests?\//;
const PUBLIC_SURFACE = /\/public\/index\.[cm]?[jt]s$/;
const PACKAGE_ROOT_SEGMENTS = 2;

const declaredFiles = (markdown: string): readonly string[] => {
	const files = new Set<string>();
	for (const line of markdown.matchAll(FILES_LINE)) {
		for (const match of (line[1] ?? '').matchAll(BACKTICKED)) {
			const path = match[1] ?? '';
			if (path.includes('/')) files.add(path);
		}
	}
	return [...files];
};

/**
 * The shape of a proposal as the ETA engine sees it, read from its own
 * text: how many slices, how many packages its files touch, how many of
 * those files are tests or public surfaces. Lines changed are unknown
 * at this point and stay zero.
 */
export const featureInputsOfProposal = (
	markdown: string,
): ITransitionFeatureInputs => {
	const files = declaredFiles(markdown);
	const packages = new Set(
		files.map((file) =>
			file.split('/').slice(0, PACKAGE_ROOT_SEGMENTS).join('/'),
		),
	);
	return {
		slice_count: Math.max(1, (markdown.match(SLICE_HEADING) ?? []).length),
		affected_packages: packages.size,
		public_api_changes: files.filter((file) => PUBLIC_SURFACE.test(file))
			.length,
		test_count: files.filter((file) => TEST_FILE.test(file)).length,
		loc_changed: 0,
	};
};

/**
 * The sample a transition leaves behind, or `undefined` when there is
 * nothing to measure: the target is not a closing one, or the document
 * carries no stamp saying when its previous stretch began.
 */
export const measureTransition = (
	input: IMeasuredTransition,
): ITransitionDurationSample | undefined => {
	if (!DURATION_TARGET_STATUSES.includes(input.to)) return undefined;
	const stamp = readFrontmatterField(
		input.previousMarkdown,
		LAST_TRANSITION_AT_FIELD,
	);
	const startedMs = stamp === undefined ? Number.NaN : Date.parse(stamp);
	if (Number.isNaN(startedMs) || startedMs >= input.nowMs) return undefined;
	return {
		to: input.to,
		features: featureInputsOfProposal(input.previousMarkdown),
		actorProfile: input.agent ?? DEFAULT_DURATION_ACTOR,
		// The stretch that ends in review (building) and the one that ends
		// in done (reviewing) are different work, so they never share a key.
		taskKind: `${
			readFrontmatterField(input.previousMarkdown, 'kind') ??
			DEFAULT_DURATION_TASK_KIND
		}:${input.to}`,
		durationMs: input.nowMs - startedMs,
		createdAt: input.nowMs,
	};
};

/**
 * Hands the sample to the recorder off the critical path: a recorder
 * that throws or rejects is swallowed, because an advisory history must
 * never fail the transition that produced it.
 */
export const recordMeasuredTransition = (
	recorder: IProposalDurationRecorder | undefined,
	input: IMeasuredTransition,
): void => {
	if (recorder === undefined) return;
	const sample = measureTransition(input);
	if (sample === undefined) return;
	queueMicrotask(() => {
		void Promise.resolve()
			.then(() => recorder.record(sample))
			.catch(() => undefined);
	});
};

/**
 * The recorder the server wires in: one JSON line per sample in a
 * journal under the cache. The ETA history ingests that journal, so the
 * two sides share a file format and nothing else.
 */
export const createDurationJournalRecorder = (
	journalPathAbs: string,
): IProposalDurationRecorder => ({
	record: (sample) => appendPeerReviewJsonl(journalPathAbs, sample),
});
