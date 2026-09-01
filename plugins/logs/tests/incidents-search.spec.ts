/**
 * incidents-search.spec.ts — f00153 S2 + S3.
 *
 * Round-trips the three new tools (`log`, `search`, `incidents`)
 * against a fresh in-memory `ILogStore` pair and asserts the
 * end-to-end shape: write+read for `log`, regex/substring search
 * across the four scopes for `search`, and the cluster contract for
 * `incidents`.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { createLogStore } from '../src/lib/services/log-store';
import { normalizeEvent } from '../src/lib/services/normalize-event';
import { buildLogToolRegistrations } from '../src/lib/tools/tools';
import { asArray } from '@mcp-vertex/test-kit/public';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;
type Registered = Map<string, Handler>;

const structured = (value: unknown): Record<string, unknown> =>
	(value as { structuredContent: Record<string, unknown> }).structuredContent;

const seed = async (
	handlers: Registered,
	errorStore: Awaited<ReturnType<typeof createLogStore>>,
) => {
	// Three lock-conflict events from two agents — the canonical cluster
	// for `incidents` testing.
	for (const [agent, ts] of [
		['a1', '2026-06-20T10:00:00.000Z'],
		['a2', '2026-06-20T10:05:00.000Z'],
		['a1', '2026-06-20T10:10:00.000Z'],
	] as const) {
		await errorStore.appendEvent(
			normalizeEvent(
				'tool-failed',
				{
					toolName: 'proposals_agent_lock',
					agent,
					taskId: 'proposals_agent_lock',
					args: { file: 'foo.ts' },
					result: { acquired: false },
					error: { message: 'lock held by another agent' },
					summary:
						'tool-failed: proposals_agent_lock — lock held by another agent',
				},
				new Date(ts),
			),
		);
	}
	// One different failure so `incidents` keeps the cardinality honest.
	await errorStore.appendEvent(
		normalizeEvent(
			'tool-failed',
			{
				toolName: 'quality_run',
				agent: 'a1',
				taskId: 'quality_run',
				error: { message: 'lint failed' },
				summary: 'tool-failed: quality_run — lint failed',
			},
			new Date('2026-06-20T10:15:00.000Z'),
		),
	);
	void handlers;
};

describe('logs_log (f00153 S2)', () => {
	let handlers: Registered;
	beforeEach(async () => {
		const main = await createLogStore(
			await mkdtemp(join(tmpdir(), 'mcp-vertex-log-')),
		);
		const errors = await createLogStore(
			await mkdtemp(join(tmpdir(), 'mcp-vertex-log-err-')),
		);
		await seed(new Map(), errors);
		handlers = new Map();
		const server = {
			registerTool: (name: string, _s: unknown, h: Handler) => {
				handlers.set(name, h);
			},
		};
		for (const r of buildLogToolRegistrations('logs', {
			main,
			errors,
		})) {
			await r.register(server as never);
		}
	});

	it('writes an incident and round-trips through query', async () => {
		const result = structured(
			await handlers.get('logs_log')?.({
				severity: 'critical',
				incidentType: 'lock-conflict',
				message: 'agents/proposals.lock held > 30s',
				files: ['agents/proposals.lock'],
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.severity).toBe('critical');
		expect(result.incidentType).toBe('lock-conflict');
		expect(typeof result.ts).toBe('string');
		const query = structured(
			await handlers.get('logs_query')?.({
				incidentType: 'lock-conflict',
				detail: 'full',
			}),
		);
		const events = query.events as Array<{
			incidentType: string | null;
			severity: string;
			meta: Record<string, unknown>;
		}>;
		expect(events.length).toBeGreaterThanOrEqual(1);
		const found = events.find(
			(e) => e.meta.source === 'logs_log' && e.severity === 'critical',
		);
		expect(found?.incidentType).toBe('lock-conflict');
	});

	it('rejects invalid incidentType slugs', async () => {
		const result = (await handlers.get('logs_log')?.({
			severity: 'warning',
			incidentType: 'Not-Valid',
			message: 'x',
		})) as { isError?: boolean };
		expect(result?.isError).toBe(true);
	});
});

describe('logs_search (f00153 S2)', () => {
	let handlers: Registered;
	beforeEach(async () => {
		const main = await createLogStore(
			await mkdtemp(join(tmpdir(), 'mcp-vertex-search-')),
		);
		const errors = await createLogStore(
			await mkdtemp(join(tmpdir(), 'mcp-vertex-search-err-')),
		);
		await main.appendEvent(
			normalizeEvent(
				'tool-completed',
				{
					toolName: 'foo',
					taskId: 'foo',
					args: { hint: 'lock held by another agent' },
					summary: 'tool-completed: foo',
				},
				new Date('2026-06-20T09:00:00.000Z'),
			),
		);
		await errors.appendEvent(
			normalizeEvent(
				'tool-failed',
				{
					toolName: 'locker',
					taskId: 'locker',
					error: {
						message: 'lock held by another agent',
						stack: 'Error: at line 42',
					},
					summary: 'tool-failed: locker',
				},
				new Date('2026-06-20T09:01:00.000Z'),
			),
		);
		handlers = new Map();
		const server = {
			registerTool: (name: string, _s: unknown, h: Handler) => {
				handlers.set(name, h);
			},
		};
		for (const r of buildLogToolRegistrations('logs', { main, errors })) {
			await r.register(server as never);
		}
	});

	it('substring search across all scopes finds matches', async () => {
		const result = structured(
			await handlers.get('logs_search')?.({ pattern: 'lock held' }),
		);
		const events = result.events as Array<{
			toolName?: string;
			taskId: string;
		}>;
		// 1 from main + 1 from errors stream.
		expect(events.length).toBe(2);
	});

	it('scope:error narrows to error.message + error.stack', async () => {
		const result = structured(
			await handlers.get('logs_search')?.({
				pattern: 'lock held',
				scope: 'error',
				detail: 'full',
			}),
		);
		const events = result.events as Array<{
			taskId: string;
			summary: string;
			meta: {
				toolName?: string;
				error?: {
					redacted?: boolean;
					fingerprint?: string;
					hasStack?: boolean;
					message?: string;
					stack?: string;
				};
			};
		}>;
		expect(events).toHaveLength(1);
		expect(events[0]?.taskId).toBe('locker');
		expect(events[0]?.summary).toBe('tool-failed: locker');
		expect(events[0]?.meta.toolName).toBe('locker');
		expect(events[0]?.meta.error?.redacted).toBe(true);
		expect(events[0]?.meta.error?.hasStack).toBe(true);
		expect(events[0]?.meta.error?.fingerprint).toMatch(/^[a-f0-9]{16}$/);
		expect(events[0]?.meta.error).not.toHaveProperty('message');
		expect(events[0]?.meta.error).not.toHaveProperty('stack');
		expect(JSON.stringify(result)).not.toContain(
			'lock held by another agent',
		);
		expect(JSON.stringify(result)).not.toContain('Error: at line 42');
	});

	it('regex search returns the matching event', async () => {
		const result = structured(
			await handlers.get('logs_search')?.({
				pattern: 'lock.?held',
				isRegex: true,
			}),
		);
		const events = asArray(result.events);
		expect(events.length).toBe(2);
	});

	it('returns a structured error for an invalid regex', async () => {
		const result = (await handlers.get('logs_search')?.({
			pattern: '[unterminated',
			isRegex: true,
		})) as { isError?: boolean };
		expect(result?.isError).toBe(true);
	});
});

describe('logs_incidents (f00153 S3)', () => {
	let handlers: Registered;
	beforeEach(async () => {
		const main = await createLogStore(
			await mkdtemp(join(tmpdir(), 'mcp-vertex-inc-')),
		);
		const errors = await createLogStore(
			await mkdtemp(join(tmpdir(), 'mcp-vertex-inc-err-')),
		);
		await seed(new Map(), errors);
		handlers = new Map();
		const server = {
			registerTool: (name: string, _s: unknown, h: Handler) => {
				handlers.set(name, h);
			},
		};
		for (const r of buildLogToolRegistrations('logs', { main, errors })) {
			await r.register(server as never);
		}
	});

	it('clusters failing events by (toolName, error.message) with count + distinct agents', async () => {
		const result = structured(await handlers.get('logs_incidents')?.({}));
		const incidents = result.incidents as Array<{
			toolName: string;
			incidentType: string;
			errorFingerprint: string;
			hasStack: boolean;
			count: number;
			distinctAgents: number;
			firstSeen: string;
			lastSeen: string;
			sampleSummary: string;
			recentEvents: Array<{ kind: string }>;
		}>;
		// Default minCount=2 drops the singleton quality_run cluster; the
		// 3-event lock-conflict cluster survives.
		expect(result.totalIncidents).toBe(1);
		const top = incidents[0];
		expect(top).toBeDefined();
		expect(top?.toolName).toBe('proposals_agent_lock');
		expect(top?.incidentType).toBe('tool-failure');
		expect(top?.count).toBe(3);
		expect(top?.distinctAgents).toBe(2);
		expect(top?.errorFingerprint).toMatch(/^[a-f0-9]{16}$/);
		expect(top?.hasStack).toBe(false);
		expect(top?.sampleSummary).toBe('tool-failed: proposals_agent_lock');
		expect(JSON.stringify(top)).not.toContain('lock held by another agent');
		expect(top?.recentEvents.length).toBeLessThanOrEqual(5);
	});

	it('keeps incidents redacted when recentLimit removes all recent events', async () => {
		const result = structured(
			await handlers.get('logs_incidents')?.({ recentLimit: 0 }),
		);
		const incidents = result.incidents as Array<{
			sampleSummary: string;
			hasStack: boolean;
		}>;
		expect(incidents[0]?.sampleSummary).toBe(
			'tool-failed: proposals_agent_lock',
		);
		expect(incidents[0]?.hasStack).toBe(false);
		expect(JSON.stringify(result)).not.toContain(
			'lock held by another agent',
		);
	});

	it('honors minCount to drop the surviving cluster as well', async () => {
		const result = structured(
			await handlers.get('logs_incidents')?.({ minCount: 4 }),
		);
		expect(result.totalIncidents).toBe(0);
	});

	it('lowering minCount to 1 surfaces the singleton quality_run cluster', async () => {
		const result = structured(
			await handlers.get('logs_incidents')?.({ minCount: 1 }),
		);
		expect(result.totalIncidents).toBe(2);
	});

	it('filters by agent before clustering', async () => {
		const result = structured(
			await handlers.get('logs_incidents')?.({
				agent: 'a2',
				minCount: 1,
			}),
		);
		const incidents = result.incidents as Array<{ count: number }>;
		// a2 contributes 1 lock-conflict + 0 quality_run = 1 cluster
		expect(incidents).toHaveLength(1);
		expect(incidents[0]?.count).toBe(1);
	});
});
