/**
 * Portable checkpoint packet construction.
 *
 * A host lifecycle hook cannot safely inspect or summarise a conversation.
 * It can, however, rehydrate the last explicit memory digest. This module
 * turns that digest into a bounded packet with the two continuation signals a
 * new context needs: pointers and the next open action.
 */
import { redactSecrets } from './redact';
import type { ISessionDigestSelection } from '../contracts/interfaces/session-digest-recall.interface';

const DEFAULT_MAX_DIGEST_CHARS = 4_000;
const MAX_POINTERS = 20;
const MAX_SIGNAL_CHARS = 400;

export interface ICheckpointPacket {
	/** Redacted digest, bounded so rehydration cannot become another long tail. */
	readonly digest: string;
	readonly pointers: readonly string[];
	readonly nextAction: string | null;
}

const bounded = (value: string, maximum: number): string => {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maximum) return normalized;
	return `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
};

const bulletsInSection = (digest: string, heading: string): string[] => {
	const lines = digest.split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
	if (start < 0) return [];
	const end = lines.findIndex(
		(line, index) => index > start && line.startsWith('## '),
	);
	return lines
		.slice(start + 1, end < 0 ? undefined : end)
		.filter((line) => line.startsWith('- '))
		.map((line) => bounded(line.slice(2), MAX_SIGNAL_CHARS));
};

/**
 * Construct the host-independent continuation contract from the newest
 * session digest. The persisted note is redacted again defensively: legacy
 * notes may predate the current write-path redaction policy.
 */
export const buildCheckpointPacket = (
	digest: ISessionDigestSelection,
	maxDigestChars = DEFAULT_MAX_DIGEST_CHARS,
): ICheckpointPacket => {
	const { text: redactedDigest } = redactSecrets(digest.body);
	const maximum = Math.max(1, Math.floor(maxDigestChars));
	return {
		digest:
			redactedDigest.length > maximum
				? `${redactedDigest.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`
				: redactedDigest,
		pointers: bulletsInSection(redactedDigest, 'Pointers').slice(
			0,
			MAX_POINTERS,
		),
		nextAction: bulletsInSection(redactedDigest, 'Open')[0] ?? null,
	};
};

export const DEFAULT_CHECKPOINT_PACKET_MAX_DIGEST_CHARS =
	DEFAULT_MAX_DIGEST_CHARS;
