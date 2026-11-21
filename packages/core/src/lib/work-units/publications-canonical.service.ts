/**
 * publications-canonical.service.ts — every published ref is shaped like
 * the work it published, under every owned namespace (f00808).
 */
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import { workRefTailSegments } from '../development-policy/work-ref-placeholders';

/**
 * The shape is the policy's own work-ref template, which the publication
 * ref repeats under its prefix: the count of components is read from it,
 * so a component added to the template (as `kind` was) cannot leave this
 * check judging the old shape.
 */
export const publicationsCanonicalInvariant = (input: {
	readonly heads: readonly string[];
	/** Every owned publication prefix, current first. */
	readonly prefixes: readonly string[];
	readonly template: string;
}): IInvariantResult => {
	const [current = ''] = input.prefixes;
	const published = input.heads.filter((ref) =>
		input.prefixes.some(
			(prefix) => prefix.length > 0 && ref.startsWith(prefix),
		),
	);
	const expectedSegments = workRefTailSegments(input.template);
	const misshapen =
		expectedSegments === 0
			? []
			: published.filter((ref) => {
					const own = input.prefixes.find((prefix) =>
						ref.startsWith(prefix),
					);
					const tail = ref.slice((own ?? current).length);
					return tail.split('/').length !== expectedSegments;
				});
	return {
		scope: 'forge',
		id: 'publications-canonical',
		claim: 'every publication ref carries agent, slice and generation',
		holds: misshapen.length === 0,
		observed:
			published.length === 0
				? 'no publication refs'
				: misshapen.length === 0
					? `${String(published.length)} ref(s), all canonical`
					: `${String(misshapen.length)} flat: ${misshapen.slice(0, 3).join(', ')}`,
		remedy: `give ${current}<name> the agent, slice and generation segments (or delete the flat ref), then publish the unit again with \`delendai work publish\``,
	};
};
