# Design a chess game

**Page:** https://kpvarma5899.github.io/LowlevelDesign/chess/

The class diagram is the opening. The score is who is allowed to say a move is legal, and what happens when both players submit a move at the same millisecond.

**High-level design** is one match: two seats, one position, a clock, and a log. Matchmaking, ratings, and an engine search stay out until the interviewer pulls one back in.

**Low-level design** is the rules engine inside that match. A piece proposes squares. The position accepts or rejects the move. If two requests both saw "white to move," the ply number decides which one lands.

**Close on this:** a piece only proposes squares. The position decides legality, because only the position knows the turn, the king, and whether castling or en passant is still available.

| | High-level design | Low-level design |
|---|---|---|
| You draw | Two clients, one match actor, an append-only move log | `Movement`, `Position`, `Legality`, `Match` |
| You defend | One writer per game, fail closed on the log, server clock | Pseudo-legal moves, then king safety, then the transit square |
| They are testing | Whether two games, or two submits, can corrupt one board | Whether check, pins, and castling fall out of one rule |

## Requirements

Functional, in scope:

- A standard chess game between two players.
- Submit a move, resign, offer a draw, accept a draw.
- The server decides check, checkmate, stalemate, and the draws below.
- Castling, en passant, and promotion, including underpromotion.
- A clock with an increment. Flag fall ends the game.
- Load any position from FEN so the rules can be tested without playing down to them.

Out of scope until they ask: accounts, matchmaking, ratings, chat, a search engine, and Chess960. Name Chess960. It is the variant that changes setup and castling without changing how a bishop moves.

Non-functional:

- The rules are deterministic. The same position and the same move always produce the same next position.
- A player sees the position their move produced. A spectator may be one ply behind. Nobody sees a king that has moved and a rook that has not, from the same ply.
- One match never shares a board with another match.
- Losing the process must not lose an accepted move, and must not accept a move twice.

## Estimate

This is a correctness problem. Say the numbers so you do not get talked into sharding a board.

- A position is a few hundred bytes. One hundred thousand live games are tens of megabytes of current positions.
- A game is on the order of 80 plies. Store the move (from, to, promotion) and a position hash per ply. That is a few kilobytes of history per game, not a copy of 64 squares per ply.
- Validating a move is well under a millisecond. About thirty pseudo-legal moves, each applied to a 64-square copy.
- Humans move every several seconds. Even 10,000 accepted moves a second site-wide is a small CPU cost. The first real cost is the log append you wait on before returning 200.

Bitboards are for a search that visits millions of nodes. A human game does not. Start with a 64-square array.

## API

```
POST /v1/matches
{ "whiteId", "blackId", "initialMs", "incrementMs" }
→ 201 { "matchId", "ply": 0, "fen" }

POST /v1/matches/{id}/moves
{ "playerId", "from": "e2", "to": "e4", "promotion": null,
  "expectedPly": 0, "clientMoveId": "..." }
→ 200 { "ply", "fen", "status", "whiteMs", "blackMs", "legalMoves" }
→ 409 the ply moved, or this clientMoveId was already used for a different move
→ 422 illegal, wrong turn, or the game is over

POST /v1/matches/{id}/resign
POST /v1/matches/{id}/draw-offers
POST /v1/matches/{id}/draw-offers/accept
```

The client sends a square pair. It does not send "castle" or "en passant." The server classifies the move from the position. A client flag can disagree with the board. A square pair cannot.

`legalMoves` is public. Chess is complete information. Still compute the list once per position and reuse it.

## Data model

`Position` is immutable.

| Field | Meaning |
|---|---|
| `squares` | 64 cells. Each cell is empty or `(color, type)`. A piece has no coordinates and no `hasMoved` flag. |
| `sideToMove` | White or black. |
| `castling` | Four bits, `KQkq`. This is the memory of whether that king or that rook has moved or been captured. |
| `enPassant` | The skipped square after a double pawn push, or null. It dies after one ply. |
| `halfmove` | Plies since the last capture or pawn move. 100 is the fifty-move rule. |
| `fullmove` | Starts at 1, increments after Black moves. |

