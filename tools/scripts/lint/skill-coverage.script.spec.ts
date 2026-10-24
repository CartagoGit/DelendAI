#!/usr/bin/env bun
/**
 * skill-coverage.script.spec.ts — the ranking the coverage ratchet reports:
 * covered tools drop out, the rest are ordered by recorded calls.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	countUses,
	coveredTools,
	rankUncovered,
} from './skill-coverage.script.ts';

describe('skill-coverage', () => {
	it('counts calls per plugin and tool, skipping a torn line', () => {
		const uses = countUses(
			[
				'{"plugin":"core","tool":"work"}',
				'{"plugin":"core","tool":"work"}',
				'{"plugin":"git","tool":"status"}',
				'{"plugin":"git"',
			].join('\n'),
		);
		expect(uses.get('core/work')).toBe(2);
		expect(uses.get('git/status')).toBe(1);
	});

	it('drops covered tools and ranks the rest by calls', () => {
		const report = rankUncovered(
			[
				{ name: 'delendai_work', plugin: 'delendai' },
				{ name: 'delendai_git_status', plugin: 'git' },
				{ name: 'delendai_git_log', plugin: 'git' },
				{ name: 'delendai_docs_read', plugin: 'docs' },
			],
			new Set(['delendai_docs_read']),
			new Map([
				['core/work', 5],
				['git/status', 2],
			]),
		);
		expect(report.tools.map((tool) => tool.name)).toEqual([
			'delendai_work',
			'delendai_git_status',
			'delendai_git_log',
		]);
		expect(report.plugins).toEqual([
			{ plugin: 'delendai', tools: 1, uses: 5 },
			{ plugin: 'git', tools: 2, uses: 2 },
		]);
	});

	it('reads the tools a skill names from its frontmatter', async () => {
		const root = await mkdtemp(join(tmpdir(), 'skill-coverage-'));
		try {
			const folder = join(root, 'plugins/demo/skills/demo-skill');
			await mkdir(folder, { recursive: true });
			await writeFile(
				join(folder, 'SKILL.md'),
				"---\nname: demo-skill\ntools: ['delendai_demo_run']\n---\n\nBody\n",
			);
			expect([...(await coveredTools(root))]).toEqual([
				'delendai_demo_run',
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
