/**
 * work-ref-mention.ts — find a unit of work named in free text, and
 * decode it the way the project names its units (x00646).
 *
 * Who delivered a commit is written down in several places, and none of
 * them has one fixed phrasing: the engine's trailer on the checkpoint
 * (`<key>: refs/heads/<work ref>`), and the merge that brought it in,
 * which every forge words its own way — `Merge pull request #7 from
 * owner/<ref>`, `Merge branch '<ref>' into 'develop'`, `Merged in <ref>
 * (pull request #7)`, `Merge remote-tracking branch 'origin/<ref>'`.
 * What they share is the ref itself. So instead of recognising
 * phrasings, this looks for any token that is one of the project's own
 * work or publication refs and decodes it with the project's own
 * `workRefTemplate` — wherever that template puts the agent.
 */
import { ownedParserOf, ownedPrefixPairs } from './review-claims.service';

import type {
	IWorkRefMention,
	IWorkRefShape,
} from '../contracts/interfaces/review-attribution.interface';

/** Characters a ref name may carry; anything else ends the token. */
// `+` joins the parts of a scope set (`x01003-S1+S4`).
const REF_TOKEN_RE = /[A-Za-z0-9._+\-/]+/gu;

/** Every place in `token` where `prefix` starts a path component. */
const componentStarts = (token: string, prefix: string): number[] => {
	const starts: number[] = [];
	for (
		let index = token.indexOf(prefix);
		index !== -1;
		index = token.indexOf(prefix, index + 1)
	) {
		if (index === 0 || token[index - 1] === '/') starts.push(index);
	}
	return starts;
};

/**
 * The first unit of work `text` names, or `undefined`.
 *
 * A publication ref is the work ref with its in-progress segment swapped
 * (the publisher derives it that way), so it is mapped back before
 * decoding. A token the template does not accept names nobody: guessing
 * an agent out of a topic would be inventing one.
 */
export const findWorkRefMention = (
	text: string,
	shape: IWorkRefShape,
): IWorkRefMention | undefined => {
	const parser = ownedParserOf(shape);
	// Longest prefix first: `delendai/wip/` before the `wip/` inside it.
	const pairs = [...ownedPrefixPairs(shape)].sort(
		(a, b) => b.work.length - a.work.length,
	);
	if (parser === undefined || pairs.every(({ work }) => work.length === 0)) {
		return undefined;
	}
	for (const [token] of text.matchAll(REF_TOKEN_RE)) {
		// Every owned namespace: a unit named under a former one still names
		// its agent, so a reviewer cannot approve what they wrote (f00808).
		const candidates = pairs.flatMap(({ work, publication }) => [
			...(work.length === 0
				? []
				: componentStarts(token, work).map((at) => token.slice(at))),
			...(publication.length === 0 || work.length === 0
				? []
				: componentStarts(token, publication).map(
						(at) =>
							`${work}${token.slice(at + publication.length)}`,
					)),
		]);
		for (const candidate of candidates) {
			const ref = `refs/heads/${candidate.replace(/[.]+$/u, '')}`;
			const identity = parser.parse(ref);
			if (identity !== undefined && identity.agent.length > 0) {
				return {
					ref,
					agent: identity.agent,
					proposal: identity.proposal,
					slice: identity.slice,
				};
			}
		}
	}
	return undefined;
};
