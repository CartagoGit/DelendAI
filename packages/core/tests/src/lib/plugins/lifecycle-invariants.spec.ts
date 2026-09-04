/**
 * lifecycle-invariants.spec.ts — d00015 (AUD-G05).
 *
 * These two invariants are documented at
 * `docs/mcp-vertex/architecture/invariants/plugin-lifecycle.md` as
 * CIERTO today, unlike the eager/lazy-equivalence invariants in the
 * same document that were FALSO until `r00038`. They get their own
 * regression spec here so "true today" does not silently become
 * "true until the next refactor" without anyone noticing.
 */
import { describe, expect, it } from 'vitest';

import { loadPlugins } from '@delendai/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';
import type { IPluginRuntime } from '@delendai/core/lib/contracts/interfaces/plugin-runtime.interface';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import type { IMcpVertexHostConfig } from '@delendai/core/lib/contracts/interfaces/host-config.interface';

const ctx = (name: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (path: string) => `/ws/${path}` },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: `.cache/mcp-vertex/${name}`,
	pluginDocsDir: `docs/mcp-vertex/${name}`,
	namespacePrefix: name,
	options: {},
	args: {},
});

const asImport =
	(plugins: Record<string, unknown>) =>
	async (specifier: string): Promise<{ default: unknown }> => {
		for (const [key, plugin] of Object.entries(plugins)) {
			if (specifier.includes(`/${key}`) || specifier === key) {
				return { default: plugin };
			}
		}
		return { default: Object.values(plugins)[0] };
	};

const baseHostConfig = (
	overrides: Partial<IMcpVertexHostConfig>,
): IMcpVertexHostConfig => ({
	metadata: {
		name: 'spec-server',
		version: '0.0.0',
		description: 'spec host',
	},
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider('/tmp/spec-lifecycle-invariants'),
	validationMatrix: { scopes: {} },
	...overrides,
});

describe('plugin lifecycle invariants (d00015)', () => {
	it('invariant: register() runs exactly once per plugin — a duplicate specifier does not re-invoke it', async () => {
		let registerCalls = 0;
		const plugin = {
			name: 'once-plugin',
			register: (): IPluginRuntime<{ tools: [] }> => {
				registerCalls += 1;
				return { registrations: { tools: [] } };
			},
		};

		const result = await loadPlugins({
			specifiers: ['once-plugin', 'once-plugin'],
			buildContext: ctx,
			import: asImport({ 'once-plugin': plugin }),
		});

		expect(registerCalls).toBe(1);
		expect(result.loaded).toHaveLength(1);
	});

	it('invariant: dispose() runs at most once, even across repeated calls to the session teardown', async () => {
		let disposeCalls = 0;
		const project = await createMcpProject(
			baseHostConfig({
				disposePlugins: async () => {
					disposeCalls += 1;
					return [];
				},
			}),
		);

		await project.dispose();
		await project.dispose();
		await project.dispose();

		expect(disposeCalls).toBe(1);
	});
});
