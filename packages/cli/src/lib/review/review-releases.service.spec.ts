/**
 * A reviewer's releases are read from its review units under every owned
 * namespace, so a unit entered before a namespace change still counts
 * (f00808).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { releasedElsewhere } from './review-releases.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	).trim();

/** develop holds x00001's document; a review unit released it after. */
const repo = (unit: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'releases-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	mkdirSync(join(root, 'docs'), { recursive: true });
	writeFileSync(join(root, 'docs', 'x00001-a.md'), '# x00001\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base', '--date=2026-01-01T00:00:00Z');
	git(root, 'switch', '-q', '-c', unit);
	git(
		root,
		'commit',
		'-q',
		'--allow-empty',
		'-m',
		'release x00001\n\nReleases: x00001',
	);
	git(root, 'switch', '-q', 'develop');
	return root;
};

const moved = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
}).branches;

describe('releasedElsewhere', () => {
	it('reads releases from a review unit under the former namespace', () => {
		const root = repo('delendai/wip/agent-a/review/batch-all-g1/verdicts');
		expect(releasedElsewhere(root, 'agent-a', moved)).toEqual(['x00001']);
	});

	it('reads releases from a review unit under the current namespace', () => {
		const root = repo('wip/agent-a/review/batch-all-g1/verdicts');
		expect(releasedElsewhere(root, 'agent-a', moved)).toEqual(['x00001']);
	});

	it('reads only the prefixes it is given when the namespace is not named', () => {
		const root = repo('delendai/wip/agent-a/review/batch-all-g1/verdicts');
		expect(
			releasedElsewhere(root, 'agent-a', {
				integration: 'develop',
				workRefPrefix: 'heads/wip/',
				publicationRefPrefix: 'pr/',
			}),
		).toEqual([]);
	});

	it('answers nothing without an integration branch', () => {
		const root = repo('wip/agent-a/review/batch-all-g1/verdicts');
		expect(
			releasedElsewhere(root, 'agent-a', {
				...moved,
				integration: 'trunk',
			}),
		).toEqual([]);
	});
});
