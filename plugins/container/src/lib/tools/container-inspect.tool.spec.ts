import { describe, expect, it } from 'vitest';

import { buildContainerInspectToolRegistrations } from './container-inspect.tool';

describe('container_inspect tool', () => {
	it('registers the legacy inspect tool present in this tree', () => {
		expect(
			buildContainerInspectToolRegistrations({
				namespacePrefix: 'container',
				deps: {
					probeBinary: async () => ({ present: true }),
					exec: async () => ({ stdout: '', stderr: '' }),
				},
			}).map((tool) => tool.id),
		).toEqual(['container_inspect']);
	});
});
