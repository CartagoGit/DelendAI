#!/usr/bin/env bun
/**
 * refresh-public-catalogues.script.ts — rewrites the catalogue snapshots
 * shipped in @delendai/core (packages/core/data/*.snapshot.json) from
 * their default sources, each with its source, date, sha256 and ETag.
 *
 * The snapshots are the last layer: what delendai names agents and models
 * by when no source answers and this machine has no copy yet. Run it
 * before a release; the date in each file says how old it is.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	AGENT_REGISTRY_FORMAT,
	compactAgentRegistry,
	compactCatalogue,
	DEFAULT_CATALOGUE_SOURCES,
	type ICatalogueCopy,
	MODEL_CATALOGUE_FORMAT,
} from '@delendai/core/cli';

const DATA_DIR = join(import.meta.dir, '../../../packages/core/data');

const snapshot = async <T>(input: {
	readonly url: string;
	readonly file: string;
	readonly format: number;
	readonly compact: (raw: unknown) => T | undefined;
}): Promise<void> => {
	const response = await fetch(input.url);
	if (!response.ok)
		throw new Error(`${input.url} answered ${String(response.status)}`);
	const body = await response.text();
	const data = input.compact(JSON.parse(body) as unknown);
	if (data === undefined) throw new Error(`${input.url} is not a catalogue`);
	const now = new Date().toISOString();
	const copy: ICatalogueCopy<T> = {
		meta: {
			source: input.url,
			format: input.format,
			fetchedAt: now,
			checkedAt: now,
			sha256: createHash('sha256').update(body).digest('hex'),
			etag: response.headers.get('etag') ?? undefined,
			lastModified: response.headers.get('last-modified') ?? undefined,
		},
		data,
	};
	writeFileSync(join(DATA_DIR, input.file), `${JSON.stringify(copy)}\n`);
	console.log(`${input.file}: ${input.url} at ${now}`);
};

const [agents] = DEFAULT_CATALOGUE_SOURCES.agents;
const [models] = DEFAULT_CATALOGUE_SOURCES.models;
if (agents === undefined || models === undefined)
	throw new Error('no default catalogue source');
await snapshot({
	url: agents,
	file: 'agent-registry.snapshot.json',
	format: AGENT_REGISTRY_FORMAT,
	compact: compactAgentRegistry,
});
await snapshot({
	url: models,
	file: 'model-catalogue.snapshot.json',
	format: MODEL_CATALOGUE_FORMAT,
	compact: (raw) => compactCatalogue(raw),
});
// Written as the repository formats JSON, so a refresh diffs only in content.
spawnSync('bunx', ['biome', 'format', '--write', DATA_DIR], {
	stdio: 'inherit',
});
