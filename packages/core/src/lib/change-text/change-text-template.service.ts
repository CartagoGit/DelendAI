/**
 * change-text-template.service.ts — the one format of pull request and
 * issue text.
 *
 * Titles read "implement batch", "review batch", "review: 4 verdict(s)
 * on …" and "x (+3 more)" depending on who made the work. The template
 * is the product's: callers supply facts and a summary, never the shape.
 * Nothing here knows the author, so two agents cannot differ.
 */
import {
	CHANGE_TYPE_BY_PROPOSAL_KIND,
	SUMMARY_MAX_LENGTH,
} from '../contracts/constants/change-text.constant';
import type {
	IChangeKind,
	IChangeText,
	IChangeTextInput,
	IChangeType,
	IIssueTextInput,
	IProofStep,
	IProposalUnit,
} from '../contracts/interfaces/change-text.interface';

const FILES_LISTED_MAX = 40;
const NOT_STATED = 'Not stated.';
const NOT_PROVED = 'not proved locally';

/** A leading conventional prefix, a trailing "(+N more)" or scope. */
const LEADING_PREFIX = /^(?:[a-z]+(?:\([^)]*\))?!?:\s*)+/iu;
const TRAILING_MORE = /\s*\(\+\d+ more\)\s*$/u;
const TRAILING_SCOPE = /\s*\((?:[a-z]\d{5,}[^)]*)\)\s*$/iu;

/** The type of a change: a review is a review whatever it reviews. */
export const changeTypeOf = (
	kind: IChangeKind,
	proposalKind?: string,
): IChangeType => {
	if (kind === 'review') return 'review';
	if (kind === 'create') return 'docs';
	if (kind === 'batch-close') return 'chore';
	if (kind === 'issue') return 'fix';
	return CHANGE_TYPE_BY_PROPOSAL_KIND[proposalKind ?? ''] ?? 'chore';
};

/** One word, lowercase, safe inside parentheses. */
export const sanitizeScope = (scope: string): string => {
	const cleaned = scope
		.toLowerCase()
		.replace(/[^a-z0-9/._-]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return cleaned === '' ? 'repo' : cleaned;
};

/** The scope a set of changed paths names: where most of them live. */
export const scopeOfPaths = (paths: readonly string[]): string => {
	const counts = new Map<string, number>();
	for (const path of paths) {
		const [top, second] = path.split('/');
		const zone =
			top === 'plugins' || top === 'packages' || top === 'apps'
				? (second ?? top)
				: (top ?? '');
		counts.set(zone, (counts.get(zone) ?? 0) + 1);
	}
	const best = [...counts].sort((a, b) => b[1] - a[1])[0];
	return sanitizeScope(best?.[0] ?? '');
};

const sliceNumber = (slice: string): number =>
	Number(/(\d+)/u.exec(slice)?.[1] ?? Number.NaN);

/** `S1`, `S1-S3` (a run), `S1+S4` (apart): the branch grammar. */
const sliceRuns = (slices: readonly string[]): string => {
	const ordered = [...new Set(slices.map((slice) => slice.toUpperCase()))]
		.filter((slice) => !Number.isNaN(sliceNumber(slice)))
		.sort((a, b) => sliceNumber(a) - sliceNumber(b));
	const runs: string[] = [];
	let start = 0;
	for (let at = 1; at <= ordered.length; at += 1) {
		const previous = ordered[at - 1] as string;
		const next = ordered[at];
		if (
			next !== undefined &&
			sliceNumber(next) === sliceNumber(previous) + 1
		) {
			continue;
		}
		const first = ordered[start] as string;
		runs.push(at - start >= 2 ? `${first}-${previous}` : first);
		start = at;
	}
	return runs.join('+');
};

const unitScope = (unit: IProposalUnit): string => {
	const id = unit.proposal.toLowerCase();
	const runs = sliceRuns(unit.slices ?? []);
	return runs === '' ? id : `${id}-${runs}`;
};

/**
 * The proposal-scope of a title, in the branch grammar: `x01003`,
 * `x01003-S2`, `x01003-S1-S3`, `x01003-S1+S4`, `x01004+x01016`.
 */
export const proposalScopeOf = (units: readonly IProposalUnit[]): string => {
	const merged = new Map<string, string[]>();
	for (const unit of units) {
		const id = unit.proposal.toLowerCase();
		const known = merged.get(id);
		if (unit.slices === undefined || unit.slices.length === 0) {
			merged.set(id, known ?? []);
		} else {
			merged.set(id, [...(known ?? []), ...unit.slices]);
		}
	}
	return [...merged]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([proposal, slices]) => unitScope({ proposal, slices }))
		.join('+');
};

