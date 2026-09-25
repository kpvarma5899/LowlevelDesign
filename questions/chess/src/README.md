# Chess

Source for this question lives in this folder. The problem is the [note](../README.md). The readable page is https://kpvarma5899.github.io/LowlevelDesign/chess/.

The implementation is not written yet. When it is, these are the patterns:

- **Strategy.** `PawnMovement`, `KnightMovement`, `BishopMovement`, `RookMovement`, `QueenMovement`, and `KingMovement` are stateless. Each implements `pseudoLegal` and `attacks`. `attacks` is geometry only. It does not call `legalMoves`.
- **Immutable value.** `Position.apply` returns a new position. A `Move` is `from`, `to`, and an optional promotion. Castling and en passant are classified inside `apply` from the current position.
- **Factory.** `Position.standard` and `Position.parse` build the starting position and any FEN used by tests.
- **Facade.** `Match.submit` is the only writer. It checks the ply, asks `Legality`, applies, appends the log, and then updates the clock.

Tests cover a pinned piece, castling through check, an en passant that opens a line to the king, a required promotion, mate versus stalemate, and two submits for the same ply.
