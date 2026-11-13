/** How long a dequeued task belongs to its worker before it returns to the queue. */
export const TASK_QUEUE_DEFAULT_LEASE_MS = 30 * 60 * 1000;

/** How many live (queued or promoted) tasks the queue holds before enqueue refuses. */
export const TASK_QUEUE_DEFAULT_MAX_LIVE = 500;
