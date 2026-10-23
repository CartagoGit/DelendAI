/**
 * audit-findings.ts — an audit's findings as data, and the ledger a plan
 * keeps of how each one is settled (f00764).
 *
 * a00095 grew to 286 findings across ten reviewers, each one a heading
 * with fields beneath it and a `seenBy` line every reviewer extended by
 * hand. Nothing read that structure, so a finding was "done" only in
 * prose and the same defect found by two audits was tracked twice or not
 * at all. A finding is now a record; a plan that contains audits names,
 * for every finding, the proposals that settle it, the finding it
 * duplicates, or why it is rejected.
 */
import type {
	IAuditFinding,
	IAuditFindings,
	ILedgerEntry,
	ILedgerSettlement,
	IOpenAuditFinding,
} from '../contracts/interfaces/audit-findings.interface';

/** `### G12 — Title`, the heading a finding opens with. */
const FINDING_HEADING = /^#{2,4}\s+([A-Z]{1,3}\d+)\s+[—–-]\s+(.+?)\s*$/u;

/** The field names a finding carries, as the audits write them. */
const FIELD_NAMES: Readonly<Record<string, keyof IFindingFields>> = {
	'clasificaci\u00f3n': 'classification',
	clasificacion: 'classification',
	classification: 'classification',
	zona: 'zone',
	zone: 'zone',
	evidencia: 'evidence',
	evidence: 'evidence',
	seenby: 'seenBy',
};

interface IFindingFields {
	classification?: string;
	zone?: string;
	evidence?: string;
	seenBy?: string;
}

/** `a, b (note, with commas), c` — split at the commas outside parentheses. */
const splitOutsideParentheses = (text: string): readonly string[] => {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of text) {
		if (char === '(') depth += 1;
		if (char === ')') depth = Math.max(0, depth - 1);
		if (char === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts.map((part) => part.trim()).filter((part) => part.length > 0);
};

/** The reviewer a `seenBy` entry names, without its note. */
const reviewerOf = (entry: string): string =>
	entry
		.replace(/\s*\(.*$/u, '')
		.replace(/`/gu, '')
		.trim();

/** Every `Name: value` pair on one bullet line (`Classification: X · Zone: core`, or the same in the audit's language). */
const fieldsOnLine = (line: string): readonly [string, string][] =>
	line
		.replace(/^\s*-\s*/u, '')
		.split(/\s+·\s+/u)
		.flatMap((part) => {
			const match = /^([\p{L}]+)\s*:\s*(.*)$/u.exec(part.trim());
			return match === null ? [] : [[match[1] ?? '', match[2] ?? '']];
		});

const finish = (
	id: string,
	title: string,
	fields: IFindingFields,
): IAuditFinding => ({
	id,
	title,
	...(fields.classification === undefined
		? {}
		: { classification: fields.classification.replace(/`/gu, '').trim() }),
	...(fields.zone === undefined ? {} : { zone: fields.zone.trim() }),
	...(fields.evidence === undefined
		? {}
		: { evidence: fields.evidence.trim() }),
	seenBy:
		fields.seenBy === undefined
			? []
			: splitOutsideParentheses(fields.seenBy).map(reviewerOf),
});

/**
 * The findings an audit document holds, in order, and the ids of those
 * that carry no evidence. A finding opens with its heading; its fields
 * are the bullet lines beneath it until the next heading; a field's
 * value continues on the indented lines that follow it.
 */
export const parseAuditFindings = (markdown: string): IAuditFindings => {
	const findings: IAuditFinding[] = [];
	let current:
		| {
				id: string;
				title: string;
				fields: IFindingFields;
				last?: keyof IFindingFields | undefined;
		  }
		| undefined;
	const close = (): void => {
		if (current !== undefined)
			findings.push(finish(current.id, current.title, current.fields));
		current = undefined;
	};
	for (const line of markdown.split('\n')) {
		const heading = FINDING_HEADING.exec(line);
		if (heading !== null) {
			close();
			current = {
				id: heading[1] ?? '',
				title: heading[2] ?? '',
				fields: {},
			};
			continue;
		}
		if (/^#{1,4}\s/u.test(line)) {
			close();
			continue;
		}
		if (current === undefined) continue;
		if (/^\s*-\s/u.test(line)) {
			current.last = undefined;
			for (const [name, value] of fieldsOnLine(line)) {
				const key = FIELD_NAMES[name.toLowerCase()];
				if (key === undefined || current.fields[key] !== undefined)
					continue;
				current.fields[key] = value;
				current.last = key;
			}
			continue;
		}
		if (current.last !== undefined && /^\s+\S/u.test(line))
			current.fields[current.last] =
				`${current.fields[current.last] ?? ''} ${line.trim()}`;
	}
	close();
	return {
		findings,
		withoutEvidence: findings
			.filter((finding) => finding.evidence === undefined)
			.map((finding) => finding.id),
	};
};

