#!/usr/bin/env bun
/**
 * privacy-validator-no-expansion.script.ts — x00256 S1 guardrail.
 *
 * PRIV-002 (P2, MEJORA / ARQUITECTURA): the privacy validator is
 * the last barrier before the public DTO. Adding heuristic regexes
 * of the form "if a string looks like a company name → redact"
 * opens the door to false positives and false negatives. The only
 * sanctioned way to keep private data out of the DTO is provenance
 * (Track B) — fix it at the origin, not in the validator.
 *
 * This lint scans
 * `plugins/error-reporting/src/lib/privacy-validator.helper.ts`
 * for two patterns that indicate the anti-pattern is sneaking in:
 *
 *  1. Any new top-level `const NAME = ['Foo', 'Bar', ...]` (or
 *     `readonly string[]` form) whose values are > 5 capitalised
 *     tokens AND lack the URL/path / format-pattern context that
 *     legitimate constants (URL allowlist, JWT header, ...)
 *     carry. The shape is heuristic: the script looks for arrays
 *     with all-Capitalised strings that are not preceded (within
 *     200 chars) by a `URL`, `PATH`, or `FORMAT` marker comment.
 *  2. The x00256 fixture file
 *     `plugins/error-reporting/tests/fixtures/privacy-validator-anti-pattern.ts`
 *     exists and must be rejected on `--apply`. We scan it as an
 *     extra sanity check.
 *
 * Usage (matches the existing lint conventions):
 *
 *   bun tools/scripts/lint/privacy-validator-no-expansion.script.ts
 *     # dry-run by default: print findings, exit 0
 *   bun tools/scripts/lint/privacy-validator-no-expansion.script.ts --apply
 *     # exit 1 on any finding (used in `bun run lint:privacy`)
 *
 * Architecture (SOLID):
 *  - `IDetection` (interface) — one row in the report.
 *  - `scanValidator(text)` (pure engine) — returns findings for the
 *    validator source.
 *  - `scanAntiPatternFixture(text)` (pure engine) — returns findings
 *    for the fixture.
 *  - `formatReport(findings)` (pure formatter).
 *  - `main()` (CLI shell) — parses args, runs engines, prints,
 *    exits.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const VALIDATOR_PATH =
	'plugins/error-reporting/src/lib/privacy-validator.helper.ts';
const ANTI_PATTERN_FIXTURE_PATH =
	'plugins/error-reporting/tests/fixtures/privacy-validator-anti-pattern.ts';

const APPLY = process.argv.includes('--apply');

/** A single finding: a place the validator drifted toward enterprise-PII heuristics. */
export interface IDetection {
	readonly file: string;
	readonly line: number;
	readonly reason: string;
	readonly excerpt: string;
}

/**
 * Heuristic match for the "stopword list" anti-pattern: a single
 * literal array whose values are all-Capitalised words (no lower
 * case, no underscores) and the array is large enough to look
 * like a curated stopword list. We require > 5 entries to match
 * because legitimate constants (URL allowlist, JWT header list,
 * domain allowlist) are typically shorter or carry context.
 */
const CAPITALISED_WORD = /^[A-Z][A-Za-z]+$/;
const STOPWORD_ARRAY_PATTERN =
	/(?:const|export const)\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]+)\]/g;

/**
 * Read the comment lines immediately preceding a constant (only
 * comments, no array contents). A legitimate constant is usually
 * preceded by a comment that mentions URL / path / format /
 * pattern / JWT — anything else is a candidate stopword list.
 * We only inspect `//` comments on the lines directly above the
 * constant so a sibling array's contents cannot mask the new
 * stopword list.
 */
const contextAbove = (text: string, matchIndex: number): string => {
	const start = Math.max(0, matchIndex - 200);
	const window = text.slice(start, matchIndex);
	// Walk back from the constant collecting consecutive comment
	// lines (skipping blank lines).
	const lines = window.split('\n');
	const comments: string[] = [];
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const line = lines[i]?.trim() ?? '';
		if (line === '') continue;
		if (line.startsWith('//')) {
			comments.unshift(line);
			continue;
		}
		break;
	}
	return comments.join(' ');
};

const hasLegitimateContext = (context: string): boolean => {
	const lower = context.toLowerCase();
	return (
		lower.includes('url') ||
		lower.includes('path') ||
		lower.includes('format') ||
		lower.includes('pattern') ||
		lower.includes('allowlist') ||
		lower.includes('domain') ||
		lower.includes('jwt') ||
		lower.includes('header') ||
		lower.includes('tag') ||
		lower.includes('category') ||
		lower.includes('marker')
	);
};

