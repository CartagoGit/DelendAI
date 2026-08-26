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
		it('returns `native` as the silent default when nothing is explicit', () => {
			expect(resolveInitialSurfaceMode(undefined)).toBe('native');
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

		it('does not register the router for `native`', () => {
			expect(shouldRegisterSurfaceRouter('native')).toBe(false);
		});

		it('does not register the router when nothing is explicit (silent default)', () => {
			expect(shouldRegisterSurfaceRouter(undefined)).toBe(false);
		});

		it('matrix agrees with the documented contract', () => {
			const matrix: Record<IMcpToolSurfaceMode, boolean> = {
				native: false,
				managed: true,
				adaptive: true,
				compact: true,
			};
			for (const mode of allModes) {
				expect(shouldRegisterSurfaceRouter(mode)).toBe(matrix[mode]);
			}
		});
	});

	describe('decideSurfaceModeFromCapabilities', () => {
		it('returns the explicit mode when set', () => {
			expect(
				decideSurfaceModeFromCapabilities({
					explicitMode: 'managed',
				}).mode,
			).toBe('managed');
		});

		it('falls back to `native` when capabilities detection is silent', () => {
			expect(decideSurfaceModeFromCapabilities({}).mode).toBe('native');
		});
	});
});
