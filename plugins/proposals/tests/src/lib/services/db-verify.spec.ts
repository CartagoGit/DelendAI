import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, expect, it } from 'bun:test';
import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import { verifyProposalsDb } from '../../../../src/lib/services/db-verify';
import { collectProposalMarkdown } from '../../../../src/lib/tools/db-reconcile.tool';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

it('rebuilds in a temporary database without requiring an active database', () => {
	const root = mkdtempSync(join(tmpdir(), 'verify-service-'));
	roots.push(root);
	const proposals = join(root, 'proposals');
	mkdirSync(proposals, { recursive: true });
	writeFileSync(
		join(proposals, 'q00001.md'),
		'---\nid: q00001\ntitle: Verify\nkind: feat\nstatus: ready\n---\n# Verify\n',
	);
	const result = verifyProposalsDb({
		workspaceRoot: root,
		proposalsDirAbs: proposals,
		sourceCommit: 'verify-sha',
	});
	expect(result.digestBefore).toBeNull();
	expect(result.digestAfter).toMatch(/^[a-f0-9]{64}$/);
	expect(result.match).toBe(false);
});

it('compares the rebuild with the digest the active database last applied', () => {
	const root = mkdtempSync(join(tmpdir(), 'verify-service-'));
	roots.push(root);
	const proposals = join(root, 'proposals');
	mkdirSync(proposals, { recursive: true });
	writeFileSync(
		join(proposals, 'q00001.md'),
		'---\nid: q00001\ntitle: Verify\nkind: feat\nstatus: ready\n---\n# Verify\n',
	);
	const paths = resolveProposalsDbPaths(root);
	mkdirSync(paths.stateDir, { recursive: true });
	const shadow = reconcileShadowToStaging({
		mode: 'shadow',
		workspacePath: root,
		statePath: paths.stateDir,
		sourceCommit: 'verify-sha',
		sha: 'verify-sha',
		files: collectProposalMarkdown(proposals),
		now: 1000,
	});
	new ProposalsSqliteDriver({ path: paths.databasePath }).close();
	expect(
		applyValidatedCandidate({
			stagingPath: shadow.stagingPath,
			activePath: paths.databasePath,
			sourceCommit: 'verify-sha',
			expectedDigest: shadow.stagingDigest,
			now: 2000,
		}).status,
	).toBe('ok');

	const result = verifyProposalsDb({
		workspaceRoot: root,
		proposalsDirAbs: proposals,
		sourceCommit: 'verify-sha',
	});

	expect(result.digestBefore).toBe(shadow.stagingDigest);
	expect(result.match).toBe(true);
});

it('reads the commit from the workspace when none is given', () => {
	const root = mkdtempSync(join(tmpdir(), 'verify-service-'));
	roots.push(root);
	const proposals = join(root, 'proposals');
	mkdirSync(proposals, { recursive: true });

	const result = verifyProposalsDb({
		workspaceRoot: root,
		proposalsDirAbs: proposals,
	});

	expect(typeof result.sourceCommit).toBe('string');
	expect(result.sourceCommit.length).toBeGreaterThan(0);
});
