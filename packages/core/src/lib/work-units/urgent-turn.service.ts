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
	IUrgentTurnRequest,
} from '../contracts/interfaces/urgent-turn.interface';
import { scalarArg } from './command-args.helper';

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
	const conclusion = await (request.certification ?? ghCertification)(
		request.integration,
	);
	return conclusion === 'failure'
		? `${request.proposal} repairs ${request.integration}, whose latest certification is red`
		: undefined;
};
