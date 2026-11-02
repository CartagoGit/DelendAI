import { describe, expect, it } from 'vitest';

import {
	STARTUP_REPORT_DEFAULT_LEVEL,
	STARTUP_REPORT_LEVELS,
	coerceStartupReportLevel,
	isStartupReportLevelVisible,
	levelIncludesPluginCostTable,
	resolveStartupReportLevel,
	resolveStartupReportLevelAlias,
} from '@delendai/core/lib/startup-report/level';

describe('startup-report/level (q00009 / f00256)', () => {
	describe('constants', () => {
		it('exposes the five canonical levels in increasing detail', () => {
			expect(STARTUP_REPORT_LEVELS).toEqual([
				'off',
				'compact',
				'medium',
				'high',
				'full',
			]);
		});

		it('default is `medium` (q00009 §8.1 acceptance criterion)', () => {
			expect(STARTUP_REPORT_DEFAULT_LEVEL).toBe('medium');
		});
	});

	describe('coerceStartupReportLevel', () => {
		it('passes through every canonical level', () => {
			for (const level of STARTUP_REPORT_LEVELS) {
				expect(coerceStartupReportLevel(level)).toBe(level);
			}
		});

		it('maps the legacy `extended` alias to `high`', () => {
			expect(coerceStartupReportLevel('extended')).toBe('high');
		});

		it('trims whitespace before checking', () => {
			expect(coerceStartupReportLevel('  compact  ')).toBe('compact');
		});

		it('returns undefined for null / undefined / empty / unknown', () => {
			expect(coerceStartupReportLevel(undefined)).toBeUndefined();
			expect(coerceStartupReportLevel(null)).toBeUndefined();
			expect(coerceStartupReportLevel('')).toBeUndefined();
			expect(coerceStartupReportLevel('   ')).toBeUndefined();
			expect(coerceStartupReportLevel('verbose')).toBeUndefined();
		});

		it('is case-sensitive — `Medium` is not accepted', () => {
			expect(coerceStartupReportLevel('Medium')).toBeUndefined();
		});
	});

	describe('resolveStartupReportLevelAlias', () => {
		it('maps `extended` to `high`', () => {
			expect(resolveStartupReportLevelAlias('extended')).toBe('high');
		});

		it('returns undefined for canonical values', () => {
			expect(resolveStartupReportLevelAlias('medium')).toBeUndefined();
		});
	});

	describe('resolveStartupReportLevel — default behaviour', () => {
		it('returns `medium` with source `default` when no input is supplied', () => {
			const result = resolveStartupReportLevel({});
			expect(result.level).toBe('medium');
			expect(result.source).toBe('default');
		});

		it('returns `medium` with source `default` when all layers are empty strings', () => {
			const result = resolveStartupReportLevel({
				cliLevel: '',
				envLevel: '',
				configLevel: '',
			});
			expect(result.level).toBe('medium');
			expect(result.source).toBe('default');
		});

		it('returns `medium` with source `default` when all layers are undefined', () => {
			const result = resolveStartupReportLevel({
				cliLevel: undefined,
				envLevel: undefined,
				configLevel: undefined,
			});
			expect(result.level).toBe('medium');
			expect(result.source).toBe('default');
		});

		it('accepts no arguments at all and still defaults to `medium`', () => {
			const result = resolveStartupReportLevel();
			expect(result.level).toBe('medium');
			expect(result.source).toBe('default');
		});
	});

	describe('resolveStartupReportLevel — precedence', () => {
		it('CLI beats env and config', () => {
			const result = resolveStartupReportLevel({
				cliLevel: 'off',
				envLevel: 'high',
				configLevel: 'full',
			});
			expect(result.level).toBe('off');
			expect(result.source).toBe('cli');
		});

		it('env beats config', () => {
			const result = resolveStartupReportLevel({
				envLevel: 'compact',
				configLevel: 'full',
			});
			expect(result.level).toBe('compact');
			expect(result.source).toBe('env');
		});

		it('config wins when CLI and env are absent', () => {
			const result = resolveStartupReportLevel({
				configLevel: 'high',
			});
			expect(result.level).toBe('high');
			expect(result.source).toBe('config');
		});
	});

	describe('resolveStartupReportLevel — aliases & unknown', () => {
		it('`extended` is normalised to `high` with source `alias`', () => {
			const result = resolveStartupReportLevel({
				configLevel: 'extended',
			});
			expect(result.level).toBe('high');
			expect(result.source).toBe('alias');
			expect(result.requested).toBe('extended');
		});

		it('unknown strings fall back to default with the requested value preserved', () => {
			const result = resolveStartupReportLevel({
				configLevel: 'verbose',
			});
			expect(result.level).toBe('medium');
			expect(result.source).toBe('default');
			expect(result.requested).toBe('verbose');
		});
	});

	describe('isStartupReportLevelVisible', () => {
		it('is false only for `off`', () => {
			expect(isStartupReportLevelVisible('off')).toBe(false);
			for (const level of STARTUP_REPORT_LEVELS) {
				if (level === 'off') continue;
				expect(isStartupReportLevelVisible(level)).toBe(true);
			}
		});
	});

	describe('levelIncludesPluginCostTable', () => {
		it('is false for `off` and `compact`', () => {
			expect(levelIncludesPluginCostTable('off')).toBe(false);
			expect(levelIncludesPluginCostTable('compact')).toBe(false);
		});

		it('is true for `medium`, `high` and `full`', () => {
			expect(levelIncludesPluginCostTable('medium')).toBe(true);
			expect(levelIncludesPluginCostTable('high')).toBe(true);
			expect(levelIncludesPluginCostTable('full')).toBe(true);
		});
	});
});
