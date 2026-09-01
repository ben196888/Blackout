# Contributing

Thanks for your interest in PACE POC — BLACKOUT. This is a proof of concept, so the scope is deliberately narrow: it exists to test whether method-coverage planning and imperfect communication produce useful coordination decisions in a four-player hidden-information game.

## Scope

Changes that fit the POC:

- Bug fixes in game rules, communication delivery, player-view secrecy, or identity validation.
- Test coverage for existing behaviour.
- Documentation and developer-experience fixes.
- Balance tuning supported by trial evidence — see below.

Changes that do not fit the POC: spectators, timers, rematches, persistence, a development harness, or multi-machine deployment. These are intentional omissions, not gaps.

If you want to propose something larger, open an issue first so we can agree on scope before you write code.

## Development setup

Requires Node 24 and pnpm 11.15.1.

```sh
pnpm install
pnpm exec playwright install --with-deps chromium
```

Run the dev server:

```sh
pnpm dev
```

## Verification

Every change must pass the full gate locally before it is pushed. CI runs the same steps.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

`pnpm smoke` is the mandatory four-player browser smoke. It drives four isolated browser contexts through the Lobby REST flow, socket connection, Day 0 planning, a credential-preserving refresh, the complete seven-night schedule, and the shared terminal outcome. A change is not done until it passes.

## Balance changes

Balance is a single tuning surface: the `BALANCE` object in [`src/constants.ts`](src/constants.ts). Balance-only pull requests must edit that object and nothing else, and must cite the trial evidence that motivates the change. Numbers changed on intuition alone will be sent back.

## Secrecy invariants

Hidden information is the point of the game. Two rules are load-bearing:

- The player view must never serialize another player's private state. `tests/player-view.test.ts` guards this.
- Seat credentials must be validated on every authenticated request. `tests/identity-validation.test.ts` guards this.

If your change touches either area, add a test that would fail without your fix.

## Trial data

Human-trial log dumps contain player-authored message text and private authoritative delivery outcomes. They stay local: `trial-logs/` is git-ignored. Never commit a dump, attach one to an issue, or quote participants verbatim in a public thread. Summarize patterns instead. The full procedure is in [the trial runbook](docs/trial-runbook.md).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`.
- Keep the subject line under 72 characters and in the imperative mood.
- Keep commits small and single-purpose.
- Describe what you changed and how you verified it in the pull request body.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
