/**
 * A proposal is ready only when nothing is left to work out. One pure
 * function judges each slice; the `proposal-readiness` lint and the move
 * to `ready` both call it, so the two can never disagree.
 *
 * The rules are shapes a machine can check. Whether Files is complete, or
 * an acceptance line truly proves the behaviour, stays a reviewer's call.
 */
import type {
	IReadinessDeps,
	IReadinessFinding,
	IReadinessRule,
	IReadinessSlice,
} from '../contracts/interfaces/proposal-readiness.interface';
import {
	BACKTICKED,
	BRACE_PATTERN,
	looksLikePath,
	withoutNewMarker,
} from './expand-declared-files';
import { NEW_FILE_MARKER } from '../contracts/constants/new-file-marker.constant';
import { readReadinessSlices } from './proposal-readiness-slices';

/** Slices already delivered are history, not work to be readied. */
const DELIVERED = new Set(['done', 'review', 'retired']);

const GUESSED_FILES = /\b(none yet|TBD|may need)\b/iu;
const GLOB = /[*?[]/u;
const OPEN_DECISION =
	/\b(TBD|to be decided|left to the implementer|implementer decides|either|open question)\b|\?/iu;
const COMMAND_SPAN = /`[a-z][\w.-]* [^`]+`/u;
const SPEC_PATH = /[\w./-]+\.spec\.ts\b/u;
const SCENARIO = /\bScenario\s+\S+/u;

const DOCUMENTS = 'docs/delendai/proposals/';

const idOf = (markdown: string): string =>
	/^id:\s*["']?([A-Za-z]\d+)["']?\s*$/mu.exec(markdown)?.[1] ?? 'unknown';

const finding = (
	proposal: string,
	slice: string,
	rule: IReadinessRule,
	text: string,
): IReadinessFinding => ({ proposal, slice, rule, text });

/** Every declared token of a Files field, with the marker kept. */
const declaredTokens = (filesText: string): readonly string[] => {
	const cleaned = filesText
		.split('\n')
		.map((line) =>
			line.replace(/^([ \t]*[-*][ \t]+`[^`]+`)[ \t]+—[ \t].*$/u, '$1'),
		)
		.join('\n')
		.replace(/\([^)]*\)/gu, ' ');
	const tokens: string[] = [];
	for (const span of cleaned.matchAll(BACKTICKED)) {
		for (const part of (span[1] ?? '').split(/,\s*(?![^{}]*\})/u)) {
			const trimmed = part.trim();
			const brace = BRACE_PATTERN.exec(trimmed);
			if (brace === null) {
				tokens.push(trimmed);
				continue;
			}
			const marker = trimmed.startsWith(NEW_FILE_MARKER)
				? NEW_FILE_MARKER
				: '';
			for (const choice of (brace[2] ?? '').split(','))
				tokens.push(
					`${marker}${withoutNewMarker(brace[1] ?? '')}${choice}${brace[3] ?? ''}`,
				);
		}
	}
	return tokens.filter((token) => token.length > 0);
};

const checkFiles = (
	proposal: string,
	slice: IReadinessSlice,
	deps: IReadinessDeps,
): readonly IReadinessFinding[] => {
	const out: IReadinessFinding[] = [];
	const add = (text: string): void => {
		out.push(finding(proposal, slice.id, 'files', text));
	};
	const text = slice.filesText ?? '';
	const guess = GUESSED_FILES.exec(text);
	if (guess !== null) add(guess[0]);
	let paths = 0;
	for (const token of declaredTokens(text)) {
		const isNew = token.startsWith(NEW_FILE_MARKER);
		const path = withoutNewMarker(token);
		if (GLOB.test(path)) {
			add(`glob ${token}`);
			continue;
		}
		if (!looksLikePath(path)) continue;
		paths += 1;
		const own =
			path.startsWith(DOCUMENTS) && path.includes(`/${proposal}-`);
		if (own) continue;
		const present = deps.exists(path);
		if (isNew && present && deps.newMustBeAbsent)
			add(`${token} exists already; drop the new: marker`);
		if (!isNew && !present)
			add(
				`${path} does not exist; write new:${path} if the slice creates it`,
			);
	}
	if (paths === 0 && guess === null) add('Files declares no path');
	return out;
};

const isCheckable = (line: string): boolean =>
	COMMAND_SPAN.test(line) || SPEC_PATH.test(line) || SCENARIO.test(line);

