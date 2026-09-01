import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
	resolvePublicToolIdentity,
	type IToolIdentityRegistry,
	type IToolRegistryEntry,
} from '@mcp-vertex/core/public';

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

describe('resolvePublicToolIdentity properties', () => {
	it('never emits safeToolId for non-vertex packages', () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 128 }),
				fc.constantFrom<
					'host-project' | 'external-mcp' | 'first-party-host'
				>('host-project', 'external-mcp', 'first-party-host'),
				(toolName, owner) => {
					const identity = resolvePublicToolIdentity(
						toolName,
						registryOf({
							[toolName]: {
								packageName: `/workspace/${owner}/plugin.ts`,
								owner,
								category:
									owner === 'external-mcp'
										? 'external-bridge'
										: 'host-specific',
							},
						}),
					);

					expect(identity.safeToolId).toBeUndefined();
					return true;
				},
			),
		);
	});

	it('always namespaces safeToolId from the registry package for first-party tools', () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-z0-9-]{1,24}$/),
				fc.stringMatching(/^[a-z0-9_]{1,24}$/),
				(pluginId, toolId) => {
					const toolName = `mcp-vertex_${pluginId}_${toolId}`;
					const identity = resolvePublicToolIdentity(
						toolName,
						registryOf({
							[toolName]: {
								packageName: `@mcp-vertex/${pluginId}`,
								owner: 'mcp-vertex',
								publicToolName: toolId,
								category: 'analysis',
							},
						}),
					);

					expect(identity.safeToolId).toBe(
						`@mcp-vertex/${pluginId}.${toolId}`,
					);
					return true;
				},
			),
		);
	});

	it('uses the unknown host-project fallback for registry misses', () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 256 }),
				(toolName) => {
					const identity = resolvePublicToolIdentity(
						toolName,
						registryOf({}),
					);
					expect(identity).toEqual({
						owner: 'host-project',
						category: 'unknown',
					});
					return true;
				},
			),
		);
	});
});
