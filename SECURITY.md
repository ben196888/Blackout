# Security policy

## What this project is

BLACKOUT is a proof of concept. It runs four-player facilitated trials on a single always-on machine, holds all match state in memory, and stores nothing. It has no user accounts, no password handling, no payment path, and no personal data beyond the message text players type during a trial.

It is not hardened for untrusted or public play, and it is not intended to be. Do not deploy it as an open service.

## What we treat as a security issue

Two invariants are load-bearing, because hidden information is the entire point of the game:

- **Player-view secrecy.** The state sent to one seat must never contain another seat's private information — inventory, inbox, position, or any authoritative delivery outcome not addressed to them. Guarded by [`tests/player-view.test.ts`](tests/player-view.test.ts).
- **Seat identity.** Every authenticated request must validate the seat's credentials. One player must not be able to act as another. Guarded by [`tests/identity-validation.test.ts`](tests/identity-validation.test.ts).

A break in either is effectively a working cheat. Disclosing one publicly hands it to players and contaminates any trial run afterwards, which is why we would rather hear about it privately first.

Also in scope: remote code execution, anything that lets an unauthenticated request read or mutate another match, and dependency vulnerabilities that are actually reachable from this code.

## What is out of scope

These are known and intentional, and reports about them will be closed:

- Match state is in memory. A deploy or restart aborts every live match.
- There is no rate limiting, abuse prevention, or account system.
- A trial facilitator can see everything. That is the design.
- Anyone with a match's invite link can take an unclaimed seat. Trials are run in a supervised room; the link is the access control.
- Denial of service against the single machine.

## Reporting

While this repository is private, report by contacting the maintainer directly on GitHub ([@ben196888](https://github.com/ben196888)).

Once the repository is public, use GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/ben196888/Blackout/security) instead. That opens a private channel visible only to the maintainer. Private vulnerability reporting is a public-repository feature and cannot be turned on before then, so it must be enabled in repository settings at the same time the repository is made public.

Either way, please do not open a public issue for anything in the in-scope list above.

Include what you can: what breaks, how to reproduce it, which seat and game day, and what an attacker or a cheating player gains. A failing test is the most useful thing you can send.

## What to expect

This is a side project maintained by one person, so treat these as intentions rather than guarantees:

- Acknowledgement within about a week.
- An assessment of whether it is in scope, and a fix or an explicit "won't fix" after that.
- Credit in the fix commit if you want it.

There is no bug bounty.

## Supported versions

Only `main` is supported. There are no releases, tags, or backports.
