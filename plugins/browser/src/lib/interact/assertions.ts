/**
 * f00125 S2 — Assertion helpers (pure planner over an IAssertOutcome).
 *
 * The driver's `assert` returns a raw `IAssertOutcome`. These helpers
 * convert a failed outcome into one or more normalized `IFinding`s so
 * the host can render failures the same way it renders axe findings.
 * Pass-through on success — no finding, no noise.
 */
import type { IFinding } from '@delendai/core/public';

import type { IAssertOutcome, IAssertRequest } from './iaction-driver';

const RULE_PREFIX = 'browser-assert';

const makeLocation = (url: string, target?: string) =>
	target !== undefined && target.length > 0
		? { location: { file: `${url} :: ${target}` } }
		: { location: { file: url } };

const expectedToFix = (req: IAssertRequest): string =>
	`Expected ${req.kind} to match \`${req.expected}\` (observed will be in the message).`;

/** Convert a failed outcome into one `IFinding`. Pass-through on success. */
export const outcomeToFinding = (
	req: IAssertRequest,
	outcome: IAssertOutcome,
): IFinding | undefined => {
	if (outcome.passed) return undefined;
	const ruleId = `${RULE_PREFIX}:${req.kind}`;
	const label = req.label ?? req.kind;
	const message =
		`Assertion ${label} failed @ ${outcome.url}: ` +
		`expected \`${outcome.expected}\`, observed \`${outcome.observed}\``;
	return {
		ruleId,
		severity: 'high',
		message,
		...makeLocation(outcome.url, req.target),
		fix: expectedToFix(req),
	};
};

/** Convert a batch of outcomes (one assertion can produce multiple). */
export const outcomesToFindings = (
	requests: readonly IAssertRequest[],
	outcomes: readonly IAssertOutcome[],
): readonly IFinding[] => {
	if (requests.length !== outcomes.length) {
		throw new Error(
			`assertions: requests/outcomes length mismatch (${requests.length} vs ${outcomes.length})`,
		);
	}
	const findings: IFinding[] = [];
	for (let i = 0; i < requests.length; i += 1) {
		const req = requests[i];
		const out = outcomes[i];
		if (req === undefined || out === undefined) continue;
		const f = outcomeToFinding(req, out);
		if (f !== undefined) findings.push(f);
	}
	return findings;
};
