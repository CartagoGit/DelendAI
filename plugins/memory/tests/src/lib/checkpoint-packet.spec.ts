import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import { buildCheckpointPacket } from '@delendai/memory/lib/services/checkpoint-packet';
import { saveNote } from '@delendai/memory/lib/services/store';
import { buildCheckpointPacketToolRegistration } from '@delendai/memory/lib/tools/checkpoint-packet.tool';

const captureHandler = async (
	registration: IToolRegistration,
): Promise<
	(args: unknown) => Promise<{ content: Array<{ text: string }> }>
> => {
	let handler:
		| ((args: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await registration.register({
		registerTool: (
			_name: string,
			_config: unknown,
			registered: typeof handler,
		) => {
			handler = registered;
		},
	} as never);
	if (!handler) throw new Error('handler not registered');
	return handler;
};

describe('checkpoint packet', () => {
	let directory = '';
	let storePath = '';

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'mem-checkpoint-'));
		storePath = join(directory, 'notes.json');
	});
	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	it('keeps only bounded digest continuation signals and redacts legacy content', () => {
		const secret = [
			'gh',
			'p_',
			'0123456789abcdefghijklmnopqrstuvwxyz',
		].join('');
		const packet = buildCheckpointPacket(
			{
				title: 'session-digest:adapter',
				topic: 'adapter',
				createdAt: '2026-07-24T10:00:00.000Z',
				body: [
					'# Session digest',
					'',
					'## Open',
					'- Add checkpoint tool',
					'',
					'## Pointers',
					'- plugins/memory/src/index.ts:1',
					'',
					`## Facts\n- legacy=${secret}`,
				].join('\n'),
			},
			80,
		);

		expect(packet.digest).not.toContain(secret);
		expect(packet.nextAction).toBe('Add checkpoint tool');
		expect(packet.pointers).toEqual(['plugins/memory/src/index.ts:1']);
		expect(packet.digest).toHaveLength(80);
	});

	it('returns the newest available packet and a truthful empty result', async () => {
		const handler = await captureHandler(
			buildCheckpointPacketToolRegistration({
				namespacePrefix: 'memory',
				storePathAbs: storePath,
			}),
		);
		const parse = async () =>
			JSON.parse((await handler({})).content[0]!.text) as {
				available: boolean;
				packet: { nextAction: string | null } | null;
			};

		expect(await parse()).toEqual({ available: false, packet: null });
		await saveNote(storePath, {
			title: 'session-digest:resume',
			body: '# Session digest\n\n## Open\n- Run the focused tests',
			tags: ['session-digest'],
		});

		expect(await parse()).toEqual({
			available: true,
			packet: expect.objectContaining({
				nextAction: 'Run the focused tests',
			}),
		});
	});

	it('advises at a lifecycle boundary without writing a checkpoint', async () => {
		const handler = await captureHandler(
			buildCheckpointPacketToolRegistration({
				namespacePrefix: 'memory',
				storePathAbs: storePath,
			}),
		);
		const missing = JSON.parse(
			(await handler({ hostEvent: 'pre-compact' })).content[0]!.text,
		) as {
			advisory: {
				recommendedAction: string;
				freshness: { state: string };
			};
		};
		expect(missing).toEqual({
			available: false,
			packet: null,
			advisory: {
				hostEvent: 'pre-compact',
				freshness: expect.objectContaining({ state: 'missing' }),
				shouldCreateSemanticCheckpoint: true,
				recommendedAction: 'create-semantic-checkpoint',
			},
		});

		await saveNote(storePath, {
			title: 'session-digest:current',
			body: '# Session digest\n\n## Open\n- Continue',
			tags: ['session-digest'],
		});
		const fresh = JSON.parse(
			(
				await handler({
					hostEvent: 'session-end',
					maxCheckpointAgeMinutes: 60,
				})
			).content[0]!.text,
		) as {
			advisory: {
				recommendedAction: string;
				freshness: { state: string };
			};
		};
		expect(fresh).toEqual({
			available: true,
			packet: null,
			advisory: {
				hostEvent: 'session-end',
				freshness: expect.objectContaining({ state: 'fresh' }),
				shouldCreateSemanticCheckpoint: false,
				recommendedAction: 'continue-with-current-checkpoint',
			},
		});
	});
});
