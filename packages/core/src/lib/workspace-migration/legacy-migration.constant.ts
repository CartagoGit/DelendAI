/** Constants for `./legacy-migration.service`. */

import { DEFAULT_CACHE_AND_DOCS_RENAMES } from './migrators/cache-and-docs.migrator';

/**
 * What makes a directory a delendai workspace.
 *
 * Deliberately short. Adoption has to be a thing somebody DID — a
 * configuration file they wrote, or a runtime directory a previous
 * adoption created — never something inferred from a repository looking
 * vaguely similar. The cost of guessing wrong is writing to files in a
 * project that never asked for any of this.
 *
 * ## The old name counts as adoption, and has to
 *
 * A project still running `mcp-vertex` has no `delendai.config.json` and
 * no `.delendai/` — it has `mcp-vertex.config.json`. Under a marker list
 * that named only the new spellings it read as a stranger and was skipped
 * forever, which is to say the migration existed for exactly the
 * workspaces it could never reach.
 *
 * Somebody who wrote `mcp-vertex.config.json` adopted this product. They
 * adopted it under its previous name, which is the whole reason the
 * migration exists. That is a different thing from a repository that
 * merely looks similar, and the markers are read from the rename table so
 * the two lists cannot drift apart: whatever `cacheAndDocsMigrator`
 * knows how to migrate FROM is, by construction, a workspace this
 * product is allowed to heal.
 */
export const ADOPTION_MARKERS = [
	'delendai.config.json',
	'.delendai',
	...DEFAULT_CACHE_AND_DOCS_RENAMES.map((rename) => rename.from),
] as const;
