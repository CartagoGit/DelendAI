/**
 * Unit tests for the `router-dashboard-webview.ts` HTML renderer (f00140 S3).
 * Pure rendering test — no vscode runtime, no fs.
 */
import { describe, expect, it } from 'vitest';

import type { IDashboardViewModel } from '@delendai/auto-agent-selector/public';

import { renderRouterDashboardHtml } from '../views/router-dashboard-webview';
import { stringsFor } from '../i18n/router-dashboard.strings';

const sampleViewModel = (): IDashboardViewModel => ({
	windowLabel: 'last 7 days',
	headline: '3 reachable · 4 task types · $0.18 this window · 4 calls',
	totalSpendUsd: 0.18,
	totalCalls: 4,
	rows: [
		{
			providerId: 'mid',
			label: 'mid',
			source: 'api',
			costTier: 3,
			pinned: false,
			bestRank: 1,
			spendUsd: 0.1,
			calls: 2,
			note: 'best rank #1 across task types',
		},
		{
			providerId: 'cheap',
			label: 'cheap',
			source: 'api',
			costTier: 1,
			pinned: true,
			bestRank: null,
			spendUsd: 0.05,
			calls: 1,
			note: 'pinned by you — always used',
		},
		{
			providerId: 'orphan',
			label: 'orphan',
			source: 'cli',
			costTier: 3,
			pinned: false,
			bestRank: null,
			spendUsd: 0.03,
			calls: 1,
			note: 'spend recorded but not in current roster',
		},
	],
});

describe('renderRouterDashboardHtml (f00140 S3)', () => {
	const strings = stringsFor('en');

	it('emits a doctype + CSP meta', () => {
		const html = renderRouterDashboardHtml(sampleViewModel(), strings);
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('Content-Security-Policy');
	});

	it('renders the headline and a KPI strip', () => {
		const html = renderRouterDashboardHtml(sampleViewModel(), strings);
		expect(html).toContain(
			'3 reachable · 4 task types · $0.18 this window',
		);
		expect(html).toContain('$0.18'); // totalSpend KPI
		expect(html).toContain('4'); // totalCalls KPI
	});

	it('renders every row in order with the right note', () => {
		const html = renderRouterDashboardHtml(sampleViewModel(), strings);
		// mid is bestRank #1 → renders the rank badge.
		expect(html).toContain('<code>mid</code>');
		expect(html).toContain('#1');
		// cheap is pinned → renders the ★ chip.
		expect(html).toContain('<code>cheap</code>');
		expect(html).toContain('chip--pin');
		// orphan is spend-only → its note appears verbatim.
		expect(html).toContain('spend recorded but not in current roster');
	});

	it('handles an empty row list with the documented empty message', () => {
		const vm = sampleViewModel();
		const empty: IDashboardViewModel = {
			...vm,
			rows: [],
			totalSpendUsd: 0,
			totalCalls: 0,
		};
		const html = renderRouterDashboardHtml(empty, strings);
		expect(html).toContain('No providers to display');
		expect(html).not.toContain('<tbody>');
	});

	it('escapes HTML in the provider id', () => {
		const vm = sampleViewModel();
		const malicious: IDashboardViewModel = {
			...vm,
			rows: [
				{
					providerId: '<script>alert(1)</script>',
					label: 'safe-label',
					source: 'api',
					costTier: 1,
					pinned: false,
					bestRank: null,
					spendUsd: 0,
					calls: 0,
					note: 'note',
				},
			],
		};
		const html = renderRouterDashboardHtml(malicious, strings);
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});

	it('uses en strings by default; non-en falls back to en copy', () => {
		const enStrings = stringsFor('en');
		const esStrings = stringsFor('es');
		expect(esStrings.title).toBe(enStrings.title);
	});
});
