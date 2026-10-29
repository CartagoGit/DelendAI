/**
 * maintenance-lease.constant.ts — how long a maintainer's lease lasts
 * without a heartbeat, and where it is kept.
 */

/** A holder silent this long has left; another server takes over. */
export const MAINTENANCE_LEASE_TTL_MS = 180_000;

/** The holder renews three times per lease, so one slow beat loses nothing. */
export const MAINTENANCE_LEASE_HEARTBEAT_MS = 60_000;

/** The lease file, under the workspace's cache, beside the startup lock. */
export const MAINTENANCE_LEASE_FILE = 'startup/maintainer.lease';
