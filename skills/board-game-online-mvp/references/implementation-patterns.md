# Portable implementation patterns

Use these patterns selectively. They are extracted from a working boardgame.io proof of concept, but names, player counts, storage policy, and rules must come from the new game.

## Seat claims and reconnect

Use `LobbyClient.createMatch` with the rulebook-derived player count, then claim the creator's seat. Invitees join the match and receive a server-issued `playerCredentials` value. Store `{ playerID, credentials, displayName }` under a match-scoped browser key.

Assume lobby metadata is public. boardgame.io strips credentials from lobby responses, but player names, occupancy and player `data` are visible; keep all rule secrets in authoritative game state behind `playerView`.

On reload, authenticate the saved seat server-side before mounting the game client. The validation endpoint should:

1. fetch authoritative match metadata;
2. confirm game name, canonical player ID, claimed seat, and stored credential presence;
3. delegate credential comparison to boardgame.io authentication;
4. return only valid, invalid, or not-found status and set `Cache-Control: no-store`.

Refetch authoritative lobby state after a join conflict. A preflight free-seat check improves feedback but cannot prevent races. Test two independent clients trying to claim the final seat and two clients trying the same normalized name.

Reference implementations in this repository, for adaptation rather than copying, are `src/lobby/client.ts`, `src/lobby/identity.ts`, and `src/server/identity.ts`.

## Public and private state

Treat the full `G` object as server truth. Project client state explicitly:

```ts
function playerView({ G, playerID }: { G: Truth; playerID?: string | null }) {
  const publicState = {
    phaseState: G.phaseState,
    seats: projectPublicSeats(G),
  };
  if (!playerID || !isPlayerID(playerID)) return { ...publicState, you: null };
  return { ...publicState, you: structuredClone(G.players[playerID]) };
}
```

This is an allowlist, not a deletion pass over `G`. Never return the truth state and delete a few known secrets. Add a test that serializes each player's view and asserts that other hands, roles, credentials, hidden decks, private logs, and exact secret quantities are absent.

Set sensitive or non-optimistic moves to server execution (`client: false`) when client prediction could momentarily leak, lie about delivery, or diverge. Disable undo for hidden-information games unless the baseline defines a safe undo rule.

Use the long-form move definition with `redact: true` when move arguments themselves reveal a hidden choice or private message. This is separate from `playerView`, which filters game state rather than every log payload.

See `src/game/game.ts` and `tests/player-view.test.ts` for the pattern.

## Multiplayer reducer tests

Exercise the real boardgame.io reducer with a shared local transport:

```ts
const multiplayer = Local();
const clients = playerIDs.map((playerID) => Client({
  game,
  multiplayer,
  matchID: 'rules-scenario',
  playerID,
  numPlayers: playerIDs.length,
}));
clients.forEach((client) => client.start());
// Drive moves through client.moves, then assert each projected G independently.
clients.forEach((client) => client.stop());
```

Use these tests for multi-seat phase gates, simultaneous choices, private messages, and final-score agreement. Unit-test pure helpers as well, but do not rely only on direct helper calls because they bypass boardgame.io phase, player, plugin, and `playerView` behavior.

## Browser isolation

Create a separate Playwright `BrowserContext` for every human seat. Pages in one context share cookies and storage, so separate pages alone do not prove identity isolation. A useful smoke path is:

1. creator makes a game and obtains the invite URL;
2. every other context joins a different seat;
3. all seats perform the minimum actions needed to cross a phase boundary;
4. each context observes the same public state and only its own private state;
5. reload at least one context and verify authenticated reconnect;
6. complete a representative round or game;
7. close every context in `finally`.

Also cover simultaneous final-seat claims. `tests/e2e/smoke.spec.ts` shows the complete pattern.

## One web service on Fly

A small MVP can use one Node process for the boardgame.io server and built static client. Build the client first, bundle the server for the target Node version, serve static assets, and use an HTML fallback only for browser routes. Exclude boardgame.io API and websocket routes from the fallback.

The health endpoint should avoid game-state or database work and return a small response such as `{ status: "ok", version }`. Configure Fly's `internal_port` to match `PORT` and its health check to call that endpoint. Verify local production startup before handing off `fly.toml`.

If match state is in memory, configure one always-on machine (`auto_stop_machines = "off"`, `min_machines_running = 1`) and document that deploys terminate active matches. Do not scale an in-memory server horizontally. If durable storage is implemented, test reconnect after a server restart before claiming that persistence works.

The repository's `package.json`, `src/server.ts`, `playwright.config.ts`, and `fly.toml` demonstrate this packaging. Copy the architecture, not the PACE app name, origins, seed variable, event names, regions, or game rules.