`Move` is `from`, `to`, and an optional promotion of queen, rook, bishop, or knight.

Castling rights live on the position, not on the piece. A `hasMoved` boolean drifts the moment a rook is captured without moving, or the moment you copy a piece and forget the flag. The four bits are the whole fact, and they are already what FEN stores.

The repetition key is piece placement, side to move, castling rights, and the en passant square only when an enemy pawn can actually capture there. A skipped square that nobody can take must not make two otherwise identical positions look different, or the threefold draw never fires.

## Patterns

Use four. Refuse three that show up in the usual diagram.

**Strategy.** One stateless movement type per piece: pawn, knight, bishop, rook, queen, king. Each implements two methods.

- `pseudoLegal(position, from)` proposes squares from geometry, blocking, and the right to capture.
- `attacks(position, from, square)` answers whether this piece attacks that square, ignoring whose turn it is and ignoring check.

The six objects are shared by every game. They hold no per-piece state. The piece on the square is only a color and a type.

**Immutable position.** `apply(move)` returns a new `Position`. History is the list of moves folded from the start, plus the current position and a map of repetition hashes. Taking back the last ply pops one move. There is no second `undo()` implementation that can drift from `apply`.

**Factory.** `Position.standard()` and `Position.parse(fen)` are the only ways to build a board. Tests load the position they mean instead of clicking forty moves to reach a pin.

**Facade.** `Match` is the only type the API calls. It owns the two seats, the clock, the status, and the log. The transport never touches `squares`.

Refuse these:

- A singleton board. The second game shares the first game's pieces.
- A `GameState` subclass per status (`CheckState`, `CheckmateState`, …) with its own `makeMove`. Status is a function of the position after each ply. A state object duplicates that function and grows illegal transitions.
- A `switch (piece.type)` inside `Match`. The pin bug then has six places to hide. The switch that remains is the factory that picks a `Movement` from a type, once.

A new piece is a new `Movement`. `Match.submit` does not change. The honest limit: `isAttacked` must call the new `attacks`. That call is one line in the scan of the opponent's pieces. You do not get a new piece for free inside a ray-direction switch written only for sliders.

## How a move becomes legal

Two layers. Mixing them is how every piece learns about the king.

1. The mover's `Movement` proposes pseudo-legal moves.
2. `Legality` keeps a proposal only when the resulting position does not leave the mover's king attacked.

`isAttacked(square, byColor)` asks each opposing piece `attacks(...)`. It does not ask `pseudoLegal`, and it does not ask `Legality`. That cut is what stops infinite recursion. A king move that would step next to the other king is illegal because the other king's `attacks` covers the adjacent square, not because king-vs-king is a special case in `submit`.

Pawn `attacks` is the two diagonals, occupied or not. Pawn `pseudoLegal` is one step forward, two from the starting rank, and a diagonal only when that square holds an enemy or is the en passant square. Using `pseudoLegal` as the attack test marks the empty square in front of a pawn as attacked, and it misses a diagonal capture onto an empty square. Both errors show up as kings stepping somewhere they cannot.

`apply` classifies the square pair against the current position:

| Shape | What `apply` does |
|---|---|
| Ordinary | Move the piece. Remove an enemy on `to`. |
| Double pawn push | Same, and set `enPassant` to the skipped square. |
| En passant | Move the pawn onto the skipped square. Remove the enemy pawn on the square behind it. |
| Promotion | The arriving piece is the chosen type. A pawn that reaches the last rank without a type is illegal. So is a promotion on any other move. |
| Castle | Move the king two squares. Move the rook to the square the king crossed. |

