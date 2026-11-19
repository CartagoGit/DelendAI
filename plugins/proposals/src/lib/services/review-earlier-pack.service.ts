/**
 * review-earlier-pack.service.ts — one agent, one pack at a time.
 */
import { compileWorkRefParser } from '@delendai/core/public';

import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import { unitOfRef } from './review-claims.service';

/**
 * The agent's first review unit, when it is not this one and still holds
 * verdicts nobody has published: a unit with commits over the integration
 * branch that change a proposal document. A second unit of one agent is
 * a second pack, and its verdicts conflict with the first one's when
 * either lands. `undefined` when this is the first unit or none holds any.
 */
export const earlierPackWithVerdicts = async (
	run: IGitRunner,
	shape: IWorkRefShape,
	current: { readonly unit?: string; readonly agent?: string },
	integration: string,
): Promise<string | undefined> => {
	if (current.agent === undefined) return undefined;
	const parser = compileWorkRefParser(
		shape.workRefTemplate,
		shape.workRefPrefix,
	);
	const listed = await run([
		'for-each-ref',
		'--sort=creatordate',
		'--format=%(refname)',
		`refs/heads/${shape.workRefPrefix.replace(/^(refs\/)?(heads\/)?/u, '')}`,
	]);
	if (!listed.ok) return undefined;
	for (const ref of listed.output.split('\n')) {
		const unit = unitOfRef(ref.trim(), shape);
		if (unit === undefined) continue;
		const identity = parser?.parse(unit);
		if (identity?.kind !== 'review' || identity.agent !== current.agent) {
			continue;
		}
		// The oldest of the agent's packs that holds a verdict is the one
		// the others wait for; if that is this one, claiming goes on.
		const written = await run([
			'log',
			'-1',
			'--format=%H',
			ref.trim(),
			'--not',
			integration,
			'--',
			':(glob,icase)**/proposals/**/*.md',
		]);
		if (!written.ok || written.output.trim().length === 0) continue;
		return unit === current.unit ? undefined : unit;
	}
	return undefined;
};
