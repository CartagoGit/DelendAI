import { describe, expect, it } from 'vitest';
import type { IMcpVertexConfigFile } from '@mcp-vertex/core/public';

import {
	LOOP_DETECTOR_DEFAULTS,
	LOOP_DETECTOR_DEFAULTS_FOR,
	createFsConfigFileReader,
	parseLoopDetectorCliOverrides,
	resolveLoopDetectorConfig,
} from '@mcp-vertex/proposals/lib/agents/loop-detector-config';

describe('loop-detector-config (Solid SRP extraction)', async () => {
	describe('parseLoopDetectorCliOverrides', async () => {
		it('returns an empty object when no loop-detector args are present', async () => {
			expect(parseLoopDetectorCliOverrides({})).toEqual({});
			expect(parseLoopDetectorCliOverrides({ unrelated: 'x' })).toEqual(
				{},
			);
		});

		it('parses --loop-detector=true|false and --no-loop-detector', async () => {
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

		it('parses dashed subkeys (loop-detector.repeat-threshold etc.)', async () => {
			expect(
				parseLoopDetectorCliOverrides({
					'loop-detector.repeat-threshold': '12',
					'loop-detector.notify-on-detect': 'true',
				}),
			).toEqual({ repeatThreshold: 12, notifyOnDetect: true });
		});

		it('treats --loop-detector.notify-on-detect=1 as truthy (numeric form)', async () => {
			expect(
				parseLoopDetectorCliOverrides({
					'loop-detector.notify-on-detect': '1',
				}),
			).toEqual({ notifyOnDetect: true });
		});

		it('parses comma-separated interactive-agent-patterns (empty = explicit opt-out)', async () => {
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

	describe('resolveLoopDetectorConfig — precedence: CLI > file > defaults', async () => {
		const stubReader = (config: IMcpVertexConfigFile) => ({
			async readGlobalConfig() {
				return config;
			},
		});

		it('returns defaults when no file and no CLI args', async () => {
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {},
				cacheDir: '.cache/mcp-vertex',
			});
			expect(out).toEqual(
				LOOP_DETECTOR_DEFAULTS_FOR('.cache/mcp-vertex'),
			);
		});

		it('file overrides defaults', async () => {
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({
					loopDetector: { repeatThreshold: 99 },
				}),
				cliArgs: {},
				cacheDir: '.cache/mcp-vertex',
			});
			expect(out.repeatThreshold).toBe(99);
			// Other keys still come from defaults
			expect(out.nearRepeatThreshold).toBe(
				LOOP_DETECTOR_DEFAULTS_FOR('.cache/mcp-vertex')
					.nearRepeatThreshold,
			);
		});

		it('CLI overrides file (highest precedence)', async () => {
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({
					loopDetector: { repeatThreshold: 50, enabled: false },
				}),
				cliArgs: { 'loop-detector.repeat-threshold': '7' },
				cacheDir: '.cache/mcp-vertex',
			});
			expect(out.repeatThreshold).toBe(7); // CLI wins
			expect(out.enabled).toBe(false); // file wins over default (CLI did not set enabled)
		});

		it('CLI overrides default when no file is present', async () => {
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {
					'loop-detector.enabled': 'false',
					'loop-detector.handoff-ttl-days': '30',
				},
				cacheDir: '.cache/mcp-vertex',
			});
			expect(out.enabled).toBe(false);
			expect(out.handoffTtlDays).toBe(30);
		});

		it('treats an absent reader result as empty config (no crash)', async () => {
			// The Solid reader abstraction lets tests prove this without
			// touching the filesystem. `readGlobalConfig` returning `{}`
			// is the same path the FS reader takes when the file is
			// missing or corrupt.
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {},
				cacheDir: '.cache/mcp-vertex',
			});
			expect(out).toEqual(
				LOOP_DETECTOR_DEFAULTS_FOR('.cache/mcp-vertex'),
			);
		});

		it('x00054: default handoffDir is anchored to the host cacheDir, not .cache/mcp-vertex/handoff', async () => {
			// Regression pin: before x00054, the default was a hardcoded
			// '.cache/mcp-vertex/handoff' literal. Hosts that set
			// `cacheDir: .cache/custom-cache` would get handoffs at the
			// historical default, stranded outside the cache root. The
			// default now derives from cacheDir.
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({}),
				cliArgs: {},
				cacheDir: '.cache/custom-cache',
			});
			expect(out.handoffDir).toBe('.cache/custom-cache/handoff');
			expect(out.handoffDir).not.toBe('.cache/mcp-vertex/handoff');
		});

		it('x00054: explicit handoffDir in the file config still wins over the cacheDir-derived default', async () => {
			const out = await resolveLoopDetectorConfig({
				configReader: stubReader({
					loopDetector: { handoffDir: '/tmp/explicit-handoff' },
				}),
				cliArgs: {},
				cacheDir: '.cache/custom-cache',
			});
			expect(out.handoffDir).toBe('/tmp/explicit-handoff');
		});

		it('x00054: LOOP_DETECTOR_DEFAULTS_FOR builds defaults anchored to the given cacheDir', async () => {
			const out = LOOP_DETECTOR_DEFAULTS_FOR('.cache/alt');
			expect(out.handoffDir).toBe('.cache/alt/handoff');
			// The non-path fields are unchanged from the base defaults.
			expect(out.repeatThreshold).toBe(
				LOOP_DETECTOR_DEFAULTS.repeatThreshold,
			);
			expect(out.interactiveAgentPatterns).toEqual(
				LOOP_DETECTOR_DEFAULTS.interactiveAgentPatterns,
			);
		});
	});

	describe('createFsConfigFileReader (DIP production wiring)', async () => {
		it('returns an empty config when the workspace path does not exist', async () => {
			const reader = createFsConfigFileReader({
				root: '/definitely/not/here',
				resolve: (rel) => `/definitely/not/here/${rel}`,
			});
			await expect((await reader).readGlobalConfig()).resolves.toEqual(
				{},
			);
		});
	});
});
