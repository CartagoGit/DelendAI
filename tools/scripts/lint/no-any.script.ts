#!/usr/bin/env bun
/**
 * no-any.script.ts — x00156 S5.
 *
 * Enforces the project-documented (but previously unenforced) rule
 * "no `as any`" over `plugins/` and `packages/core/src/lib/`. Pure
 * regex, no AST — mirrors `solid-compliance.script.ts`'s
 * walkAndClassify → pure engine → formatReport → main shell template.
 *
 * Scope note: this does NOT flag `as unknown as <T>` — that pattern
 * is a separate, more nuanced case (documented MCP SDK workarounds
 * and duck-typing casts coexist with a handful of genuinely
 * ungrounded ones; see the `as unknown as` census in x00157's notes).
 * Blanket-flagging it here would fail `validate` on ~40 intentional,
 * already-reviewed casts. `as any` has no such legitimate use — it
 * erases type safety outright — so it is unconditionally banned.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { walkTsFiles } from '@delendai/core/public';

const AS_ANY_RE = /\bas\s+any\b/g;

export interface INoAnyFinding {
	readonly relPath: string;
	readonly line: number;
	readonly snippet: string;
}

/** Pure engine: caller supplies file contents, no fs access here. */
export const findAsAny = (
	fileContents: ReadonlyMap<string, string>,
): readonly INoAnyFinding[] => {
	const findings: INoAnyFinding[] = [];
	for (const [relPath, body] of fileContents) {
		const lines = body.split('\n');
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] ?? '';
			if (line.trimStart().startsWith('//')) continue;
			if (AS_ANY_RE.test(line)) {
				findings.push({ relPath, line: i + 1, snippet: line.trim() });
			}
			AS_ANY_RE.lastIndex = 0;
		}
	}
	findings.sort((a, b) =>
		a.relPath === b.relPath
			? a.line - b.line
			: a.relPath.localeCompare(b.relPath),
	);
	return findings;
};

export const formatReport = (findings: readonly INoAnyFinding[]): string => {
	if (findings.length === 0) return '✓ no-any: 0 `as any` casts found.';
	return [
		`✖ no-any: ${findings.length} \`as any\` cast(s) found:`,
		...findings.map((f) => `  ${f.relPath}:${f.line}  ${f.snippet}`),
		'  fix: narrow with a type guard, a Zod schema, or an explicit',
		'       interface instead of erasing the type entirely.',
	].join('\n');
};

const DEFAULT_ROOTS = ['plugins', 'packages/core/src/lib'];

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const rootDir = process.cwd();
	const files = await walkTsFiles(rootDir, DEFAULT_ROOTS);
	const fileContents = new Map<string, string>();
	await Promise.all(
		files.map(async (rel) => {
			fileContents.set(rel, await readFile(join(rootDir, rel), 'utf8'));
		}),
	);
	const findings = findAsAny(fileContents);
	process.stdout.write(`${formatReport(findings)}\n`);
	process.exit(findings.length === 0 ? 0 : 1);
}
