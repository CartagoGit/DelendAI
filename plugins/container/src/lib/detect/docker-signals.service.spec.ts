import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';
import { fakePartial } from '@delendai/test-kit';

import plugin from '../../index';
import { dockerSignals } from './docker-signals.service';

const registeredTools = async (root: string): Promise<readonly string[]> => {
	const registrations = await plugin.register(
		fakePartial<IMcpPluginContext>({
			namespacePrefix: 'c',
			options: {},
			workspace: fakePartial<IMcpPluginContext['workspace']>({
				root,
				resolve: (path: string) => join(root, path),
			}),
		}),
	);
	return ('tools' in registrations ? (registrations.tools ?? []) : [])
		.map((tool) => tool.id)
		.sort();
};

describe('docker signals', () => {
	it('names the root entries that say the project uses Docker, and the plugin stays passive without them', async () => {
		const root = mkdtempSync(join(tmpdir(), 'docker-signals-'));
		try {
			expect(await dockerSignals(root)).toEqual([]);
			expect(await registeredTools(root)).not.toContain('container_run');
			expect(await registeredTools(root)).toContain('container_inspect');
			writeFileSync(join(root, 'Dockerfile'), 'FROM alpine\n');
			mkdirSync(join(root, '.devcontainer'));
			expect(await dockerSignals(root)).toEqual([
				'Dockerfile',
				'.devcontainer',
			]);
			expect(await registeredTools(root)).toContain('container_run');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
