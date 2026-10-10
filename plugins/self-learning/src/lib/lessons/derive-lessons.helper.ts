/**
 * derive-lessons.helper.ts — from what happened to what this project
 * has taught us (q00014 S5).
 *
 * Pure: observations in, lessons out, `now` injected. No store, no
 * clock, no network — so the same history always produces the same
 * lessons, which is what makes them arguable.
 *
 * Three lesson kinds, one per question an arriving agent actually asks:
 *
 *   - `command-reliability` — does this command work HERE? Both
 *     directions matter, which is why the store keeps passing runs: an
 *     agent that only ever hears about failures cannot tell a flaky
 *     command from a broken one.
 *   - `fragile-test` — which specs fail more than the rest? Named by
 *     full test name, because that is the identity a fix is about.
 *   - `recurring-refusal` — which refusal keeps happening? A refusal
 *     seen once is a mistake; seen every session it is a missing
 *     affordance.
 *
 * What it will NOT do is invent a correlation. A pattern under
 * `minimumSupport` is not reported at all — the negative case the
 * proposal asks for, and the reason a store of coincidences is worse
 * than no store.
 */

import type {
	IDeriveLessonsOptions,
	ILesson,
	ILessonKind,
} from '../contracts/interfaces/lesson.interface';
import type { IObservation } from '../contracts/interfaces/observation.interface';
import {
	DEFAULT_MINIMUM_SUPPORT,
	DEFAULT_RECENCY_WINDOW_MS,
} from '../contracts/constants/lesson.constant';
import { scoreConfidence } from './confidence.helper';

/** Evidence entries kept per lesson: enough to check, not a log. */
const DEFAULT_MAX_EVIDENCE = 5;

interface IGroup {
	readonly subject: string;
	readonly supporting: readonly IObservation[];
	readonly contradicting: readonly IObservation[];
}

const groupBySubject = (
	observations: readonly IObservation[],
	supports: (observation: IObservation) => boolean,
): readonly IGroup[] => {
	const bySubject = new Map<
		string,
		{ supporting: IObservation[]; contradicting: IObservation[] }
	>();
	for (const observation of observations) {
		const entry = bySubject.get(observation.subject) ?? {
			supporting: [],
			contradicting: [],
		};
		if (supports(observation)) entry.supporting.push(observation);
		else entry.contradicting.push(observation);
		bySubject.set(observation.subject, entry);
	}
	return [...bySubject.entries()].map(([subject, entry]) => ({
		subject,
		supporting: entry.supporting,
		contradicting: entry.contradicting,
	}));
};

const newestFirst = (
	observations: readonly IObservation[],
): readonly IObservation[] =>
	[...observations].sort((left, right) => right.atMs - left.atMs);

const lessonFrom = (
	kind: ILessonKind,
	group: IGroup,
	claim: (group: IGroup) => string,
	options: Required<
		Pick<
			IDeriveLessonsOptions,
			'recencyWindowMs' | 'minimumSupport' | 'maxEvidence' | 'nowMs'
		>
	>,
): ILesson | null => {
	if (group.supporting.length < options.minimumSupport) return null;
	const evidence = newestFirst(group.supporting);
	const recentSupport = evidence.filter(
		(observation) =>
			options.nowMs - observation.atMs <= options.recencyWindowMs,
	).length;
	return {
		kind,
		subject: group.subject,
		claim: claim(group),
		confidence: scoreConfidence({
			support: group.supporting.length,
			counterExamples: group.contradicting.length,
			recentSupport,
		}),
		lastSeenMs: evidence[0]?.atMs ?? 0,
		evidence: evidence.slice(0, options.maxEvidence),
	};
};

/**
 * Derive every lesson this history supports, strongest first.
 *
 * Ordering is by confidence and then by recency: an agent reads the top
 * of this list and stops, so what is most likely to be true today has
 * to be there.
 */
export const deriveLessons = (
	observations: readonly IObservation[],
	options: IDeriveLessonsOptions = {},
): readonly ILesson[] => {
	const resolved = {
		recencyWindowMs: options.recencyWindowMs ?? DEFAULT_RECENCY_WINDOW_MS,
		minimumSupport: options.minimumSupport ?? DEFAULT_MINIMUM_SUPPORT,
		maxEvidence: options.maxEvidence ?? DEFAULT_MAX_EVIDENCE,
		nowMs: options.nowMs ?? Date.now(),
	};

	const commands = observations.filter(
		(observation) => observation.kind === 'command-outcome',
	);
	const failures = observations.filter(
		(observation) => observation.kind === 'test-failure',
	);
	const refusals = observations.filter(
		(observation) => observation.kind === 'refusal',
	);

	const lessons: ILesson[] = [];

	// A command that mostly FAILS here is the actionable direction: an
	// agent about to run it should know before it spends the minutes.
	for (const group of groupBySubject(
		commands,
		(observation) => observation.outcome === 'fail',
	)) {
		const lesson = lessonFrom(
			'command-reliability',
			group,
			(each) =>
				`\`${each.subject}\` failed ${String(each.supporting.length)} of the last ${String(each.supporting.length + each.contradicting.length)} runs in this project.`,
			resolved,
		);
		if (lesson !== null) lessons.push(lesson);
	}

	for (const group of groupBySubject(
		failures,
		(observation) => observation.outcome === 'fail',
	)) {
		const lesson = lessonFrom(
			'fragile-test',
			group,
			(each) =>
				`\`${each.subject}\` has failed ${String(each.supporting.length)} time(s) here; check it before assuming a change broke it.`,
			resolved,
		);
		if (lesson !== null) lessons.push(lesson);
	}

	for (const group of groupBySubject(
		refusals,
		(observation) => observation.outcome === 'fail',
	)) {
		const lesson = lessonFrom(
			'recurring-refusal',
			group,
			(each) =>
				`\`${each.subject}\` refused ${String(each.supporting.length)} time(s); a refusal this regular is usually a missing step rather than a mistake.`,
			resolved,
		);
		if (lesson !== null) lessons.push(lesson);
	}

	return lessons.sort(
		(left, right) =>
			right.confidence.score - left.confidence.score ||
			right.lastSeenMs - left.lastSeenMs,
	);
};

/**
 * The lessons that bear on a stated goal, as advice.
 *
 * Matching is a plain substring on the subject, and deliberately so: an
 * agent says "run the tests" or "close the slice", and the subjects are
 * command lines and test names. Anything cleverer would be a guess
 * dressed as a match.
 */
export const adviseFor = (
	goal: string,
	lessons: readonly ILesson[],
): readonly ILesson[] => {
	const needle = goal.trim().toLowerCase();
	if (needle.length === 0) return [];
	return lessons.filter(
		(lesson) =>
			lesson.subject.toLowerCase().includes(needle) ||
			needle.includes(lesson.subject.toLowerCase()),
	);
};
