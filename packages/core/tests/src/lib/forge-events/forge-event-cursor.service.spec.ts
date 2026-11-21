/**
 * forge-event-cursor.service.spec.ts — what the host last delivered of each
 * subscribed pull request survives a restart and stays bounded.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FORGE_EVENT_CURSOR_KEYS } from '@delendai/core/lib/contracts/constants/forge-event-store.constant';
import {
	forgeCursorTarget,
	markForgeEventDelivered,
	readForgeEventCursor,
} from '@delendai/core/lib/forge-events/forge-event-cursor.service';

const roots: string[] = [];
const scratch = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'forge-event-cursor-'));
	roots.push(root);
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('forge event cursor', () => {
	it('[<50ms] reads nothing from a store that has none', async () => {
		expect(await readForgeEventCursor(scratch())).toEqual({});
	});

	it('[<50ms] remembers a key once per target and reads it back', async () => {
		const dir = scratch();
		const target = forgeCursorTarget('o/r', 7);
		await markForgeEventDelivered(dir, target, 'pr.merged');
		await markForgeEventDelivered(dir, target, 'pr.merged');
		await markForgeEventDelivered(dir, forgeCursorTarget('o/r', 8), 'x');
		expect(await readForgeEventCursor(dir)).toEqual({
			'o/r#7': ['pr.merged'],
			'o/r#8': ['x'],
		});
	});

	it('[<100ms] keeps the newest keys of a target, the oldest go first', async () => {
		const dir = scratch();
		for (let index = 0; index < FORGE_EVENT_CURSOR_KEYS + 3; index += 1)
			await markForgeEventDelivered(dir, 'o/r#1', `k${String(index)}`);
		const keys = (await readForgeEventCursor(dir))['o/r#1'] ?? [];
		expect(keys).toHaveLength(FORGE_EVENT_CURSOR_KEYS);
		expect(keys[0]).toBe('k3');
	});

	it('[<50ms] reads an unreadable file as an empty cursor and drops malformed entries', async () => {
		const dir = scratch();
		writeFileSync(join(dir, 'cursor.json'), 'not json');
		expect(await readForgeEventCursor(dir)).toEqual({});
		writeFileSync(
			join(dir, 'cursor.json'),
			JSON.stringify({ 'o/r#1': ['a', 2], 'o/r#2': 'x' }),
		);
		expect(await readForgeEventCursor(dir)).toEqual({ 'o/r#1': ['a'] });
	});
});
