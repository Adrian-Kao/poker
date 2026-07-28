# Heart Attack Multiplayer Server

This backend is the first server-authoritative implementation for the Heart Attack game. It uses Colyseus over WebSocket and keeps all live match state in memory inside a room.

## Runtime

- Next.js remains the frontend app.
- `server/index.ts` starts the game server on `PORT` or `2567`.
- `server/app.config.ts` registers the `heart_attack` room.
- Health check: `GET /health`.
- Local WebSocket URL: `ws://localhost:2567`.

## Room Model

`HeartAttackRoom` is the Colyseus room wrapper. `HeartAttackRoomController` owns the testable game flow:

- lobby players and bot seats
- action id de-duplication
- server timestamps
- private engine state
- public schema synchronization
- automatic play scheduling
- slap-window resolution
- penalty notices
- bot slap timers
- reconnect status

The public Colyseus schema never exposes hidden hand contents. It only publishes player metadata, remaining card counts, phase, current player id, call number, center pile count, last played card, deadlines, winner id, and penalty notice.

## Client Messages

Clients may send only these actions:

- `START_GAME`
- `ADD_BOT`
- `REMOVE_BOT`
- `SLAP`
- `PLAY_AGAIN`

Every client message must include an `actionId`. Duplicate `actionId` values are rejected by the room controller.

There is no client `PLAY_TOP_CARD` message. Cards are flipped only by the server scheduler.

## Server Events

The room broadcasts `heart-attack:event` events:

- `GAME_STARTED`
- `CARD_PLAYED`
- `SLAP_WINDOW_OPENED`
- `SLAP_ACCEPTED`
- `ROUND_RESULT`
- `PENALTY_NOTICE`
- `GAME_FINISHED`
- `ACTION_REJECTED`

## Timing

The server uses timeout scheduling, not `setInterval`.

- Automatic play: `AUTO_PLAY_INTERVAL_MS = 800`
- Slap window: `SLAP_WINDOW_MS = 1500`
- Result notice: `RESULT_NOTICE_MS = 1800`
- Reconnect window: `RECONNECT_WINDOW_SECONDS = 30`

When the room enters `slap-window`, automatic play pauses. When the room enters `round-result`, slap input is rejected and the next automatic play is scheduled only after the result notice window.

## Penalties

Penalty notices are derived from the engine `PenaltyResult`.

- false slap
- slowest valid slap
- no slap timeout
- pending-finish failed

Penalty notices include the punished player, collected card count, created time, and display end time.

## Bots

Bots use the shared `calculateBotReaction` helper and normal difficulty settings. Bot timers are cleared when the room is disposed, the game restarts, or the phase changes out of `slap-window`.

Bots do not read hidden human hands. They only react to the same public trigger timing and the latest played card.

## Tests

Run:

```bash
npm test
npm run build
```

Room tests use `ManualRoomScheduler` to advance time without opening a real WebSocket server.
