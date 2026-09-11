---
name: board-game-online-mvp
description: Convert a board-game rulebook or rules website into an isolated, multiplayer boardgame.io MVP with a seat-taking lobby, rules-faithful tests, and a developer-ready Fly.io configuration. Use when onboarding a new tabletop game for online play; do not use for visual-only prototypes or deploying an existing app.
---

# Board Game Online MVP

Turn the supplied rules into a small online game that a developer can inspect, test, and deploy. Preserve the rulebook as the rules authority, keep private information private, and stop short of deploying unless the user separately asks for deployment.

Before implementing, inspect the repository, its `AGENTS.md` files, current git status, package manager, existing multiplayer architecture, and test/deploy conventions. Preserve unrelated or uncommitted work. Read [references/implementation-patterns.md](references/implementation-patterns.md) when choosing the lobby, game-state boundary, multiplayer tests, or Fly packaging.

## Establish the rules baseline

Read every supplied rule source completely enough to reconstruct play. For local documents, use the format-appropriate reader and retain file paths plus revision or hash when available. For websites, retrieve the named page and directly linked rules material; record the URL and retrieval date. If a web source can change, verify it at the time of use. Do not reproduce a copyrighted rulebook wholesale.

Create `docs/rules-baseline.md` inside the isolated output with:

- source titles, locations, editions, revisions, and precedence;
- player counts, components, setup, initial state, turn/phase order, legal actions, costs, limits, randomness, triggers, scoring, and end conditions;
- public, per-player private, and server-only information;
- a traceability table from each implemented rule group to its source section and tests;
- contradictions and unresolved ambiguities, each with an ID and implementation impact.

Distinguish rules from examples, strategy advice, variants, and inferred behavior. Use examples only to clarify rules. Ask the user only about unresolved choices that materially change game logic, secrecy, player count, persistence, or core architecture. Do not silently invent a rule. Safe presentation details may be chosen and recorded as MVP decisions.

Freeze the accepted baseline before coding. Later deviations must be labeled as deliberate online adaptations, with the reason and the approving source or user decision.

Record asset provenance separately from rules provenance. Use licensed assets, user-supplied assets with clear authorization, or explicit placeholders; do not copy rulebook prose, illustrations, logos, or component art into the MVP merely because they are visible in a source.

## Isolate the output

Never implement directly into rule-source files or an unrelated working tree.

- In an existing git product, prefer a dedicated worktree and task branch when the user has authorized branch isolation. The worktree directory is the output folder; record its base commit in the rules baseline or launch notes.
- When a worktree is unavailable or unnecessary, create a new, clearly named folder such as `<game-slug>-online-mvp/` at the user-approved location.
- Reuse an existing platform shell only when doing so does not mix the new game's rule state with another game's code. Extract reusable platform code rather than copying game-specific behavior.
- If the repository already defines a per-game package or `games/<slug>/` contract, use that boundary and its registration mechanism. Do not create a second client/server stack merely for isolation when the platform already supplies one.
- Keep generated code, rules notes, tests, and deployment config within the isolated output. Do not touch deployment state or the source game's production app.

The git base plus the task branch/diff is the before/after record. Do not duplicate the entire repository merely to create snapshots.

## Build the smallest complete player journey

Implement the path from landing page to finished match. Match the repository's stack where practical; for a new TypeScript app, a minimal React/Vite client and boardgame.io server is a reasonable default.

### Lobby and identity

Provide create-game and join-by-invite flows with exactly the rulebook's supported seat range. Show claimed and open seats, and begin only under the agreed start condition.

Treat the boardgame.io-issued player credential as the seat identity:

- keep credentials out of URLs, logs, and public game state;
- validate saved identity against server metadata before reconnecting;
- use a game- and match-scoped storage key;
- use persistent browser storage for ordinary reconnect when appropriate and isolated/session storage for automated or ephemeral environments;
- handle duplicate names, full rooms, invalid credentials, and simultaneous claims from authoritative lobby state;
- treat lobby match metadata and player `data` as public; never place roles, hands, locations, inventory, connectivity decisions, or other secrets there;
- do not add spectators, bots, accounts, matchmaking, chat moderation, or host controls unless the rules or user require them.

An invitee must be able to reload and reclaim only their own seat. A rejected identity must not expose the board or another player's private state.

