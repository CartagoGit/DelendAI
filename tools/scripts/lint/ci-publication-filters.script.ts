#!/usr/bin/env bun
/**
 * ci-publication-filters — the publication and train prefixes ci.yml's
 * ref filters name must be exactly the ones the development policy owns
 * (f00808).
 *
 * YAML cannot read the policy, so `startsWith(github.head_ref, '…pr/')`
 * is spelled in the workflow. When the namespace changes, or a former one
 * is declared for a transition, this is what keeps the two from drifting:
 * a filter that misses a prefix wakes no queue for those pull requests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	ownedPublicationRefPrefixes,
	ownedTrainPrefixes,
	parseJsonc,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from '../lib/repo-root';

/**
 * The prefixes each line's `startsWith(github.head_ref|ref, '…<segment>')`
 * filters name: `pr/` for publications, `train/` for the queue's trains.
 */
export const workflowPublicationFilters = (
	workflow: string,
	segment: 'pr/' | 'train/' = 'pr/',
): readonly (readonly string[])[] =>
	workflow
		.split('\n')
		.map((line) =>
			[
				...line.matchAll(
					new RegExp(
						`startsWith\\(github\\.(?:head_ref|ref), '([^']*${segment})'\\)`,
						'gu',
					),
				),
			].map((match) => (match[1] ?? '').replace(/^refs\/heads\//u, '')),
		)
		.filter((prefixes) => prefixes.length > 0);

/** Throws when a filter does not name exactly the owned publication prefixes. */
export const assertPublicationFilters = (
	workflow: string,
	owned: readonly string[],
	segment: 'pr/' | 'train/' = 'pr/',
): void => {
	const want = [...owned].sort().join(', ');
	for (const named of workflowPublicationFilters(workflow, segment)) {
		const got = [...new Set(named)].sort().join(', ');
		if (got !== want) {
			throw new Error(
				`ci.yml filters ${segment} refs by ${got}, but the policy owns ${want}: name every owned ${segment} prefix (development.branches.namespacePrefix and formerNamespacePrefixes).`,
			);
		}
	}
};

const main = (): number => {
	const root = repoRoot();
	const { value } = parseJsonc(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	);
	const development = (value as { development?: Record<string, unknown> })
		.development;
	const { branches } = resolveDevelopmentPolicy(
		development === undefined ? {} : { development },
	);
	const owned = ownedPublicationRefPrefixes(branches);
	const trains = ownedTrainPrefixes(branches);
	try {
		const workflow = readFileSync(
			join(root, '.github/workflows/ci.yml'),
			'utf8',
		);
		assertPublicationFilters(workflow, owned);
		assertPublicationFilters(workflow, trains, 'train/');
	} catch (error) {
		console.error(
			`✖ ci-publication-filters: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
	console.log(
		`✓ ci-publication-filters: ci.yml names ${[...owned, ...trains].join(', ')}, the publication and train prefixes the policy owns.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
