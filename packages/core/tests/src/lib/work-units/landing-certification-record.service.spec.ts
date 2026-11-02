/**
 * landing-certification-record.service.spec.ts — a landed merge's passed
 * gate is kept under the git directory, keyed by the trees it covers.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { recordLandingCertification } from '@delendai/core/lib/work-units/landing-certification-record.service';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'landing-record-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'record@example.com');
	git(root, 'config', 'user.name', 'Record');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.txt'), 'base\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const read = (root: string, tree: string): Record<string, unknown> =>
	JSON.parse(
		readFileSync(
			join(root, '.git', 'delendai-certify', 'passed', `${tree}.json`),
			'utf8',
		),
	);

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('recordLandingCertification', () => {
	it('keys the record by the candidate tree and by the unit tip it covers', async () => {
		const root = repo();
		const base = git(root, 'rev-parse', 'HEAD');
		git(root, 'checkout', '-q', '-b', 'unit');
		writeFileSync(join(root, 'b.txt'), 'unit\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'unit');
		git(root, 'checkout', '-q', 'develop');
		writeFileSync(join(root, 'c.txt'), 'trunk\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'trunk moved');
		git(root, 'merge', '-q', '--no-ff', '-m', 'merge', 'unit');
		const candidate = git(root, 'rev-parse', 'HEAD');

		const written = await recordLandingCertification({
			root,
			candidateSha: candidate,
			integrationSha: base,
			workRef: 'unit',
		});

		expect(written).toBe(true);
		const candidateTree = git(root, 'rev-parse', `${candidate}^{tree}`);
		const unitTree = git(root, 'rev-parse', 'unit^{tree}');
		expect(candidateTree).not.toBe(unitTree);
		expect(read(root, candidateTree)).toMatchObject({
			tree: candidateTree,
			candidateSha: candidate,
			integrationSha: base,
		});
		expect(read(root, candidateTree)).not.toHaveProperty('coveredTree');
		expect(read(root, unitTree)).toMatchObject({
			tree: unitTree,
			coveredTree: unitTree,
			candidateSha: candidate,
		});
	});

	it('writes one record when the unit tree is the merge tree', async () => {
		const root = repo();
		const head = git(root, 'rev-parse', 'HEAD');

		await recordLandingCertification({
			root,
			candidateSha: head,
			integrationSha: head,
			workRef: 'develop',
		});

		const tree = git(root, 'rev-parse', 'HEAD^{tree}');
		expect(read(root, tree)).not.toHaveProperty('coveredTree');
	});

	it('records nothing outside a git repository', async () => {
		const root = mkdtempSync(join(tmpdir(), 'landing-record-none-'));
		roots.push(root);

		const written = await recordLandingCertification({
			root,
			candidateSha: 'deadbeef',
			integrationSha: 'deadbeef',
			workRef: 'unit',
		});

		expect(written).toBe(false);
	});
});
