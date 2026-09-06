/**
 * workspace-ownership.spec.ts — b00239 S5.
 *
 * Pins the predicate that decides whether a single host-config
 * entry belongs to the workspace being migrated.
 *
 * Acceptance criterion (proposal S5):
 *
 *   "Una entrada global solo se toca si su asociación al
 *    workspace en migración es demostrable."
 *
 * The four proofs the predicate accepts are exercised end-to-end:
 *
 *   1. map-key equals the canonical workspace path,
 *   2. a string leaf inside the entry contains the canonical path,
 *   3. the entry references the canonical config file,
 *   4. an entry in `metadata` names the workspace.
 *
 * Anything else is rejected: the "no path at all" case is the
 * ambiguous case the acceptance criterion exists to forbid.
 */

import { describe, expect, it } from 'vitest';

import {
	POST_MIGRATION_CONFIG_BASENAME,
	collectOwnership,
	isOwnedByWorkspace,
	normalizeWorkspacePath,
	type IAbstractWorkspaceEntry,
} from '@delendai/core/lib/workspace-migration/host-scope/workspace-ownership';

const WORKSPACE = '/srv/projects/acme';

describe('normalizeWorkspacePath', () => {
	it('strips trailing separators', () => {
		expect(normalizeWorkspacePath('/srv/proj/')).toBe('/srv/proj');
	});

	it('collapses `.` segments', () => {
		expect(normalizeWorkspacePath('/srv/./proj')).toBe('/srv/proj');
	});

	it('collapses `..` segments', () => {
		expect(normalizeWorkspacePath('/srv/proj/sub/..')).toBe('/srv/proj');
	});

	it('treats mixed separators as forward slashes', () => {
		expect(normalizeWorkspacePath('\\srv\\proj')).toBe('/srv/proj');
	});

	it('preserves the literal root `/`', () => {
		expect(normalizeWorkspacePath('/')).toBe('/');
	});
});

describe('isOwnedByWorkspace — positive cases', () => {
	it('accepts an entry whose map key equals the canonical workspace path', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: WORKSPACE,
			value: { mcpServers: { 'mcp-vertex': { command: 'bun' } } },
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(true);
	});

	it('accepts an entry whose map key normalises to the canonical workspace path', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: `${WORKSPACE}/`,
			value: { trust_level: 'trusted' },
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(true);
	});

	it('accepts an entry whose `cwd` field contains the workspace path', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'mcp-vertex-global',
			value: {
				mcpServers: {
					'mcp-vertex': {
						command: 'bun',
						cwd: WORKSPACE,
					},
				},
			},
		};
		const result = collectOwnership(entry, WORKSPACE);
		expect(result.owned).toBe(true);
		expect(result.proofs.map((proof) => proof.kind)).toContain(
			'value-path',
		);
	});

	it('accepts an entry whose `args` array contains the workspace path', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'some-other-key',
			value: {
				mcpServers: {
					'mcp-vertex': {
						command: 'bun',
						args: ['run', '--cwd', WORKSPACE, 'dev'],
					},
				},
			},
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(true);
	});

	it('accepts an entry whose value references the canonical config file', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'orphan-entry',
			value: {
				configPath: `${WORKSPACE}/${POST_MIGRATION_CONFIG_BASENAME}`,
			},
		};
		const result = collectOwnership(entry, WORKSPACE);
		expect(result.owned).toBe(true);
		expect(result.proofs.map((proof) => proof.kind)).toContain(
			'config-path',
		);
	});

	it('accepts an entry whose metadata `name` names the workspace', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'global-key',
			value: { trust_level: 'trusted' },
			metadata: { name: WORKSPACE, trust_level: 'trusted' },
		};
		const result = collectOwnership(entry, WORKSPACE);
		expect(result.owned).toBe(true);
		expect(result.proofs.map((proof) => proof.kind)).toContain('metadata');
	});

	it('accepts an entry whose metadata `label` names the workspace', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'global-key',
			value: {},
			metadata: { label: `${WORKSPACE}/` },
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(true);
	});
});

describe('isOwnedByWorkspace — negative cases', () => {
	it('rejects an entry that points at a different workspace', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: '/srv/projects/other',
			value: {
				mcpServers: {
					'mcp-vertex': { cwd: '/srv/projects/other' },
				},
			},
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(false);
	});

	it('rejects an entry that shares a substring but not a full path segment', () => {
		// `/srv/projects/acme-legacy` shares a prefix with
		// `/srv/projects/acme`; a substring match would rewrite
		// the wrong entry. Path-anchored matching refuses.
		const entry: IAbstractWorkspaceEntry = {
			key: '/srv/projects/acme-legacy',
			value: {
				mcpServers: {
					'mcp-vertex': { cwd: '/srv/projects/acme-legacy' },
				},
			},
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(false);
	});

	it('rejects an entry with no path-bearing fields at all', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'arbitrary-key',
			value: { trust_level: 'trusted', enabled: true },
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(false);
	});

	it('rejects an entry whose value is null', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'orphan',
			value: null,
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(false);
	});

	it('rejects an entry whose value is a primitive', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'orphan',
			value: 'some scalar string with no path',
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(false);
	});

	it('rejects an entry whose metadata has no naming field', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: 'orphan',
			value: {},
			metadata: { trust_level: 'trusted', alias: 'unrelated' },
		};
		expect(isOwnedByWorkspace(entry, WORKSPACE)).toBe(false);
	});
});

describe('isOwnedByWorkspace — proof diagnostics', () => {
	it('records multiple proofs when more than one matches', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: WORKSPACE,
			value: {
				cwd: WORKSPACE,
				mcpServers: {
					'mcp-vertex': { cwd: WORKSPACE },
				},
			},
			metadata: { name: WORKSPACE },
		};
		const result = collectOwnership(entry, WORKSPACE);
		expect(result.owned).toBe(true);
		const kinds = new Set(result.proofs.map((proof) => proof.kind));
		expect(kinds.has('map-key')).toBe(true);
		expect(kinds.has('value-path')).toBe(true);
		expect(kinds.has('metadata')).toBe(true);
	});

	it('returns empty proofs when the entry is not owned', () => {
		const entry: IAbstractWorkspaceEntry = {
			key: '/srv/projects/other',
			value: { trust_level: 'trusted' },
		};
		expect(collectOwnership(entry, WORKSPACE)).toEqual({
			owned: false,
			proofs: [],
		});
	});
});
