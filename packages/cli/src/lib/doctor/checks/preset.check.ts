import { describeRetiredPresetMatch, parseJsonc } from '@delendai/core/cli';

import type { DoctorCheck } from '../types';

const CONFIG_FILE = 'delendai.config.json';

/**
 * Says when the plugin map of `delendai.config.json` equals a retired
 * preset and which pack replaces it. Reports only; changes nothing.
 */
export const checkPreset: DoctorCheck = async ({ fs }) => {
	const text = await fs.readFile(CONFIG_FILE);
	const parsed = text === undefined ? undefined : parseJsonc(text);
	const plugins =
		parsed !== undefined &&
		parsed.errors.length === 0 &&
		typeof parsed.value === 'object' &&
		parsed.value !== null
			? (parsed.value as { plugins?: Record<string, never> }).plugins
			: undefined;
	if (plugins === undefined) {
		return {
			name: 'preset',
			status: 'ok',
			findings: [`${CONFIG_FILE} has no plugin map to compare`],
		};
	}
	const finding = describeRetiredPresetMatch(plugins);
	return finding === undefined
		? {
				name: 'preset',
				status: 'ok',
				findings: ['the plugin map matches no retired preset'],
			}
		: { name: 'preset', status: 'warn', findings: [finding] };
};
