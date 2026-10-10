import { describe, expect, it } from 'vitest';

import type { IStartupReport } from '@delendai/core/lib/startup-report/model';
import { buildStartupReport } from '@delendai/core/lib/startup-report/model';
import {
	assertStdoutClean,
	resolveOutputChannel,
	resolveStartupReportDispatch,
	writeStartupReport,
} from '@delendai/core/lib/startup-report/stdio-guard';

const sampleReport = (
	level: 'off' | 'compact' | 'medium' | 'high' | 'full',
): IStartupReport =>
	buildStartupReport(
		{
			identity: {
				version: '0.18.0',
				workspace: '/ws',
				preset: 'swarm',
				surfaceMode: 'managed',
			},
			catalog: {
				pluginsConfigured: 1,
				pluginsWarm: 1,
				pluginsFailed: 0,
				toolsAvailable: 4,
				toolsExposed: 4,
				skillsAvailable: 0,
				skillsBodiesPreloaded: 0,
				resourcesAvailable: 0,
			},
			pluginCosts: [],
			runtime: {
				lazyActivation: false,
				internalRouting: false,
				listChangedRequired: false,
			},
			baseline: { tokensPerRequest: 0, source: 'unset' },
		},
		level,
	);

describe('startup-report/stdio-guard (q00009 / f00259 partial)', () => {
	describe('resolveOutputChannel', () => {
		it('defaults to stderr', () => {
			expect(resolveOutputChannel({ env: {} })).toBe('stderr');
		});

		it('honours DELENDAI_LOG=host', () => {
			expect(
				resolveOutputChannel({ env: { DELENDAI_LOG: 'host' } }),
			).toBe('host');
		});

		it('honours DELENDAI_LOG=discard (silences the report)', () => {
			expect(
				resolveOutputChannel({ env: { DELENDAI_LOG: 'discard' } }),
			).toBe('discard');
		});

		it('forced channel overrides env', () => {
			expect(
				resolveOutputChannel({
					env: { DELENDAI_LOG: 'host' },
					forced: 'stderr',
				}),
			).toBe('stderr');
		});
	});

	describe('writeStartupReport', () => {
		it('writes nothing when level is off', () => {
			let stderrCalls = 0;
			const result = writeStartupReport({
				report: sampleReport('off'),
				channel: 'stderr',
				useAnsi: false,
				writers: { stderr: () => stderrCalls++ },
			});
			expect(result.wrote).toBe(false);
			expect(result.bytes).toBe(0);
			expect(stderrCalls).toBe(0);
		});

		it('writes the rendered report to stderr when channel=stderr', () => {
			const captured: string[] = [];
			const result = writeStartupReport({
				report: sampleReport('compact'),
				channel: 'stderr',
				useAnsi: false,
				writers: { stderr: (t) => captured.push(t) },
			});
			expect(result.wrote).toBe(true);
			expect(result.channel).toBe('stderr');
			expect(captured.length).toBe(1);
			expect(captured[0]).toContain('DelendAI ready');
		});

		it('writes to the host writer when channel=host', () => {
			const captured: string[] = [];
			const result = writeStartupReport({
				report: sampleReport('medium'),
				channel: 'host',
				useAnsi: false,
				writers: { host: (t) => captured.push(t) },
			});
			expect(result.wrote).toBe(true);
			expect(result.channel).toBe('host');
			// medium includes the per-request cost summary + level marker
			expect(captured[0]).toContain('medium (default)');
			expect(captured[0]).toContain('Context cost per request');
		});

		it('drops the report when channel=discard', () => {
			const result = writeStartupReport({
				report: sampleReport('full'),
				channel: 'discard',
				useAnsi: false,
				writers: {},
			});
			expect(result.wrote).toBe(false);
			expect(result.bytes).toBe(0);
		});
	});

	describe('assertStdoutClean', () => {
		it('passes when transport is not stdio', () => {
			expect(
				assertStdoutClean('stderr', { MCP_TRANSPORT: 'ws' }),
			).toEqual({ ok: true });
		});

		it('passes when channel is stderr under stdio transport', () => {
			expect(
				assertStdoutClean('stderr', { MCP_TRANSPORT: 'stdio' }),
			).toEqual({ ok: true });
		});

		it('passes when channel is host under stdio transport', () => {
			expect(
				assertStdoutClean('host', { MCP_TRANSPORT: 'stdio' }),
			).toEqual({ ok: true });
		});

		it('would fail if a future refactor introduces a `stdout` channel', () => {
			const result = assertStdoutClean('stderr' as never, {
				MCP_TRANSPORT: 'stdio',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('resolveStartupReportDispatch', () => {
		it('combines level and channel resolution in one call', () => {
			const dispatch = resolveStartupReportDispatch({
				cliLevel: 'high',
				channelInput: { env: { DELENDAI_LOG: 'host' } },
			});
			expect(dispatch.level.level).toBe('high');
			expect(dispatch.level.source).toBe('cli');
			expect(dispatch.channel).toBe('host');
		});

		it('returns medium + stderr when nothing is set', () => {
			const dispatch = resolveStartupReportDispatch({});
			expect(dispatch.level.level).toBe('medium');
			expect(dispatch.level.source).toBe('default');
			expect(dispatch.channel).toBe('stderr');
		});
	});
});
