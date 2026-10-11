import { describe, expect, it } from 'vitest';

import { isConfigurationCenterSaveRequest } from './configuration-center-data';

describe('dev Configuration Center request boundary', () => {
	it('accepts bounded set/delete edits', () => {
		expect(
			isConfigurationCenterSaveRequest({
				expectedDigest: 'abc',
				edits: [
					{
						action: 'set',
						path: ['plugins', 'audit', 'enabled'],
						value: true,
					},
					{ action: 'delete', path: ['providers', 0] },
				],
			}),
		).toBe(true);
	});

	it('rejects extra keys, invalid paths and unbounded batches', () => {
		expect(
			isConfigurationCenterSaveRequest({
				expectedDigest: 'abc',
				edits: [],
				workspaceRoot: '/tmp/escape',
			}),
		).toBe(false);
		expect(
			isConfigurationCenterSaveRequest({
				expectedDigest: 'abc',
				edits: [{ action: 'delete', path: [''] }],
			}),
		).toBe(false);
		expect(
			isConfigurationCenterSaveRequest({
				expectedDigest: 'abc',
				edits: Array.from({ length: 257 }, () => ({
					action: 'delete',
					path: ['plugins'],
				})),
			}),
		).toBe(false);
	});
});
