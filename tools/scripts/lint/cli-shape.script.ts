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
	// `router-dashboard` is a 1:1 group command: the group exposes exactly
	// one sub-action whose name happens to be the same word as the dashboard
	// noun. The kebab-case namespace `router-dashboard` is the canonical,
	// documented term (the help translation key, the webview path, and the
	// router doctor's auto-dashboard test all use it as one token).
	'router-dashboard',
]);

/**
 * Parse the primary command name from a typed `ICliCommand` object literal.
 * Looking for a bare `name:` property would mistake doctor section names
 * (`env`, `plugins`, `tools`) for CLI commands. The existing linter treats
 * one command-group file as one shape unit, so retain its first-name
 * contract while making the match type-aware.
 */
const extractName = (source: string): { name: string; line: number } | null => {
	const commandRe =
		/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*:\s*ICliCommand\s*=\s*\{\s*\n\s*name:\s*['"]([^'"]+)['"]/g;
	const match = commandRe.exec(source);
	const name = match?.[1];
	if (match === null || name === undefined) return null;
	const nameOffset = (match.index ?? 0) + match[0].lastIndexOf('name:');
	return { name, line: lineOf(source, nameOffset) };
};

const lineOf = (source: string, index: number): number =>
	source.slice(0, index).split('\n').length;

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
		if (
			!entry.isFile() ||
			!entry.name.endsWith('.ts') ||
			entry.name.endsWith('.spec.ts') ||
			entry.name.endsWith('.test.ts')
		)
			continue;
		const file = join(groupsDir, entry.name);
		const source = await readFile(file, 'utf8');
		const command = extractName(source);
		if (command === null || exempt.has(command.name)) continue;
		const ruleFindings = evaluateName(rules, command.name);
		for (const rf of ruleFindings) {
			findings.push({
				...rf,
				file,
				line: command.line,
				name: command.name,
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
