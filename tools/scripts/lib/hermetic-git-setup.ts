/**
 * hermetic-git-setup.ts — no git a test spawns reads the machine's own
 * configuration.
 *
 * The guard compares a commit's author with the identity the repository
 * is configured with, and that includes the global one (x00698). A spec
 * that commits as `Facts <facts@example.com>` passed in CI, which has no
 * global identity, and failed on every machine that has one. What a test
 * observes must not depend on who runs it, so every git it spawns sees
 * neither `~/.gitconfig` nor `/etc/gitconfig`, exactly as CI does. A spec
 * that needs a global config points `GIT_CONFIG_GLOBAL` at its own file.
 */
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

export {};
