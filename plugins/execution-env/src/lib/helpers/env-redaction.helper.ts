import {
	DEFAULT_ALLOWED_ENV_NAMES,
	REDACTED_VALUE,
	SECRET_NAME_PATTERN,
} from '../contracts/constants/env-redaction.constant';
import type { IEnvRedactionPolicy } from '../contracts/interfaces/env-redaction.interface';
import type { IExecutionEnvVariables } from '../contracts/interfaces/execution-env-types.interface';

/** The policy used when a caller does not supply one. */
export const defaultEnvRedactionPolicy = (): IEnvRedactionPolicy => ({
	secretNamePattern: SECRET_NAME_PATTERN,
	allowNames: DEFAULT_ALLOWED_ENV_NAMES,
	placeholder: REDACTED_VALUE,
});

/**
 * Copy `source` with every secret-looking variable's value replaced.
 * Variables with no value are dropped: `undefined` is not an
 * environment value.
 */
export const redactEnvironment = (
	source: Readonly<Record<string, string | undefined>>,
	policy: IEnvRedactionPolicy = defaultEnvRedactionPolicy(),
): IExecutionEnvVariables => {
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(source)) {
		if (value === undefined) continue;
		const hidden =
			!policy.allowNames.includes(name) &&
			policy.secretNamePattern.test(name);
		out[name] = hidden ? policy.placeholder : value;
	}
	return out;
};
