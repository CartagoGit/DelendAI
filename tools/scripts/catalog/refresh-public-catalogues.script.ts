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
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_CATALOGUE_SOURCES } from '../../../packages/core/src/lib/contracts/constants/public-catalogues.constant';
import type { ICatalogueCopy } from '../../../packages/core/src/lib/contracts/interfaces/public-catalogue.interface';
import {
	AGENT_REGISTRY_FORMAT,
	compactAgentRegistry,
} from '../../../packages/core/src/lib/shared/agent-registry.service';
import {
	compactCatalogue,
	MODEL_CATALOGUE_FORMAT,
} from '../../../packages/core/src/lib/shared/model-catalogue.service';

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