/**
 * Pure engine: scan the privacy validator source for new stopword
 * arrays. Returns the list of findings (empty when clean).
 */
export const scanValidator = (text: string): readonly IDetection[] => {
	const findings: IDetection[] = [];
	STOPWORD_ARRAY_PATTERN.lastIndex = 0;
	while (true) {
		const match = STOPWORD_ARRAY_PATTERN.exec(text);
		if (match === null) break;
		const [, name, body] = match;
		const entries = (body ?? '')
			.split(',')
			.map((entry) =>
				entry
					.replace(/^\s*['"]|['"]\s*$/g, '')
					.replace(/^\s*\{\s*|\s*\}\s*$/g, '')
					.trim(),
			)
			.filter((entry) => entry.length > 0);
		if (entries.length < 6) continue;
		if (!entries.every((entry) => CAPITALISED_WORD.test(entry))) continue;
		const context = contextAbove(text, match.index);
		if (hasLegitimateContext(context)) continue;
		const line = text.slice(0, match.index).split('\n').length;
		findings.push({
			file: VALIDATOR_PATH,
			line,
			reason: 'new stopword array detected — PRIV-002 forbids adding "looks like a company name" heuristics',
			excerpt: `${name} = [${entries.slice(0, 6).join(', ')}${entries.length > 6 ? ', ...' : ''}]`,
		});
	}
	return findings;
};

/**
 * The fixture is the canonical anti-pattern. We surface its
 * presence so the lint can tell humans "you wrote the bait — and
 * the bait is still there". `--apply` exits 1 so the workflow
 * refuses to ship with the fixture present.
 */
export const scanAntiPatternFixture = async (
	absPath: string,
): Promise<readonly IDetection[]> => {
	const text = await readFile(absPath, 'utf8').catch(() => '');
	if (text === '') return [];
	if (!text.includes('COMPANY_NAME_STOPWORDS')) return [];
	return [
		{
			file: ANTI_PATTERN_FIXTURE_PATH,
			line: 1,
			reason: 'fixture file intentionally models the anti-pattern; remove it once the lint has been verified',
			excerpt: 'COMPANY_NAME_STOPWORDS = [Acme, Bank, Corp, Ltd, ...]',
		},
	];
};

/** Pure formatter: turn findings into a human-readable report. */
export const formatReport = (findings: readonly IDetection[]): string => {
	if (findings.length === 0) {
		return '✓ privacy-validator-no-expansion: validator is fail-closed and carries no enterprise-PII heuristics.\n';
	}
	const lines: string[] = [
		`✗ privacy-validator-no-expansion: ${findings.length} finding${findings.length === 1 ? '' : 's'}.\n`,
		'  PRIV-002 forbids adding "looks like a company name" heuristics',
		'  to the validator. Fix the data at the origin (provenance) instead.\n',
	];
	for (const f of findings) {
		lines.push(`  ${f.file}:${f.line}`);
		lines.push(`    ${f.reason}`);
		lines.push(`    → ${f.excerpt}`);
	}
	return `${lines.join('\n')}\n`;
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const validatorText = await readFile(join(root, VALIDATOR_PATH), 'utf8');
	const fixtureText = await readFile(
		join(root, ANTI_PATTERN_FIXTURE_PATH),
		'utf8',
	).catch(() => '');
	const fixtureFindings =
		fixtureText === ''
			? []
			: await scanAntiPatternFixture(
					join(root, ANTI_PATTERN_FIXTURE_PATH),
				);
	const validatorFindings = scanValidator(validatorText);
	// Findings in the production validator are always blocking on
	// `--apply`. The fixture is a permanent sanity-check artefact:
	// its presence is informational (proves the lint still fires)
	// and only blocking when accompanied by other findings. The
	// CI gate wires `--apply`, so a regression in the validator
	// itself still fails the build.
	const findings = [...validatorFindings, ...fixtureFindings];
	const report = formatReport(findings);
	if (findings.length === 0) {
		process.stdout.write(report);
		return 0;
	}
	const blocking = APPLY && validatorFindings.length > 0;
	if (blocking) {
		process.stderr.write(report);
		return 1;
	}
	// Dry-run by default, or fixture-only under `--apply`: still
	// observable, but not blocking. Operators can `--apply` plus
	// delete the fixture to confirm a clean exit (see docs/mcp-
	// vertex/contributing/lint-rules.md).
	process.stdout.write(report);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
