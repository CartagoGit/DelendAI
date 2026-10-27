/**
 * host-byok.constant.ts — where an editor of the VS Code family keeps the
 * BYOK providers of each profile, and how it names the profile a
 * workspace opens in.
 */

/** The file, in a user directory or one of its profiles, listing the BYOK providers. */
export const HOST_BYOK_FILE = 'chatLanguageModels.json';

/** The folder of the user directory holding one folder per profile. */
export const HOST_PROFILES_FOLDER = 'profiles';

/** The editor's global state, naming each profile and which workspace opens in which. */
export const HOST_GLOBAL_STORAGE_FILE = 'globalStorage/storage.json';

/** How the editor names the user directory's own profile in its associations. */
export const HOST_DEFAULT_PROFILE = '__default__profile__';

/** The profile name delendai gives the user directory's own profile. */
export const DEFAULT_PROFILE_FOLDER = 'default';
