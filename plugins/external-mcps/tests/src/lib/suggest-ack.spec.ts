/**
 * suggest-ack.spec.ts — the LLM-assisted config flow (f00068 S3):
 * `suggest` proposes a valid, ≤3-candidate RFC 6902 patch and never
 * writes; the pending-acks ledger records accept/reject durably
 * (mutex → redact → atomic) and `isAcked` gates activation.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { FULL_CATALOG } from '../../../src/lib/catalog/catalog-data';
import {
	createPendingAcksStore,
	isAcked,
	listPending,
} from '../../../src/lib/ack/pending-acks';
import { buildAckToolRegistration } from '../../../src/lib/tools/ack.tool';
import {
	buildSuggestToolRegistration,
	draftServerEntry,
	MAX_SUGGEST_CANDIDATES,
	SERVERS_POINTER,
	SuggestOutputSchema,
	versionFromPinExample,
} from '../../../src/lib/tools/suggest.tool';
import { validateServersPatch } from '../../../src/lib/tools/validate-config.tool';

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

interface ICapturedTool {
	readonly name: string;
	readonly config: {
		description: string;
		inputSchema: unknown;
		outputSchema: unknown;
	};
	readonly handler: (args: Record<string, unknown>) => Promise<IToolResult>;
}

interface ILoggedMessage {
	readonly level: string;
	readonly logger: string;
	readonly data: Record<string, unknown>;
}

const captureTool = async (
	reg: IToolRegistration,
	logged?: ILoggedMessage[],
): Promise<ICapturedTool> => {
	const captured: ICapturedTool[] = [];
	const server = {
		registerTool: (
			name: string,
			config: ICapturedTool['config'],
			handler: ICapturedTool['handler'],
		) => {
			captured.push({ name, config, handler });
		},
		...(logged !== undefined
			? {
					sendLoggingMessage: async (params: ILoggedMessage) => {
						logged.push(params);
					},
				}
			: {}),
	} as unknown as Parameters<IToolRegistration['register']>[0];
	await reg.register(server);
	const tool = captured[0];
	if (tool === undefined) throw new Error('tool did not register');
	return tool;
};

describe('suggest tool (proposes, never writes)', () => {
	const registration = buildSuggestToolRegistration({
		namespacePrefix: 'external-mcps',
		options: {},
	});

	it('registers under the plugin namespace with NO effects (never writes)', async () => {
		const tool = await captureTool(registration);
		expect(tool.name).toBe('external-mcps_suggest');
		expect(tool.config.inputSchema).toBeDefined();
		expect(tool.config.outputSchema).toBeDefined();
		expect(registration.effects).toBeUndefined();
		expect(tool.config.description).toContain('NEVER writes');
	});

	it('returns a valid RFC 6902 add-only patch targeting the servers block', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ need: 'query a postgres database' });
		const payload = SuggestOutputSchema.parse(result.structuredContent);
		expect(payload.ok).toBe(true);
		expect(payload.patch.length).toBeGreaterThan(0);
		// First op creates the missing servers block; the rest add entries.
		expect(payload.patch[0]).toEqual({
			op: 'add',
			path: SERVERS_POINTER,
			value: {},
		});
		for (const op of payload.patch.slice(1)) {
			expect(op.op).toBe('add');
			expect(op.path.startsWith(`${SERVERS_POINTER}/`)).toBe(true);
		}
	});

	it('proposes entries that pass the S1 validate_config dry-run as-is', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ need: 'database' });
		const payload = SuggestOutputSchema.parse(result.structuredContent);
		const servers = Object.fromEntries(
			payload.patch
				.filter((op) => op.path !== SERVERS_POINTER)
				.map((op) => [op.path.slice(`${SERVERS_POINTER}/`.length), op.value]),
		);
		expect(Object.keys(servers).length).toBeGreaterThan(0);
		expect(validateServersPatch(servers)).toEqual({ ok: true, issues: [] });
	});

	it('caps candidates at 3 with a ONE-line rationale each (token-lean)', async () => {
		const tool = await captureTool(registration);
		// "database" matches many catalog rows (sqlite, postgres, redis, …).
		const result = await tool.handler({ need: 'database' });
		const payload = SuggestOutputSchema.parse(result.structuredContent);
		expect(payload.total).toBeGreaterThan(MAX_SUGGEST_CANDIDATES);
		expect(payload.candidates.length).toBe(MAX_SUGGEST_CANDIDATES);
		for (const candidate of payload.candidates) {
			expect(candidate.rationale).not.toContain('\n');
			expect(candidate.rationale.length).toBeGreaterThan(0);
		}
		// Curated entries outrank discoverable ones.
		expect(payload.candidates[0]?.rationale.startsWith('curated:')).toBe(
			true,
		);
	});

	it('skips already-declared ids and the container op when servers exists', async () => {
		const declared = buildSuggestToolRegistration({
			namespacePrefix: 'external-mcps',
			options: {
				servers: {
					postgres: {
						version: '0.6.2',
						command: 'npx',
						args: ['-y', '@modelcontextprotocol/server-postgres@0.6.2'],
					},
				},
			},
		});
		const tool = await captureTool(declared);
		const result = await tool.handler({ need: 'database' });
		const payload = SuggestOutputSchema.parse(result.structuredContent);
		expect(payload.candidates.map((c) => c.id)).not.toContain('postgres');
		expect(
			payload.patch.some((op) => op.path === SERVERS_POINTER),
		).toBe(false);
		expect(
			payload.patch.some((op) => op.path.endsWith('/postgres')),
		).toBe(false);
	});

	it('returns an empty proposal (not an error) when nothing matches', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ need: 'zzz-unmatchable-xyzzy' });
		const payload = SuggestOutputSchema.parse(result.structuredContent);
		expect(payload).toMatchObject({ ok: true, total: 0, patch: [] });
		expect(payload.candidates).toEqual([]);
		expect(result.isError).toBeUndefined();
	});

	it('extracts an exact pin from EVERY catalog pinExample style', () => {
		expect(versionFromPinExample('@scope/pkg@1.2.3')).toBe('1.2.3');
		expect(versionFromPinExample('pypkg==0.6.2')).toBe('0.6.2');
		expect(versionFromPinExample('ghcr.io/x/y:v0.9.1')).toBe('0.9.1');
		// Invariant over the whole catalog: every draft passes the schema.
		const servers = Object.fromEntries(
			FULL_CATALOG.map((entry) => [entry.id, draftServerEntry(entry)]),
		);
		expect(validateServersPatch(servers)).toEqual({ ok: true, issues: [] });
	});
});

describe('pending-acks ledger (durable, one entry per server)', () => {
	let dir = '';
	let ledgerPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ext-mcps-acks-'));
		ledgerPath = join(dir, 'pending-acks.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('request creates a pending entry that survives a fresh store', async () => {
		const store = createPendingAcksStore(ledgerPath);
		await store.request('filesystem', 'need file access');
		expect(existsSync(ledgerPath)).toBe(true);
		const reread = await createPendingAcksStore(ledgerPath).read();
		expect(listPending(reread)).toHaveLength(1);
		expect(reread[0]).toMatchObject({
			serverId: 'filesystem',
			reason: 'need file access',
		});
		expect(await store.isAcked('filesystem')).toBe(false);
	});

	it('request is idempotent while pending (one entry per serverId)', async () => {
		const store = createPendingAcksStore(ledgerPath);
		await store.request('filesystem');
		await store.request('filesystem');
		expect(await store.read()).toHaveLength(1);
	});

	it('isAcked flips to true only after an ACCEPTED record', async () => {
		const store = createPendingAcksStore(ledgerPath);
		await store.request('filesystem');
		expect(await store.isAcked('filesystem')).toBe(false);
		await store.record('filesystem', true, 'cartago');
		// Durability: a brand-new store sees the accept.
		const fresh = createPendingAcksStore(ledgerPath);
		expect(await fresh.isAcked('filesystem')).toBe(true);
		const entries = await fresh.read();
		expect(entries[0]).toMatchObject({
			serverId: 'filesystem',
			accepted: true,
			ackedBy: 'cartago',
		});
		expect(entries[0]?.ackedAt).toBeDefined();
	});

	it('a rejection is recorded durably but stays un-acked', async () => {
		const store = createPendingAcksStore(ledgerPath);
		await store.request('github');
		await store.record('github', false, 'cartago');
		const fresh = createPendingAcksStore(ledgerPath);
		expect(await fresh.isAcked('github')).toBe(false);
		const entries = await fresh.read();
		expect(entries[0]).toMatchObject({ serverId: 'github', accepted: false });
		// Decided — no longer pending.
		expect(listPending(entries)).toHaveLength(0);
	});

	it('the pure isAcked predicate ignores pending and rejected entries', () => {
		const acks = [
			{ serverId: 'a', requestedAt: 't' },
			{ serverId: 'b', requestedAt: 't', ackedAt: 't', accepted: false },
			{ serverId: 'c', requestedAt: 't', ackedAt: 't', accepted: true },
		];
		expect(isAcked(acks, 'a')).toBe(false);
		expect(isAcked(acks, 'b')).toBe(false);
		expect(isAcked(acks, 'c')).toBe(true);
		expect(isAcked(acks, 'missing')).toBe(false);
	});

	it('redacts secret-looking content before it reaches disk', async () => {
		const store = createPendingAcksStore(ledgerPath);
		const token = `ghp_${'a1B2c3D4e5F6g7H8i9J0'.repeat(2)}`;
		await store.request('github', `token ${token} should not persist`);
		const onDisk = readFileSync(ledgerPath, 'utf8');
		expect(onDisk).not.toContain(token);
		expect(onDisk).toContain('[REDACTED]');
	});
});

describe('ack tool (records + lists, notifies via the host bridge)', () => {
	let dir = '';
	let ledgerPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ext-mcps-ack-tool-'));
		ledgerPath = join(dir, 'pending-acks.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const registration = (): IToolRegistration =>
		buildAckToolRegistration({
			namespacePrefix: 'external-mcps',
			pendingAcksPath: ledgerPath,
		});

	it('registers under the plugin namespace and declares the write effect', async () => {
		const reg = registration();
		const tool = await captureTool(reg);
		expect(tool.name).toBe('external-mcps_ack');
		expect(reg.effects).toEqual(['write']);
	});

	it('{list:true} shows pending activations only', async () => {
		await createPendingAcksStore(ledgerPath).request('filesystem', 'fs ops');
		await createPendingAcksStore(ledgerPath).record('github', true);
		const tool = await captureTool(registration());
		const result = await tool.handler({ list: true });
		expect(result.structuredContent).toMatchObject({
			ok: true,
			mode: 'list',
			total: 1,
		});
		const pending = result.structuredContent?.['pending'] as Array<{
			serverId: string;
		}>;
		expect(pending.map((p) => p.serverId)).toEqual(['filesystem']);
	});

	it('records an accept durably and emits the notification', async () => {
		const logged: ILoggedMessage[] = [];
		const tool = await captureTool(registration(), logged);
		const result = await tool.handler({
			server: 'filesystem',
			accept: true,
			ackedBy: 'cartago',
		});
		expect(result.structuredContent).toMatchObject({
			ok: true,
			mode: 'record',
		});
		expect(
			await createPendingAcksStore(ledgerPath).isAcked('filesystem'),
		).toBe(true);
		expect(logged).toHaveLength(1);
		expect(logged[0]).toMatchObject({
			level: 'info',
			logger: 'external-mcps_ack',
			data: {
				event: 'external-mcp-ack-accepted',
				serverId: 'filesystem',
				ackedBy: 'cartago',
			},
		});
	});

	it('records a rejection: durable, notified, still un-acked', async () => {
		const logged: ILoggedMessage[] = [];
		const tool = await captureTool(registration(), logged);
		await tool.handler({ server: 'github', accept: false });
		expect(
			await createPendingAcksStore(ledgerPath).isAcked('github'),
		).toBe(false);
		expect(logged[0]?.data['event']).toBe('external-mcp-ack-rejected');
	});

	it('works without a notification bridge (test double has none)', async () => {
		const tool = await captureTool(registration());
		const result = await tool.handler({ server: 'filesystem', accept: true });
		expect(result.isError).toBeUndefined();
		expect(
			await createPendingAcksStore(ledgerPath).isAcked('filesystem'),
		).toBe(true);
	});

	it('rejects a call with neither a decision nor list:true', async () => {
		const tool = await captureTool(registration());
		const result = await tool.handler({ server: 'filesystem' });
		expect(result.isError).toBe(true);
		expect(result.structuredContent).toMatchObject({ ok: false });
	});
});
