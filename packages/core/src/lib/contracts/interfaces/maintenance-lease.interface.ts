/**
 * maintenance-lease.interface.ts — which server process maintains a
 * workspace, and whether this one may.
 */

/** What the lease file says. */
export interface IMaintenanceLeaseRecord {
	/**
	 * Who holds it: machine, process and a nonce drawn at boot. Never an
	 * agent's name: several sessions of one model, or one model's servers
	 * on two machines, are each their own holder.
	 */
	readonly holder: string;
	readonly machineId: string;
	readonly pid: number;
	/** Milliseconds since the epoch at the last heartbeat. */
	readonly renewedAt: number;
}

export interface IMaintenanceLeaseOptions {
	/** The lease file, one per workspace. */
	readonly path: string;
	readonly machineId: string;
	readonly pid?: number | undefined;
	/** Drawn once per process; tests name it. */
	readonly nonce?: string | undefined;
	readonly now?: (() => number) | undefined;
	readonly ttlMs?: number | undefined;
	/** Whether a process on this machine is alive; signal 0 by default. */
	readonly isAlive?: ((pid: number) => boolean) | undefined;
}

export interface IMaintenanceLease {
	/** This process's holder name. */
	readonly self: string;
	/** Take the lease or renew it; whether this process holds it now. */
	readonly hold: () => Promise<boolean>;
	/** Give it up, if this process holds it. */
	readonly release: () => Promise<void>;
	/** The live holder, if any. */
	readonly holder: () => Promise<IMaintenanceLeaseRecord | undefined>;
}

/** Whether this server maintains its workspace, as `status` reports it. */
export interface IMaintenanceStanding {
	readonly maintains: boolean;
	/** The process that does, when it is another one or nobody yet. */
	readonly maintainer?: string | undefined;
	/** Why this one does not, in a sentence. */
	readonly reason?: string | undefined;
}

/** One gate per server process for ref-changing background work. */
export interface IMaintenanceGate {
	/** Why this server must not maintain now, or `undefined` when it may. */
	readonly standDown: () => Promise<string | undefined>;
	/** Stop the heartbeat and give the lease up. */
	readonly stop: () => Promise<void>;
}

/**
 * A server's maintenance, as its host config carries it. The gate is made
 * on first use, by the first background step that asks, so a one-off
 * command that loads the same config never takes the lease.
 */
export interface IHostMaintenance {
	readonly gate: () => IMaintenanceGate;
	/** Who maintains, read without taking anything. */
	readonly observe: () => Promise<IMaintenanceStanding>;
	/** Stop the gate, if it was made. */
	readonly stop: () => Promise<void>;
}
