import { describe, expect, it } from 'vitest';

import { detectClientSurfaceCapabilities } from '@mcp-vertex/core/lib/surface/client-capabilities';
import {
	decideSurfaceModeFromCapabilities,
	resolveExplicitSurfaceMode,
	resolveInitialSurfaceMode,
	shouldRegisterSurfaceRouter,
} from '@mcp-vertex/core/lib/surface/decide-mode';

describe('surface capability negotiation', () => {
	it('detects tools list-changed support from extensions', () => {
		const detected = detectClientSurfaceCapabilities({
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {
				extensions: {
					'mcp-vertex/surface': {
						toolsListChanged: true,
						preferredMode: 'adaptive',
					},
				},
			},
		});
		expect(detected.listChangedSupport).toBe(true);
		expect(detected.preferredMode).toBe('adaptive');
		expect(detected.source).toBe('extensions');
	});

	it('keeps managed stable for clients with or without list-change support', () => {
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {
					extensions: {
						'mcp-vertex/surface': { toolsListChanged: true },
					},
				},
			}).mode,
		).toBe('managed');
		// Managed is the stable default. r00026's
		// "adaptive by default" hid every tool behind a
		// `list_changed` notification that most spec-compliant
		// MCP clients never re-fetch on. Inverting back means the
		// first `tools/list` is now the stable managed bootstrap.
		expect(
			decideSurfaceModeFromCapabilities({ capabilities: {} }).mode,
		).toBe('managed');
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {},
				explicitMode: 'native',
			}).mode,
		).toBe('native');
		// Adaptive is still available as an explicit opt-in.
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {},
				explicitMode: 'adaptive',
			}).mode,
		).toBe('adaptive');
	});

	it('respects explicit overrides and derives bootstrap registration hints', () => {
		expect(
			resolveExplicitSurfaceMode({
				cliMode: 'compact',
				cliSurfaceExplicit: true,
				configMode: 'native',
			}),
		).toBe('compact');
		// Managed is now the default surface (was `adaptive` in
		// r00026). The bootstrap set therefore stays smaller and the router
		// remains registered as the internal fallback.
		expect(resolveInitialSurfaceMode(undefined)).toBe('managed');
		expect(shouldRegisterSurfaceRouter(undefined)).toBe(true);
		expect(shouldRegisterSurfaceRouter('native')).toBe(true);
	});
});