### Rules engine

Model one authoritative `G` state and implement setup, moves, phases/turns, randomness, scoring, and termination from the frozen baseline.

- Validate every move on the server, including actor, phase, target, resources, prerequisites, and once-per-turn limits.
- Use boardgame.io's deterministic random API for shuffles, dice, or draws. Never use `Math.random()` in game logic.
- Keep move logic deterministic and serializable; do not depend on browser state, process-local clocks, or wall-clock timing unless the game explicitly requires real time.
- Make one source of truth authoritative for rule tables and schedules. Avoid duplicated constants or derived state that can drift.
- Disable or explicitly constrain undo when it could reveal hidden information or reroll randomness.
- Use `playerView` as an allowlist projection. Return shared public fields plus only the requesting player's private fields; an unidentified client receives no private state.
- Mark moves whose arguments contain hidden choices or private text with boardgame.io log redaction. `playerView` filters `G`, not every framework log or move argument; verify the required secrecy boundary explicitly.
- Keep secret decks, hands, roles, choices, inventories, and delivery outcomes server-only unless the baseline makes them public. Test serialized views for absence, not only expected presence.
- If chat or player messaging affects rules, model it as validated game moves and serializable state instead of assuming framework chat is persisted, replayed, or blocked for ineligible players.
- Make reconnect and phase transitions derive from authoritative server state. Never trust a client's claimed seat, readiness, score, or legal-action calculation.

Make the UI usable enough to conduct a real game: current phase/turn, legal actions, rule-relevant state, ready/waiting state, errors, reconnect state, and terminal outcome. Avoid a separate developer harness in the MVP; use automated tests and an optional development widget only when it materially helps the game.

## Verify against the rules

Build a test matrix from the traceability table. Tests should prove behavior, not restate implementation details.

At minimum, cover:

- setup invariants, deterministic randomness, action success and each important rejection path;
- phase/turn order, resource accounting, scoring, and every terminal outcome;
- `playerView` secrecy for each seat and an unidentified client;
- a boardgame.io `Local()` reducer test with one client per seat for shared state, private delivery, and synchronization;
- lobby identity validation, duplicate/full-seat behavior, concurrent last-seat claims, and reconnect;
- a Playwright smoke test using one independent `BrowserContext` per player so storage is never shared;
- a representative complete round and, when affordable, one complete game ending with the same outcome in every client.

Run the repository's typecheck, unit tests, production build, and local multiplayer smoke test. Fix product defects found by the smoke test. Do not replace a required human playtest with automation; report it as remaining evidence.

## Prepare Fly.io handoff

Create a root-level `fly.toml` inside the isolated app, adapting the repository's proven shape rather than copying its app identity. It should include:

- an explicit placeholder or developer-supplied unique app name and appropriate primary region;
- the server's `PORT`, matching `internal_port`;
- HTTPS, sensible machine start/stop behavior, and a small initial shared VM size;
- an HTTP health check backed by a lightweight `/health` endpoint;
- a production build/start path that serves both boardgame.io APIs/websockets and the built client, including SPA fallback without intercepting API or socket routes.

Also provide the referenced Dockerfile or supported Fly build configuration. It must install from the committed lockfile, build both client and server, start the production server, and use a runtime compatible with the repository's pinned dependencies.

Make machine policy follow the chosen match-storage model. For in-memory state, use exactly one always-running machine, disable scale-to-zero, document that restart/deploy aborts matches, and do not imply horizontal scaling is safe. A durable boardgame.io storage adapter may justify different start/stop or scaling settings, but verify that assumption rather than copying a Fly default.

Ensure the server binds to an address reachable inside the Fly machine. Keep secrets out of `fly.toml`; document required secret names without values. If the Fly CLI is available, run its local config validation only. Do not create an app, attach a repository, set secrets, deploy, or alter DNS unless the user separately authorizes that external change.

## Handoff

Report:

- the isolated output path and base revision;
- rule sources and unresolved decisions;
- implemented player count and complete player journey;
- tests run with exact results, including whether contexts used separate storage;
- the `fly.toml` path and any values the developer must set;
- remaining human playtest or deployment steps.

Do not call the MVP rules-complete while a core ambiguity is unresolved, and do not call it launch-ready when mandatory automated gates fail.
