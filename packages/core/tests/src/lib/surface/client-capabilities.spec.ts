import { describe, expect, it } from 'vitest';

import { detectClientSurfaceCapabilities } from '@delendai/core/lib/surface/client-capabilities';
import {
	decideSurfaceModeFromCapabilities,
	resolveExplicitSurfaceMode,
	resolveInitialSurfaceMode,
	shouldRegisterSurfaceRouter,
} from '@delendai/core/lib/surface/decide-mode';

describe('surface capability negotiation', () => {
	it('detects tools list-changed support from extensions', () => {
		const detected = detectClientSurfaceCapabilities({
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {
				extensions: {
					'delendai/surface': {
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

	it('keeps managed for a client that declares delendai/surface support, native otherwise (AUD-C01 / x00285)', () => {
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {
					extensions: {
						'delendai/surface': { toolsListChanged: true },
					},
				},
			}).mode,
		).toBe('managed');
		// An anonymous client (no clientInfo, so it matches no known host
		// profile) that declares NOTHING about list-changed support used
		// to get the same `managed` default as everyone else — AUD-C01:
		// `decideSurfaceModeFromCapabilities` ignored both parameters
		// that give it its name. It now falls back to `native`, because
		// there is no signal it can ever discover a lazily-activated
		// tool. A recognised host (Claude Code, Cursor, ...) is
		// unaffected: see the host-profile spec below.
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
		// Managed is now the default surface (was `adaptive` in
		// r00026). The bootstrap set therefore stays smaller and the router
		// remains registered as the internal fallback.
		expect(resolveInitialSurfaceMode(undefined)).toBe('managed');
		expect(shouldRegisterSurfaceRouter(undefined)).toBe(true);
		expect(shouldRegisterSurfaceRouter('native')).toBe(true);
	});
});
