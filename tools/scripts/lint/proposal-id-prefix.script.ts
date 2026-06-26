#!/usr/bin/env bun
/**
 * proposal-id-prefix.script.ts — f00049 S9.
 *
 * Ensures proposal markdown files under `docs/mcp-vertex/proposals/**` have a
 * frontmatter `id:` prefix consistent with their parent status folder policy:
 *
 * - `ready/` -> `f|x|r|c|d|t`
 * - `done/`, `paused/`, `blocked/`, `retired/`, `review/`, `in-progress/`
 *   -> any prefix is accepted
 *
 * Non-proposal markdown files (e.g. README) are ignored by filename shape.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';

const PROPOSAL_FILENAME = /^[a-z]\d{5}-[a-z0-9-]+\.md$/;
const READY_PREFIXES = new Set(['f', 'x', 'r', 'c', 'd', 't']);
const STATUS_WITH_FREE_PREFIX = new Set([
	'done',
	'paused',
	'blocked',
	'retired',
	'review',
	'in-progress',
]);

interface IIssue {
	readonly relPath: string;
	readonly message: string;
}

const walkMarkdown = async (root: string): Promise<string[]> => {
	const entries = await readdir(root).catch(() => null);
	if (entries === null) return [];
	const out: string[] = [];
	for (const entry of entries) {
		const abs = join(root, entry);
		const info = await stat(abs).catch(() => null);
		if (info === null) continue;
		if (info.isDirectory()) {
			out.push(...(await walkMarkdown(abs)));
			continue;
		}
		if (info.isFile() && PROPOSAL_FILENAME.test(entry)) {
			out.push(abs);
		}
	}
	return out;
};

const readIdPrefix = (markdown: string): string | null => {
	const block = extractYamlBlock(markdown);
	if (block === null) return null;
	const fm = parseFrontmatterBlock(block) as Record<string, unknown>;
	const id = fm.id;
	if (typeof id !== 'string') return null;
	const match = id.match(/^([a-z])\d{5}$/);
	return match?.[1] ?? null;
};

export const lintProposalIdPrefixes = async (
	proposalsDirAbs: string,
): Promise<readonly IIssue[]> => {
	const files = await walkMarkdown(proposalsDirAbs);
	const issues: IIssue[] = [];

	for (const absPath of files) {
		const rel = relative(proposalsDirAbs, absPath).split('\\').join('/');
		const status = rel.split('/')[0] ?? '';
		const markdown = await readFile(absPath, 'utf8').catch(() => null);
		if (markdown === null) {
			issues.push({ relPath: rel, message: 'cannot read markdown file' });
			continue;
		}
		const prefix = readIdPrefix(markdown);
		if (prefix === null) {
			issues.push({
				relPath: rel,
				message:
					'missing or invalid frontmatter id (expected shape: <prefix><5 digits>)',
			});
			continue;
		}
		if (status === 'ready' && !READY_PREFIXES.has(prefix)) {
			issues.push({
				relPath: rel,
				message: `ready proposals must use one of [${[...READY_PREFIXES].join(', ')}] but found "${prefix}"`,
			});
			continue;
		}
		if (status === 'ready' || STATUS_WITH_FREE_PREFIX.has(status)) {
			continue;
		}
		// Unknown top-level folder: do not fail this lint; other gates own the lifecycle map.
	}

	issues.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return issues;
};

if (import.meta.main) {
	const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
	const proposalsDirAbs = join(repoRoot, 'docs', 'mcp-vertex', 'proposals');
	const issues = await lintProposalIdPrefixes(proposalsDirAbs);
	for (const issue of issues) {
		console.log(`${issue.relPath}: ${issue.message}`);
	}
	if (issues.length > 0) process.exit(1);
	console.log('✓ proposal-id-prefix: frontmatter id prefixes valid');
}
