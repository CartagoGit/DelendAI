/**
 * pack.script.spec.ts — f00178: walker / arg-parser unit tests for the
 * presets pack-smoke mode.
 *
 * We do NOT spawn throwaway projects here — the spec only covers the
 * pure functions that decide WHAT to pack + which preset list to feed
 * the loop. The full e2e (npm install → boot → listTools → call
 * overview → exit) is exercised by the runtime script and stays slow.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRESET_CATALOG, type IPresetKind } from '@mcp-vertex/core/public';

import { parseCliArgs } from './pack.script.ts';
import {
	deriveDistributablePresets,
	parsePresetsArg,
} from './pack-presets.preset-list.ts';

const knownPresets: ReadonlySet<IPresetKind> = new Set(
	PRESET_CATALOG.map((preset) => preset.id),
);

describe('deriveDistributablePresets', () => {
	it('returns every catalog preset whose members are in PUBLISH_ORDER', () => {
		const result = deriveDistributablePresets();
		// Every entry is a valid preset id.
		for (const id of result) {
			expect(knownPresets.has(id)).toBe(true);
		}
		// Order matches PRESET_CATALOG (== PRESET_KIND).
		expect(result).toEqual(
			[...result].sort((a, b) => {
				return (
					PRESET_CATALOG.findIndex((p) => p.id === a) -
					PRESET_CATALOG.findIndex((p) => p.id === b)
				);
			}),
		);
	});

	it('includes all 9 distribuible presets (minimal, lean, standard, swarm, full, vertex, web-app, backend-api, cli-tool)', () => {
		const result = deriveDistributablePresets();
		const expected: readonly IPresetKind[] = [
			'minimal',
			'lean',
			'standard',
			'swarm',
			'full',
			'vertex',
			'web-app',
			'backend-api',
			'cli-tool',
		];
		for (const preset of expected) {
			expect(result).toContain(preset);
		}
	});
});

describe('parsePresetsArg', () => {
	it('returns an empty array for undefined input', () => {
		expect(parsePresetsArg(undefined)).toEqual([]);
	});

	it('returns an empty array for an empty string', () => {
		expect(parsePresetsArg('')).toEqual([]);
	});

	it('parses a comma-separated list trimming whitespace', () => {
		expect(parsePresetsArg('minimal, lean, standard')).toEqual([
			'minimal',
			'lean',
			'standard',
		]);
	});

	it('drops empty entries from trailing/double commas', () => {
		expect(parsePresetsArg('minimal,,lean,')).toEqual(['minimal', 'lean']);
	});

	it('throws on an unknown preset id', () => {
		expect(() => parsePresetsArg('minimal,no-such-preset')).toThrowError(
			/unknown preset "no-such-preset"/u,
		);
	});
});

describe('parseCliArgs', () => {
	it('returns the default package mode when no flag is present', () => {
		expect(parseCliArgs([])).toEqual({ mode: 'package', presetIds: [] });
	});

	it('returns the presets mode + every distribuible preset for empty --presets=', () => {
		const result = parseCliArgs(['--presets=']);
		expect(result.mode).toBe('presets');
		expect(result.presetIds).toEqual(deriveDistributablePresets());
	});

	it('returns the presets mode + the parsed subset when --presets=A,B,C is set', () => {
		const result = parseCliArgs(['--presets=minimal,full,vertex']);
		expect(result.mode).toBe('presets');
		expect(result.presetIds).toEqual(['minimal', 'full', 'vertex']);
	});

	it('throws on an unknown flag (rejects future arg drift)', () => {
		expect(() => parseCliArgs(['--bogus'])).toThrowError(
			/unknown CLI flag "--bogus"/u,
		);
	});

	it('throws on an unknown preset id inside --presets=', () => {
		expect(() => parseCliArgs(['--presets=full,unknown'])).toThrowError(
			/unknown preset "unknown"/u,
		);
	});
});

describe('throwaway project fixture cleanup', () => {
	it('mkdtempSync produces a unique dir under tmpdir that rmSync removes', () => {
		const dir = mkdtempSync(join(tmpdir(), 'mcp-pack-spec-'));
		try {
			expect(dir).toContain('mcp-pack-spec-');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
