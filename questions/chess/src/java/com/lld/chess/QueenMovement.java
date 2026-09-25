package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

/** Queen is the rook strategy plus the bishop strategy. */
public final class QueenMovement implements Movement {

    private final Movement rook;
    private final Movement bishop;

    QueenMovement(Movement rook, Movement bishop) {
        this.rook = rook;
        this.bishop = bishop;
    }

    @Override
    public boolean attacks(Position position, Square from, Square target) {
        return rook.attacks(position, from, target) || bishop.attacks(position, from, target);
    }

    @Override
    public List<Move> pseudoLegal(Position position, Square from) {
        List<Move> moves = new ArrayList<>(rook.pseudoLegal(position, from));
        moves.addAll(bishop.pseudoLegal(position, from));
        return moves;
    }
}
