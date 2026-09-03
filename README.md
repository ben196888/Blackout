# PACE POC — BLACKOUT

[![Verify and deploy](https://github.com/ben196888/Blackout/actions/workflows/release.yml/badge.svg)](https://github.com/ben196888/Blackout/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A four-player hidden-information communication survival game, built to test whether method-coverage planning and imperfect communication produce useful coordination decisions.

Four survivors are scattered across a village after a blackout. Each has private information, a private inventory, and a limited set of ways to reach the others — mobile data, voice, SMS, landline, mesh, walkie-talkie, and a village bulletin board. Every method has a different cost, payload cap, drop rate, and set of preconditions, and several require *both* parties to hold the same capability. Players spend Day 0 negotiating who covers which method, then live with those choices for seven nights while the world degrades around them.

The research question is not "is this fun". It is whether PACE-style method-coverage planning under imperfect communication produces coordination decisions worth studying.

> **Content note:** fictional disaster, food scarcity, starvation, and death.

## Status

Proof of concept. Scope is deliberately narrow and several omissions are intentional — see [Runtime limits](#runtime-limits). The implementation plan lives in [issue #1](https://github.com/ben196888/Blackout/issues/1).

## Quick start

Requires Node 24 and pnpm 11.15.1.

```sh
pnpm install
pnpm dev
```

Open the printed URL, create a match, and share the invite link with three other browser sessions. There is no single-player or bot mode: the game needs four seats.

## Verification

Every change must pass all four gates. CI runs the same ones.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

`pnpm smoke` is the mandatory browser smoke and needs Chromium:

```sh
pnpm exec playwright install --with-deps chromium
```

It drives four isolated browser contexts through the thin Lobby REST flow, socket connection, Day 0 planning, a credential-preserving refresh, the complete seven-night schedule, and the shared terminal outcome. Every main-branch release runs the same smoke locally, deploys the tested commit, then repeats it against the deployed app.

`pnpm shots` compares the lobby, Day 0 discussion, move, action and contact screens, an action toast, and the rules page reach explorer against the baselines in [`tests/e2e/__screenshots__/`](tests/e2e/__screenshots__), so an unintended visual change fails the build. It runs in a pinned Playwright image and needs Docker; see [CONTRIBUTING.md](CONTRIBUTING.md) for how to refresh the baselines.

## Layout

| Path | Contents |
| --- | --- |
| `src/game/` | Rules: actions, communication delivery, facilities, map, night schedule, setup |
| `src/server/` | Seat identity validation and in-memory match storage |
| `src/components/` | React surfaces: planning board, comms panel, map, outcome |
| `src/constants.ts` | The complete balance tuning surface |
| `tests/` | Unit tests plus the four-player Playwright smoke in `tests/e2e/` |
| `docs/trial-runbook.md` | Procedure for running a four-human trial |

## Running a trial

Four-human sessions must follow the private-log capture and verification checklist in [the trial runbook](docs/trial-runbook.md). Trial log dumps contain player-authored message text and private authoritative delivery outcomes; they stay local and are never committed or attached to a public issue.

## Runtime limits

- boardgame.io is intentionally pinned to 0.50.2. It has not published a newer release since November 2022.
- Match state is held in memory. A deploy or process restart aborts every live match.
- Never deploy or restart the production machine during a trial. Run the production smoke before players join, then freeze deployments until the outcome and log dump are complete.
- Production intentionally runs exactly one always-on Machine in `sin`; in-memory matches cannot be load-balanced across Machines.
- There are no spectators, timers, rematches, persistence, or development harness in the POC.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for scope, setup, the verification gate, and the rules around balance changes and trial data. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Ben Liu
