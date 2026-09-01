import { describe, expect, it } from 'vitest';

import {
	PROJECT_HEALTH_DOMAIN_TOOLS,
	PROJECT_HEALTH_MAX_HINT_LENGTH,
} from '../../../../src/lib/contracts/constants/project-health.constant';
import type {
	IProjectHealthOutput,
	IProjectHealthScore,
	IProjectHealthSignals,
} from '../../../../src/lib/contracts/interfaces/project-health.interface';
import {
	buildDomainHint,
	buildNextActions,
	finalizeOutput,
} from '../../../../src/lib/services/project-health.service';

const score: IProjectHealthScore = {
	score: 42,
	security: 85,
	deps: 60,
	quality: 40,
	debt: 30,
};

const signals: IProjectHealthSignals = {
	lockfile: 'bun.lock',
	qualityScopes: ['lint', 'typecheck'],
	lintConfig: true,
	testConfig: true,
	suspiciousPaths: ['plugins/demo/.env.backup'],
	markerCount: 8,
	sampledFiles: 3,
	score,
};

const rawOutput = (): Omit<
	IProjectHealthOutput,
	'bytes' | 'truncated' | 'originalBytes'
> => ({
	...score,
	next: Array.from({ length: 5 }, (_, index) => ({
		tool: `tool-${index + 1}`,
		reason: `reason ${index + 1} ${'x'.repeat(90)}`,
	})),
	hint: `hint ${'y'.repeat(400)}`,
	dependsOn: ['quality', 'security'],
});

describe('project-health.service', () => {
	it('unit > buildNextActions > emits one action per degraded domain', () => {
		const actions = buildNextActions(score, signals);

		expect(actions).toEqual([
			{
				tool: PROJECT_HEALTH_DOMAIN_TOOLS.security,
				reason: 'Bounded filename scan found 1 suspicious path(s).',
			},
			{
				tool: PROJECT_HEALTH_DOMAIN_TOOLS.deps,
				reason: 'Dependency health still needs the real audit beyond the bun.lock lockfile signal.',
			},
			{
				tool: PROJECT_HEALTH_DOMAIN_TOOLS.quality,
				reason: 'Resolved scopes (lint, typecheck) still need real execution results.',
			},
			{
				tool: PROJECT_HEALTH_DOMAIN_TOOLS.debt,
				reason: 'Bounded sample found 8 debt marker(s) across 3 file(s).',
			},
		]);
	});

	it('unit > buildDomainHint > truncates oversized lazy detail hints', () => {
		const hint = buildDomainHint('security', {
			...signals,
			suspiciousPaths: Array.from(
				{ length: 30 },
				(_, index) => `path-${index}`,
			),
		});

		expect(hint).toContain('Lazy detail only.');
		expect(hint.length).toBeLessThanOrEqual(PROJECT_HEALTH_MAX_HINT_LENGTH);
	});

	it('unit > finalizeOutput > trims next actions before dropping them entirely', () => {
		const output = finalizeOutput(rawOutput(), 450);

		expect(output.truncated).toBe(true);
		expect(output.originalBytes).toBeTypeOf('number');
		expect((output.next?.length ?? 0) <= 4).toBe(true);
		expect(output.dependsOn).toEqual(['quality', 'security']);
		expect(
			(output.hint?.length ?? 0) <= PROJECT_HEALTH_MAX_HINT_LENGTH,
		).toBe(true);
	});
});
