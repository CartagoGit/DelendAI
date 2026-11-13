#!/usr/bin/env bun
/**
 * invariants-link-fix.script.ts — d00015 (AUD-G05).
 *
 * `docs/delendai/architecture/invariants/*.md` documents invariants
 * per subsystem, each tagged with an "Estado actual" line. When that
 * line says the invariant is broken or missing (`FALSO` /
 * `NO IMPLEMENTADO`), the whole point of writing it down is to point
 * at the fix — otherwise the document just restates "this is broken"
 * without giving a future reader (agent or human) anywhere to go.
 *
 * This lint fails when a broken/missing invariant's block has no
 * proposal-id-shaped reference (`[a-z]\d{4,5}`, e.g. `r00037`,
 * `x00288`, `f00273`) that resolves to a real file under
 * `docs/delendai/proposals/**` (any lifecycle folder — retired,
 * blocked, and done all count; only a reference to an id that never
 * existed on disk is an error).
 *
 * Usage:
 *   bun tools/scripts/lint/invariants-link-fix.script.ts
 *   bun run lint:invariants-link-fix
 *
 * Exit codes:
 *   0 — every broken/missing invariant references a real proposal.
 *   1 — at least one broken/missing invariant has no such reference.
 */
import { readdir, readFile } from 'node:fs/promises';

import { repoRoot } from '../lib/monorepo-paths';

export const INVARIANTS_DIR = 'docs/delendai/architecture/invariants';
const PROPOSALS_DIR = 'docs/delendai/proposals';

const ID_RE = /\b([a-z]\d{4,5})\b/g;
const BROKEN_STATE_RE = /\*\*Estado actual\*\*:\s*(FALSO|NO IMPLEMENTADO)/i;

export interface IInvariantsLinkFixResult {
	readonly ok: boolean;
	readonly violations: readonly string[];
}

/**
 * Splits a document on `## Invariante` headings so each block can be
 * checked independently.
 */
const splitIntoInvariantBlocks = (
	text: string,
): readonly { readonly heading: string; readonly body: string }[] => {
	const lines = text.split('\n');
	const blocks: { heading: string; body: string[] }[] = [];
	for (const line of lines) {
		if (line.startsWith('## Invariante')) {
			blocks.push({ heading: line, body: [] });
			continue;
		}
		if (blocks.length === 0) continue;
		blocks.at(-1)?.body.push(line);
	}
	return blocks.map((block) => ({
		heading: block.heading,
		body: block.body.join('\n'),
	}));
};

export const lintInvariantsLinkFix = (input: {
	readonly files: Readonly<Record<string, string>>;
	readonly knownProposalIds: ReadonlySet<string>;
}): IInvariantsLinkFixResult => {
	const violations: string[] = [];
	for (const [path, text] of Object.entries(input.files)) {
		for (const block of splitIntoInvariantBlocks(text)) {
			if (!BROKEN_STATE_RE.test(block.body)) continue;
			const referencedIds = [...block.body.matchAll(ID_RE)].map(
				(match) => match[1] ?? '',
			);
			const hasResolvableReference = referencedIds.some((id) =>
				input.knownProposalIds.has(id),
			);
			if (!hasResolvableReference) {
				violations.push(
					`${path} ${block.heading.replace(/^##\s*/, '')} is marked FALSO/NO IMPLEMENTADO but references no real proposal id`,
				);
			}
		}
	}
	return { ok: violations.length === 0, violations };
};

const collectProposalIds = async (
	root: string,
): Promise<ReadonlySet<string>> => {
	const ids = new Set<string>();
	const walk = async (dirAbs: string): Promise<void> => {
		const entries = await readdir(dirAbs, { withFileTypes: true });
		for (const entry of entries) {
			const childAbs = `${dirAbs}/${entry.name}`;
			if (entry.isDirectory()) {
				await walk(childAbs);
				continue;
			}
			if (!entry.name.endsWith('.md')) continue;
			const match = /^([a-z]\d{4,5})-/.exec(entry.name);
			if (match?.[1] !== undefined) ids.add(match[1]);
		}
	};
	await walk(`${root}/${PROPOSALS_DIR}`);
	return ids;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const invariantsDirAbs = `${root}/${INVARIANTS_DIR}`;
		const entries = await readdir(invariantsDirAbs, {
			withFileTypes: true,
		});
		const files = Object.fromEntries(
			await Promise.all(
				entries
					.filter(
						(entry) => entry.isFile() && entry.name.endsWith('.md'),
					)
					.map(async (entry) => {
						const rel = `${INVARIANTS_DIR}/${entry.name}`;
						const text = await readFile(
							`${invariantsDirAbs}/${entry.name}`,
							'utf8',
						);
						return [rel, text] as const;
					}),
			),
		);
		const knownProposalIds = await collectProposalIds(root);
		const result = lintInvariantsLinkFix({ files, knownProposalIds });
		if (!result.ok) {
			for (const violation of result.violations) {
				console.error(`✖ invariants-link-fix: ${violation}`);
			}
			process.exit(1);
		}
		console.log(
			'✓ invariants-link-fix: every broken/missing invariant references a real proposal.',
		);
	})();
}