/** The summary as the title carries it: one line, no prefix, bounded. */
export const shapeSummary = (summary: string): string => {
	const flat = summary
		.replace(/\s+/gu, ' ')
		.trim()
		.replace(TRAILING_MORE, '')
		.replace(TRAILING_SCOPE, '')
		.replace(LEADING_PREFIX, '')
		.trim();
	const base = flat === '' ? 'update' : flat;
	return base.length <= SUMMARY_MAX_LENGTH
		? base
		: `${base.slice(0, SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
};

/** Free text kept to its paragraph: it cannot open a section. */
const freeText = (text: string | undefined): string => {
	const kept = (text ?? '')
		.split('\n')
		.map((line) => line.replace(/^\s{0,3}#{1,6}\s+/u, '').trimEnd())
		.join('\n')
		.trim();
	return kept === '' ? NOT_STATED : kept;
};

const bullets = (lines: readonly string[], none: string): string =>
	lines.length === 0 ? none : lines.map((line) => `- ${line}`).join('\n');

const proofText = (steps: readonly IProofStep[] | undefined): string =>
	steps === undefined || steps.length === 0
		? NOT_PROVED
		: [...steps]
				.sort((a, b) => b.seconds - a.seconds)
				.map(
					(step) =>
						`- ${String(step.seconds)}s ${step.ok ? 'ok' : 'FAIL'} ${step.name}`,
				)
				.join('\n');

const titleOf = (
	type: IChangeType,
	scope: string,
	summary: string,
	units: readonly IProposalUnit[],
): string => {
	const proposalScope = proposalScopeOf(units);
	const head = `${type}(${sanitizeScope(scope)}): ${shapeSummary(summary)}`;
	return proposalScope === '' ? head : `${head} (${proposalScope})`;
};

const section = (heading: string, content: string): string =>
	`## ${heading}\n\n${content}`;

/** The title and body of a pull request or merge request. */
export const renderChangeText = (input: IChangeTextInput): IChangeText => {
	const files = input.files ?? [];
	const listed = files
		.slice(0, FILES_LISTED_MAX)
		.map((file) => `\`${file}\``);
	if (files.length > FILES_LISTED_MAX) {
		listed.push(`… and ${String(files.length - FILES_LISTED_MAX)} more`);
	}
	const reviewing = input.kind === 'review';
	const shipped = reviewing
		? section(
				'Verdicts',
				bullets(
					(input.verdicts ?? []).map(
						(verdict) =>
							`${verdict.proposal.toLowerCase()}: ${verdict.verdict}`,
					),
					'None recorded.',
				),
			)
		: section(
				'Slices shipped',
				bullets(
					(input.slices ?? []).map((slice) =>
						slice.title === undefined
							? slice.id
							: `${slice.id}: ${shapeSummary(slice.title)}`,
					),
					'None.',
				),
			);
	const zones = [
		...new Set(files.map((file) => scopeOfPaths([file]))),
	].sort();
	const body = [
		section('What', freeText(input.summary)),
		section('Why', freeText(input.why)),
		shipped,
		section(
			'Files and zones',
			`Zones: ${zones.length === 0 ? 'none' : zones.join(', ')}\n\n${bullets(listed, 'No files.')}`,
		),
		section('Proof', proofText(input.proof)),
		section('Review notes', bullets(input.reviewNotes ?? [], 'None.')),
	].join('\n\n');
	return {
		title: titleOf(input.type, input.scope, input.summary, input.units),
		body: `${body}\n`,
	};
};

/** The title and body of an issue. */
export const renderIssueText = (input: IIssueTextInput): IChangeText => {
	const body = [
		section('Summary', freeText(input.summary)),
		section('Where', freeText(input.where)),
		section('Evidence', freeText(input.evidence)),
		section(
			'Expected and Actual',
			`Expected: ${freeText(input.expected)}\n\nActual: ${freeText(input.actual)}`,
		),
		section('Proposal link', input.proposalLink ?? 'None yet.'),
	].join('\n\n');
	return {
		title: titleOf(
			input.type,
			input.scope,
			input.summary,
			input.units ?? [],
		),
		body: `${body}\n`,
	};
};
