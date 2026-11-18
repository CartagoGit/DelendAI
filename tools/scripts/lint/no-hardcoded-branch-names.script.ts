#!/usr/bin/env bun
/**
 * no-hardcoded-branch-names.script.ts — this repository's branch names
 * are not the product's defaults.
 *
 * `develop` is what THIS project calls its integration branch. Eleven
 * source files treated it as a fact about every project: the branch
 * garbage collector defaulted to it before deciding what to delete, the
 * swarm hygiene engine before deciding what was non-conforming, the
 * release flow before reading a ref. A project whose trunk is `main`,
 * `trunk` or a release line got judgements made against a branch that
 * does not exist.
 *
 * The development policy answers the question, and the workspace answers
 * it when the policy does not — `projectBranches` reads both. A literal
 * in source is a project assuming its author's habits.
 *
 * Tests may name branches freely: a fixture has to call its branch
 * something, and pinning a literal there is the point.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	BASELINE_PATH,
	BRANCH_LITERALS,
	SOURCE_GLOBS,
} from './no-hardcoded-branch-names.constant';
import type { IBranchLiteralFinding } from './no-hardcoded-branch-names.interface';

/** Every hardcoded branch name in one text, with its line. */
export const branchLiteralsIn = (
	text: string,
): readonly { readonly line: number; readonly match: string }[] => {
	const found: { line: number; match: string }[] = [];
	text.split('\n').forEach((line, index) => {
		// A comment explaining why a name is NOT used is not a use.
		const code = line.replace(/\/\/.*$/u, '').replace(/^\s*\*.*$/u, '');
		for (const name of BRANCH_LITERALS) {
			for (const quote of ["'", '"', '`']) {
				if (code.includes(`${quote}${name}${quote}`)) {
					found.push({
						line: index + 1,
						match: `${quote}${name}${quote}`,
					});
				}
			}
		}
	});
	return found;
};

/** Scan the source files a caller hands over. */
export const findBranchLiterals = (
	files: readonly { readonly path: string; readonly text: string }[],
): readonly IBranchLiteralFinding[] =>
	files.flatMap((file) =>
		branchLiteralsIn(file.text).map((hit) => ({
			path: file.path,
			line: hit.line,
			match: hit.match,
		})),
	);

const sourceFiles = (
	root: string,
): readonly { readonly path: string; readonly text: string }[] =>
	execFileSync('git', ['ls-files', '-z', ...SOURCE_GLOBS], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => path.length > 0)
		.filter((path) => !/\.spec\.ts$|\.test\.ts$|\/tests\//u.test(path))
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				return [];
			}
		});

if (import.meta.main) {
	const root = process.cwd();
	const baseline = existsSync(join(root, BASELINE_PATH))
		? (JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')) as {
				readonly allowed?: readonly string[];
			})
		: {};
	const allowed = new Set(baseline.allowed ?? []);
	const findings = findBranchLiterals(sourceFiles(root)).filter(
		(finding) => !allowed.has(finding.path),
	);
	if (findings.length === 0) {
		console.log(
			'✓ no-hardcoded-branch-names: no source file assumes a branch name.',
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ no-hardcoded-branch-names: ${String(findings.length)} hardcoded branch name(s) in source.`,
			'',
			...findings
				.slice(0, 20)
				.map((f) => `  ${f.path}:${String(f.line)} — ${f.match}`),
			'',
			'  These are THIS project’s branch names, not the product’s defaults.',
			'  A project on `main`, `trunk` or a release line gets judgements made',
			'  against a branch that does not exist.',
			'',
			'  fix: read `projectBranches(workspaceRoot)`, or take the branch as an',
			'  argument the caller resolves from the policy.',
		].join('\n'),
	);
	process.exit(1);
}
