import { describe, expect, it } from 'vitest';

import { parseKubectlGet } from './parse-kubectl-get';

describe('parseKubectlGet', () => {
	it('returns an empty list when items are absent', () => {
		expect(parseKubectlGet('{"kind":"List"}')).toEqual([]);
	});

	it('projects pod summaries from kubectl JSON', () => {
		const items = parseKubectlGet(
			JSON.stringify({
				items: [
					{
						metadata: { name: 'api-0', namespace: 'apps' },
						spec: {
							nodeName: 'node-a',
							containers: [{ name: 'api' }, { name: 'sidecar' }],
						},
						status: { phase: 'Running', podIP: '10.0.0.5' },
					},
				],
			}),
		);
		expect(items).toEqual([
			{
				name: 'api-0',
				namespace: 'apps',
				status: 'Running',
				nodeName: 'node-a',
				podIp: '10.0.0.5',
				containers: ['api', 'sidecar'],
			},
		]);
	});

	it('returns an empty list for malformed JSON', () => {
		expect(parseKubectlGet('{')).toEqual([]);
	});
});
