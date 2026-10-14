import { describe, expect, it } from 'vitest';

import { buildStartupReportForAssembly } from '@delendai/core/lib/startup-report/assembly';
import type { IToolSurfacePlan } from '@delendai/core/lib/contracts/interfaces/tool-surface.interface';

const basePlan = (
	overrides: Partial<IToolSurfacePlan> = {},
): IToolSurfacePlan => ({
	mode: 'managed',
	bootstrapToolIds: [],
	descriptors: [],
	plugins: [],
	...overrides,
});

const baseInput = (plan: IToolSurfacePlan) => ({
	plan,
	level: 'full' as const,
	version: '0.0.0',
	workspace: '/tmp/workspace',
	preset: 'test',
	configuredPluginIds: [],
	loadedPluginIds: [],
	skillsByPlugin: {},
	failedPluginCount: 0,
	skillsAvailable: 0,
	resourcesAvailable: 0,
});

describe('buildStartupReportForAssembly — surface mode honesty (AUD-C01 / x00285)', () => {
	it('reports an explicit-override reason when the plan pins an explicit mode', () => {
		const report = buildStartupReportForAssembly(
			baseInput(basePlan({ mode: 'native', explicitMode: 'native' })),
		);
		expect(report.identity.surfaceModeReason).toContain(
			'explicit surface override -> native',
		);
	});

	it('reports the boot-default reason (deferred to handshake) when nothing is explicit', () => {
		const report = buildStartupReportForAssembly(baseInput(basePlan()));
		expect(report.identity.surfaceModeReason).toContain('handshake');
	});

	it('listChangedRequired is true for managed/adaptive/compact and false for native, not a hardcoded constant', () => {
		expect(
			buildStartupReportForAssembly(
				baseInput(basePlan({ mode: 'managed' })),
			).runtime.listChangedRequired,
		).toBe(true);
		expect(
			buildStartupReportForAssembly(
				baseInput(basePlan({ mode: 'adaptive' })),
			).runtime.listChangedRequired,
		).toBe(true);
		expect(
			buildStartupReportForAssembly(
				baseInput(basePlan({ mode: 'compact' })),
			).runtime.listChangedRequired,
		).toBe(true);
		expect(
			buildStartupReportForAssembly(
				baseInput(basePlan({ mode: 'native' })),
			).runtime.listChangedRequired,
		).toBe(false);
	});
});
