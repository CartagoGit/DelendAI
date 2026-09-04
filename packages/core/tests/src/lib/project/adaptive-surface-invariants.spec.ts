/**
 * adaptive-surface-invariants.spec.ts — d00015 (AUD-G05).
 *
 * The audit calls "visible ≠ loaded ≠ active ≠ callable" the one
 * invariant of its four examples that was ALREADY well designed, not
 * a bug to fix. `tool-surface-runtime.spec.ts` already exercises each
 * of these states individually across several tests; this spec makes
 * the multi-state distinction itself the explicit assertion, in one
 * place, so a future refactor that quietly collapses two of these
 * axes into one boolean fails a test that says exactly what broke —
 * documented at
 * `docs/mcp-vertex/architecture/invariants/adaptive-surface.md`.
 *
 * Axes, as this runtime actually implements them:
 *   - visible : `isToolExposed()` — appears in `tools/list` right now.
 *   - loaded  : a `bindRegisteredTool()` record exists for the name
 *               (the module registered a real handler at some point).
 *   - active  : the owning plugin has not been explicitly
 *               deactivated (`activatePlugin`/`deactivatePlugin`).
 *   - callable: `invokeTool()` actually runs the handler right now.
 */
import { describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';
import { ToolNotAuthorizedError } from '@delendai/core/lib/project/tool-surface-runtime.helper';

const makeHandle = (enabled = true) => ({
	enabled,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

const TOOL_NAME = 'mcp-vertex_reports_run';

const buildRuntime = (mode: 'native' | 'compact' = 'native') =>
	createToolSurfaceRuntime({
		mode,
		bootstrapToolIds: ['overview'],
		routerToolId: 'vertex',
		descriptors: [
			{
				registrationId: 'reports_run',
				name: TOOL_NAME,
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

describe('adaptive surface invariant: visible ≠ loaded ≠ active ≠ callable', () => {
	it('a declared-but-never-bound tool is unknown to the runtime — none of the four states apply yet', () => {
		const runtime = buildRuntime();
		expect(runtime.getToolExposure(TOOL_NAME)).toBe('unknown');
		expect(runtime.isToolExposed(TOOL_NAME)).toBe(false);
	});

	it('hidden by surface mode (not visible) can still be loaded, active, AND callable', async () => {
		const runtime = buildRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: TOOL_NAME,
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.applySurfaceMode('compact');

		// not visible: the compact surface does not list it...
		expect(runtime.isToolExposed(TOOL_NAME)).toBe(false);
		// ...yet it is loaded (a real handler is bound), active (never
		// deactivated), and callable (invokeTool actually runs it).
		await expect(runtime.invokeTool(TOOL_NAME, {}, {})).resolves.toEqual({
			ok: true,
		});
	});

	it('deactivated makes a loaded, previously-visible tool NOT callable — collapsing visible into callable would miss this', async () => {
		const runtime = buildRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: TOOL_NAME,
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.deactivatePlugin('reports');

		// not visible AND not callable (both authorization axes flip)...
		expect(runtime.isToolExposed(TOOL_NAME)).toBe(false);
		await expect(
			runtime.invokeTool(TOOL_NAME, {}, {}),
		).rejects.toBeInstanceOf(ToolNotAuthorizedError);

		// ...but the registration itself is untouched: it is still
		// "loaded" — the route still resolves — which is exactly why
		// reactivation can restore it without re-registering anything.
		expect(runtime.resolveRoute('reports', 'run')?.name).toBe(TOOL_NAME);
	});

	it('reactivating restores visible AND callable together — the two authorization-gated axes move in lockstep, unlike the mode-gated visible axis above', async () => {
		const runtime = buildRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: TOOL_NAME,
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.deactivatePlugin('reports');
		runtime.activatePlugin('reports');

		expect(runtime.isToolExposed(TOOL_NAME)).toBe(true);
		await expect(runtime.invokeTool(TOOL_NAME, {}, {})).resolves.toEqual({
			ok: true,
		});
	});
});
