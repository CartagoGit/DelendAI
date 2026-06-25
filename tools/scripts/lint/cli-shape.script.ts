#!/usr/bin/env bun
/**
 * cli-shape.script.ts — f00049 S10 (CLI command-shape lint).
 *
 * Walks `packages/cli/src/commands/groups/*.ts` and asserts every
 * `ICliCommand.name` follows the documented shape:
 *
 *   - The first token is the plugin namespace (kebab-case for
 *     hyphenated plugins: `web-fetch`, `status-marker`,
 *     `test-convention`).
 *   - The second token (the action) is kebab-case (`auto-work`,
 *     not `autoWork` or `autowork`).
 *   - Nested sub-actions use the same kebab-case shape (`doctor env`,
 *     `doctor plugins`, `doctor tools`).
 *   - Top-level commands (`completion`, `version`, `help`) are exempt.
 *
 * Architecture (SOLID):
 *   - `IShapeRule` (interface) — one rule in the chain. Open/Closed:
 *     new rules are added by appending to `DEFAULT_CLI_SHAPE_RULES`,
 *     no edit to the composer.
 *   - `lintCliShape(rootDir, rules?, exempt?)` — pure engine. DIP:
 *     tests inject `rules` and `exempt` without touching the lint.
 *   - `formatReport(findings)` (pure formatter).
 *   - `main()` (CLI shell) — parses args, runs the engine, formats.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
	DEFAULT_CLI_SHAPE_RULES,
	parseShapeName,
	type IShapeFinding,
	type IShapeRule,
} from './cli-shape-rules';

export interface IShapeRuleFinding extends IShapeFinding {
	readonly file: string;
	readonly line: number;
	readonly name: string;
}

const TOP_LEVEL_EXEMPT: ReadonlySet<string> = new Set([
	// Built-in top-level commands with no plugin namespace.
	'completion',
	'version',
	'help',
	// `doctor` is a top-level diagnostic command whose actions (env,
	// plugins, tools) are nested subcommands, not part of the name —
	// the same single-token shape as `completion`.
	'doctor',
	// `web-fetch` is a 1:1 plugin command: the plugin maps to exactly
	// one tool (`mcp-vertex_web-fetch_web_fetch`), so the command *is* the action.
	// Its namespace is already kebab-case; there is no second token to
	// add without inventing a redundant `web-fetch fetch`.
	'web-fetch',
]);

/**
 * Parse `name: 'foo'` (or `name: "foo"`) from a TypeScript command-group
 * file. Returns the name string + 1-based line number, or null.
 */
const extractName = (source: string): { name: string; line: number } | null => {
	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^\s*name:\s*['"]([^'"]+)['"]/);
		if (m) return { name: m[1], line: i + 1 };
	}
	return null;
};

/**
 * Run every rule in `rules` against a parsed name. The first matching
 * rule wins (a single bad name triggers one finding). Open/Closed:
 * add a rule to `DEFAULT_CLI_SHAPE_RULES` to widen coverage without
 * editing this composer.
 */
const evaluateName = (
	rules: readonly IShapeRule[],
	name: string,
): readonly Omit<IShapeRuleFinding, 'file' | 'line' | 'name'>[] => {
	const parsed = parseShapeName(name);
	const findings: Omit<IShapeRuleFinding, 'file' | 'line' | 'name'>[] = [];
	for (const rule of rules) {
		const finding = rule.evaluate(parsed);
		if (finding) findings.push(finding);
	}
	return findings;
};

export const lintCliShape = async (
	rootDir: string,
	rules: readonly IShapeRule[] = DEFAULT_CLI_SHAPE_RULES,
	exempt: ReadonlySet<string> = TOP_LEVEL_EXEMPT,
): Promise<readonly IShapeRuleFinding[]> => {
	const groupsDir = join(rootDir, 'packages/cli/src/commands/groups');
	let entries: readonly import('node:fs').Dirent[];
	try {
		entries = await readdir(groupsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const findings: IShapeRuleFinding[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
		const file = join(groupsDir, entry.name);
		const source = await readFile(file, 'utf8');
		const extracted = extractName(source);
		if (!extracted) continue;
		if (exempt.has(extracted.name)) continue;
		const ruleFindings = evaluateName(rules, extracted.name);
		for (const rf of ruleFindings) {
			findings.push({
				...rf,
				file,
				line: extracted.line,
				name: extracted.name,
			});
		}
	}
	return findings;
};

export const formatReport = (
	findings: readonly IShapeRuleFinding[],
): string => {
	if (findings.length === 0) return 'cli-shape: 0 findings\n';
	const lines: string[] = [`cli-shape: ${findings.length} finding(s)`];
	for (const f of findings) {
		lines.push(`  ${f.file}:${f.line}  ${f.name}  (${f.rule})`);
	}
	return `${lines.join('\n')}\n`;
};

/** CLI entrypoint. Side-effecting; isolated from the engine for testability. */
export const main = async (argv: readonly string[]): Promise<number> => {
	const args = argv.slice(2);
	const reportOnly = args.includes('--report');
	const rootDir = process.cwd();
	const findings = await lintCliShape(rootDir);
	process.stderr.write(formatReport(findings));
	if (reportOnly) return 0;
	if (findings.length > 0) return 1;
	return 0;
};

// Run when invoked directly (not when imported by tests).
if (import.meta.main) {
	main(process.argv).then((code) => process.exit(code));
}
