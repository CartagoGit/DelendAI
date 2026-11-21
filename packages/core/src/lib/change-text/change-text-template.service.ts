/**
 * change-text-template.service.ts — the one pull request and issue text
 * (f00809). A pure renderer: the type, the scope and the section order are
 * derived here, a caller only supplies text.
 */
import {
	CHANGE_TEXT_EMPTY_SECTION,
	CHANGE_TEXT_ISSUE_SECTIONS,
	CHANGE_TEXT_NOT_PROVED,
	CHANGE_TEXT_REVIEW_SECTIONS,
	CHANGE_TEXT_SUMMARY_LIMIT,
	CHANGE_TEXT_WORK_SECTIONS,
} from '../contracts/constants/change-text.constant';
import type {
	IChangeText,
	IChangeTextInput,
	IChangeTextProofStep,
	IChangeTextProposalRef,
	IChangeTextType,
} from '../contracts/interfaces/change-text.interface';

const SLICE_NUMBER = /^S(\d+)$/;

/** The summary cut to the limit at a word boundary. */
export const truncateSummary = (
	summary: string,
	limit: number = CHANGE_TEXT_SUMMARY_LIMIT,
): string => {
	const text = summary.replace(/\s+/g, ' ').trim();
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit + 1);
	const space = cut.lastIndexOf(' ');
	return (space > 0 ? cut.slice(0, space) : text.slice(0, limit)).trimEnd();
};

/** One proposal in the branch grammar: `x01003`, `x01003-S2`, `x01003-S1-S3`, `x01003-S1+S4`. */
const oneProposalScope = (ref: IChangeTextProposalRef): string => {
	const numbered: number[] = [];
	const others: string[] = [];
	for (const slice of ref.slices ?? []) {
		const match = SLICE_NUMBER.exec(slice);
		if (match?.[1] === undefined) others.push(slice);
		else numbered.push(Number(match[1]));
	}
	numbered.sort((a, b) => a - b);
	const parts: string[] = [];
	for (let i = 0; i < numbered.length; ) {
		let end = i;
		while (numbered[end + 1] === (numbered[end] ?? 0) + 1) end += 1;
		parts.push(
			end > i ? `S${numbered[i]}-S${numbered[end]}` : `S${numbered[i]}`,
		);
		i = end + 1;
	}
	const slices = [...parts, ...others.sort()];
	return slices.length === 0
		? ref.proposal
		: `${ref.proposal}-${slices.join('+')}`;
};

/** The proposal-scope of a title, in the branch grammar. */
export const proposalScope = (
	refs: readonly IChangeTextProposalRef[],
): string => refs.map(oneProposalScope).join('+');

/** The title scope: the most common zone of the files, `core` when none. */
export const zoneScope = (files: readonly string[] = []): string => {
	const counts = new Map<string, number>();
	for (const file of files) {
		if (!file.includes('/')) continue;
		const [top, second] = file.split('/');
		const zone =
			(top === 'packages' || top === 'plugins' || top === 'apps') &&
			second
				? second
				: top;
		if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1);
	}
	let best = 'repo';
	let bestCount = 0;
	for (const [zone, count] of counts) {
		if (count > bestCount) {
			best = zone;
			bestCount = count;
		}
	}
	return best;
};

const titleType = (input: IChangeTextInput): IChangeTextType => {
	switch (input.kind) {
		case 'review':
			return 'review';
		case 'implement':
			return input.proposalKind ?? 'feat';
		case 'issue':
			return 'fix';
		default:
			return 'chore';
	}
};

const text = (value: string | undefined): string =>
	value?.trim() ? value.trim() : CHANGE_TEXT_EMPTY_SECTION;

const list = (items: readonly string[] | undefined): string =>
	items && items.length > 0
		? items.map((item) => `- ${item}`).join('\n')
		: CHANGE_TEXT_EMPTY_SECTION;

const FILE_LIST_LIMIT = 40;

/** A long file list shortened to its first entries and a count. */
const shortList = (
	items: readonly string[] | undefined,
): readonly string[] | undefined =>
	items && items.length > FILE_LIST_LIMIT
		? [
				...items.slice(0, FILE_LIST_LIMIT),
				`... and ${String(items.length - FILE_LIST_LIMIT)} more`,
			]
		: items;

const proof = (steps: readonly IChangeTextProofStep[] | undefined): string =>
	steps && steps.length > 0
		? steps.map((s) => `- ${s.step}: ${s.durationMs} ms`).join('\n')
		: CHANGE_TEXT_NOT_PROVED;

const sections = (
	headings: readonly string[],
	content: Readonly<Record<string, string>>,
): string =>
	headings
		.map((h) => `## ${h}\n\n${content[h] ?? CHANGE_TEXT_EMPTY_SECTION}`)
		.join('\n\n');

const renderBody = (input: IChangeTextInput): string => {
	if (input.kind === 'issue') {
		return sections(CHANGE_TEXT_ISSUE_SECTIONS, {
			Summary: text(input.summary),
			Where: text(input.where),
			Evidence: text(input.evidence),
			'Expected and Actual': `Expected: ${text(input.expected)}\n\nActual: ${text(input.actual)}`,
			'Proposal link': text(input.proposalLink),
		});
	}
	const shared = {
		What: text(input.what ?? input.summary),
		Why: text(input.why),
		'Files and zones': list(shortList(input.files)),
		Proof: proof(input.proof),
		'Review notes': text(input.reviewNotes),
	};
	if (input.kind === 'review') {
		return sections(CHANGE_TEXT_REVIEW_SECTIONS, {
			...shared,
			Verdicts: list(
				input.verdicts?.map((v) => `${v.proposal}: ${v.verdict}`),
			),
		});
	}
	return sections(CHANGE_TEXT_WORK_SECTIONS, {
		...shared,
		'Slices shipped': list(input.slicesShipped),
	});
};

/** Render the title and body of a pull request or an issue. */
export const renderChangeText = (input: IChangeTextInput): IChangeText => {
	const scope = proposalScope(input.proposals ?? []);
	const summary = truncateSummary(input.summary);
	const head = `${titleType(input)}(${zoneScope(input.files)}): ${summary}`;
	return {
		title: scope === '' ? head : `${head} (${scope})`,
		body: renderBody(input),
	};
};
