import { afterEach, describe, expect, it, vi } from 'vitest';

import { MANAGED_LAZY_PLUGIN_BY_ID } from '@delendai/core/lib/plugins/managed-lazy-catalog.generated';
import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';

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
				registrationId: 'vertex',
				name: 'delendai_vertex',
				toolId: 'vertex',
			},
			{
				registrationId: 'reports_run',
				name: 'delendai_reports_run',
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

/** q00016 S8: a runtime with one `essential` (undeclared, defaults
 * visible) and one `administrative` (declared, must be hidden) tool.
 *
 * `progressiveDisclosure` is opt-in and this harness opts in, because
 * `native` without it must keep listing everything — that is the mode's
 * documented promise (AUD-C01) and the reason the flag exists. See
 * `IToolSurfacePlan.progressiveDisclosure`. */
const buildDisclosureRuntime = () =>
	createToolSurfaceRuntime({
		mode: 'native',
		progressiveDisclosure: true,
		bootstrapToolIds: ['overview'],
		routerToolId: 'vertex',
		descriptors: [
			{
				registrationId: 'proposals_auto_work',
				name: 'delendai_proposals_auto_work',
				toolId: 'auto_work',
				pluginId: 'proposals',
				namespace: 'proposals',
			},
			{
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				toolId: 'state_repair',
				pluginId: 'proposals',
				namespace: 'proposals',
				disclosure: 'administrative',
			},
		],
		plugins: [
			{
				id: 'proposals',
				namespace: 'proposals',
				toolRegistrationIds: [
					'proposals_auto_work',
					'proposals_state_repair',
				],
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
			name: 'delendai_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();

		expect(runtime.getToolExposure('delendai_reports_run')).toBe('visible');
		expect(runtime.isToolExposed('delendai_reports_run')).toBe(true);
	});

	it('reports hidden for a registered tool hidden by surface mode', () => {
		const runtime = buildRuntime();
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'delendai_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.applySurfaceMode('compact');

		expect(runtime.getToolExposure('delendai_reports_run')).toBe('hidden');
		expect(runtime.isToolExposed('delendai_reports_run')).toBe(false);
	});

	describe('q00016 S8 — disclosure-hidden tools stay callable', () => {
		it('leaves an undeclared registration visible (backwards compatible)', () => {
			const runtime = buildDisclosureRuntime();
			runtime.bindRegisteredTool({
				registrationId: 'proposals_auto_work',
				name: 'delendai_proposals_auto_work',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.bindRegisteredTool({
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.finalizeInitialSurface();

			expect(
				runtime.getToolExposure('delendai_proposals_auto_work'),
			).toBe('visible');
		});

		it('hides a `disclosure: administrative` registration from native tools/list', () => {
			const runtime = buildDisclosureRuntime();
			runtime.bindRegisteredTool({
				registrationId: 'proposals_auto_work',
				name: 'delendai_proposals_auto_work',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.bindRegisteredTool({
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.finalizeInitialSurface();

			expect(
				runtime.getToolExposure('delendai_proposals_state_repair'),
			).toBe('hidden');
		});

		it('keeps the router visible in native mode when progressive disclosure hides tools', () => {
			const runtime = buildDisclosureRuntime();
			runtime.bindRegisteredTool({
				registrationId: 'vertex',
				name: 'delendai_vertex',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.bindRegisteredTool({
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.finalizeInitialSurface();

			expect(runtime.getToolExposure('delendai_vertex')).toBe('visible');
		});

		it('does not reveal administrative tools when their plugin is reactivated', () => {
			const runtime = buildDisclosureRuntime();
			runtime.bindRegisteredTool({
				registrationId: 'proposals_auto_work',
				name: 'delendai_proposals_auto_work',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.bindRegisteredTool({
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.finalizeInitialSurface();

			runtime.deactivatePlugin('proposals');
			runtime.activatePlugin('proposals');

			expect(
				runtime.getToolExposure('delendai_proposals_auto_work'),
			).toBe('visible');
			expect(
				runtime.getToolExposure('delendai_proposals_state_repair'),
			).toBe('hidden');
		});

		it('preserves proposals disclosure metadata in the managed-lazy catalog', () => {
			const proposals = MANAGED_LAZY_PLUGIN_BY_ID.get('proposals');
			expect(proposals?.toolDisclosure?.state_repair).toBe(
				'administrative',
			);
			expect(proposals?.toolDisclosure?.proposal_transition).toBe(
				'contextual',
			);
			expect(proposals?.toolDisclosure?.auto_work).toBeUndefined();
		});

		it('CRITICAL INVARIANT: a hidden administrative tool is still callable through invokeTool', async () => {
			const runtime = buildDisclosureRuntime();
			const handler = vi.fn(async () => ({ ok: true, ranHidden: true }));
			runtime.bindRegisteredTool({
				registrationId: 'proposals_auto_work',
				name: 'delendai_proposals_auto_work',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.bindRegisteredTool({
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				handler,
				handle: makeHandle(true),
			});
			runtime.finalizeInitialSurface();

			// hidden, not deactivated: getToolExposure/isToolExposed say no...
			expect(
				runtime.getToolExposure('delendai_proposals_state_repair'),
			).toBe('hidden');
			// ...but the router still dispatches to it.
			const result = await runtime.invokeTool(
				'delendai_proposals_state_repair',
				{},
				{},
			);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ ok: true, ranHidden: true });
		});

		it('CRITICAL INVARIANT: a hidden administrative tool is still findable via resolveRoute', () => {
			const runtime = buildDisclosureRuntime();
			runtime.bindRegisteredTool({
				registrationId: 'proposals_auto_work',
				name: 'delendai_proposals_auto_work',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.bindRegisteredTool({
				registrationId: 'proposals_state_repair',
				name: 'delendai_proposals_state_repair',
				handler: async () => ({ ok: true }),
				handle: makeHandle(true),
			});
			runtime.finalizeInitialSurface();

			const found = runtime.resolveRoute('proposals', 'state_repair');
			expect(found?.name).toBe('delendai_proposals_state_repair');
			expect(found?.active).toBe(false);
		});
	});
});
