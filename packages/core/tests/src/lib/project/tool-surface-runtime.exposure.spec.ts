import { afterEach, describe, expect, it, vi } from 'vitest';

import { createToolSurfaceRuntime } from '@mcp-vertex/core/lib/project/tool-surface-runtime.service';

const makeHandle = (enabled = true) => ({
	enabled,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

const buildRuntime = () =>
	createToolSurfaceRuntime({
		mode: 'native',
		bootstrapToolIds: ['overview'],
		routerToolId: 'vertex',
		descriptors: [
			{
				registrationId: 'reports_run',
				name: 'mcp-vertex_reports_run',
				toolId: 'run',
				pluginId: 'reports',
				namespace: 'reports',
			},
		],
		plugins: [
			{
				id: 'reports',
				namespace: 'reports',
				toolRegistrationIds: ['reports_run'],
			},
		],
	});

describe('tool-surface-runtime exposure (x00287 / AUD-C04)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns unknown and fails closed for a never-bound tool name', () => {
		const runtime = buildRuntime();
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		expect(runtime.getToolExposure('never-bound-tool-name')).toBe(
			'unknown',
		);
		expect(runtime.isToolExposed('never-bound-tool-name')).toBe(false);
		expect(stderr).toHaveBeenCalledTimes(2);
		expect(String(stderr.mock.calls[0]?.[0] ?? '')).toContain('warn');
		expect(String(stderr.mock.calls[0]?.[0] ?? '')).toContain(
			'never-bound-tool-name',
		);
	});

	it('keeps registered visible tools exposed', () => {
		const runtime = buildRuntime();
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'mcp-vertex_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();

		expect(runtime.getToolExposure('mcp-vertex_reports_run')).toBe(
			'visible',
		);
		expect(runtime.isToolExposed('mcp-vertex_reports_run')).toBe(true);
	});

	it('reports hidden for a registered tool hidden by surface mode', () => {
		const runtime = buildRuntime();
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'mcp-vertex_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.applySurfaceMode('compact');

		expect(runtime.getToolExposure('mcp-vertex_reports_run')).toBe(
			'hidden',
		);
		expect(runtime.isToolExposed('mcp-vertex_reports_run')).toBe(false);
	});
});
