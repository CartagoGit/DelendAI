import { toolError, toolOk } from '@mcp-vertex/core/public';

import type { IGithubClientTier } from '../contracts';

const GITHUB_CLIENT_NEXT_ACTION =
	'Check repo configuration / network connectivity / gh auth status.';

type TCollectionField = 'issues' | 'alerts' | 'advisories';

export const githubTieredCollectionOk = <
	TField extends TCollectionField,
	TItem,
>(
	field: TField,
	items: readonly TItem[],
	tier: IGithubClientTier,
) =>
	toolOk({
		[field]: [...items],
		tier,
	} as { readonly tier: IGithubClientTier } & Record<
		TField,
		readonly TItem[]
	>);

export const githubClientToolError = (error: unknown) =>
	toolError(
		error instanceof Error ? error.message : String(error),
		GITHUB_CLIENT_NEXT_ACTION,
	);
