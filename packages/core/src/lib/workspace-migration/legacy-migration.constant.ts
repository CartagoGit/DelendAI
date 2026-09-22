/** Constants for `./legacy-migration.service`. */

/**
 * What makes a directory a delendai workspace.
 *
 * Deliberately short. Adoption has to be a thing somebody DID — a
 * configuration file they wrote, or a runtime directory a previous
 * adoption created — never something inferred from a repository looking
 * vaguely similar. The cost of guessing wrong is writing to files in a
 * project that never asked for any of this.
 */
export const ADOPTION_MARKERS = ['delendai.config.json', '.delendai'] as const;