Everything else in `apply` is bookkeeping. Clear a castling bit when that king moves, when that rook moves off its original square, or when a capture lands on that rook's original square. Set `enPassant` only for a double push; every other move clears it. Reset `halfmove` on a pawn move or a capture; otherwise add one. Flip the side to move. Add one to `fullmove` after Black's move.

Check is `isAttacked(king, opponent)`. It is not a status you store separately and try to keep in sync.

Checkmate and stalemate use the same list. The side to move has no legal move. If their king is attacked, it is checkmate. If not, it is stalemate. You do not write a checkmate detector. You write "zero legal moves" and then look at the king.

A pin falls out. A knight on e2 in front of a king on e1, with a rook on e8, has a full set of knight jumps in `pseudoLegal` and an empty set after king safety. Discovered check falls out the same way. So does double check. You never branch on those names.

Castling is the exception you say out loud. King safety on the resulting position sees the destination. It does not see the square the king passed through, and it does not see that the king was in check before the move, because a castle can leave check onto a safe square.

For a castle, `Legality` also requires, on the position before the move:

- The king's current square is not attacked.
- The transit square is not attacked.
- The squares between king and rook are empty.

Kingside those squares are f1 and g1 empty, and e1, f1, g1 not attacked. Queenside, b1, c1, and d1 are empty, and e1, d1, and c1 are not attacked. b1 is empty. It is not a square the king walks through, so an attack on b1 does not by itself forbid queenside castling.

En passant needs no extra rule. White pawn on d5, Black has just played e7-e5, White king on e1, Black rook on e8. Capturing en passant onto e6 removes the pawn on e5 and opens the file. The resulting position has the king attacked, so `Legality` drops the move. A hand-written "en passant pin" check is a second copy of king safety.

Draws, after a move that is not mate or stalemate:

| Rule | Mechanism |
|---|---|
| Fifty-move | `halfmove >= 100`. This product ends the game. FIDE lets a player claim at 50 and forces the draw at 75. Say which product you are building. |
| Threefold | The repetition key has been seen three times in the game. Same FIDE distinction: a claim at three, forced at five. Online, end it at three. |
| Dead position | King versus king, king and knight versus king, king and bishop versus king, or king and bishop versus king and bishop on the same color. |
| Agreement | A pending offer, accepted by the opponent. Any move clears the offer. |
| Resignation | The seat that resigns loses. |

King and two knights versus a king is not a dead position. A help-mate exists. "Cannot force mate" is a different predicate, and it is the wrong one.

Order after `apply`: if the opponent has no legal move and is in check, checkmate, even when this ply also hit the fifty-move count. Else stalemate. Else fifty-move. Else repetition. Else dead position. Else the game continues, in check or not.

## One game, two writers

```
White ──submit──▶ Match actor (mailbox, key = matchId) ──▶ Position.apply
Black ──submit──▶            │                                    │
Spectator ─GET───────────────┘                                    ▼
                                                         append one log record
                                                         then start the opponent's clock
```

The actor applies one move at a time. `expectedPly` is the compare-and-swap. Both players can read ply 20 and both send a move. The first applied becomes ply 21. The second still says `expectedPly: 20` and gets 409 with the new position. A lock without the ply check is how a timed-out retry applies again on a later turn, if that same square pair is still legal.

`clientMoveId` makes the retry safe. The same id and the same move return the original 200. The same id and a different move is 409. Persist the id on the accepted ply.

The log stores one record per ply: match id, ply, move, client move id, server receipt time. On restart, fold the log from the initial FEN. A crash cannot leave a half-moved rook, because a ply is one record. The response is 200 only after that append succeeds. If the log is down or slower than a few tens of milliseconds, fail closed. Telling the client the move was accepted, then losing it, means the opponent's process still has the old position.

A spectator read can come from a replica one event behind. It returns a whole position. It never patches squares one at a time in a cache.

The hot path is `submit`. It must not write analytics, fan out to every spectator, or generate legal moves for the side that just moved beyond the king-safety checks the rules already did. Legal moves for the side now to move are cached on that immutable position the first time someone asks.

