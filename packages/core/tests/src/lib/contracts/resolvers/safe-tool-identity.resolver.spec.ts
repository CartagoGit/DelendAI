import { describe, expect, it } from 'vitest';

import {
	resolvePublicToolIdentity,
	type IToolIdentityRegistry,
	type IToolRegistryEntry,
} from '@delendai/core/public';

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

describe('resolvePublicToolIdentity', () => {
	it('keeps the fully qualified safeToolId only for first-party tools', () => {
		const identity = resolvePublicToolIdentity(
			'mcp-vertex_proposals_create_proposal',
			registryOf({
				'mcp-vertex_proposals_create_proposal': {
					packageName: '@delendai/proposals',
					owner: 'mcp-vertex',
					publicToolName: 'create_proposal',
					category: 'orchestration',
				},
			}),
		);

		expect(identity).toEqual({
			owner: 'mcp-vertex',
			safeToolId: '@delendai/proposals.create_proposal',
			category: 'orchestration',
		});
	});

	it('omits the tool name for host-project tools', () => {
		const identity = resolvePublicToolIdentity(
			'privatecompany_reconciliation_execute',
			registryOf({
				privatecompany_reconciliation_execute: {
					packageName: '/workspace/private-company/plugin.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
		);

		expect(identity).toEqual({
			owner: 'host-project',
			category: 'host-specific',
		});
	});

	it('does not trust a deceptive vertex-looking prefix', () => {
		const identity = resolvePublicToolIdentity(
			'mcp_vertex_internal_fraud',
			registryOf({
				mcp_vertex_internal_fraud: {
					packageName: '/workspace/evil/plugin.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
		);

		expect(identity.safeToolId).toBeUndefined();
		expect(identity.owner).toBe('host-project');
	});

	it('keeps external bridges coarse-grained', () => {
		const identity = resolvePublicToolIdentity(
			'web_fetch.fetch_url',
			registryOf({
				'web_fetch.fetch_url': {
					packageName: 'ext.web-fetch',
					owner: 'external-mcp',
					category: 'external-bridge',
				},
			}),
		);

		expect(identity).toEqual({
			owner: 'external-mcp',
			category: 'external-bridge',
		});
	});

	it('falls back to host-project when the tool is missing from the registry', () => {
		const identity = resolvePublicToolIdentity(
			'unknown.tool',
			registryOf({}),
		);

		expect(identity).toEqual({
			owner: 'host-project',
			category: 'unknown',
		});
	});

	it('covers adversarial names without leaking them into safeToolId', () => {
		const adversarialNames = [
			'privatecompany_reconciliation_execute',
			'acme_hr_onboarding',
			'superbank_internal_fraud',
			'mcp_vertex_internal_fraud',
			'mcp-vertex.create_proposal',
			'vertex.create_proposal',
			'mcp_vert_x_evil',
			'🔓host_secret_tool',
			'A'.repeat(256),
			'tool\nwith\nnewlines',
			'tool with spaces',
			'../../../etc/passwd-as-tool-name',
			'superbank_internal\u0000fraud',
		] as const;

		for (const toolName of adversarialNames) {
			const identity = resolvePublicToolIdentity(
				toolName,
				registryOf({
					[toolName]: {
						packageName: '/workspace/adversarial/plugin.ts',
						owner: 'host-project',
						category: 'host-specific',
					},
				}),
			);

			expect(identity.safeToolId).toBeUndefined();
			expect(identity.owner).not.toBe('mcp-vertex');
		}
	});
});
