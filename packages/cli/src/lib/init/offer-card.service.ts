/**
 * offer-card.service.ts — how the offer of accounts looks at a terminal:
 * a header that says what is happening, one numbered card per account,
 * and a summary table at the end.
 *
 * Only the left edge is drawn, so a card stays whole at any width and in
 * a log; colour comes from the shared palette, which a pipe turns off.
 */
import type { IOfferMessages } from '../../contracts/interfaces/offer-messages.interface';
import { c } from '../helpers/cli-color.helper';

const DEFAULT_WIDTH = 72;
const MIN_WIDTH = 40;
const MODELS_SHOWN = 4;

/** The width cards are wrapped to: the terminal's, within reason. */
export const cardWidth = (columns: number | undefined): number =>
	// A pseudo-terminal can report 0 columns: that is no width at all.
	Math.max(
		MIN_WIDTH,
		Math.min(
			columns === undefined || columns <= 0 ? DEFAULT_WIDTH : columns,
			DEFAULT_WIDTH,
		),
	);

/** `text` broken at spaces into lines of at most `width` characters. */
export const wrap = (text: string, width: number): readonly string[] => {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/u).filter((each) => each.length > 0)) {
		if (line.length > 0 && line.length + 1 + word.length > width) {
			lines.push(line);
			line = word;
		} else line = line.length === 0 ? word : `${line} ${word}`;
	}
	if (line.length > 0) lines.push(line);
	return lines;
};

/** The header an offer opens with: its title and what it does. */
export const offerHeader = (messages: IOfferMessages, width: number): string =>
	[
		'',
		`  ${c.magenta('◆')} ${c.bold(messages.title)}`,
		...wrap(messages.intro, width - 4).map((line) => `    ${c.gray(line)}`),
		'',
	].join('\n');

/** A heading between the runs of cards. */
export const offerSection = (text: string): string =>
	`\n  ${c.bold(c.cyan(text))}\n`;

/** One card: `3/13 · what kind`, the account in bold, its details below. */
export const offerCard = (input: {
	readonly index: number;
	readonly total: number;
	readonly kind: string;
	readonly title: string;
	readonly details: readonly string[];
	readonly width: number;
}): string => {
	const inner = input.width - 6;
	const edge = c.cyan('│');
	const kicker = `${c.cyan(`╭─ ${String(input.index)}/${String(input.total)}`)}${input.kind.length > 0 ? ` ${c.gray('·')} ${c.cyan(input.kind)}` : ''}`;
	return [
		'',
		`  ${kicker}`,
		...wrap(input.title, inner).map((line) => `  ${edge}  ${c.bold(line)}`),
		...input.details.flatMap((detail) =>
			wrap(detail, inner).map((line) => `  ${edge}  ${c.gray(line)}`),
		),
		`  ${c.cyan('╰─')}`,
	].join('\n');
};

/** `a, b, c, d and 9 more`, in the person's language. */
export const modelsLine = (
	messages: IOfferMessages,
	models: readonly string[],
): string | undefined =>
	models.length === 0
		? undefined
		: messages.models(
				models.slice(0, MODELS_SHOWN).join(', '),
				Math.max(0, models.length - MODELS_SHOWN),
			);

/** The table an offer ends with: what was added, declined, left. */
export const offerSummary = (
	messages: IOfferMessages,
	outcome: {
		readonly added: readonly string[];
		readonly declined: readonly string[];
		readonly notAsked: number;
		readonly personalLayer: string;
	},
): string => {
	const rows: ReadonlyArray<readonly [string, string, string]> = [
		[
			c.green('✓'),
			messages.added,
			outcome.added.join(', ') || messages.none,
		],
		[
			c.red('✗'),
			messages.declined,
			outcome.declined.join(', ') || messages.none,
		],
		...(outcome.notAsked === 0
			? []
			: [
					[
						c.yellow('…'),
						messages.notAsked,
						`${String(outcome.notAsked)} (${messages.notAskedHint})`,
					] as const,
				]),
		[c.gray('▸'), messages.yourFile, outcome.personalLayer],
	];
	const labelWidth = Math.max(...rows.map(([, label]) => label.length));
	return [
		offerSection(messages.summaryHeading),
		...rows.map(
			([mark, label, value]) =>
				`  ${mark} ${c.bold(label.padEnd(labelWidth))}  ${value}`,
		),
		'',
		`  ${c.gray(messages.automationHint)}`,
		'',
	].join('\n');
};
