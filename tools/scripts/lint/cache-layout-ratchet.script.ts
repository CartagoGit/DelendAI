#!/usr/bin/env bun
/**
 * cache-layout-ratchet.script.ts — `bun run lint:cache-layout-ratchet`.
 *
 * The cache layout manifest documents the persisted layout. Changing what
 * it lists without raising `CACHE_LAYOUT_EPOCH` ships a layout change with
 * no migration step, so workspaces written by the old build are never
 * carried. The snapshot records the epoch and a checksum of the artifacts;
 * `--update` re-records it, and is refused unless the epoch went up
 * whenever the artifacts changed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	CACHE_LAYOUT_EPOCH,
	CACHE_LAYOUT_MANIFEST,
} from '../../../packages/core/src/lib/contracts/constants/cache-layout.constant';
import type { ICacheLayoutManifest } from '../../../packages/core/src/lib/contracts/interfaces/cache-layout.interface';
import { CACHE_LAYOUT_RATCHET_SNAPSHOT_PATH } from './cache-layout-ratchet.constant';
import type {
	ICacheLayoutRatchetSnapshot,
	ICacheLayoutRatchetVerdict,
} from './cache-layout-ratchet.interface';

/** Order-independent checksum of what the manifest says exists. */
export const manifestChecksum = (manifest: ICacheLayoutManifest): string =>
	createHash('sha256')
		.update(
			JSON.stringify(
				[...manifest.artifacts]
					.map((a) => [a.id, a.owner, a.path, a.class])
					.sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
			),
		)
		.digest('hex');

export const judgeRatchet = (
	recorded: ICacheLayoutRatchetSnapshot,
	current: ICacheLayoutRatchetSnapshot,
): ICacheLayoutRatchetVerdict => {
	if (current.epoch < recorded.epoch)
		return {
			ok: false,
			message: `the epoch went down (${String(recorded.epoch)} -> ${String(current.epoch)}); an epoch only ever rises`,
		};
	if (
		current.checksum !== recorded.checksum &&
		current.epoch === recorded.epoch
	)
		return {
			ok: false,
			message: `the cache layout manifest changed but CACHE_LAYOUT_EPOCH is still ${String(current.epoch)}. Raise the epoch and add the migration for the new step, then run this lint with --update.`,
		};
	if (
		current.epoch !== recorded.epoch ||
		current.checksum !== recorded.checksum
	)
		return {
			ok: false,
			message: `the snapshot is stale (epoch ${String(recorded.epoch)} -> ${String(current.epoch)}). Run this lint with --update once the migration for the new epoch is in.`,
		};
	return { ok: true };
};

if (import.meta.main) {
	const path = join(process.cwd(), CACHE_LAYOUT_RATCHET_SNAPSHOT_PATH);
	const current: ICacheLayoutRatchetSnapshot = {
		epoch: CACHE_LAYOUT_EPOCH,
		checksum: manifestChecksum(CACHE_LAYOUT_MANIFEST),
	};
	const recorded = existsSync(path)
		? (JSON.parse(
				readFileSync(path, 'utf8'),
			) as ICacheLayoutRatchetSnapshot)
		: undefined;
	if (process.argv.includes('--update')) {
		if (recorded !== undefined) {
			const verdict = judgeRatchet(recorded, current);
			if (
				!verdict.ok &&
				current.epoch === recorded.epoch &&
				current.checksum !== recorded.checksum
			) {
				console.error(`✖ cache-layout-ratchet: ${verdict.message}`);
				process.exit(1);
			}
		}
		writeFileSync(path, `${JSON.stringify(current, null, '\t')}\n`);
		console.log(
			`cache-layout-ratchet: recorded epoch ${String(current.epoch)}.`,
		);
		process.exit(0);
	}
	if (recorded === undefined) {
		console.error(
			'✖ cache-layout-ratchet: no snapshot recorded; run with --update.',
		);
		process.exit(1);
	}
	const verdict = judgeRatchet(recorded, current);
	if (!verdict.ok) {
		console.error(`✖ cache-layout-ratchet: ${verdict.message}`);
		process.exit(1);
	}
	console.log(
		`✓ cache-layout-ratchet: epoch ${String(current.epoch)}, manifest unchanged.`,
	);
}
