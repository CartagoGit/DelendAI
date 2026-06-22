import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runResolveIssue,
	type IResolveIssueToolOptions,
} from '../../../../src/lib/tools/resolve-issue.tool';

const SCAFFOLD_TEMPLATE = `---
id: github#7-crash-on-startup
status: ingested
source: github
source_id: 7
source_url: https://github.com/o/r/issues/7
source_author: octocat
ingested_at: 2026-01-01T00:00:00Z
resolution: pending
proposals: []
comments: []
---

> Labels: bug

# Crash on startup

It crashes.
`;

describe('issues_resolve', () => {
	let scaffoldDirAbs = '';

	beforeEach(async () => {
		scaffoldDirAbs = await mkdtemp(join(tmpdir(), 'issues-resolve-'));
		// Pre-seed one scaffold so resolve has something to mutate.
		await writeFile(
			join(scaffoldDirAbs, 'github#7-crash-on-startup.md'),
			SCAFFOLD_TEMPLATE,
			'utf8',
		);
	});

	afterEach(async () => rm(scaffoldDirAbs, { recursive: true, force: true }));

	it('rejects resolution:"dismissed" without a dismissReason', async () => {
		const options: IResolveIssueToolOptions = {
			namespacePrefix: 'issues',
			scaffoldDirAbs,
		};

		const result = await runResolveIssue(
			{ number: 7, resolution: 'dismissed' },
			options,
		);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toMatch(/dismissReason/);
	});

	it('returns an error when no scaffold exists for the given issue', async () => {
		const emptyDir = await mkdtemp(join(tmpdir(), 'issues-resolve-empty-'));
		try {
			const options: IResolveIssueToolOptions = {
				namespacePrefix: 'issues',
				scaffoldDirAbs: emptyDir,
			};

			const result = await runResolveIssue(
				{ number: 99, resolution: 'promoted' },
				options,
			);

			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.ok).toBe(false);
			expect(body.error.reason).toMatch(/no scaffold found/);
		} finally {
			await rm(emptyDir, { recursive: true, force: true });
		}
	});

	it('mutates the scaffold frontmatter to "promoted" with proposalIds', async () => {
		const options: IResolveIssueToolOptions = {
			namespacePrefix: 'issues',
			scaffoldDirAbs,
		};

		const result = await runResolveIssue(
			{
				number: 7,
				resolution: 'promoted',
				proposalIds: ['f00123'],
			},
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.scaffold.frontmatter.resolution).toBe('promoted');
		expect(body.scaffold.frontmatter.proposals).toEqual(['f00123']);

		const files = await readdir(scaffoldDirAbs);
		const fileName = files.find((f) => f.endsWith('crash-on-startup.md'));
		expect(fileName).toBeDefined();
		const written = await readFile(
			join(scaffoldDirAbs, fileName as string),
			'utf8',
		);
		expect(written).toContain('resolution: promoted');
		expect(written).toContain('proposals:');
		expect(written).toContain('f00123');
	});

	it('mutates the scaffold frontmatter to "dismissed" and persists dismiss_reason', async () => {
		const options: IResolveIssueToolOptions = {
			namespacePrefix: 'issues',
			scaffoldDirAbs,
		};

		const result = await runResolveIssue(
			{
				number: 7,
				resolution: 'dismissed',
				dismissReason: 'Duplicate of github#4',
			},
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.scaffold.frontmatter.resolution).toBe('dismissed');
		expect(body.scaffold.frontmatter.dismiss_reason).toBe(
			'Duplicate of github#4',
		);

		const files = await readdir(scaffoldDirAbs);
		const fileName = files.find((f) => f.endsWith('crash-on-startup.md'));
		expect(fileName).toBeDefined();
		const written = await readFile(
			join(scaffoldDirAbs, fileName as string),
			'utf8',
		);
		expect(written).toContain('resolution: dismissed');
		expect(written).toContain('dismiss_reason:');
		expect(written).toContain('Duplicate of github#4');
	});

	it('mutates the scaffold frontmatter to "promoted-multiple" with multiple ids', async () => {
		const options: IResolveIssueToolOptions = {
			namespacePrefix: 'issues',
			scaffoldDirAbs,
		};

		const result = await runResolveIssue(
			{
				number: 7,
				resolution: 'promoted-multiple',
				proposalIds: ['f00010', 'f00011'],
			},
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.scaffold.frontmatter.resolution).toBe('promoted-multiple');
		expect(body.scaffold.frontmatter.proposals).toEqual([
			'f00010',
			'f00011',
		]);
	});
});
