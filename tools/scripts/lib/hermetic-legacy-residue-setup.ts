/**
 * hermetic-legacy-residue-setup.ts — no spec migrates the machine's own host
 * configs.
 *
 * `init` and `doctor --fix` rewrite files under the person's home: a spec that
 * runs them would edit the developer's real config. The residue run is
 * switched off for every spec file; a spec that tests it passes its own
 * environment and its own files.
 */
process.env.DELENDAI_LEGACY_RESIDUE = '0';
