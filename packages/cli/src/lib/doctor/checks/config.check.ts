import { parseJsonc } from '@delendai/core/cli';

import type { DoctorCheck } from '../types';

export const checkConfig: DoctorCheck = async ({ fs }) => {
	const path = 'delendai.config.json';
	const text = await fs.readFile(path);
	if (text === undefined) {
		return {
			name: 'config',
			status: 'warn',
			findings: [`${path} not found; server defaults are active`],
		};
	}
	// The file `init` writes carries a comment above every plugin, and the
	// server reads it as JSONC; judging it as strict JSON called every
	// freshly initialised project broken.
	return parseJsonc(text).errors.length === 0
		? {
				name: 'config',
				status: 'ok',
				findings: [`${path} is valid JSON (comments allowed)`],
			}
		: {
				name: 'config',
				status: 'warn',
				findings: [`${path} is not valid JSON`],
			};
};
