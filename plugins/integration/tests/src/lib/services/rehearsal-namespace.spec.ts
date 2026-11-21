import { describe, expect, it } from 'vitest';

import {
	landConfigFromPolicy,
	landRepairPrefix,
	ownedPublicationRefPrefixes,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	pullHead,
	scenarioIntegration,
} from '../../../../src/lib/services/rehearsal-names.helper';
import { rehearsalPolicy } from '../../../../src/lib/services/rehearsal-setup.helper';

const REAL = JSON.stringify({
	development: {
		branches: {
			integration: 'develop',
			release: 'main',
			namespacePrefix: 'ns',
		},
	},
});
const ROOT = 'ns/rehearsal/r1/';
const integration = scenarioIntegration('ns/rehearsal/', 'r1', 's');

const resolved = () => {
	const parsed = JSON.parse(rehearsalPolicy(REAL, integration, true, 'r1'));
	return resolveDevelopmentPolicy({ development: parsed.development });
};

describe('rehearsal namespace', () => {
	it('[<50ms] gives land a batch and repair prefix under the run root', () => {
		const config = landConfigFromPolicy(resolved());
		expect(config.batchPrefix.startsWith(ROOT)).toBe(true);
		expect(landRepairPrefix(config.batchPrefix).startsWith(ROOT)).toBe(
			true,
		);
		expect(config.batchPrefix.startsWith('ns/queue/')).toBe(false);
	});

	it('[<50ms] keeps every ref a rehearsal names under the run root', () => {
		const policy = resolved();
		const config = landConfigFromPolicy(policy);
		const refs = [
			policy.branches.integration,
			pullHead('ns/rehearsal/', 'r1', 's', 'a'),
			config.batchPrefix,
			landRepairPrefix(config.batchPrefix),
			...ownedPublicationRefPrefixes(policy.branches).slice(0, 1),
		];
		for (const ref of refs) {
			expect(ref.startsWith(ROOT)).toBe(true);
			expect(ref.startsWith('ns/pr/')).toBe(false);
		}
	});
});