const checkAcceptance = (
	proposal: string,
	slice: IReadinessSlice,
): readonly IReadinessFinding[] => {
	if (slice.acceptance.length === 0)
		return [
			finding(proposal, slice.id, 'acceptance', 'no acceptance lines'),
		];
	return slice.acceptance
		.filter((line) => !isCheckable(line))
		.map((line) => finding(proposal, slice.id, 'acceptance', line));
};

const checkDecisions = (
	proposal: string,
	slice: IReadinessSlice,
): readonly IReadinessFinding[] => {
	const text = slice.decisions;
	if (text === undefined)
		return [finding(proposal, slice.id, 'decisions', 'no Decisions field')];
	const bare = text.replace(/[`.\s]/gu, '').toLowerCase();
	if (bare === 'none') return [];
	const open = OPEN_DECISION.exec(text);
	return open === null
		? []
		: [finding(proposal, slice.id, 'decisions', open[0])];
};

/** Slice ids reachable from `from` along DependsOn edges. */
const reachable = (
	from: string,
	edges: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> => {
	const seen = new Set<string>();
	const stack = [...(edges.get(from) ?? [])];
	for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
		if (seen.has(next)) continue;
		seen.add(next);
		stack.push(...(edges.get(next) ?? []));
	}
	return seen;
};

const checkDependsOn = (
	proposal: string,
	slices: readonly IReadinessSlice[],
	known: ReadonlySet<string>,
	edges: ReadonlyMap<string, readonly string[]>,
): readonly IReadinessFinding[] => {
	const out: IReadinessFinding[] = [];
	for (const slice of slices) {
		for (const dep of slice.dependsOn)
			if (!known.has(dep))
				out.push(
					finding(
						proposal,
						slice.id,
						'depends-on',
						`${dep} is not a slice of this proposal`,
					),
				);
		if (reachable(slice.id, edges).has(slice.id))
			out.push(
				finding(
					proposal,
					slice.id,
					'depends-on',
					'depends on itself through a cycle',
				),
			);
	}
	return out;
};

const checkSharedFiles = (
	proposal: string,
	slices: readonly IReadinessSlice[],
	edges: ReadonlyMap<string, readonly string[]>,
): readonly IReadinessFinding[] => {
	const owners = new Map<string, string[]>();
	for (const slice of slices)
		for (const token of declaredTokens(slice.filesText ?? '')) {
			const path = withoutNewMarker(token);
			if (!looksLikePath(path) || GLOB.test(path)) continue;
			if (path.startsWith(DOCUMENTS)) continue;
			owners.set(path, [...(owners.get(path) ?? []), slice.id]);
		}
	const out: IReadinessFinding[] = [];
	for (const [path, ids] of owners) {
		const unique = [...new Set(ids)];
		for (const [i, first] of unique.entries())
			for (const second of unique.slice(i + 1))
				if (
					!reachable(first, edges).has(second) &&
					!reachable(second, edges).has(first)
				)
					out.push(
						finding(
							proposal,
							second,
							'shared-file',
							`${path} is also listed by ${first}, with no DependsOn between them`,
						),
					);
	}
	return out;
};

/** Every path the open slices declare, marker removed, for the caller to probe. */
export const readinessPaths = (markdown: string): readonly string[] => [
	...new Set(
		readReadinessSlices(markdown)
			.filter((slice) => !DELIVERED.has(slice.status))
			.flatMap((slice) => declaredTokens(slice.filesText ?? ''))
			.map(withoutNewMarker)
			.filter((path) => looksLikePath(path) && !GLOB.test(path)),
	),
];

/** Every reason the proposal's open slices are not ready; empty when none. */
export const checkProposalReadiness = (
	markdown: string,
	deps: IReadinessDeps,
): readonly IReadinessFinding[] => {
	const proposal = idOf(markdown);
	const all = readReadinessSlices(markdown);
	const slices = all.filter((slice) => !DELIVERED.has(slice.status));
	const edges = new Map(slices.map((slice) => [slice.id, slice.dependsOn]));
	return [
		...slices.flatMap((slice) => [
			...checkFiles(proposal, slice, deps),
			...checkAcceptance(proposal, slice),
			...checkDecisions(proposal, slice),
		]),
		...checkDependsOn(
			proposal,
			slices,
			new Set(all.map((slice) => slice.id)),
			edges,
		),
		...checkSharedFiles(proposal, slices, edges),
	];
};

/** One line a person can act on. */
export const describeReadinessFinding = (item: IReadinessFinding): string =>
	`${item.proposal} ${item.slice} [${item.rule}] ${item.text.replace(/\s+/gu, ' ')}`;
