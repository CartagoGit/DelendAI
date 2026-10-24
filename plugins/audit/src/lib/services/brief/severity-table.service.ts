/**
 * Severity table — the 7-band rubric the brief asks every model to
 * grade against, and the pure renderer that turns it into the
 * markdown row block consumed by `buildBrief`.
 *
 * SOLID — SRP: this file owns the canonical severity token table and
 * the markdown formatter. It is pure data plus a pure function of
 * that data; consumers (the brief builder, the consolidation tool)
 * reach into it for the rubric without owning the rubric themselves.
 */

/** Severity bands the brief surfaces to the model (canonical 7-band
 *  scale, pure English). Each row carries the canonical enum token
 *  used in the structured `worstSeverity` field plus a short English
 *  meaning. The full token IS the band label, so the model pastes
 *  exactly what the parser will emit — no translation step. */
export const SEVERITY_TABLE_ROWS: ReadonlyArray<{
	readonly band: string;
	readonly enumToken: string;
	readonly emoji: string;
	readonly meaning: string;
}> = [
	{
		band: 'FATAL',
		enumToken: 'FATAL',
		emoji: '🔴',
		meaning:
			'Critical: silent bug, security hole, or design error. Must fix.',
	},
	{
		band: 'BAD',
		enumToken: 'BAD',
		emoji: '🟠',
		meaning: 'Serious issue that degrades quality. Should fix soon.',
	},
	{
		band: 'MINOR',
		enumToken: 'MINOR',
		emoji: '🟡',
		meaning: 'A detail worth improving; non-urgent.',
	},
	{
		band: 'OK',
		enumToken: 'OK',
		emoji: '🟢',
		meaning: 'Above expectations; nothing to change.',
	},
	{
		band: 'GOOD',
		enumToken: 'GOOD',
		emoji: '🌟',
		meaning: 'Very good execution.',
	},
	{
		band: 'PERFECT',
		enumToken: 'PERFECT',
		emoji: '💎',
		meaning: 'Perfect implementation; zero defects.',
	},
	{
		band: 'EXEMPLARY',
		enumToken: 'EXEMPLARY',
		emoji: '✨',
		meaning: 'Reference-quality; worth copying into other projects.',
	},
];

/**
 * Render the rubric as a full markdown block ready to drop into the
 * brief. The section heading (`## 📐 Rubric …`), the table header
 * row, and the divider row are all emitted here (instead of being
 * inlined in `buildBrief`) so the brief builder stays a markdown
 * assembler and this file owns the contract that
 * `audit_consolidate` later parses against.
 *
 * Pure: no inputs, no side effects. Returns the heading + the table
 * rows joined by `\n`, with a leading `|` on every row. No trailing
 * newline — the consumer decides how to terminate the block before
 * it appends the next paragraph (the canonical enums explanation).
 */
export const renderSeverityTable = (): string => {
	const rows = SEVERITY_TABLE_ROWS.map(
		(r) =>
			`| **${r.band}** | ${r.emoji} | \`${r.enumToken}\` | ${r.meaning} |`,
	).join('\n');
	return `## 📐 Rubric (7 severity bands — pure English)

| Band | Emoji | Token | Meaning |
|---|---|---|---|
${rows}`;
};
