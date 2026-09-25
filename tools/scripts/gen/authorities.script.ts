#!/usr/bin/env bun
/**
 * authorities.script.ts — AUTHORITIES.md, from the declarations.
 *
 * Which copy of a fact is the truth is declared in code: this
 * repository's build facts in `repo-authorities.constant.ts`, a plugin's
 * product facts in its manifest. This page is generated from those
 * declarations so it is never a second, hand-kept statement of them.
 *
 *   bun tools/scripts/gen/authorities.script.ts [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	type IAuthorityDeclaration,
	parseAuthorityDeclarations,
} from '@delendai/core/public';

import { loadPluginManifests } from '../generate/from-manifests.script';
import { repoRoot } from '../lib/repo-root';
import { REPO_AUTHORITIES } from './repo-authorities.constant';

export const AUTHORITIES_DOC = 'docs/delendai/AUTHORITIES.md';

/** A declaration and who made it. */
export interface IDeclaredAuthority {
	readonly source: string;
	readonly declaration: IAuthorityDeclaration;
}

/**
 * Every declaration, sorted by domain. A domain declared by two sources
 * is two answers to "which copy is the truth", which is the defect this
 * exists to prevent, so it is refused rather than rendered.
 */
export const collectAuthorities = (
	sources: readonly {
		readonly source: string;
		readonly declarations: readonly IAuthorityDeclaration[];
	}[],
): readonly IDeclaredAuthority[] => {
	const seen = new Map<string, string>();
	const all: IDeclaredAuthority[] = [];
	for (const { source, declarations } of sources) {
		for (const declaration of declarations) {
			const earlier = seen.get(declaration.domain);
			if (earlier !== undefined) {
				throw new Error(
					`authority domain "${declaration.domain}" is declared by both ${earlier} and ${source}`,
				);
			}
			seen.set(declaration.domain, source);
			all.push({ source, declaration });
		}
	}
	return all.sort((a, b) =>
		a.declaration.domain.localeCompare(b.declaration.domain),
	);
};

const cell = (value: string | undefined): string =>
	value === undefined ? '—' : `\`${value}\``;

export const renderAuthorities = (
	declared: readonly IDeclaredAuthority[],
): string => {
	const lines = [
		'# Authorities — generated',
		'',
		'<!-- generated: tools/scripts/gen/authorities.script.ts -->',
		'<!-- generated — do not edit by hand -->',
		'',
		'For every fact kept in more than one place: the copy that is the truth, the copies derived from it, what writes each copy, and what notices when they drift. Edit the authority, never a projection; declare a new fact in `tools/scripts/gen/repo-authorities.constant.ts` (this repository) or in a plugin manifest’s `authorities` (a product fact), then regenerate with `bun run gen:all`.',
		'',
	];
	for (const { source, declaration } of declared) {
		lines.push(
			`## ${declaration.domain}`,
			'',
			`- **Authority**: ${cell(declaration.authority)}`,
			`- **Declared by**: ${source}`,
			`- **Rebuild**: ${cell(declaration.rebuild)}`,
			`- **Drift gate**: ${cell(declaration.driftGate)}`,
			...(declaration.reconciler !== undefined
				? [`- **Reconciler**: ${cell(declaration.reconciler)}`]
				: []),
			...(declaration.digest !== undefined
				? [`- **Digest**: ${cell(declaration.digest)}`]
				: []),
			'',
			'| Projection | Producer |',
			'| --- | --- |',
			...declaration.projections.map(
				(projection) =>
					`| ${cell(projection.path)} | ${cell(projection.producer)} |`,
			),
			'',
		);
	}
	return `${lines.join('\n').trimEnd()}\n`;
};

const main = async (): Promise<void> => {
	const root = repoRoot();
	const manifests = await loadPluginManifests(root);
	const declared = collectAuthorities([
		{
			source: 'this repository',
			declarations: parseAuthorityDeclarations(REPO_AUTHORITIES),
		},
		...manifests
			.filter((loaded) => loaded.manifest.authorities !== undefined)
			.map((loaded) => ({
				source: `plugin \`${loaded.manifest.id}\``,
				declarations: loaded.manifest.authorities ?? [],
			})),
	]);
	const rendered = renderAuthorities(declared);
	const target = join(root, AUTHORITIES_DOC);
	if (process.argv.includes('--check')) {
		let current = '';
		try {
			current = readFileSync(target, 'utf8');
		} catch {
			// A missing page is drift like any other.
		}
		if (current !== rendered) {
			console.error(
				`authorities: ${AUTHORITIES_DOC} is out of date. Run bun run gen:all.`,
			);
			process.exit(1);
		}
		console.log(`authorities: ${AUTHORITIES_DOC} is current.`);
		return;
	}
	writeFileSync(target, rendered);
	console.log(
		`authorities: wrote ${String(declared.length)} declaration(s) to ${AUTHORITIES_DOC}.`,
	);
};

if (import.meta.main) await main();
