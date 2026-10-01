import { describe, expect, it } from 'vitest';

import { queryOsv, type IOsvFetch } from './osv';

const fetchWith =
	(status: number, body: unknown): IOsvFetch =>
	async () => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	});

describe('queryOsv', () => {
	it('normalizes the happy path into findings', async () => {
		const findings = await queryOsv({
			package: { name: 'axios', ecosystem: 'npm', version: '1.7.0' },
			fetchImpl: fetchWith(200, {
				vulns: [
					{
						id: 'GHSA-8hc4-vh64-cxmj',
						summary: 'SSRF in axios',
						database_specific: { severity: 'high' },
						references: [
							{
								url: 'https://github.com/advisories/GHSA-8hc4-vh64-cxmj',
							},
						],
					},
				],
			}),
		});
		expect(findings).toEqual([
			{
				ruleId: 'GHSA-8hc4-vh64-cxmj',
				severity: 'high',
				message: 'axios: SSRF in axios',
				location: { file: 'package.json' },
				fix: 'Review https://github.com/advisories/GHSA-8hc4-vh64-cxmj and upgrade axios from 1.7.0.',
			},
		]);
	});

	it('returns an empty list when OSV reports no vulns', async () => {
		const findings = await queryOsv({
			package: { name: 'safe', ecosystem: 'npm', version: '1.0.0' },
			fetchImpl: fetchWith(200, { vulns: [] }),
		});
		expect(findings).toEqual([]);
	});

	it('returns an empty list on 404', async () => {
		const findings = await queryOsv({
			package: { name: 'missing', ecosystem: 'npm', version: '0.0.1' },
			fetchImpl: fetchWith(404, {}),
		});
		expect(findings).toEqual([]);
	});
});
