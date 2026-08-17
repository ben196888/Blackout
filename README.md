# PACE POC — BLACKOUT

A four-player hidden-information communication survival game built to test whether method-coverage planning and imperfect communication produce useful coordination decisions.

Implementation plan: [GitHub issue #1](https://github.com/ben196888/PACE-POC/issues/1).

## Development

Requires Node 24 and pnpm 11.15.1.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

The mandatory browser smoke uses four isolated browser contexts. It covers the thin Lobby REST flow, socket connection, Day 0 planning, credential-preserving refresh, the complete seven-night schedule, and the shared terminal outcome. Every main-branch release runs the same smoke locally, deploys the tested commit, then repeats it against Fly.

Four-human sessions must follow the private-log capture and verification checklist in [the trial runbook](docs/trial-runbook.md).

## Runtime limits

- boardgame.io is intentionally pinned to 0.50.2. It has not published a newer release since November 2022.
- Match state is held in memory. A deploy or process restart aborts every live match.
- Never deploy or restart the Fly Machine during a trial. Run the production smoke before players join, then freeze deployments until the outcome and log dump are complete.
- Production intentionally runs exactly one always-on Machine in `sin`; in-memory matches cannot be load-balanced across Machines.
- There are no spectators, timers, rematches, persistence, or development harness in the POC.
