import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IAppliedConfigSnapshot } from '../../../../src/lib/contracts/interfaces/config-transition.interface';
import { namespacePrefixTransition } from '../../../../src/lib/workspace-migration/namespace-prefix-transition';

const snapshot = (namespacePrefix?: string): IAppliedConfigSnapshot => ({
	version: 1,
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	plugins: [],
	...(namespacePrefix === undefined ? {} : { namespacePrefix }),
});

describe('namespacePrefixTransition', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'prefix-transition-'));
		mkdirSync(join(root, '.github/agents'), { recursive: true });
		mkdirSync(join(root, '.claude/agents'), { recursive: true });
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('plans nothing when the prefix is unchanged or was never recorded', () => {
		const transition = namespacePrefixTransition();
		expect(transition.plan(snapshot('acme'), snapshot('acme'))).toEqual([]);
		expect(transition.plan(snapshot(), snapshot('acme'))).toEqual([]);
		expect(transition.plan(snapshot('old'), snapshot('acme'))).toHaveLength(
			1,
		);
	});

	it('renames and rewrites the agents delendai wrote, and only those', async () => {
		writeFileSync(
			join(root, '.github/agents/old-orchestrator.agent.md'),
			'---\nname: old-orchestrator\ntools: [read, old/*]\n---\nCall `old_overview` first.\n',
		);
		writeFileSync(
			join(root, '.claude/agents/orchestrator.md'),
			'---\nname: orchestrator\n---\nThen `old_auto_work`; never `bold_x`.\n',
		);
		writeFileSync(
			join(root, '.github/agents/mine.agent.md'),
			'---\nname: mine\n---\nI use old_overview on purpose.\n',
		);
		await namespacePrefixTransition().apply(
			snapshot('old'),
			snapshot('acme'),
			{
				workspaceRoot: root,
				dryRun: false,
			},
		);
		expect(
			existsSync(join(root, '.github/agents/old-orchestrator.agent.md')),
		).toBe(false);
		expect(
			readFileSync(
				join(root, '.github/agents/acme-orchestrator.agent.md'),
				'utf8',
			),
		).toBe(
			'---\nname: acme-orchestrator\ntools: [read, old/*]\n---\nCall `acme_overview` first.\n',
		);
		expect(
			readFileSync(join(root, '.claude/agents/orchestrator.md'), 'utf8'),
		).toContain('Then `acme_auto_work`; never `bold_x`.');
		expect(
			readFileSync(join(root, '.github/agents/mine.agent.md'), 'utf8'),
		).toContain('old_overview');
	});
});
