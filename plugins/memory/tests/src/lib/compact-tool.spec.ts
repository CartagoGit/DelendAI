/**
 * compact-tool.spec.ts (f00090 S1)
 *
 * The `memory_compact` tool must persist the digest as a self-expiring,
 * recallable note via the existing store (inheriting redaction), support a
 * no-persist dry run, and report token accounting.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import { buildCompactToolRegistration } from '@delendai/memory/lib/tools/compact.tool';
import { readStore, recall } from '@delendai/memory/lib/services/store';

const captureHandler = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler:
		| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	if (handler === undefined) throw new Error('handler not registered');
	return handler;
};

const parse = (res: { content: Array<{ text: string }> }): any =>
	JSON.parse(res.content[0]!.text);

const tok = (...parts: string[]): string => parts.join('');

describe('memory_compact tool (f00090 S1)', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-compact-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const build = () =>
		captureHandler(
			buildCompactToolRegistration({
				namespacePrefix: 'mem',
				storePathAbs: store,
				maxNotes: 1000,
			}),
		);

	it('persists the digest as a recallable session-digest TTL note', async () => {
		const handler = await build();
		const out = parse(
			await handler({
				topic: 'fase3',
				items: [
					{ kind: 'decision', label: 'extend memory plugin' },
					{
						kind: 'output',
						label: 'noisy dump',
						detail: 'z'.repeat(300),
					},
				],
			}),
		);
		expect(out.persisted).toBe(true);
		expect(out.noteId).toBe('session-digest-fase3');
		expect(out.tokenAccounting.keptCount).toBe(1);
		expect(out.tokenAccounting.discardedCount).toBe(1);

		const notes = await readStore(store);
		expect(notes).toHaveLength(1);
		expect(notes[0]!.expiresAt).toBeDefined(); // self-expiring
		expect(notes[0]!.tags).toContain('session-digest');
		// Recallable by the session-digest tag.
		expect(await recall(store, { tags: ['session-digest'] })).toHaveLength(
			1,
		);
	});

	it('dry-run (persist:false) returns the digest without writing the store', async () => {
		const handler = await build();
		const out = parse(
			await handler({
				topic: 'preview',
				items: [{ kind: 'fact', label: 'just looking' }],
				persist: false,
			}),
		);
		expect(out.persisted).toBe(false);
		expect(out.digest).toContain('just looking');
		expect(await readStore(store)).toHaveLength(0);
	});

	it('redacts secrets in the digest before persisting', async () => {
		const handler = await build();
		const secret = tok(
			'gh',
			'p',
			'_',
			'0123456789abcdefghijklmnopqrstuvwxyz',
		);
		const out = parse(
			await handler({
				topic: 'creds',
				items: [
					{ kind: 'fact', label: 'token', detail: `key=${secret}` },
				],
			}),
		);
		expect(out.redactedSecrets).toBeGreaterThanOrEqual(1);
		expect(out.digest).not.toContain(secret);
		expect(out.digest).toContain('[REDACTED]');
	});

	it('upserts by topic (one digest per topic, not a duplicate)', async () => {
		const handler = await build();
		await handler({
			topic: 'loop',
			items: [{ kind: 'open', label: 'v1' }],
		});
		await handler({
			topic: 'loop',
			items: [{ kind: 'open', label: 'v2' }],
		});
		const notes = await readStore(store);
		expect(notes).toHaveLength(1);
		expect(notes[0]!.body).toContain('v2');
	});
});

describe('memory_compact under an automatic trigger (q00014 S6)', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-compact-auto-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const build = () =>
		captureHandler(
			buildCompactToolRegistration({
				namespacePrefix: 'mem',
				storePathAbs: store,
				maxNotes: 1000,
			}),
		);

	/** Items whose text carries a constraint the digest will drop. */
	const LOSSY_ITEMS = [
		{
			kind: 'output' as const,
			label: 'raw log',
			detail: 'The report must never contain source code.',
		},
		{
			kind: 'exploration' as const,
			label: 'dead end',
			detail: 'Tried the other parser, it was slower.',
		},
	];

	it('refuses to persist a policy-triggered digest that drops a constraint', async () => {
		const handler = await build();

		const out = parse(
			await handler({
				topic: 'auto',
				items: LOSSY_ITEMS,
				trigger: 'policy',
			}),
		);

		// The tail is larger than the digest and costs tokens. Losing the
		// user's constraint costs their decision, and no amount of tokens
		// buys it back.
		expect(out.preservation.binding).toBe(true);
		expect(out.preservation.accepted).toBe(false);
		expect(out.persisted).toBe(false);
		expect(out.preservation.droppedCount).toBeGreaterThan(0);
		expect(out.preservation.nextAction).toContain('Keep the tail');
		// Nothing was written, so the store has no note for the topic.
		expect(await readStore(store)).toHaveLength(0);
	});

	it('persists the same digest when the agent asked for it', async () => {
		const handler = await build();

		const out = parse(
			await handler({
				topic: 'asked',
				items: LOSSY_ITEMS,
			}),
		);

		// Same items, same losses, different answer: somebody is reading
		// this result and chose to compact.
		expect(out.preservation.binding).toBe(false);
		expect(out.preservation.accepted).toBe(true);
		expect(out.persisted).toBe(true);
		expect(await readStore(store)).not.toHaveLength(0);
	});
});
