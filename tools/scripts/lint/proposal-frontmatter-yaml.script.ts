#!/usr/bin/env bun
/**
 * proposal-frontmatter-yaml.script.ts — r00643 S0.
 *
 * Every proposal frontmatter is YAML. The proposals were read by two
 * hand-written parsers that accepted blocks YAML refuses (a second colon
 * in a list item, tab indentation, a key written twice) and each guessed
 * a different meaning; r00643 replaces them with one YAML parser, which
 * needs every file it reads to be YAML first.
 *
 * `legacy/closed/` is frozen by its own guard and is not checked here.
 *
 *   bun tools/scripts/lint/proposal-frontmatter-yaml.script.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parse } from 'yaml';

import { repoRoot } from '../lib/monorepo-paths';

const PROPOSALS_ROOT = 'docs/delendai/proposals';
const FROZEN_PREFIX = 'legacy/';

/** Why a proposal's frontmatter is not YAML, or undefined when it is. */
export const frontmatterYamlError = (raw: string): string | undefined => {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(raw)?.[1];
	if (block === undefined) return undefined;
	try {
		parse(block, { schema: 'core' });
		return undefined;
	} catch (error) {
		return error instanceof Error
			? (error.message.split('\n')[0] ?? error.message)
			: String(error);
	}
};

const markdownUnder = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return markdownUnder(path);
		return name.endsWith('.md') ? [path] : [];
	});

const main = (): number => {
	const root = join(repoRoot(), PROPOSALS_ROOT);
	const failures = markdownUnder(root)
		.map((path) => ({ rel: relative(root, path), path }))
		.filter((file) => !file.rel.startsWith(FROZEN_PREFIX))
		.flatMap((file) => {
			const error = frontmatterYamlError(readFileSync(file.path, 'utf8'));
			return error === undefined ? [] : [`  ${file.rel}: ${error}`];
		});
	if (failures.length === 0) {
		console.log('✓ proposal-frontmatter-yaml: every frontmatter is YAML.');
		return 0;
	}
	console.error(
		`✖ proposal-frontmatter-yaml: ${String(failures.length)} frontmatter(s) are not YAML — quote the value or fix the indentation:\n${failures.join('\n')}`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());
