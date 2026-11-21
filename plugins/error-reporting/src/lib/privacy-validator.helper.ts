import type { ISafeDelendaiReport } from './contracts/interfaces/reporter.interface';
import type { IPrivacyValidationResult } from './contracts/interfaces/privacy-validator.interface';

const MAX_SAFE_STRING_LENGTH = 240;
const UUID_TAIL_HEX_LENGTH = 12;

// PRIV-002 SET START — the canonical list of classes the privacy
// validator refuses by construction. Each entry is one of the
// regex / literal constants immediately below this marker, paired
// with its `stringReason` short code. The regression test in
// `plugins/error-reporting/tests/src/lib/privacy-validator.spec.ts`
// reads the count of these entries to assert no new heuristic has
// slipped in (lint `privacy-validator-no-expansion` blocks the
// obvious bypass). Update this list when adding a legitimate class;
// do not add heuristic / "looks like a company name" stopwords —
// provenance (Track B) is the only sanctioned way to keep private
// data out of the DTO.
export const PRIVACY_VALIDATOR_BLOCKED_CLASSES = [
	'absolute-path',
	'windows-path',
	'url-not-allowlisted',
	'email',
	'ip-address',
	'uuid',
	'token',
	'git-metadata',
	'branch-name',
	'json-fragment',
	'xml-fragment',
	'sql-fragment',
] as const;
export type IPrivacyValidatorBlockedClass =
	(typeof PRIVACY_VALIDATOR_BLOCKED_CLASSES)[number];
// PRIV-002 SET END

const ABSOLUTE_UNIX_PATH =
	/(^|[\s(])\/(Users|home|srv|opt|tmp|var|mnt|private|etc|proc|dev)\//i;
const WINDOWS_PATH =
	/[A-Za-z]:\\(?:Users|Documents and Settings|Windows|Program Files)\\/;
const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IPV6 = /\b(?:[A-F0-9]{1,4}:){2,}[A-F0-9:]{1,4}\b/i;
const UUID = new RegExp(
	`\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{${UUID_TAIL_HEX_LENGTH}}\\b`,
	'i',
);
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/;
const AUTHORIZATION = /\b(?:authorization|bearer|token)\b/i;
const DOT_GIT = /(^|[\s/])\.git([\s/]|$)/i;
const GIT_BRANCH =
	/\b(?:refs\/heads\/|origin\/|feature\/|bugfix\/|hotfix\/|release\/)[^\s]+/i;
const JSON_LIKE = /^\s*[{[].*[\]}]\s*$/s;
const XML_LIKE = /<\?xml|<[^>]+>/i;
const SQL_LIKE =
	/\b(select|insert|update|delete|drop|alter|truncate|create table|from)\b/i;

const isAllowlistedUrl = (value: string): boolean => {
	const urls = value.match(URL_PATTERN) ?? [];
	if (urls.length === 0) return true;
	return urls.every((entry) => {
		try {
			const url = new URL(entry);
			return (
				url.hostname === 'example.com' ||
				url.hostname === 'example.invalid'
			);
		} catch {
			return false;
		}
	});
};

const stringReason = (value: string): string | undefined => {
	if (value.length > MAX_SAFE_STRING_LENGTH) return 'string-too-long';
	if (ABSOLUTE_UNIX_PATH.test(value)) return 'absolute-path';
	if (WINDOWS_PATH.test(value)) return 'windows-path';
	if (!isAllowlistedUrl(value)) return 'url-not-allowlisted';
	if (EMAIL.test(value)) return 'email';
	if (IPV4.test(value) || IPV6.test(value)) return 'ip-address';
	if (UUID.test(value)) return 'uuid';
	if (JWT.test(value) || AUTHORIZATION.test(value)) return 'token';
	if (DOT_GIT.test(value)) return 'git-metadata';
	if (GIT_BRANCH.test(value)) return 'branch-name';
	if (JSON_LIKE.test(value)) return 'json-fragment';
	if (XML_LIKE.test(value)) return 'xml-fragment';
	if (SQL_LIKE.test(value)) return 'sql-fragment';
	return undefined;
};

const validateLeaf = (value: unknown): string | undefined => {
	if (typeof value === 'string') return stringReason(value);
	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value === null ||
		value === undefined
	) {
		return undefined;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const reason = validateLeaf(entry);
			if (reason !== undefined) return reason;
		}
		return undefined;
	}
	if (typeof value === 'object') {
		for (const entry of Object.values(value)) {
			const reason = validateLeaf(entry);
			if (reason !== undefined) return reason;
		}
		return undefined;
	}
	return 'unsupported-scalar';
};

export const validateSafeReport = (
	report: ISafeDelendaiReport,
): IPrivacyValidationResult => {
	if (!report.packageId.startsWith('@delendai/')) {
		return { ok: false, reasonCode: 'package-id' };
	}
	if (report.mcpFrames.length === 0) {
		return { ok: false, reasonCode: 'missing-frames' };
	}
	for (const frame of report.mcpFrames) {
		if (!frame.file.startsWith('@delendai/')) {
			return { ok: false, reasonCode: 'unsafe-frame' };
		}
	}
	const leafReason = validateLeaf(report);
	if (leafReason !== undefined) {
		return { ok: false, reasonCode: leafReason };
	}
	return { ok: true };
};

export const validateSerializedSafeReport = (
	serialized: string,
): IPrivacyValidationResult => {
	if (serialized.length > 16_384) {
		return { ok: false, reasonCode: 'serialized-too-long' };
	}
	if (ABSOLUTE_UNIX_PATH.test(serialized)) {
		return { ok: false, reasonCode: 'absolute-path' };
	}
	if (WINDOWS_PATH.test(serialized)) {
		return { ok: false, reasonCode: 'windows-path' };
	}
	if (!isAllowlistedUrl(serialized)) {
		return { ok: false, reasonCode: 'url-not-allowlisted' };
	}
	if (EMAIL.test(serialized)) return { ok: false, reasonCode: 'email' };
	if (IPV4.test(serialized) || IPV6.test(serialized)) {
		return { ok: false, reasonCode: 'ip-address' };
	}
	if (UUID.test(serialized)) return { ok: false, reasonCode: 'uuid' };
	if (JWT.test(serialized) || AUTHORIZATION.test(serialized)) {
		return { ok: false, reasonCode: 'token' };
	}
	if (DOT_GIT.test(serialized))
		return { ok: false, reasonCode: 'git-metadata' };
	if (GIT_BRANCH.test(serialized)) {
		return { ok: false, reasonCode: 'branch-name' };
	}
	return { ok: true };
};
