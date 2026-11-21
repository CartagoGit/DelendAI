/**
 * doctor/checks/deps.check.ts — the project's own dependency lockfile.
 *
 * The package manager is the project's choice: any of bun, npm, pnpm or
 * yarn counts. A project without a `package.json` has no JavaScript
 * dependencies to lock, and one that declares none needs no lockfile.
 */
import { parsePackageJson, notApplicable } from '../applicability';
import type { DoctorCheck } from '../types';

const LOCKFILES: readonly (readonly [file: string, manager: string])[] = [
	['bun.lock', 'bun'],
	['bun.lockb', 'bun'],
	['package-lock.json', 'npm'],
	['npm-shrinkwrap.json', 'npm'],
	['pnpm-lock.yaml', 'pnpm'],
	['yarn.lock', 'yarn'],
];

const declaresDependencies = (pkg: Record<string, unknown>): boolean =>
	['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => {
		const value = pkg[key];
		return (
			typeof value === 'object' &&
			value !== null &&
			Object.keys(value).length > 0
		);
	});

export const checkDeps: DoctorCheck = async ({ fs }) => {
	const raw = await fs.readFile('package.json');
	if (raw === undefined) {
		return notApplicable(
			'deps',
			'not applicable: no package.json, so there are no JavaScript dependencies to lock',
		);
	}
	const pkg = parsePackageJson(raw);
	if (pkg === undefined) {
		return {
			name: 'deps',
			status: 'warn',
			findings: ['package.json is not parseable; lockfile check skipped'],
		};
	}
	for (const [file, manager] of LOCKFILES) {
		if (await fs.fileExists(file)) {
			return {
				name: 'deps',
				status: 'ok',
				findings: [`${file} is present (${manager})`],
			};
		}
	}
	if (!declaresDependencies(pkg)) {
		return {
			name: 'deps',
			status: 'ok',
			findings: [
				'package.json declares no dependencies; no lockfile needed',
			],
		};
	}
	return {
		name: 'deps',
		status: 'warn',
		findings: [
			`no lockfile found (${LOCKFILES.map(([file]) => file).join(', ')}); install dependencies to create one`,
		],
	};
};
