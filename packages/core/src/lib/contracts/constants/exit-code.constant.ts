export const EXIT_CODE = {
	OK: 0,
	USAGE: 2,
	NOT_FOUND: 3,
	VALIDATION: 4,
	RUNTIME: 5,
	REMOTE: 6,
	INTERNAL: 70,
} as const;

export type { IExitCode } from '../interfaces/exit-code.interface';
