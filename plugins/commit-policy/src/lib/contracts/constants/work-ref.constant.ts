/**
 * work-ref.constant.ts — limits and the input schema of `commit_policy_work_ref`.
 */
import z from 'zod';

export const WORK_REF_ID_MAX_LENGTH = 200;
export const WORK_REF_PATH_MAX_LENGTH = 1000;
/** Hex length of a SHA-1 git object id. */
export const SHA1_HEX_LENGTH = 40;
/** Hex length of a SHA-256 git object id. */
export const SHA256_HEX_LENGTH = 64;
/** A git object id in either hash format. */
export const COMMIT_SHA_PATTERN = new RegExp(
	`^[0-9a-f]{${SHA1_HEX_LENGTH},${SHA256_HEX_LENGTH}}$`,
	'u',
);
/** Tree-entry mode git uses for a symbolic link. */
// Git modes are octal; spelling them that way keeps the value exact.
export const GIT_SYMLINK_MODE = (0o120000).toString(8);
/** Mode suffix git uses for an executable blob (`100755`). */
export const GIT_EXECUTABLE_MODE_SUFFIX = (0o755).toString(8);
/** Upper bound for a blob read through `git cat-file`: 128 MiB. */
export const GIT_BLOB_MAX_BUFFER_BYTES = 128 * 1024 * 1024;

const ID = z.string().trim().min(1).max(WORK_REF_ID_MAX_LENGTH);
const PATH = z.string().trim().min(1).max(WORK_REF_PATH_MAX_LENGTH);

export const WORK_REF_INPUT_SCHEMA = z
	.object({
		action: z.enum(['checkpoint', 'materialize', 'recover']),
		proposal: ID,
		slice: ID,
		generation: z.number().int().positive().max(1_000_000),
		topic: ID.optional(),
		paths: z.array(PATH).min(1).max(10_000),
		message: z.string().trim().min(1).max(20_000).optional(),
		commit: z.string().regex(COMMIT_SHA_PATTERN).optional(),
		cleanAfterCheckpoint: z.boolean().optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.action === 'checkpoint' && value.message === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['message'],
				message: 'message is required for checkpoint',
			});
		}
		if (
			value.action !== 'checkpoint' &&
			value.cleanAfterCheckpoint === true
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['cleanAfterCheckpoint'],
				message: 'cleanAfterCheckpoint is valid only for checkpoint',
			});
		}
		if (value.action === 'recover' && value.commit === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['commit'],
				message: 'commit is required for recovery',
			});
		}
	});
