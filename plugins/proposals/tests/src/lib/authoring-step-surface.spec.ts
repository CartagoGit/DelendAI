/**
 * authoring-step-surface.spec.ts — the authoring step cannot vanish from
 * either surface an agent reads before it writes a proposal: the playbook
 * and the proposals-workflow knowledge entry. It used to live only in a
 * refusal message.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';
import plugin from '@delendai/proposals';
import { fakePartial } from '@delendai/test-kit/public';

const STEP = [
	'work enter --kind=create --proposal=new',
	'create_proposal',
	'allocates the id',
];

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const knowledgeBody = async (): Promise<string> => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-authoring-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
		recursive: true,
	});
	const registration = await plugin.register(
		fakePartial<
			IMcpPluginContext,
			| 'workspace'
			| 'cacheDir'
			| 'docsDir'
			| 'namespacePrefix'
			| 'options'
			| 'pluginOptions'
		>({
			workspace: {
				root,
				resolve: (relativePath: string) => join(root, relativePath),
			},
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
			},
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			keepLegacy: false,
			pluginCacheDir: '.cache/delendai/proposals',
			pluginDocsDir: 'docs/delendai/proposals',
			namespacePrefix: 'proposals',
			options: { persist: { mode: 'none' } },
			args: {},
			pluginOptions: new Map<string, Readonly<Record<string, unknown>>>(),
		}),
	);
	return (
		registration.knowledge?.find(
			(entry) => entry.id === 'proposals-workflow',
		)?.body ?? ''
	);
};

describe('the authoring step', () => {
	it('is taught in the playbook and in the knowledge entry', async () => {
		const playbook = readFileSync(
			new URL(
				'../../../skills/proposals-workflow-playbook/SKILL.md',
				import.meta.url,
			),
			'utf8',
		);
		const knowledge = await knowledgeBody();
		for (const surface of [playbook, knowledge]) {
			for (const words of STEP) expect(surface).toContain(words);
		}
	});
});
