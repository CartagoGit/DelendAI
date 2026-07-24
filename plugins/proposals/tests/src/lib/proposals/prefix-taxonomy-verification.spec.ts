/**
 * prefix-taxonomy-verification.spec.ts — f00114 S3.
 *
 * The parked S-G block asked for "a migration script that updates every
 * proposal's id to a valid prefix". The census showed the tree is
 * already coherent, so the migration is this VERIFICATION: walk every
 * real proposal file in the repo and prove ids and kinds parse under
 * the new schemas, with prefix↔kind coherence. If a future file breaks
 * the taxonomy, this spec names it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	kindMatchesId,
	proposalIdSchema,
	proposalKindSchema,
} from '../../../../src/lib/contracts/schemas/proposal-kind.schema';

const PROPOSALS_DIR = resolve(
	__dirname,
	'../../../../../..',
	'docs/mcp-vertex/proposals',
);

/** Same filename filter the sync registry applies (README etc. skipped). */
const PROPOSAL_FILENAME = /^[a-z]\d+[a-z]*-.+\.md$/iu;

const walk = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(abs)));
		else if (entry.isFile() && PROPOSAL_FILENAME.test(entry.name))
			out.push(abs);
	}
	return out;
};

const frontmatterField = (raw: string, field: string): string | undefined => {
	const block = raw.startsWith('---')
		? raw.slice(3, raw.indexOf('\n---', 3))
		: '';
	const match = block.match(new RegExp(`^${field}:\\s*(\\S+)\\s*$`, 'm'));
	return match?.[1];
};

describe('prefix taxonomy — repo-wide verification (f00114 S3)', async () => {
	const files = await walk(PROPOSALS_DIR);

	it('finds the proposal tree (sanity)', () => {
		expect(files.length).toBeGreaterThan(150);
	});

	it('every proposal id parses under the read-seam schema', async () => {
		const offenders: string[] = [];
		for (const file of files) {
			const raw = await readFile(file, 'utf8');
			const id = frontmatterField(raw, 'id');
			if (id === undefined) continue; // registry linter owns missing ids
			if (!proposalIdSchema.safeParse(id).success) {
				offenders.push(`${file} (id: ${id})`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('every declared kind is canonical and coherent with its id prefix', async () => {
		const offenders: string[] = [];
		for (const file of files) {
			const raw = await readFile(file, 'utf8');
			const id = frontmatterField(raw, 'id');
			const kind = frontmatterField(raw, 'kind');
			if (kind === undefined) continue;
			if (!proposalKindSchema.safeParse(kind).success) {
				offenders.push(`${file} (kind: ${kind})`);
				continue;
			}
			if (id !== undefined) {
				const match = kindMatchesId(kind, id);
				if (!match.ok) offenders.push(`${file} — ${match.reason}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
