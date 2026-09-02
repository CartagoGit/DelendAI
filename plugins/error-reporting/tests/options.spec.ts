import { describe, expect, it } from 'vitest';

import {
	DEFAULT_BACKOFF_BASE_MS,
	DEFAULT_BACKOFF_JITTER_RATIO,
	DEFAULT_BACKOFF_MAX_MS,
	DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
	DEFAULT_LABELS,
	DEFAULT_MAX_ISSUES_PER_DAY,
	DEFAULT_TARGET_REPO,
} from '../src/lib/contracts/constants/options.constant';
import {
	ERR_REPORTING_OPTION_DEPRECATED,
	resolveOptions,
} from '../src/lib/options.service';

describe('resolveOptions', () => {
	it('applies the intrinsic defaults when nothing is configured', () => {
		const options = resolveOptions({});
		expect(options.enabled).toBe(true);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.labels).toEqual([...DEFAULT_LABELS]);
		expect(options.dedupeWindowHours).toBe(24);
		expect(options.maxIssuesPerDay).toBe(DEFAULT_MAX_ISSUES_PER_DAY);
		expect(options.circuitBreakerThreshold).toBe(
			DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
		);
		expect(options.backoffBaseMs).toBe(DEFAULT_BACKOFF_BASE_MS);
		expect(options.backoffMaxMs).toBe(DEFAULT_BACKOFF_MAX_MS);
		expect(options.backoffJitterRatio).toBe(DEFAULT_BACKOFF_JITTER_RATIO);
	});

	it('honours operational overrides but never project-controlled transport policy', () => {
		const options = resolveOptions({
			enabled: true,
			targetRepo: 'acme/tools',
			labels: ['custom'],
			dedupeWindowHours: 1,
			maxIssuesPerDay: 2,
			circuitBreakerThreshold: 4,
			backoffBaseMs: 500,
			backoffMaxMs: 5_000,
			backoffJitterRatio: 0.5,
		});
		expect(options.enabled).toBe(true);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.labels).toEqual([...DEFAULT_LABELS]);
		expect(options.dedupeWindowHours).toBe(1);
		expect(options.maxIssuesPerDay).toBe(2);
		expect(options.circuitBreakerThreshold).toBe(4);
		expect(options.backoffBaseMs).toBe(500);
		expect(options.backoffMaxMs).toBe(5_000);
		expect(options.backoffJitterRatio).toBe(0.5);
	});

	it('falls back to defaults on malformed values', () => {
		const options = resolveOptions({
			enabled: 'nope',
			targetRepo: 'bad repo --flag',
			dedupeWindowHours: -5,
			maxIssuesPerDay: 0,
			circuitBreakerThreshold: 0,
			backoffBaseMs: -1,
			backoffMaxMs: -1,
			backoffJitterRatio: 5,
		});
		// A malformed master switch falls back to the default, which is on;
		// a typo must not silently take reporting down.
		expect(options.enabled).toBe(true);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.dedupeWindowHours).toBe(24);
		expect(options.maxIssuesPerDay).toBe(DEFAULT_MAX_ISSUES_PER_DAY);
		expect(options.circuitBreakerThreshold).toBe(
			DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
		);
		expect(options.backoffBaseMs).toBe(DEFAULT_BACKOFF_BASE_MS);
		expect(options.backoffMaxMs).toBe(DEFAULT_BACKOFF_MAX_MS);
		expect(options.backoffJitterRatio).toBe(DEFAULT_BACKOFF_JITTER_RATIO);
	});

	it('ignores targetRepo and labels from consumer project config', () => {
		const options = resolveOptions({
			targetRepo: '  acme/tools  ',
		});
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.labels).toEqual([...DEFAULT_LABELS]);
	});

	it('warns and ignores legacy internalOnly=false', () => {
		const warnings: string[] = [];
		const options = resolveOptions(
			{
				internalOnly: false,
				targetRepo: 'acme/tools',
			},
			(warning) => {
				warnings.push(`${warning.code}: ${warning.message}`);
			},
		);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.labels).toEqual([...DEFAULT_LABELS]);
		expect(warnings).toEqual([
			`${ERR_REPORTING_OPTION_DEPRECATED}: "internalOnly" is deprecated and ignored. External project data is non-reportable by construction.`,
			`${ERR_REPORTING_OPTION_DEPRECATED}: "targetRepo" and "labels" are fixed by MCP Vertex and ignored. Consumer project configuration cannot redirect or identify issues.`,
		]);
	});

	it('warns and ignores legacy internalOnly=true', () => {
		const warnings: string[] = [];
		resolveOptions(
			{
				internalOnly: true,
			},
			(warning) => {
				warnings.push(warning.code);
			},
		);
		expect(warnings).toEqual([ERR_REPORTING_OPTION_DEPRECATED]);
	});

	it('does not warn when internalOnly is absent', () => {
		const warnings: string[] = [];
		resolveOptions(
			{
				enabled: true,
			},
			(warning) => {
				warnings.push(warning.code);
			},
		);
		expect(warnings).toEqual([]);
	});

	it('reports by default and honours an explicit opt-out', () => {
		// mcp-vertex can only be fixed for an adopter if its own failures
		// reach its maintainers, and a report carries no project data — so
		// the default is on, and `false` is the operator's escape hatch
		// (announced on every start by `startup-notice.helper.ts`).
		expect(resolveOptions({}).enabled).toBe(true);
		expect(resolveOptions({ enabled: true }).enabled).toBe(true);
		expect(resolveOptions({ enabled: false }).enabled).toBe(false);
	});
});
