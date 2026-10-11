/**
 * attested-implementer.service.ts — who delivered work that Git cannot
 * name, said on the record.
 *
 * A slice delivered before agents were named in refs has no work ref in
 * its commit and none in the merge that landed it. It is reviewed as
 * `unrecorded`, and a slice with no implementer has no reviewer who is
 * provably somebody else, so it could be approved and never closed: the
 * only way out was the owner merging a red pull request by hand, and one
 * such pull request sat open for a day, red, with nothing saying why.
 *
 * An attestation names the implementer and says where the name comes
 * from — a session record, a ticket, the person who was there. It does
 * not pretend Git says it: the line reads `attested by`, and a proposal
 * closed over one needs the owner's label on its pull request, so the
 * decision the owner always had is taken in the open instead of by
 * pushing a red merge button.
 */
import {
	ATTESTED_BY_MARK,
	MIN_ATTESTATION_EVIDENCE_LENGTH,
	UNRECORDED_IMPLEMENTER,
} from '../contracts/constants/review-attribution.constant';
import type { IAttestation } from '../contracts/interfaces/attestation.interface';

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The block of one slice: its heading, then everything up to the next heading. */
const sliceBlock = (sliceId: string): RegExp =>
	new RegExp(
		`(^### ${/^[sS]\d+$/u.test(sliceId) ? `[sS]${sliceId.slice(1)}` : escapeRegExp(sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
		'mu',
	);

const IMPLEMENTER_LINE = /^- review-implementer:\s*(\S+)[^\n]*$/mu;
const ATTRIBUTION_LINE = /^- review-attribution:[^\n]*$/mu;
const ATTESTED_LINE = new RegExp(
	`^- review-attribution:\\s*\\S+\\s+${ATTESTED_BY_MARK}\\s`,
	'mu',
);

/**
 * The proposal with the slice's implementer attested, or why not. Only a
 * slice reviewed as unrecorded takes one: where Git or a submitter
 * already names somebody, an attestation would be a second opinion.
 */
export const attestImplementer = (
	markdown: string,
	sliceId: string,
	attestation: IAttestation,
):
	| { readonly ok: true; readonly markdown: string }
	| { readonly ok: false; readonly reason: string } => {
	const implementer = attestation.implementer.trim();
	const evidence = attestation.evidence.trim().replaceAll(/\s+/gu, ' ');
	if (
		implementer === '' ||
		implementer.toLowerCase() === UNRECORDED_IMPLEMENTER
	) {
		return {
			ok: false,
			reason: `an attestation names who delivered the slice; "${UNRECORDED_IMPLEMENTER}" is what it replaces`,
		};
	}
	if (/\s/u.test(implementer)) {
		return {
			ok: false,
			reason: 'the implementer is one name, without spaces',
		};
	}
	if (evidence.length < MIN_ATTESTATION_EVIDENCE_LENGTH) {
		return {
			ok: false,
			reason: 'an attestation says where the name comes from — a session record, a ticket, who was there — in a sentence a reader can check',
		};
	}
	const match = sliceBlock(sliceId).exec(markdown);
	if (match === null) {
		return { ok: false, reason: `slice "${sliceId}" was not found` };
	}
	const [whole, heading = '', body = ''] = match;
	const recorded = IMPLEMENTER_LINE.exec(body)?.[1];
	if (recorded === undefined) {
		return {
			ok: false,
			reason: `slice "${sliceId}" has no review round: it is reviewed first, and attested only if that finds nobody to name`,
		};
	}
	if (recorded.toLowerCase() !== UNRECORDED_IMPLEMENTER) {
		return {
			ok: false,
			reason: `slice "${sliceId}" already names its implementer, ${recorded}; an attestation is only for work nobody could be named for`,
		};
	}
	const line = `- review-attribution: ${implementer} ${ATTESTED_BY_MARK} ${attestation.attestedBy.trim()} — ${evidence}`;
	const named = body.replace(
		IMPLEMENTER_LINE,
		`- review-implementer: ${implementer}`,
	);
	const attested = ATTRIBUTION_LINE.test(named)
		? named.replace(ATTRIBUTION_LINE, () => line)
		: `${named.replace(/\n*$/u, '')}\n${line}\n`;
	return {
		ok: true,
		markdown: markdown.replace(whole, () => `${heading}${attested}`),
	};
};

/** The slices whose implementer is attested rather than named by Git. */
export const attestedSlices = (markdown: string): readonly string[] =>
	markdown
		.split(/^### /mu)
		.slice(1)
		.filter((block) => ATTESTED_LINE.test(block))
		.map((block) => (block.split('\n')[0] ?? '').trim());
