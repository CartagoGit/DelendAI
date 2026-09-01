import { describe, expect, it } from 'vitest';

import type { IMcpToolSurfaceMode } from '@mcp-vertex/core/lib/contracts/interfaces/surface-mode.interface';
import {
	decideSurfaceModeFromCapabilities,
	resolveExplicitSurfaceMode,
	resolveInitialSurfaceMode,
	shouldRegisterSurfaceRouter,
} from '@mcp-vertex/core/lib/surface/decide-mode';

describe('decide-surface-mode (q00009 / f00254)', () => {
	describe('resolveInitialSurfaceMode', () => {
		it('returns `managed` as the silent default when nothing is explicit', () => {
			expect(resolveInitialSurfaceMode(undefined)).toBe('managed');
		});

		it('returns the explicit override verbatim', () => {
			expect(resolveInitialSurfaceMode('managed')).toBe('managed');
			expect(resolveInitialSurfaceMode('compact')).toBe('compact');
			expect(resolveInitialSurfaceMode('adaptive')).toBe('adaptive');
		});
	});

	describe('resolveExplicitSurfaceMode', () => {
		it('prefers CLI over config when CLI is explicit', () => {
			expect(
				resolveExplicitSurfaceMode({
					cliMode: 'managed',
					cliSurfaceExplicit: true,
					configMode: 'native',
				}),
			).toBe('managed');
		});

		it('falls back to config when CLI is not explicit', () => {
			expect(
				resolveExplicitSurfaceMode({
					cliMode: 'managed',
					cliSurfaceExplicit: false,
					configMode: 'compact',
				}),
			).toBe('compact');
		});

		it('returns undefined when neither CLI nor config sets a mode', () => {
			expect(
				resolveExplicitSurfaceMode({
					cliMode: 'native',
					cliSurfaceExplicit: false,
				}),
			).toBeUndefined();
		});
	});

	describe('shouldRegisterSurfaceRouter (q00009 / f00254)', () => {
		const allModes: readonly IMcpToolSurfaceMode[] = [
			'native',
			'managed',
			'adaptive',
			'compact',
		];

		it('registers the router for `managed` (catalog stays server-side)', () => {
			expect(shouldRegisterSurfaceRouter('managed')).toBe(true);
		});

		it('keeps registering the router for `compact` and `adaptive`', () => {
			expect(shouldRegisterSurfaceRouter('compact')).toBe(true);
			expect(shouldRegisterSurfaceRouter('adaptive')).toBe(true);
		});

		it('registers the router for `native` but keeps it hidden', () => {
			expect(shouldRegisterSurfaceRouter('native')).toBe(true);
		});

		it('does not register the router when nothing is explicit (silent default)', () => {
			expect(shouldRegisterSurfaceRouter(undefined)).toBe(true);
		});

		it('matrix agrees with the documented contract', () => {
			const matrix: Record<IMcpToolSurfaceMode, boolean> = {
				native: true,
				managed: true,
				adaptive: true,
				compact: true,
			};
			for (const mode of allModes) {
				expect(shouldRegisterSurfaceRouter(mode)).toBe(matrix[mode]);
			}
		});
	});

	describe('decideSurfaceModeFromCapabilities (AUD-C01 / x00285)', () => {
		it('returns the explicit mode when set, even for a client that would otherwise resolve differently', () => {
			expect(
				decideSurfaceModeFromCapabilities({
					explicitMode: 'managed',
				}).mode,
			).toBe('managed');
			// A known-managed host explicitly forced to native.
			expect(
				decideSurfaceModeFromCapabilities({
					clientInfo: { name: 'claude-code', version: '1.0.0' },
					explicitMode: 'native',
				}).mode,
			).toBe('native');
			// A client with no signal at all, explicitly forced to managed.
			expect(
				decideSurfaceModeFromCapabilities({
					clientInfo: {
						name: 'totally-unknown-host',
						version: '1.0.0',
					},
					capabilities: {},
					explicitMode: 'managed',
				}).mode,
			).toBe('managed');
		});

		it('an unknown client with no listChanged signal resolves to native, and the reason names the signal', () => {
			const decision = decideSurfaceModeFromCapabilities({
				clientInfo: { name: 'totally-unknown-host', version: '1.0.0' },
				capabilities: {},
			});
			expect(decision.mode).toBe('native');
			expect(decision.reason).toContain('totally-unknown-host');
			expect(decision.reason).toContain('listChanged');
		});

		it('an unknown client that declares mcp-vertex/surface listChanged support resolves to managed, and the reason names it', () => {
			const decision = decideSurfaceModeFromCapabilities({
				clientInfo: { name: 'totally-unknown-host', version: '1.0.0' },
				capabilities: {
					extensions: {
						'mcp-vertex/surface': { toolsListChanged: true },
					},
				},
			});
			expect(decision.mode).toBe('managed');
			expect(decision.reason).toContain('listChanged support');
		});

		it('a recognised host profile wins over capability detection', () => {
			// Claude Code declares nothing, but the host profile pins it to
			// managed regardless — matches host-compatibility-matrix.md.
			const decision = decideSurfaceModeFromCapabilities({
				clientInfo: { name: 'claude-code', version: '1.0.0' },
				capabilities: {},
			});
			expect(decision.mode).toBe('managed');
			expect(decision.reason).toContain('host-compatibility-matrix.md');
		});

		it('falls back to `native` when there is no clientInfo at all (fully anonymous connection)', () => {
			expect(decideSurfaceModeFromCapabilities({}).mode).toBe('native');
		});
	});
});
