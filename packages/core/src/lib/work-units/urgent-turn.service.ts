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

import type {
	ICertificationLookup,
	IForgeCommandRunner,
	IUrgentTurnRequest,
} from '../contracts/interfaces/urgent-turn.interface';
import { scalarArg } from './command-args.helper';

/** The workflow whose latest finished run certifies the integration branch. */
const CERTIFYING_WORKFLOW = 'ci.yml';

const FORGE_TIMEOUT_MS = 15_000;

const runGh: IForgeCommandRunner = (args, cwd) =>
	execFileSync('gh', [...args], {
		cwd,
		encoding: 'utf8',
		timeout: FORGE_TIMEOUT_MS,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

/**
 * The integration branch's latest finished certification, through the REST
 * endpoint every gh version answers (`gh run list --branch` is missing from
 * some). gh fills `{owner}/{repo}` from the remote of the directory it runs
 * in. Unknown is never urgent, and the reason is logged.
 */
export const ghCertificationLookup =
	(
		run: IForgeCommandRunner,
		log: (line: string) => void,
	): ICertificationLookup =>
	(integration, root) =>
		Promise.resolve(
			(() => {
				try {
					const out = run(
						[
							'api',
							`repos/{owner}/{repo}/actions/workflows/${CERTIFYING_WORKFLOW}/runs?branch=${encodeURIComponent(integration)}&status=completed&per_page=1`,
							'--jq',
							'.workflow_runs[0].conclusion // empty',
						],
						root,
					).trim();
					if (out.length === 0)
						log(
							`urgent lane: no finished ${CERTIFYING_WORKFLOW} run on ${integration}; not urgent\n`,
						);
					return out.length === 0 ? undefined : out;
				} catch (error) {
					log(
						`urgent lane: could not read the certification of ${integration} (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); not urgent\n`,
					);
					return undefined;
				}
			})(),
		);

/** A fix's id carries the fix prefix (its kind's letter in the proposal glossary). */
const FIX_ID_PREFIX = 'x';

/** The reason this unit's proof is urgent, or undefined for a normal turn. */
export const urgentReasonOf = async (
	request: IUrgentTurnRequest,
): Promise<string | undefined> => {
	const stated = scalarArg(request.args, 'urgent');
	if (stated !== undefined && stated.length > 0) return stated;
	if (request.proposal === undefined) return undefined;
	if (!request.proposal.startsWith(FIX_ID_PREFIX)) return undefined;
	const lookup =
		request.certification ??
		ghCertificationLookup(
			request.runForge ?? runGh,
			request.log ?? ((line) => process.stderr.write(line)),
		);
	const conclusion = await lookup(request.integration, request.root);
	return conclusion === 'failure'
		? `${request.proposal} repairs ${request.integration}, whose latest certification is red`
		: undefined;
};
