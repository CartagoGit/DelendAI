#!/usr/bin/env bun
/**
 * lint:authorities — a declared authority is checked, not just printed.
 *
 * AUTHORITIES.md says, for every fact kept in more than one place, which
 * copy is the truth and what keeps the others in line. That is only
 * worth something while it is true, so each declaration is held to what
 * it claims:
 *
 * - the authority exists (a named store such as `measurement:…` or
 *   `sqlite:…` is not a path and is not looked up; a glob must match);
 * - every projection's producer exists — a producer that was deleted
 *   leaves a copy nothing writes any more;
 * - the drift gate is a script CI actually reaches, through the same
 *   closure `lints-reach-ci` computes — a gate CI never runs guards
 *   nothing;
 * - a rebuild written as `bun run <script>` names a real script.
 *
 * Running every rebuild is not repeated here: that is what the drift
 * gates themselves do.
 */
import { existsSync, globSync } from 'node:fs';
import { join } from 'node:path';

import type { IAuthorityDeclaration } from '@delendai/core/public';

import { loadDeclaredAuthorities } from '../gen/authorities.script';
import { repoRoot } from '../lib/repo-root';
import {
	reachableScripts,
	readScripts,
	readWorkflows,
} from './lints-reach-ci.script';

const NAMED_STORE = /^[a-z]+:/u;

/** The facts a check needs about the repository, injectable for tests. */
export interface IAuthorityCheckFacts {
	readonly exists: (relativePath: string) => boolean;
	readonly scripts: Readonly<Record<string, string>>;
	readonly reachable: ReadonlySet<string>;
}

/** Every way `declaration` is not true of the repository. */
export const authorityFindings = (
	declaration: IAuthorityDeclaration,
	facts: IAuthorityCheckFacts,
): readonly string[] => {
	const at = `authority "${declaration.domain}"`;
	const findings: string[] = [];
	if (
		!NAMED_STORE.test(declaration.authority) &&
		!facts.exists(declaration.authority)
	) {
		findings.push(
			`${at}: its authority ${declaration.authority} does not exist`,
		);
	}
	for (const projection of declaration.projections) {
		if (!facts.exists(projection.producer)) {
			findings.push(
				`${at}: ${projection.path} is written by ${projection.producer}, which does not exist`,
			);
		}
	}
	const gate = declaration.driftGate;
	if (gate !== undefined) {
		if (facts.scripts[gate] === undefined) {
			findings.push(
				`${at}: its drift gate ${gate} is not a package.json script`,
			);
		} else if (!facts.reachable.has(gate)) {
			findings.push(
				`${at}: its drift gate ${gate} is never run by CI, so it guards nothing`,
			);
		}
	}
	const rebuild = /^bun run ([^\s]+)$/u.exec(declaration.rebuild ?? '');
	if (rebuild?.[1] !== undefined && facts.scripts[rebuild[1]] === undefined) {
		findings.push(
			`${at}: its rebuild names ${rebuild[1]}, which is not a script`,
		);
	}
	return findings;
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const scripts = readScripts();
	const facts: IAuthorityCheckFacts = {
		exists: (relativePath) =>
			relativePath.includes('*')
				? globSync(relativePath, { cwd: root }).length > 0
				: existsSync(join(root, relativePath)),
		scripts,
		reachable: reachableScripts(scripts, readWorkflows()),
	};
	const declared = await loadDeclaredAuthorities(root);
	const findings = declared.flatMap(({ declaration }) =>
		authorityFindings(declaration, facts),
	);
	if (findings.length > 0) {
		console.error(
			[
				`✖ authorities: ${String(findings.length)} declaration(s) are not true of this repository:`,
				...findings.map((finding) => `  ${finding}`),
			].join('\n'),
		);
		return 1;
	}
	console.log(
		`✓ authorities: ${String(declared.length)} declaration(s) hold — every producer exists and every drift gate runs in CI.`,
	);
	return 0;
};

if (import.meta.main) process.exit(await main());