/** `settled-by: x1, x2` · `same-as: a00094/G3` · `rejected: <reason>`. */
const settlementOf = (text: string): ILedgerSettlement | undefined => {
	const match = /^\s*(settled-by|same-as|rejected)\s*:\s*(.+?)\s*$/u.exec(
		text,
	);
	if (match === null) return undefined;
	const value = match[2] ?? '';
	if (match[1] === 'settled-by')
		return {
			kind: 'settled-by',
			proposals: value.split(/[,\s]+/u).filter((id) => id.length > 0),
		};
	if (match[1] === 'same-as') return { kind: 'same-as', finding: value };
	return { kind: 'rejected', reason: value };
};

/** `confirmed: a, b; disputed: c; threshold: 8`. */
const agreementOf = (
	text: string,
): Pick<ILedgerEntry, 'confirmed' | 'disputed' | 'threshold'> => {
	const part = (name: string): readonly string[] =>
		new RegExp(`${name}\\s*:\\s*([^;|]*)`, 'u')
			.exec(text)?.[1]
			?.split(',')
			.map((each) => each.trim())
			.filter(
				(each) => each.length > 0 && each !== '—' && each !== '-',
			) ?? [];
	const threshold = /threshold\s*:\s*(\d+)/u.exec(text)?.[1];
	return {
		confirmed: part('confirmed'),
		disputed: part('disputed'),
		...(threshold === undefined ? {} : { threshold: Number(threshold) }),
	};
};

/**
 * The ledger a plan keeps under its `## Ledger` heading: one table row
 * per finding, `| a00095/G1 | settled-by: x00940 | confirmed: …; disputed: … |`.
 * Rows that name no finding or no settlement are left out; the lint
 * reports them.
 */
export const parseAuditLedger = (markdown: string): readonly ILedgerEntry[] => {
	const lines = markdown.split('\n');
	const start = lines.findIndex((line) => /^##\s+Ledger\b/iu.test(line));
	if (start === -1) return [];
	const entries: ILedgerEntry[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^##\s/u.test(line)) break;
		const cells = line.split('|').map((cell) => cell.trim());
		if (cells.length < 4) continue;
		const finding = cells[1] ?? '';
		if (!/^[a-z]\d{5}\/[A-Z]{1,3}\d+$/u.test(finding)) continue;
		const settlement = settlementOf(cells[2] ?? '');
		if (settlement === undefined) continue;
		entries.push({ finding, settlement, ...agreementOf(cells[3] ?? '') });
	}
	return entries;
};

/**
 * Every finding of the contained audits the ledger leaves open: not in
 * the ledger at all, or settled by a proposal that is not done yet.
 */
export const openAuditFindings = (input: {
	readonly findingsByAudit: ReadonlyMap<string, readonly IAuditFinding[]>;
	readonly ledger: readonly ILedgerEntry[];
	readonly statusOf: (proposalId: string) => string | undefined;
}): readonly IOpenAuditFinding[] => {
	const byFinding = new Map(
		input.ledger.map((entry) => [entry.finding, entry]),
	);
	const open: IOpenAuditFinding[] = [];
	for (const [audit, findings] of input.findingsByAudit)
		for (const finding of findings) {
			const ref = `${audit}/${finding.id}`;
			const entry = byFinding.get(ref);
			if (entry === undefined) {
				open.push({ ref, reason: 'unsettled' });
				continue;
			}
			if (entry.settlement.kind !== 'settled-by') continue;
			const pending = entry.settlement.proposals.filter(
				(id) => input.statusOf(id) !== 'done',
			);
			if (pending.length > 0)
				open.push({ ref, reason: 'settling-proposal-open', pending });
		}
	return open;
};

/**
 * What is wrong with a ledger, as `lint:proposals` reports it: a row
 * naming a finding no contained audit has, and a finding settled twice.
 */
export const ledgerProblems = (input: {
	readonly findingsByAudit: ReadonlyMap<string, readonly IAuditFinding[]>;
	readonly ledger: readonly ILedgerEntry[];
}): readonly string[] => {
	const known = new Set(
		[...input.findingsByAudit].flatMap(([audit, findings]) =>
			findings.map((finding) => `${audit}/${finding.id}`),
		),
	);
	const seen = new Set<string>();
	const problems: string[] = [];
	for (const entry of input.ledger) {
		if (!known.has(entry.finding))
			problems.push(
				`${entry.finding}: no contained audit has this finding`,
			);
		if (seen.has(entry.finding))
			problems.push(`${entry.finding}: settled more than once`);
		seen.add(entry.finding);
	}
	return problems;
};