The clock uses the actor's monotonic clock. On receipt, subtract the elapsed time from the side that just moved. If what remains is below zero, the move does not apply and that side loses on time, unless the opponent has no mating material, in which case the game is a draw. If the move applies, add the increment. A wall-clock step backwards does not refund time, because wall clock is not an input. The clients render the server's numbers. They do not vote.

A dropped socket does not pause the clock. The player reconnects and reads the log.

Each match has a home region chosen at create. Both seats submit there. Another region may serve the log to spectators. It does not accept moves, so two regions never both apply ply 20.

## What you test

One table per piece for geometry, including pawn attack versus pawn move. Then positions, loaded from FEN:

- The knight on e2 is pinned. Six geometric moves, zero legal.
- Kingside castle with a rook attacking f1 and not g1. Rejected.
- Kingside castle while the king is in check on the e-file, with g1 safe. Rejected.
- The en passant that opens the e-file. Rejected, with no special case in the test's production code.
- Promotion omitted on the last rank. Rejected. Four different promotions to the same square. All legal.
- A stalemate position and a mate that differs by one square.
- The same position reached three times, once with a harmless en passant square set. Still a draw.
- Two submits with the same `expectedPly`. One 200, one 409.

## Follow-ups

### Who decides that a move is legal?

The position, in `Legality`. A piece strategy only proposes squares from geometry. If each piece also checks whether its own king is left in check, every piece learns the whole board, and a pin is a special case inside the knight. The mechanism is the two-layer filter: `pseudoLegal`, then `apply`, then `isAttacked` on the mover's king.

### Why does attack detection not call legal-move generation?

`isAttacked` is on the path that decides whether a move is legal. If it calls back into `Legality`, a king move recurses forever. `attacks` is geometry only. Pawn attacks are the diagonals even when the square is empty. That is also why a king cannot step diagonally in front of a pawn.

### How do you tell checkmate from stalemate?

The side to move has no legal move. Attacked king: checkmate. Safe king: stalemate. Both answers come from the list you already built to accept the previous move's result. A dedicated mate search that forgets stalemate will call a stalemate a win.

### Why is castling not just "the king is safe on the destination"?

The destination test does not look at the square the king crossed, and a castle can leave a check. White king on e1 in check from a rook on e8 can land on a safe g1 if you only inspect the result. Reject a castle when e1, the transit square, or the destination is attacked. Kingside transit is f1. Queenside transit is d1. An attack on b1 does not forbid queenside castling. b1 only has to be empty.

### An en passant capture opens a line to the king. Where is that rule?

Nowhere of its own. Apply the capture, including removing the pawn that was passed, and ask whether the mover's king is attacked. White pawn d5 takes on e6, the black pawn on e5 disappears, the rook on e8 sees the king on e1. The move is dropped by the same filter as a pin. A second "en passant pin" function will drift from that filter.

### Where do you put `hasMoved`?

On the position, as four castling bits. A boolean on the rook is wrong the moment the rook is captured on its home square without ever moving: the other side's right has to disappear, and the captured piece may already be off the board. FEN already stores the four bits. Clearing them inside `apply` on a king move, a rook move, or a capture on a home rook square keeps a single writer.

### Two moves arrive at the same millisecond. What serializes them?

One actor per `matchId`, and `expectedPly` on the write. The mailbox orders the two requests. The first apply advances the ply. The second fails the compare with 409. Check-then-apply from two gateway threads, with no ply condition, lets both observe "white to move" and both write. The durable form of the same lock is an append of ply N that is unique on `(matchId, ply)`.

### A player retries because the response was lost.

Same `clientMoveId` and the same move returns the stored 200 and does not append again. The id is kept with the ply. A lock alone does not do this: after a timeout the client retries, the ply has moved, and a still-legal square pair would be applied a second time.

### A spectator refreshes in the middle of a move. What can they see?

