/**
 * repository-identity.constant.ts — b00239.
 *
 * Where this project lives, declared once.
 *
 * It was declared in at least ten places: `DEFAULT_TARGET_REPO` in
 * error-reporting, three `repository.url` manifest fields, the shared-UI
 * strings, and half a dozen CI and generator scripts — 227 occurrences
 * across 119 files. Renaming the repository would have meant finding every
 * one of them, and the ones nobody found would keep pointing at a slug
 * that only survives because GitHub redirects.
 *
 * A rename is a single edit here. `lint:repository-identity` proves that
 * no source file kept a private copy, which is the half that makes the
 * single edit trustworthy.
 *
 * ## Why a constant rather than reading the git remote
 *
 * Some of these values are about OUR repository specifically — where a bug
 * report goes, which repo CI health-checks — and they must stay correct
 * inside a published package running in somebody else's checkout, where
 * the local remote points somewhere else entirely. Deriving from the
 * remote would silently retarget an adopter's bug reports at their own
 * repository. A declaration cannot make that mistake.
 */

/** The account or organisation that owns the repository. */
export const REPOSITORY_OWNER = 'CartagoGit';

/**
 * The repository name.
 *
 * This is the value a rename changes. Everything else in this file is
 * derived from it, and every consumer imports the derivation rather than
 * rebuilding the string.
 */
export const REPOSITORY_NAME = 'delendai';

/** `owner/name`, the form GitHub APIs and `gh` take. */
export const REPOSITORY_SLUG = `${REPOSITORY_OWNER}/${REPOSITORY_NAME}`;

/** Canonical browser URL. */
export const REPOSITORY_URL = `https://github.com/${REPOSITORY_SLUG}`;

/** Clone URL in the form `package.json#repository.url` expects. */
export const REPOSITORY_GIT_URL = `git+${REPOSITORY_URL}.git`;

/** Where issues are filed. */
export const REPOSITORY_ISSUES_URL = `${REPOSITORY_URL}/issues`;
