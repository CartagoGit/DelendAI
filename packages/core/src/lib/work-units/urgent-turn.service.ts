/**
 * urgent-turn.service.ts — when a unit's proof takes the machine's compute
 * slot ahead of the others.
 *
 * Urgent means the integration branch is red and this unit repairs it (its
 * proposal is a fix), or the caller said so with `--urgent=<reason>`.
 * Nothing else has priority: a slot that everyone could jump is a slot no
 * one waits for.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ICertificationLookup,
	IUrgentTurnRequest,
} from '../contracts/interfaces/urgent-turn.interface';
import { scalarArg } from './command-args.helper';
import { readWorkspaceDocsDir } from './development-policy.service';

/** The workflow whose latest finished run certifies the integration branch. */
const CERTIFYING_WORKFLOW = 'ci.yml';

const FORGE_TIMEOUT_MS = 15_000;

const ghCertification: ICertificationLookup = (integration) =>
	Promise.resolve(
		(() => {
			try {
				const out = execFileSync(
					'gh',
					[
						'run',
						'list',
						'--workflow',
						CERTIFYING_WORKFLOW,
						'--branch',
						integration,
						'--status',
						'completed',
						'--limit',
						'1',
						'--json',
						'conclusion',
						'--jq',
						'.[0].conclusion',
					],
					{ encoding: 'utf8', timeout: FORGE_TIMEOUT_MS },
				).trim();
				return out.length === 0 ? undefined : out;
			} catch {
				// No forge, no network: never urgent on a guess.
				return undefined;
			}
		})(),
	);

/** The `kind` a proposal declares, wherever its document sits. */
const proposalKind = async (
	root: string,
	proposal: string,
): Promise<string | undefined> => {
	const proposals = join(root, await readWorkspaceDocsDir(root), 'proposals');
	for (const status of await readdir(proposals).catch(() => [])) {
		const names = await readdir(join(proposals, status)).catch(() => []);
		const name = names.find((entry) => entry.startsWith(`${proposal}-`));
		if (name === undefined) continue;
		const text = await readFile(join(proposals, status, name), 'utf8');
		return /^kind:\s*"?([a-z-]+)"?\s*$/mu.exec(text)?.[1];
	}
	return undefined;
};

/** The reason this unit's proof is urgent, or undefined for a normal turn. */
export const urgentReasonOf = async (
	request: IUrgentTurnRequest,
): Promise<string | undefined> => {
	const stated = scalarArg(request.args, 'urgent');
	if (stated !== undefined && stated.length > 0) return stated;
	if (request.proposal === undefined) return undefined;
	if ((await proposalKind(request.root, request.proposal)) !== 'fix') {
		return undefined;
	}
	const conclusion = await (request.certification ?? ghCertification)(
		request.integration,
	);
	return conclusion === 'failure'
		? `${request.proposal} repairs ${request.integration}, whose latest certification is red`
		: undefined;
};
