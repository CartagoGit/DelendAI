---
id: x01054
title: "A merge never leaves a proposal twice, and a claim never leaves its old pull request open"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-08
---

# x01054 — A merge never leaves a proposal twice, and a claim never leaves its old pull request open

## goal

Two defects seen on 2026-11-08. (1) A merge train carried a create PR (ready/ copy) together with the slices that moved the proposal to review/, so develop held the same proposal id in two folders; the registry refused the duplicate and every transition failed until a hand fix. (2) work claim on an ended unit opens a new generation and a new PR but leaves the old PR open (#1858, #1859, #1860).

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
