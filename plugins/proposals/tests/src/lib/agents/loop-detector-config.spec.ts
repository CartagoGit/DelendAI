import { describe, expect, it } from 'vitest';
import type { IMcpVertexConfigFile } from '@mcp-vertex/core/public';

import {
	LOOP_DETECTOR_DEFAULTS,
	createFsConfigFileReader,
	parseLoopDetectorCliOverrides,
	resolveLoopDetectorConfig,
} from '@mcp-vertex/proposals/lib/agents/loop-detector-config';

describe('loop-detector-config (Solid SRP extraction)', () => {
	describe('parseLoopDetectorCliOverrides', () => {
		it('returns an empty object when no loop-detector args are present', () => {
			expect(parseLoopDetectorCliOverrides({})).toEqual({});
			expect(parseLoopDetectorCliOverrides({ unrelated: 'x' })).toEqual(
				{},
			);
		});

		it('parses --loop-detector=true|false and --no-loop-detector', () => {
			expect(
				parseLoopDetectorCliOverrides({ 'loop-detector': 'true' }),
			).toEqual({ enabled: true });
			expect(
				parseLoopDetectorCliOverrides({ 'loop-detector': 'false' }),
			).toEqual({ enabled: false });
			expect(
				parseLoopDetectorCliOverrides({ 'no-loop-detector': 'true' }),
			).toEqual({ enabled: false });
		});

		it('parses dashed subkeys (loop-detector.repeat-threshold etc.)', () => {
			expect(
				parseLoopDetectorCliOverrides({
					'loop-detector.repeat-threshold': '12',
					'loop-detector.notify-on-detect': 'true',
				}),
			).toEqual({ repeatThreshold: 12, notifyOnDetect: true });
		});

		it('treats --loop-detector.notify-on-detect=1 as truthy (numeric form)', () => {
			expect(
				parseLoopDetectorCliOverrides({
					'loop-detector.notify-on-detect': '1',
				}),
			).toEqual({ notifyOnDetect: true });
		});

		it('parses comma-separated interactive-agent-patterns (empty = explicit opt-out)', () => {
			expect(
				parseLoopDetectorCliOverrides({
					'loop-detector.interactive-agent-patterns': 'foo, bar ,baz',
				}),
			).toEqual({ interactiveAgentPatterns: ['foo', 'bar', 'baz'] });
			// Empty string is the documented way to disable every pattern.
			expect(
				parseLoopDetectorCliOverrides({
					'loop-detector.interactive-agent-patterns': '',
				}),
			).toEqual({ interactiveAgentPatterns: [] });
		});
	});

	describe('resolveLoopDetectorConfig — precedence: CLI > file > defaults', () => {
		const stubReader = (config: IMcpVertexConfigFile) => ({
			readGlobalConfig: () => config,
		});

		it('returns defaults when no file and no CLI args', () => {
			const out = resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {},
			});
			expect(out).toEqual(LOOP_DETECTOR_DEFAULTS);
		});

		it('file overrides defaults', () => {
			const out = resolveLoopDetectorConfig({
				configReader: stubReader({
					loopDetector: { repeatThreshold: 99 },
				}),
				cliArgs: {},
			});
			expect(out.repeatThreshold).toBe(99);
			// Other keys still come from defaults
			expect(out.nearRepeatThreshold).toBe(
				LOOP_DETECTOR_DEFAULTS.nearRepeatThreshold,
			);
		});

		it('CLI overrides file (highest precedence)', () => {
			const out = resolveLoopDetectorConfig({
				configReader: stubReader({
					loopDetector: { repeatThreshold: 50, enabled: false },
				}),
				cliArgs: { 'loop-detector.repeat-threshold': '7' },
			});
			expect(out.repeatThreshold).toBe(7); // CLI wins
			expect(out.enabled).toBe(false); // file wins over default (CLI did not set enabled)
		});

		it('CLI overrides default when no file is present', () => {
			const out = resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {
					'loop-detector.enabled': 'false',
					'loop-detector.handoff-ttl-days': '30',
				},
			});
			expect(out.enabled).toBe(false);
			expect(out.handoffTtlDays).toBe(30);
		});

		it('treats an absent reader result as empty config (no crash)', () => {
			// The Solid reader abstraction lets tests prove this without
			// touching the filesystem. `readGlobalConfig` returning `{}`
			// is the same path the FS reader takes when the file is
			// missing or corrupt.
			const out = resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {},
			});
			expect(out).toEqual(LOOP_DETECTOR_DEFAULTS);
		});
	});

	describe('createFsConfigFileReader (DIP production wiring)', () => {
		it('returns an empty config when the workspace path does not exist', () => {
			const reader = createFsConfigFileReader({
				root: '/definitely/not/here',
				resolve: (rel) => `/definitely/not/here/${rel}`,
			});
			expect(reader.readGlobalConfig()).toEqual({});
		});
	});
});
