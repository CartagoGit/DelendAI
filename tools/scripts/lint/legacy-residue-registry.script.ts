#!/usr/bin/env bun
/**
 * legacy-residue-registry.script.ts — `bun run lint:legacy-residue-registry`.
 *
 * A rename or removal ships its migration. The snapshot records the names
 * the previous release emitted: the config file, the server name, the cache
 * and documents directories, and each host's written paths. A name in the
 * snapshot that the current code no longer emits must be carried by an
 * entry of the legacy-residue registry, or the lint fails. `--update`
 * re-records the snapshot, and is refused while a removed name is unnamed.
 * It reads no network, and fails when it measured nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AGENT_HOSTS } from '../../../packages/core/src/lib/contracts/constants/agent-hosts.constant';
import { DEFAULT_CORE_PATHS } from '../../../packages/core/src/lib/contracts/interfaces/core-paths.interface';
import { legacyResidueRegistry } from '../../../packages/core/src/lib/workspace-migration/legacy-residue/legacy-residue.registry';
import { LEGACY_RESIDUE_SNAPSHOT_PATH } from './legacy-residue-registry.constant';
import type {
	ILegacyResidueSnapshot,
	ILegacyResidueVerdict,
} from './legacy-residue-registry.interface';

/** Everything the current release emits that an older one could have emitted differently. */
export const currentEmittedNames = (): readonly string[] => {
	const names = new Set<string>([
		'config-file:delendai.config.json',
		'server-name:delendai',
		`cache-dir:${DEFAULT_CORE_PATHS.cacheDir}`,
		`docs-dir:${DEFAULT_CORE_PATHS.docsDir}`,
	]);
	for (const host of AGENT_HOSTS) {
		if (host.instructions !== undefined)
			names.add(`${host.id}-instructions:${host.instructions}`);
		if (host.agents !== undefined)
			names.add(`${host.id}-agents:${host.agents.dir}`);
		if (host.skills !== undefined)
			names.add(`${host.id}-skills:${host.skills.dir}`);
	}
	return [...names].sort();
};

/** The retired names the registry's entries carry away. */
export const registryNames = (): ReadonlySet<string> =>
	new Set(legacyResidueRegistry.flatMap((entry) => entry.names ?? []));

export const judgeLegacyResidue = (
	recorded: ILegacyResidueSnapshot,
	current: readonly string[],
	named: ReadonlySet<string>,
): ILegacyResidueVerdict => {
	if (current.length === 0 || recorded.names.length === 0) {
		return {
			ok: false,
			message: `measured nothing (${String(current.length)} current names, ${String(recorded.names.length)} recorded); the lint cannot pass over an empty scan`,
		};
	}
	const now = new Set(current);
	const unnamed = recorded.names.filter((name) => {
		if (now.has(name)) return false;
		const value = name.slice(name.indexOf(':') + 1);
		return !named.has(value) && !named.has(name);
	});
	if (unnamed.length > 0) {
		return {
			ok: false,
			message: `${String(unnamed.length)} name(s) the previous release emitted are no longer emitted and no registry entry names them: ${unnamed.join(', ')}. Add an entry to the legacy-residue registry with the old value in its names, then run this lint with --update.`,
		};
	}
	const added = current.filter((name) => !recorded.names.includes(name));
	if (added.length > 0) {
		return {
			ok: false,
			message: `the snapshot is stale: ${added.join(', ')} are emitted now. Run this lint with --update.`,
		};
	}
	return {
		ok: true,
		measured: `${String(current.length)} emitted names against ${String(recorded.names.length)} recorded, ${String(named.size)} carried by the registry`,
	};
};

const readRecorded = (path: string): ILegacyResidueSnapshot | undefined => {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as ILegacyResidueSnapshot;
	} catch {
		return undefined;
	}
};

if (import.meta.main) {
	const path = join(process.cwd(), LEGACY_RESIDUE_SNAPSHOT_PATH);
	const current = currentEmittedNames();
	const recorded = readRecorded(path);
	if (process.argv.includes('--update')) {
		if (recorded !== undefined) {
			const verdict = judgeLegacyResidue(
				recorded,
				current,
				registryNames(),
			);
			if (!verdict.ok && !verdict.message.includes('stale')) {
				console.error(`✖ legacy-residue-registry: ${verdict.message}`);
				process.exit(1);
			}
		}
		writeFileSync(
			path,
			`${JSON.stringify({ names: current }, null, '\t')}\n`,
		);
		console.log(
			`legacy-residue-registry: recorded ${String(current.length)} names.`,
		);
		process.exit(0);
	}
	if (recorded === undefined) {
		console.error(
			'✖ legacy-residue-registry: no snapshot recorded; run with --update.',
		);
		process.exit(1);
	}
	const verdict = judgeLegacyResidue(recorded, current, registryNames());
	if (!verdict.ok) {
		console.error(`✖ legacy-residue-registry: ${verdict.message}`);
		process.exit(1);
	}
	console.log(`✓ legacy-residue-registry: ${verdict.measured}.`);
}