A whole position from ply N or ply N+1. The log record is the ply. The response to the mover is the position the actor just produced, so the mover has read-your-writes. A replica can lag by one record. A cache that updates the king square and the rook square as two writes can show a castle half-done. Do not cache squares. Cache positions.

### What must the hot path not do?

`submit` applies one pure function and appends one record. It does not write an analytics event in that request, and it does not notify spectators synchronously. Legal-move dots for the side to move are memoized on the position, which is immutable, so the memo cannot go stale underneath a later ply.

### The move log is down.

Fail closed. Return an error, leave the ply where it was, let the client retry the same `clientMoveId`. Accepting the move in memory and hoping the log returns means a restart resurrects the other position. A log that takes longer than a few tens of milliseconds has already failed. The clock does not depend on the log. It is monotonic time inside the actor.

### The player's socket drops.

The clock keeps running. Flag fall still counts. Reconnect is a read of the log. Pausing on disconnect turns a dropped network into free time.

### What breaks first at 10×?

Not the rules. A move check is under a millisecond, and 10× human traffic is still a small CPU number. The first limit is the commit you wait for on every ply, if each move forces its own fsync. Group the commits by a few milliseconds, and still wait for the commit before 200. The second limit is the actor thread, if a search or a spectator fanout runs on it. The bot is another client of `submit`. It thinks somewhere else.

### What is the shard key?

`matchId`. Every ply of that game goes to the same actor and the same log partition. Split the plies and two regions can both accept ply 20. A player's other games are other match ids and can live elsewhere.

### Someone floods illegal moves.

Reject wrong turn, illegal geometry, and "game over" before any append. That check is in memory on the actor. A flood of legal-looking garbage still costs a `Legality` call, so put a small per-player limit on `submit` in front of the actor. One premove is enough if you want premoves, and it is checked again when that ply arrives. It is not an applied move.

### Chess960 is added.

Movement strategies stay. The starting position becomes a parameter, and castling stops meaning "king moves two squares and the rook is in the corner." One function returns king from, king to, rook from, rook to, and the transit squares, from the rights and the current squares. Standard chess is that function with the rooks on a and h. Encoding "h1 rook to f1" in `apply` is the line Chess960 breaks.

### Whose clock is the clock?

The actor's monotonic clock. Subtract elapsed time when the move arrives, then add the increment only if the move is accepted. A backwards NTP step on a wall clock must not put time back, so wall clock is not an input. If the receipt time is already past zero, the move is not applied. Mate on a move that arrived in time is still mate. Flag fall against a side with no mating material is a draw, using the same material check as a dead position.

### Two regions both want to take moves.

Only the home region, chosen at create, accepts `submit`. Other regions serve the log to spectators. The games are disjoint by `matchId`, so a ply does not need a cross-region lock. Letting both regions write means the uniqueness of `(matchId, ply)` becomes a distributed transaction on the hot path.

### Do you need the command pattern, with `execute` and `undo`?

The move is a value and `apply` is a pure function. Undo of the last ply pops that value and keeps the previous position, which you already hold. A mutable `undo` is a second writer of the same squares. The tests will pass on `apply` and fail on `undo`, or the reverse. Folding the log from the initial FEN is the restart path, and it is the same function as live play.

### Why not bitboards?

A search that visits millions of nodes is paying for move generation. This match visits about thirty moves per human ply. A `Piece[64]` is the model you can draw and test. Bitboards are the optimization after a profiler shows `apply` inside a bot, and that bot should not run on the match actor anyway.

### A new piece is added. What changes?

A new `Movement` with `pseudoLegal` and `attacks`. `isAttacked` already loops pieces and calls `attacks`, so the scan does not grow a branch. `Match`, the log, the clock, and the ply check stay. What does not work is a ray scanner that knows rooks move orthogonally and bishops diagonally as hard-coded directions. A fairy slider with a new leap is an edit in that scanner, which is how the castling bug gets a neighbor.
