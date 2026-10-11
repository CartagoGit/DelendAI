import { describe, expect, it } from 'vitest';

import {
	MCP_TOOL_SURFACE_MODE,
	coerceSurfaceMode,
	isMcpToolSurfaceMode,
	resolveSurfaceModeAlias,
} from '@delendai/core/lib/contracts/interfaces/surface-mode.interface';

describe('surface-mode interface (q00009 / f00254)', () => {
	it('exposes the four canonical modes', () => {
		expect(MCP_TOOL_SURFACE_MODE).toEqual([
			'native',
			'managed',
			'adaptive',
			'compact',
		]);
	});

	it('recognises every canonical mode via isMcpToolSurfaceMode', () => {
		for (const mode of MCP_TOOL_SURFACE_MODE) {
			expect(isMcpToolSurfaceMode(mode)).toBe(true);
		}
	});

	it('recognises the legacy `extended` alias via isMcpToolSurfaceMode', () => {
		expect(isMcpToolSurfaceMode('extended')).toBe(true);
	});

	it('rejects unknown mode strings', () => {
		expect(isMcpToolSurfaceMode('unknown')).toBe(false);
		expect(isMcpToolSurfaceMode('')).toBe(false);
		expect(isMcpToolSurfaceMode(undefined)).toBe(false);
	});

	it('resolveSurfaceModeAlias maps `extended` to `adaptive`', () => {
		expect(resolveSurfaceModeAlias('extended')).toBe('adaptive');
	});

	it('resolveSurfaceModeAlias returns undefined for canonical modes', () => {
		expect(resolveSurfaceModeAlias('managed')).toBeUndefined();
		expect(resolveSurfaceModeAlias('native')).toBeUndefined();
	});

	it('coerceSurfaceMode returns the canonical mode for known inputs', () => {
		expect(coerceSurfaceMode('managed')).toBe('managed');
		expect(coerceSurfaceMode('extended')).toBe('adaptive');
		expect(coerceSurfaceMode(undefined)).toBeUndefined();
		expect(coerceSurfaceMode('garbage')).toBeUndefined();
	});
});
