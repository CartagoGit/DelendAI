/**
 * batch-atomic-writer.spec.ts
 *
 * r00003 S11 (CONC-2): the scaffold tool used to write files one by
 * one with no batch-level mutex. Two concurrent scaffold calls could
 * observe each other's mid-batch state (a directory created but not
 * yet filled, a file written but not yet visible). With the
 * `IBatchAtomicWriter` abstraction the scaffold tool plans the whole
 * batch, takes a single mutex for the batch, and either commits or
 * rolls back — keeping concurrent scaffolds from interleaving.
 */
export {};
