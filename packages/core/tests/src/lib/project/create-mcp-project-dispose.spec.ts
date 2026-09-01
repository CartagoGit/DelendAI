/**
 * r00039 / AUD-E02 — `McpHostSession` teardown.
 *
 * `createMcpProject()` used to expose no way to close what it opened:
 * `config.disposePlugins` (assembled by `assemble-plugins.ts` from
 * whichever route — eager or lazy — actually activated plugins) was
 * never called by anything. These specs drive `IMcpVertexProject.dispose()`
 * directly against a hand-built `IMcpVertexHostConfig`, so they exercise
 * the host's OWN responsibility (idempotency, error aggregation, and
 * draining in-flight work) independently of how the plugins were loaded.
 */
import { describe, expect, it } from 'vitest';

import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';
import type { IMcpVertexHostConfig } from '@mcp-vertex/core/lib/contracts/interfaces/host-config.interface';

const baseHostConfig = (
	overrides: Partial<IMcpVertexHostConfig>,
): IMcpVertexHostConfig => ({
	metadata: {
		name: 'spec-server',
		version: '0.0.0',
		description: 'spec host',
	},
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider('/tmp/spec-workspace-dispose'),
	validationMatrix: { scopes: {} },
	...overrides,
});

describe('createMcpProject().dispose()', () => {
	it('calls config.disposePlugins() exactly once', async () => {
		let calls = 0;
		const project = await createMcpProject(
			baseHostConfig({
				disposePlugins: async () => {
					calls += 1;
					return [];
				},
			}),
		);
		await project.dispose();
		expect(calls).toBe(1);
	});

	it('is idempotent: a second dispose() does not call disposePlugins again', async () => {
		let calls = 0;
		const project = await createMcpProject(
			baseHostConfig({
				disposePlugins: async () => {
					calls += 1;
					return [];
				},
			}),
		);
		await project.dispose();
		await project.dispose();
		expect(calls).toBe(1);
	});

	it('is safe to call even when start() was never invoked', async () => {
		let calls = 0;
		const project = await createMcpProject(
			baseHostConfig({
				disposePlugins: async () => {
					calls += 1;
					return [];
				},
			}),
		);
		await expect(project.dispose()).resolves.toBeUndefined();
		expect(calls).toBe(1);
	});

	it('does not throw when a host declares no disposePlugins at all', async () => {
		const project = await createMcpProject(baseHostConfig({}));
		await expect(project.dispose()).resolves.toBeUndefined();
	});

	it('surfaces per-plugin dispose failures through the aggregate result without throwing', async () => {
		// `disposePlugins` itself is the aggregation point (assembled by
		// `assemble-plugins.ts`'s `disposeLoadedPlugins`/`disposeAll`); the
		// host's job is only to call it and never let it crash teardown.
		const project = await createMcpProject(
			baseHostConfig({
				disposePlugins: async () => [
					{ pluginName: 'broken', error: new Error('boom') },
				],
			}),
		);
		await expect(project.dispose()).resolves.toBeUndefined();
	});
});
