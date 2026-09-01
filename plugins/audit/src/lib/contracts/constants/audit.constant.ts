/**
 * Shared constants for the audit parser. Repo convention: exported
 * SCREAMING_SNAKE constants live under `contracts/constants/` so the
 * `types-in-contracts` ratchet keeps operational modules free of inline
 * literals.
 */

/** Length of the `DD-MM-YYYY` prefix that opens an audit filename. */
export const DATE_PREFIX_LENGTH = 10;
