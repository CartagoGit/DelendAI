/**
 * agents-lock.constants.ts — x00155 S2 / x00153 S5.
 *
 * Single source of truth for the additional durable state files that
 * the agent-lock engine writes alongside `agents.lock.json`. Today
 * that means the cross-process release audit log; future additions
 * (e.g. heartbeat ages, gc events) belong here too.
 *
 * The release audit log is append-only: every `release` action that
 * detects a caller-host mismatch (the live caller's `(host, pid)`
 * differs from the recorded `(host, pid)` in the `in_flight` entry)
 * records one JSONL line so an operator can grep the file to see
 * the host-restart pattern in production.
 *
 * The log lives next to `agents.lock.json` so all lock state is
 * colocated under `.cache/delendai/`.
 */
import { join } from 'node:path';

/** Cross-process release audit log. One JSONL line per force-release. */
export const RELEASE_AUDIT_LOG_RELATIVE_PATH = join(
	'.cache',
	'delendai',
	'agents.lock.releases.jsonl',
);
