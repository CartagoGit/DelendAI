import { describe, expect, it } from 'vitest';

import type {
	IHostContent,
	IHostIdentity,
	IHostObservability,
	IHostPaths,
	IHostRegistrations,
	IMcpVertexHostConfig,
} from '@mcp-vertex/core/public';
import type {
	ICorePaths,
	IKnowledgeEntry,
	IMcpVertexProjectMetadata,
	IPromptRegistration,
	IResourceRegistration,
	IStatusCollector,
	IToolRegistration,
	IValidationMatrix,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';

/**
 * Solid-ISP: these tests pin the segregated sub-interfaces of
 * `IMcpVertexHostConfig`. Every sub-interface must be:
 *
 *   1. Assignable to the composite (LSP).
 *   2. Independently usable (a caller that depends only on the
 *      slice is not forced to import the rest).
 *   3. Structurally compatible — fields that overlap (none today,
 *      by design) MUST still satisfy both shapes.
 */
describe('IMcpVertexHostConfig ISP segregation', () => {
	const metadata: IMcpVertexProjectMetadata = {
		name: 'mcp-vertex-host',
		version: '1.0.0',
		description: 'Test host metadata fixture',
	};
	const workspace: IWorkspacePathProvider = {
		root: '/repo',
		resolve: (rel) => `/repo/${rel}`,
	};
	const corePaths: ICorePaths = { cacheDir: '/cache', docsDir: '/docs' };
	const knowledgeEntry: IKnowledgeEntry = {
		id: 'k1',
		title: 'Title',
		body: 'Knowledge body for the test fixture',
	};
	const validationMatrix: IValidationMatrix = {
		scopes: {
			full: [{ command: 'bun test', expect: 'exit0' }],
		},
	};
	const statusCollector: IStatusCollector = {
		id: 'engine',
		collect: async () => ({ ok: true }),
	};
	const toolRegistration: IToolRegistration = {
		id: 't1',
		summary: '',
		effects: [],
		tags: [],
		register: async () => {},
	};
	const promptRegistration: IPromptRegistration = {
		id: 'p1',
		register: async () => {},
	};
	const resourceRegistration: IResourceRegistration = {
		id: 'r1',
		register: async () => {},
	};

	describe('IHostIdentity (slice)', () => {
		it('carries metadata + namespacePrefix', () => {
			const slice: IHostIdentity = { metadata, namespacePrefix: 'acme' };
			expect(slice.metadata.name).toBe('mcp-vertex-host');
			expect(slice.namespacePrefix).toBe('acme');
		});
		it('is assignable to the composite IMcpVertexHostConfig (LSP)', () => {
			const slice: IHostIdentity = { metadata };
			const composite: IMcpVertexHostConfig = {
				...slice,
				workspace,
			};
			expect(composite.metadata).toBe(metadata);
			expect(composite.workspace.root).toBe('/repo');
		});
	});

	describe('IHostPaths (slice)', () => {
		it('carries workspace + corePaths + keepLegacy', () => {
			const slice: IHostPaths = {
				workspace,
				corePaths,
				keepLegacy: true,
			};
			expect(slice.workspace.root).toBe('/repo');
			expect(slice.corePaths?.cacheDir).toBe('/cache');
			expect(slice.keepLegacy).toBe(true);
		});
		it('is assignable to the composite (LSP)', () => {
			const slice: IHostPaths = { workspace };
			const composite: IMcpVertexHostConfig = {
				...slice,
				metadata,
			};
			expect(composite.workspace.root).toBe('/repo');
		});
	});

	describe('IHostContent (slice)', () => {
		it('carries knowledge + skills + validationMatrix', () => {
			// Use the typed fixture directly to keep the chain narrow:
			// exactOptionalPropertyTypes + Record index access
			// interact awkwardly otherwise.
			const slice: IHostContent = {
				knowledge: [knowledgeEntry],
				validationMatrix,
			};
			expect(slice.knowledge?.[0]?.id).toBe('k1');
			const fullScope = validationMatrix.scopes['full'];
			expect(fullScope?.[0]?.command).toBe('bun test');
		});
		it('is assignable to the composite (LSP)', () => {
			const slice: IHostContent = { knowledge: [knowledgeEntry] };
			const composite: IMcpVertexHostConfig = {
				...slice,
				metadata,
				workspace,
			};
			expect(composite.knowledge).toEqual([knowledgeEntry]);
		});
	});

	describe('IHostObservability (slice)', () => {
		it('carries statusCollectors + metricsRegistry + lifecycle hooks', () => {
			const slice: IHostObservability = {
				statusCollectors: [statusCollector],
				onToolStart: (name) => {
					void name;
				},
			};
			expect(slice.statusCollectors?.[0]?.id).toBe('engine');
			expect(typeof slice.onToolStart).toBe('function');
		});
		it('is assignable to the composite (LSP)', () => {
			const slice: IHostObservability = {
				statusCollectors: [statusCollector],
			};
			const composite: IMcpVertexHostConfig = {
				...slice,
				metadata,
				workspace,
			};
			expect(composite.statusCollectors?.[0]?.id).toBe('engine');
		});
	});

	describe('IHostRegistrations (slice)', () => {
		it('carries extraTools + extraPrompts + extraResources', () => {
			const slice: IHostRegistrations = {
				extraTools: [toolRegistration],
				extraPrompts: [promptRegistration],
				extraResources: [resourceRegistration],
			};
			expect(slice.extraTools?.[0]?.id).toBe('t1');
			expect(slice.extraPrompts?.[0]?.id).toBe('p1');
			expect(slice.extraResources?.[0]?.id).toBe('r1');
		});
		it('is assignable to the composite (LSP)', () => {
			const slice: IHostRegistrations = {
				extraTools: [toolRegistration],
			};
			const composite: IMcpVertexHostConfig = {
				...slice,
				metadata,
				workspace,
			};
			expect(composite.extraTools?.[0]?.id).toBe('t1');
		});
	});

	describe('IMcpVertexHostConfig composite (Solid-LSP)', () => {
		it('a minimal host config satisfies the contract (only required fields)', () => {
			// The minimum a host MUST inject: identity + paths. The
			// rest is optional — this proves the slice-based design
			// pays off (no test needs to fake a metrics registry).
			const minimal: IMcpVertexHostConfig = { metadata, workspace };
			expect(minimal.metadata.name).toBe('mcp-vertex-host');
			expect(minimal.workspace.root).toBe('/repo');
		});

		it('the full composite carries every sub-interface field', () => {
			const full: IMcpVertexHostConfig = {
				metadata,
				namespacePrefix: 'full',
				workspace,
				corePaths,
				keepLegacy: true,
				knowledge: [knowledgeEntry],
				validationMatrix,
				statusCollectors: [statusCollector],
				extraTools: [toolRegistration],
				extraPrompts: [promptRegistration],
				extraResources: [resourceRegistration],
			};
			// Every field reachable through the composite — LSP-friendly.
			expect(full.metadata).toBe(metadata);
			expect(full.namespacePrefix).toBe('full');
			expect(full.workspace).toBe(workspace);
			expect(full.corePaths).toBe(corePaths);
			expect(full.keepLegacy).toBe(true);
			expect(full.knowledge).toEqual([knowledgeEntry]);
			expect(full.validationMatrix).toBe(validationMatrix);
			expect(full.statusCollectors).toEqual([statusCollector]);
			expect(full.extraTools).toEqual([toolRegistration]);
			expect(full.extraPrompts).toEqual([promptRegistration]);
			expect(full.extraResources).toEqual([resourceRegistration]);
		});
	});
});
