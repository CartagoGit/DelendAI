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

	it('negotiates adaptive for a declaring client AND as the default for a plain one (r00026 / TOK-004)', () => {
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {
					extensions: {
						'mcp-vertex/surface': { toolsListChanged: true },
					},
				},
			}).mode,
		).toBe('adaptive');
		// r00026: adaptive is now the default even without the private
		// capability extension — native is an explicit opt-out only.
		expect(
			decideSurfaceModeFromCapabilities({ capabilities: {} }).mode,
		).toBe('adaptive');
		expect(
			decideSurfaceModeFromCapabilities({
				capabilities: {},
				explicitMode: 'native',
			}).mode,
		).toBe('native');
	});

	it('respects explicit overrides and derives bootstrap registration hints', () => {
		expect(
			resolveExplicitSurfaceMode({
				cliMode: 'compact',
				cliSurfaceExplicit: true,
				configMode: 'native',
			}),
		).toBe('compact');
		expect(resolveInitialSurfaceMode(undefined)).toBe('adaptive');
		expect(shouldRegisterSurfaceRouter(undefined)).toBe(true);
		expect(shouldRegisterSurfaceRouter('native')).toBe(false);
	});
});
