/**
 * rehearsal-graphql.helper.ts — the `gh api graphql` arguments of one request
 * that applies a pull request mutation to several pull requests, one alias
 * each, so the forge handles them as a single request.
 */
export const markArgs = (
	mutation: string,
	ids: readonly string[],
): readonly string[] => {
	const vars = ids.map((_id, i) => `$i${String(i)}: ID!`).join(', ');
	const calls = ids
		.map(
			(_id, i) =>
				`m${String(i)}: ${mutation}(input: {pullRequestId: $i${String(i)}}) { clientMutationId }`,
		)
		.join(' ');
	return [
		'api',
		'graphql',
		'-f',
		`query=mutation(${vars}) { ${calls} }`,
		...ids.flatMap((id, i) => ['-f', `i${String(i)}=${id}`]),
	];
};
