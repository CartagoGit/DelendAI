#!/usr/bin/env bun
/**
 * workflow-write-identity.script.ts — an automation that opens a pull
 * request or pushes a branch must not do it with the workflow token.
 *
 * GitHub starts no workflow for anything the workflow token pushes or
 * opens, so such a pull request or branch is never built and sits with
 * its required check absent. Each automation takes the token of the
 * project's integration identity instead.
 *
 * A step is refused when it opens a pull request (`gh pr create`, a
 * create-pull-request action) or pushes a branch (`git push` that does
 * not push a tag), and no identity token reaches it: its `GH_TOKEN`,
 * `GITHUB_TOKEN` or `token` input is the workflow token, or it names none
 * and so takes the checkout's.
 *
 *   bun tools/scripts/lint/workflow-write-identity.script.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const WORKFLOWS = '.github/workflows';

const OPENS_OR_PUSHES =
	/\bgh pr create\b|\bgit push\b(?![^\n]*(?:--tags|refs\/tags|\bv\$))/u;
const WORKFLOW_TOKEN = /github\.token|secrets\.GITHUB_TOKEN/u;

interface IStep {
	readonly name?: string;
	readonly uses?: string;
	readonly run?: string;
	readonly env?: Readonly<Record<string, unknown>>;
	readonly with?: Readonly<Record<string, unknown>>;
}

export interface IWriteIdentityFinding {
	readonly file: string;
	readonly job: string;
	readonly step: string;
	readonly reason: string;
}

const tokenOf = (step: IStep): string | undefined => {
	const named = [
		step.env?.['GH_TOKEN'],
		step.env?.['GITHUB_TOKEN'],
		step.with?.['token'],
	].find((value) => value !== undefined);
	return named === undefined ? undefined : String(named);
};

const reasonOf = (step: IStep): string | undefined => {
	const opens =
		step.uses?.includes('create-pull-request') === true ||
		OPENS_OR_PUSHES.test(step.run ?? '');
	if (!opens) return undefined;
	const token = tokenOf(step);
	if (token === undefined)
		return 'opens a pull request or pushes a branch and names no token, so it takes the workflow token';
	return WORKFLOW_TOKEN.test(token)
		? 'opens a pull request or pushes a branch with the workflow token'
		: undefined;
};

/** The steps of one workflow file's text that write with the workflow token. */
export const writeIdentityFindings = (
	file: string,
	text: string,
): readonly IWriteIdentityFinding[] => {
	const document = parse(text) as {
		jobs?: Record<string, { steps?: readonly IStep[] }>;
	} | null;
	return Object.entries(document?.jobs ?? {}).flatMap(([job, body]) =>
		(body.steps ?? []).flatMap((step) => {
			const reason = reasonOf(step);
			return reason === undefined
				? []
				: [
						{
							file,
							job,
							step: step.name ?? step.uses ?? '(step)',
							reason,
						},
					];
		}),
	);
};

if (import.meta.main) {
	const findings = readdirSync(WORKFLOWS)
		.filter((name) => /\.ya?ml$/u.test(name))
		.flatMap((name) =>
			writeIdentityFindings(
				name,
				readFileSync(join(WORKFLOWS, name), 'utf8'),
			),
		);
	for (const finding of findings)
		console.error(
			`✖ ${finding.file} > ${finding.job} > ${finding.step}: ${finding.reason}. Use the integration identity's token.`,
		);
	if (findings.length === 0)
		console.log(
			'✓ workflow-write-identity: no workflow opens a pull request or pushes a branch with the workflow token.',
		);
	process.exit(findings.length === 0 ? 0 : 1);
}
