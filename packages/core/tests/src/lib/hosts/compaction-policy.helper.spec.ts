import { describe, expect, it } from 'vitest';

import type {
	IAgentHost,
	ICompactionPolicy,
} from '../../../../src/lib/contracts/interfaces/agent-host.interface';
import { AGENT_HOSTS } from '../../../../src/lib/contracts/constants/agent-hosts.constant';
import { renderCompactionForHosts } from '../../../../src/lib/hosts/agent-renderers.helper';
import {
	compactNowDirective,
	renderCompactionFor,
} from '../../../../src/lib/hosts/compaction-policy.helper';

const policy: ICompactionPolicy = {
	thresholdPercent: 60,
	handoverCommand: 'delendai handover',
};

const host = (extra: Partial<IAgentHost>): IAgentHost => ({
	id: 'h',
	label: 'H',
	evidence: { paths: [] },
	...extra,
});

describe('renderCompactionFor', () => {
	it('[<20ms] gives a host with a native setting its threshold variable and hooks that run the handover', () => {
		const claude = AGENT_HOSTS.find((entry) => entry.id === 'claude');
		if (claude === undefined) throw new Error('claude host missing');
		expect(renderCompactionFor(claude, policy)).toEqual({
			kind: 'native',
			hostId: 'claude',
			env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '60' },
			hooks: [
				{ event: 'PreCompact', command: 'delendai handover persist' },
				{ event: 'SessionStart', command: 'delendai handover index' },
			],
		});
	});

	it('[<20ms] gives a host with only a variable just the variable', () => {
		expect(
			renderCompactionFor(
				host({ compaction: { thresholdEnv: 'X_PCT' } }),
				policy,
			),
		).toMatchObject({ kind: 'native', env: { X_PCT: '60' }, hooks: [] });
	});

	it('[<20ms] gives a host with only hooks just the hooks', () => {
		expect(
			renderCompactionFor(
				host({ compaction: { hooks: { sessionStart: 'Start' } } }),
				policy,
			),
		).toMatchObject({
			kind: 'native',
			env: {},
			hooks: [{ event: 'Start', command: 'delendai handover index' }],
		});
	});

	it('[<20ms] gives any other host a compact-now directive from the server', () => {
		expect(renderCompactionFor(host({}), policy)).toEqual({
			kind: 'directive',
			hostId: 'h',
			directive: compactNowDirective(policy),
		});
		expect(compactNowDirective(policy)).toContain('60%');
	});

	it('[<20ms] refuses a threshold outside 1..99 and an empty command', () => {
		for (const thresholdPercent of [0, 100, 50.5]) {
			expect(() =>
				renderCompactionFor(host({}), { ...policy, thresholdPercent }),
			).toThrow(RangeError);
		}
		expect(() =>
			renderCompactionFor(host({}), { ...policy, handoverCommand: ' ' }),
		).toThrow(/handoverCommand/);
	});
});

describe('renderCompactionForHosts', () => {
	it('[<20ms] renders every host from the one policy', () => {
		const rendered = renderCompactionForHosts(AGENT_HOSTS, policy);
		expect(rendered).toHaveLength(AGENT_HOSTS.length);
		expect(
			rendered.filter((entry) => entry.kind === 'native'),
		).toHaveLength(
			AGENT_HOSTS.filter((entry) => entry.compaction !== undefined)
				.length,
		);
	});
});
