import { describe, expect, it } from 'vitest';

import type { IArgvExec } from '@delendai/core/public';

import { parseBunAudit, runDepsAudit } from '../../../src/lib/services/audit';

// Shape captured from a real `bun audit --json` run against this repo
// (severities adjusted to exercise the full mapping).
const REAL = JSON.stringify({
	'@hono/node-server': [
		{
			id: 1124006,
			url: 'https://github.com/advisories/GHSA-frvp-7c67-39w9',
			title: 'Path traversal in serve-static on Windows',
			severity: 'moderate',
			vulnerable_versions: '<2.0.5',
		},
	],
	astro: [
		{
			id: 1123974,
			url: 'https://github.com/advisories/GHSA-8mv7-9c27-98vc',
			title: 'checkOrigin bypass',
			severity: 'high',
			vulnerable_versions: '>=7.0.0 <7.0.6',
		},
		{
			id: 1123899,
			url: 'https://github.com/advisories/GHSA-4g3v-8h47-v7g6',
			title: 'Reflected XSS via View Transition properties',
			severity: 'critical',
			vulnerable_versions: '>=2.9.0 <=7.0.9',
		},
	],
});

const execWith = (stdout: string, stderr = '', code = 1): IArgvExec =>
	(async () => ({ code, stdout, stderr, timedOut: false })) as IArgvExec;

describe('parseBunAudit', () => {
	it('maps each advisory to a finding with GHSA ruleId + mapped severity', () => {
		const findings = parseBunAudit(REAL);
		expect(findings).toHaveLength(3);
		const hono = findings.find((f) => f.ruleId === 'GHSA-frvp-7c67-39w9');
		expect(hono?.severity).toBe('medium'); // moderate → medium
		expect(hono?.message).toContain('@hono/node-server');
		expect(hono?.message).toContain('vulnerable <2.0.5');
		expect(hono?.fix).toContain('upgrade @hono/node-server');
		expect(findings.some((f) => f.severity === 'critical')).toBe(true);
		expect(findings.some((f) => f.severity === 'high')).toBe(true);
	});

	it('tolerates a leading banner and trailing whitespace', () => {
		expect(parseBunAudit(`bun audit v1.3.14\n${REAL}\n`)).toHaveLength(3);
	});

	it('returns [] on malformed / empty input (never throws)', () => {
		expect(parseBunAudit('')).toEqual([]);
		expect(parseBunAudit('not json at all')).toEqual([]);
		expect(parseBunAudit('{bad')).toEqual([]);
	});

	it('falls back to advisory-<id> when there is no GHSA url', () => {
		const noUrl = JSON.stringify({
			pkg: [{ id: 42, title: 'x', severity: 'low' }],
		});
		const [finding] = parseBunAudit(noUrl);
		expect(finding?.ruleId).toBe('advisory-42');
		expect(finding?.severity).toBe('low');
		expect(finding?.fix).toBeUndefined();
	});
});

describe('runDepsAudit', () => {
	it('normalizes findings + summary from bun audit stdout', async () => {
		const result = await runDepsAudit('/repo', execWith(REAL));
		expect(result.tool).toBe('bun-audit');
		expect(result.findings).toHaveLength(3);
		expect(result.summary.critical).toBe(1);
		expect(result.summary.high).toBe(1);
		expect(result.summary.medium).toBe(1);
		expect(result.skipped).toBeUndefined();
	});

	it('reads the JSON from stderr when stdout carries none', async () => {
		const result = await runDepsAudit('/repo', execWith('', REAL));
		expect(result.findings).toHaveLength(3);
	});

	it('reports a skipped scan with an install hint when bun is missing', async () => {
		const result = await runDepsAudit('/repo', execWith('', '', 127));
		expect(result.skipped).toBe(true);
		expect(result.note).toContain('bun not found');
		expect(result.findings).toEqual([]);
	});

	it('returns no findings on a clean audit', async () => {
		const result = await runDepsAudit('/repo', execWith('{}'));
		expect(result.findings).toEqual([]);
		expect(result.skipped).toBeUndefined();
	});
});
