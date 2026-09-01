import { describe, expect, it } from 'vitest';

import { buildObsHealthToolRegistration } from '../tools/obs-health.tool';
import {
	fakeReadReleaseHealthDeps,
	fakeReadTracesDeps,
	type IReadonlyReleaseHealthRecord,
	type IReadonlyTraceRecord,
} from './interfaces';
import { FakeServer, parseOk } from '../testing/tool-spec-server.helper';

const parseError = (
	value: unknown,
): { reason: string; nextAction?: string } => {
	const text =
		(value as { content: Array<{ text: string }> }).content[0]?.text ??
		'{}';
	const envelope = JSON.parse(text) as {
		error?: { reason: string; nextAction?: string };
	};
	return envelope.error ?? { reason: '' };
};

const traceRecords: readonly IReadonlyTraceRecord[] = [
	{
		service: 'web',
		traceId: 't-1',
		ts: '2026-07-25T10:00:00Z',
		isError: false,
	},
	{
		service: 'web',
		traceId: 't-1',
		ts: '2026-07-25T10:10:00Z',
		isError: true,
		errorMessage: 'render failed',
	},
];

const releaseRecords: readonly IReadonlyReleaseHealthRecord[] = [
	{ version: '1.0.0', sessionId: 's-1', crashed: false },
	{ version: '1.0.0', sessionId: 's-2', crashed: true },
	{ version: '1.0.1', sessionId: 's-3', crashed: false },
];

const build = (options?: {
	readonly traces?: readonly IReadonlyTraceRecord[];
	readonly releases?: readonly IReadonlyReleaseHealthRecord[];
	readonly workspaceRootAbs?: string;
}) => {
	const registration = buildObsHealthToolRegistration({
		namespacePrefix: 'obs',
		...(options?.traces !== undefined
			? { tracesDeps: fakeReadTracesDeps(options.traces) }
			: {}),
		...(options?.releases !== undefined
			? { releaseHealthDeps: fakeReadReleaseHealthDeps(options.releases) }
			: {}),
		...(options?.workspaceRootAbs !== undefined
			? { workspaceRootAbs: options.workspaceRootAbs }
			: {}),
	});
	const server = new FakeServer();
	void registration.register(server.asServer);
	return server.tools;
};

describe('obs-health tools', () => {
	it('registers both tool names under the namespace prefix', () => {
		const tools = build({ traces: traceRecords, releases: releaseRecords });
		expect(Object.keys(tools).sort()).toEqual([
			'obs_obs_release_health',
			'obs_obs_trace',
		]);
	});

	it('returns grouped trace summaries on the happy path', async () => {
		const tools = build({ traces: traceRecords, releases: releaseRecords });
		const out = parseOk(await tools.obs_obs_trace!.handler({ limit: 10 }));
		expect(out.sampleSize).toBe(2);
		expect(out.summary).toEqual({
			critical: 0,
			high: 1,
			medium: 0,
			low: 0,
			info: 0,
		});
	});

	it('returns release-health summaries on the injected-deps path', async () => {
		const tools = build({ traces: traceRecords, releases: releaseRecords });
		const out = parseOk(
			await tools.obs_obs_release_health!.handler({ limit: 10 }),
		);
		const versions = out.versions as Array<{
			version: string;
			crashFreeRate: number;
		}>;
		expect(versions).toHaveLength(2);
		expect(versions[0]?.version).toBe('1.0.0');
		expect(out.worst).toBe('critical');
	});

	it('returns empty summaries when there is no data', async () => {
		const tools = build({ traces: [], releases: [] });
		const traceOut = parseOk(
			await tools.obs_obs_trace!.handler({ limit: 10 }),
		);
		const releaseOut = parseOk(
			await tools.obs_obs_release_health!.handler({ limit: 10 }),
		);
		expect(traceOut).toMatchObject({
			sampleSize: 0,
			groups: [],
			worst: null,
		});
		expect(releaseOut).toMatchObject({
			versions: [],
			worst: null,
		});
	});

	it('returns a structured error when no workspace reader is configured', async () => {
		const tools = build();
		const traceError = parseError(
			await tools.obs_obs_trace!.handler({ limit: 10 }),
		);
		const releaseError = parseError(
			await tools.obs_obs_release_health!.handler({ limit: 10 }),
		);
		expect(traceError.reason).toMatch(/workspace reader/i);
		expect(releaseError.nextAction).toMatch(/workspaceRootAbs|tracesDeps/);
	});
});
