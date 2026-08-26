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

	it('negotiates adaptive for a declaring client AND defaults to native for a plain one (r00027 / TOK-004 follow-up)', () => {
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {
					extensions: {
						'mcp-vertex/surface': { toolsListChanged: true },
					},
				},
			}).mode,
		).toBe('adaptive');
		// r00027: native is the silent default again. r00026's
		// "adaptive by default" hid every tool behind a
		// `list_changed` notification that most spec-compliant
		// MCP clients never re-fetch on. Inverting back means the
		// first `tools/list` enumerates every loaded tool.
		expect(
			decideSurfaceModeFromCapabilities({ capabilities: {} }).mode,
		).toBe('native');
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
		// r00027: default surface is now `native` (was `adaptive` in
		// r00026). The bootstrap set therefore stays smaller and the
		// router registration hint flips accordingly.
		expect(resolveInitialSurfaceMode(undefined)).toBe('native');
		expect(shouldRegisterSurfaceRouter(undefined)).toBe(false);
		expect(shouldRegisterSurfaceRouter('native')).toBe(false);
	});
});
