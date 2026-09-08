#!/usr/bin/env bun
/**
 * tool-schema-shape.script.ts — no tool may register `schema.shape`.
 *
 * `server.registerTool` here is delendai's wrapper, not the raw MCP SDK
 * server, and its contract is `inputSchema: z.ZodType<TArgs>` — a whole
 * schema. The raw SDK takes a `ZodRawShape`, so `.shape` is muscle
 * memory for anyone who has used it directly, and it type-checks either
 * way: a raw shape is a perfectly good object.
 *
 * What it is not is a schema. It has no `.safeParse` and no `.parse`, so
 * the tool blows up the moment anything validates against it, and
 * `verify:tools` reports:
 *
 *     inputSchema.safeParse is not a function
 *
 * This happened twice in one day. Seven tools shipped with it — every
 * SQLite tool the repo had, `proposals_db_reconcile` (the first
 * production writer) included — and while those were being fixed another
 * five landed with the same mistake. Nothing caught it at author time;
 * `verify:tools` only runs the whole server, so the feedback arrived
 * minutes later and only if someone ran it.
 *
 * The failure is textual and unambiguous, so a grep-level lint catches it
 * at the moment it is written.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const SCAN_ROOTS = ['plugins', 'packages'] as const;
const SHAPE_RE = /\b(input|output)Schema:\s*[A-Za-z0-9_.]+\.shape\b/g;

export interface IShapeFinding {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

const walk = (dir: string, out: string[]): void => {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === 'dist' || entry === 'build')
			continue;
		const abs = join(dir, entry);
		if (statSync(abs).isDirectory()) walk(abs, out);
		else if (abs.endsWith('.ts') && !abs.endsWith('.d.ts')) out.push(abs);
	}
};

/** Pure over file contents so the spec does not need a filesystem. */
export const findShapeRegistrations = (
	file: string,
	body: string,
): readonly IShapeFinding[] => {
	const findings: IShapeFinding[] = [];
	body.split('\n').forEach((text, index) => {
		SHAPE_RE.lastIndex = 0;
		if (SHAPE_RE.test(text))
			findings.push({ file, line: index + 1, text: text.trim() });
	});
	return findings;
};

export const scanShapeRegistrations = (
	root: string,
): readonly IShapeFinding[] => {
	const findings: IShapeFinding[] = [];
	for (const scanRoot of SCAN_ROOTS) {
		const abs = join(root, scanRoot);
		const files: string[] = [];
		try {
			walk(abs, files);
		} catch {
			continue;
		}
		for (const file of files) {
			findings.push(
				...findShapeRegistrations(
					relative(root, file).split('\\').join('/'),
					readFileSync(file, 'utf8'),
				),
			);
		}
	}
	return findings;
};

const main = (): number => {
	const findings = scanShapeRegistrations(repoRoot());
	if (findings.length === 0) {
		console.log(
			'✓ tool-schema-shape: no tool registers a raw shape where a schema is required.',
		);
		return 0;
	}
	console.error(
		`✖ tool-schema-shape: ${String(findings.length)} registration(s) pass \`.shape\` where a whole schema is required:`,
	);
	for (const finding of findings) {
		console.error(`  ${finding.file}:${String(finding.line)}`);
		console.error(`    ${finding.text.slice(0, 140)}`);
	}
	console.error(
		'\n  A raw shape has no .safeParse/.parse, so the tool fails at runtime and',
	);
	console.error(
		'  verify:tools reports "inputSchema.safeParse is not a function".',
	);
	console.error('  Drop the `.shape` and pass the schema itself.');
	return 1;
};

if (import.meta.main) process.exit(main());
