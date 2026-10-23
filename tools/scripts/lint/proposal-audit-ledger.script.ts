#!/usr/bin/env bun
/**
 * proposal-audit-ledger.script.ts — a plan's ledger settles only the
 * findings its audits have, each once (f00764).
 *
 * A plan that contains audits keeps a `## Ledger` naming, for every
 * finding, the proposals that settle it, the finding it duplicates, or
 * why it is rejected. A row for a finding no contained audit has is a
 * typo the closure would never notice; a finding settled twice is two
 * answers to one question.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
	ledgerProblems,
	parseAuditFindings,
	parseAuditLedger,
} from '../../../plugins/proposals/src/lib/proposals/audit-findings';

const ROOT = resolve(import.meta.dirname, '../../..');
const PROPOSALS = join(ROOT, 'docs/delendai/proposals');

/** The ids a plan's frontmatter lists under `contains: audits:`. */
export const containedAudits = (markdown: string): readonly string[] => {
	const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(markdown)?.[1] ?? '';
	const block =
		/^\s+audits:\s*\n((?:\s+-.*\n?)+)/mu.exec(frontmatter)?.[1] ?? '';
	const inline = /^\s+audits:\s*\[([^\]]*)\]/mu.exec(frontmatter)?.[1];
	const raw = inline === undefined ? block.split('\n') : inline.split(',');
	return raw
		.map((line) =>
			line
				.replace(/^\s*-\s*/u, '')
				.replace(/^id:\s*/u, '')
				.replace(/["']/gu, '')
				.trim(),
		)
		.filter((id) => /^a\d{5}$/u.test(id));
};

const main = (): number => {
	const files = readdirSync(PROPOSALS, {
		recursive: true,
		withFileTypes: true,
	})
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => join(entry.parentPath, entry.name));
	if (files.length === 0) {
		console.error(
			`✖ proposal-audit-ledger: no proposal under ${PROPOSALS}; nothing was checked.`,
		);
		return 1;
	}
	const byId = new Map(
		files.map((path) => [
			/([a-z]\d{5})-/u.exec(path.split('/').pop() ?? '')?.[1] ?? '',
			path,
		]),
	);
	const problems: string[] = [];
	let plans = 0;
	for (const path of files) {
		const markdown = readFileSync(path, 'utf8');
		const audits = containedAudits(markdown);
		if (audits.length === 0) continue;
		plans += 1;
		const findingsByAudit = new Map(
			audits.flatMap((audit) => {
				const file = byId.get(audit);
				return file === undefined
					? []
					: [
							[
								audit,
								parseAuditFindings(readFileSync(file, 'utf8'))
									.findings,
							] as const,
						];
			}),
		);
		for (const problem of ledgerProblems({
			findingsByAudit,
			ledger: parseAuditLedger(markdown),
		}))
			problems.push(`${relative(ROOT, path)}: ${problem}`);
	}
	if (problems.length > 0) {
		console.error(
			`✖ proposal-audit-ledger: ${String(problems.length)} ledger problem(s):\n  ${problems.join('\n  ')}`,
		);
		return 1;
	}
	console.log(
		`✓ proposal-audit-ledger: ${String(plans)} plan(s) with audits, every ledger row settles one known finding once.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
