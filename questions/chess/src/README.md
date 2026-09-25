# Chess

Source for this question lives in this folder. The problem is the [note](../README.md). The readable page is https://kpvarma5899.github.io/LowlevelDesign/chess/.

```
javac -d out $(find src/java src/test -name '*.java')
java -cp out com.lld.chess.ChessTest
```

## Patterns

- **Strategy.** `Movement` is the interface. `PawnMovement`, `KnightMovement`, `BishopMovement`, `RookMovement`, `QueenMovement`, and `KingMovement` are the six stateless objects. `Movements.of` is the only place that maps a piece type to one of them, and those six instances are shared by every match. `QueenMovement` is the rook strategy plus the bishop strategy. `attacks` is geometry only. It does not call `Legality`.
- **Immutable value.** `Position.apply` copies the 64 squares and returns a new position. A `Move` is `from`, `to`, and an optional promotion. Castling and en passant are classified inside `apply`. `Position.fold` replays the log through that same function. There is no `undo`.
- **Factory.** `Position.standard` and `Position.parse` are how a board is built. Tests load a FEN instead of playing down to a pin.
- **Facade.** `Match.submit` is the only writer. It checks the client move id and the ply, asks `Legality`, applies, appends the log, and only then updates the clock. `GameStatus` is the value `Rules.assess` returns. It is not a class hierarchy.

The actor is the lock inside `Match`. Two submits for one ply: one `200`, one `409`. A log that throws leaves the ply where it was.

Tests cover a pinned knight, castling through check and out of check, queenside castling with `b1` attacked, an en passant that opens a file, a required promotion, mate versus stalemate, mate on the ply that also reaches the fifty-move count, a harmless en passant square in the repetition key, threefold, two concurrent submits, an idempotent retry, a down log, two matches, flag fall, and perft from the start position through depth 3.
