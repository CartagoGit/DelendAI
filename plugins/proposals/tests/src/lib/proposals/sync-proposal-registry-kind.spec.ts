/**
 * sync-proposal-registry-kind.spec.ts — every index entry names its kind.
 *
 * The catalog and the host read a proposal's kind from the index instead
 * of re-deriving it from a partial copy of the id prefixes, so the plugin
 * that owns the vocabulary has to write one for every entry.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { syncProposalRegistry } from '@delendai/proposals/lib/proposals/sync-proposal-registry';
import { DEFAULT_PATH_LAYOUT } from '@delendai/proposals/lib/contracts/constants/default-path-layout.constant';

const writeReadyProposal = async (
	root: string,
	filename: string,
	frontmatter: readonly string[],
): Promise<void> => {
	const dir = resolve(root, DEFAULT_PATH_LAYOUT.proposalsDir, 'ready');
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, filename),
		`---\n${frontmatter.join('\n')}\n---\n\n## Goal\n\nseed.\n`,
		'utf8',
	);
};

const indexedKinds = async (
	root: string,
): Promise<Readonly<Record<string, string | undefined>>> => {
	const index = JSON.parse(
		await readFile(
			resolve(root, DEFAULT_PATH_LAYOUT.proposalIndexFile),
			'utf8',
		),
	) as { proposals: { id: string; kind?: string }[] };
	return Object.fromEntries(
		index.proposals.map((entry) => [entry.id, entry.kind]),
	);
};

describe('index entries carry the kind the plugin resolved', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'sync-kind-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('takes the frontmatter kind, normalises aliases, and falls back to the id prefix', async () => {
		await writeReadyProposal(root, 'v900-fast.md', [
			'id: v900',
			'status: ready',
			'kind: perf',
		]);
		await writeReadyProposal(root, 'i900-infra.md', [
			'id: i900',
			'status: ready',
			'kind: infrastructure',
		]);
		await writeReadyProposal(root, 't900-untyped.md', [
			'id: t900',
			'status: ready',
		]);

		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT);

		expect(await indexedKinds(root)).toEqual({
			v900: 'perf',
			i900: 'infra',
			t900: 'test',
		});
	});

	it('does not trust a kind outside the vocabulary over the id prefix', async () => {
		await writeReadyProposal(root, 'x900-odd.md', [
			'id: x900',
			'status: ready',
			'kind: nonsense',
		]);

		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT);

		expect(await indexedKinds(root)).toEqual({ x900: 'fix' });
	});
});
