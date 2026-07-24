import { describe, expect, it } from 'vitest';

import { parseAuditJson } from './parsers';

describe('parseAuditJson', () => {
	it('maps bun audit format into findings', () => {
		const findings = parseAuditJson(
			{
				astro: [
					{
						id: 1,
						url: 'https://github.com/advisories/GHSA-8mv7-9c27-98vc',
						title: 'checkOrigin bypass',
						severity: 'high',
						vulnerable_versions: '<7.0.6',
					},
				],
			},
			{ ecosystem: 'bun' },
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			ruleId: 'GHSA-8mv7-9c27-98vc',
			severity: 'high',
			location: { file: 'package.json' },
		});
	});

	it('maps npm vulnerabilities with fix metadata', () => {
		const findings = parseAuditJson(
			{
				vulnerabilities: {
					minimatch: {
						severity: 'critical',
						range: '<3.0.5',
						via: [
							{
								source: 1096485,
								title: 'ReDoS',
								url: 'https://github.com/advisories/GHSA-f8q6-p94x-37v3',
								severity: 'critical',
								range: '<3.0.5',
							},
						],
						fixAvailable: { name: 'minimatch', version: '3.1.2' },
					},
				},
			},
			{ ecosystem: 'npm' },
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.fix).toContain('3.1.2');
		expect(findings[0]?.severity).toBe('critical');
	});

	it('maps yarn advisories into findings', () => {
		const findings = parseAuditJson(
			{
				advisories: {
					'42': {
						id: 42,
						module_name: 'axios',
						severity: 'moderate',
						title: 'SSRF',
						url: 'https://github.com/advisories/GHSA-8hc4-vh64-cxmj',
						vulnerable_versions: '<1.8.2',
					},
				},
			},
			{ ecosystem: 'yarn' },
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			ruleId: 'GHSA-8hc4-vh64-cxmj',
			severity: 'medium',
		});
	});

	it('returns no findings for an empty payload', () => {
		expect(parseAuditJson({}, { ecosystem: 'bun' })).toEqual([]);
	});
});
