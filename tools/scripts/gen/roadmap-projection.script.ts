#!/usr/bin/env bun
/**
 * roadmap-projection — regenerate what is derived from the roadmap file:
 * the JSON the web page reads, and the timeline's record of what the
 * file holds. Deterministic: a second run writes the same bytes and
 * appends nothing.
 *
 *   bun tools/scripts/gen/roadmap-projection.script.ts
 *
 * It writes one file under `apps/web/src/data/` and appends to the
 * timeline beside the roadmap; nothing else. The guard that compares is
 * `tools/scripts/lint/roadmap-drift.script.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { repoRoot } from '../lib/repo-root';
import {
	deriveRoadmap,
	ROADMAP_PROJECTION_PATH,
} from './roadmap-projection.lib';

const main = async (): Promise<number> => {
	const root = repoRoot();
	const derived = await deriveRoadmap(root);
	if (!derived.ok) {
		console.error(`roadmap-projection: ${derived.reason}`);
		return 1;
	}
	const target = join(root, ROADMAP_PROJECTION_PATH);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, derived.value.text);
	let recorded = 0;
	if (
		derived.value.workspace !== undefined &&
		derived.value.pending.length > 0
	) {
		const appended = await derived.value.workspace.timeline.append(
			derived.value.pending,
		);
		if (!appended.ok) {
			console.error(`roadmap-projection: ${appended.reason}`);
			return 1;
		}
		recorded = appended.value.length;
	}
	console.log(
		`roadmap-projection: wrote ${ROADMAP_PROJECTION_PATH}; ${String(recorded)} event(s) recorded in the timeline.`,
	);
	return 0;
};

if (import.meta.main) process.exit(await main());
