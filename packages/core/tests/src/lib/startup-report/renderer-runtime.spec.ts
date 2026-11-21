import { describe, expect, it } from 'vitest';

import { RUNTIME_STATE_ENV } from '@delendai/core/lib/contracts/constants/runtime-state.constant';
import { buildStartupReport } from '@delendai/core/lib/startup-report/model';
import { renderStartupReportPlain } from '@delendai/core/lib/startup-report/renderer';

const report = buildStartupReport(
	{
		identity: {
			version: '0.x.x',
			workspace: '/w',
			preset: 'swarm',
			surfaceMode: 'managed',
		},
		catalog: {
			pluginsConfigured: 1,
			pluginsWarm: 1,
			pluginsFailed: 0,
			toolsAvailable: 1,
			toolsExposed: 1,
			skillsAvailable: 0,
			skillsBodiesPreloaded: 0,
			resourcesAvailable: 0,
		},
		pluginCosts: [],
		runtime: {
			lazyActivation: true,
			internalRouting: true,
			idleEvictionMs: 0,
			maxWarmPlugins: 8,
			listChangedRequired: false,
		},
		baseline: { tokensPerRequest: 1, source: 'estimated' },
	},
	'medium',
);

describe('the boot summary runtime line', () => {
	it('[<50ms] prints the branch state and the follow note the host set', () => {
		const out = renderStartupReportPlain(report, {
			[RUNTIME_STATE_ENV]: JSON.stringify({
				kind: 'branch',
				branch: 'develop',
				sha12: 'abcdef123456',
				ahead: 1,
				behind: 0,
				dirty: false,
				follow: 'not fast-forwarded',
			}),
		});
		expect(out).toContain('running        develop@abcdef123456 ahead 1');
		expect(out).toContain('follow: not fast-forwarded');
	});

	it('[<50ms] prints no runtime line when the host set none', () => {
		expect(renderStartupReportPlain(report, {})).not.toContain('running ');
	});
});
