#!/usr/bin/env bun
/**
 * host-docs-landing.script.ts — a host instruction document never says
 * how work lands.
 *
 * How work reaches the integration branch is the project's development
 * profile: a pull request, a merge, or a direct commit. The server states
 * it to every agent, rendered from the resolved policy. A host document
 * that states one of them anyway is read as a rule by agents in projects
 * whose profile is another: an agent on a project that merges read "publish
 * with `forge:publish`" in the bootstrap and followed a pull-request flow
 * until its user stopped it.
 *
 * Fails, too, when it finds no document to scan: a gate over nothing
 * passes having measured nothing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	HOST_INSTRUCTION_DIRS,
	HOST_INSTRUCTION_DOCS,
	LANDING_CLAIMS,
} from './host-docs-landing.constant';
import type { IHostDoc, ILandingClaim } from './host-docs-landing.interface';

/** Every line of `docs` that names a landing route. */
export const findLandingClaims = (
	docs: readonly IHostDoc[],
): readonly ILandingClaim[] =>
	docs.flatMap((doc) =>
		doc.text.split('\n').flatMap((text, index) =>
			LANDING_CLAIMS.filter((claim) => claim.pattern.test(text)).map(
				(claim): ILandingClaim => ({
					path: doc.path,
					line: index + 1,
					names: claim.names,
					text: text.trim(),
				}),
			),
		),
	);

/** The host documents present under `root`, read. */
export const readHostDocs = (root: string): readonly IHostDoc[] => {
	const inDirs = HOST_INSTRUCTION_DIRS.flatMap((dir) =>
		existsSync(join(root, dir))
			? readdirSync(join(root, dir))
					.filter((name) => name.endsWith('.md'))
					.map((name) => `${dir}/${name}`)
			: [],
	);
	return [...HOST_INSTRUCTION_DOCS, ...inDirs]
		.filter((path) => existsSync(join(root, path)))
		.map((path) => ({
			path,
			text: readFileSync(join(root, path), 'utf8'),
		}));
};

if (import.meta.main) {
	const docs = readHostDocs(process.cwd());
	if (docs.length === 0) {
		console.error(
			'✖ host-docs-landing: found no host instruction document to scan; the gate would pass having read nothing.',
		);
		process.exit(1);
	}
	const claims = findLandingClaims(docs);
	if (claims.length === 0) {
		console.log(
			`✓ host-docs-landing: ${String(docs.length)} host document(s) leave the landing route to the server.`,
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ host-docs-landing: ${String(claims.length)} line(s) state how work lands.`,
			'',
			...claims.map(
				(claim) =>
					`  ${claim.path}:${String(claim.line)} names ${claim.names}: ${claim.text}`,
			),
			'',
			'  How work lands is the project’s development profile, and the',
			'  server states it (connect-time instructions, agent_bootstrap,',
			'  overview.workModel, every refusal). Point there instead.',
		].join('\n'),
	);
	process.exit(1);
}
