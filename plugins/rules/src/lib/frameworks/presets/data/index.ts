import type { IRulePreset } from '../../contracts';

import { RUST_PRESET } from './rust';

/**
 * Composition root for the plugin's preset DATA.
 *
 * Single Responsibility: this file's only job is to list every
 * preset shipped today. The `data/<lang>.ts` files are DATA
 * only (no logic); this file is the only place that knows the
 * full set.
 *
 * Adding a preset: add one entry in `data/<lang>.ts`, then add
 * one line here. The `PresetRegistry` consumes this list; no
 * other file changes.
 */
export const ALL_PRESET_DATA: readonly IRulePreset[] = [RUST_PRESET];
