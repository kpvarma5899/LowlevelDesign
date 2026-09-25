package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

public final class KnightMovement implements Movement {

    private static final int[][] LEAPS = {
        {1, 2}, {2, 1}, {-1, 2}, {-2, 1}, {1, -2}, {2, -1}, {-1, -2}, {-2, -1}
    };

    @Override
    public boolean attacks(Position position, Square from, Square target) {
        int fileDelta = Math.abs(target.file() - from.file());
        int rankDelta = Math.abs(target.rank() - from.rank());
        return fileDelta * rankDelta == 2;
    }

    @Override
    public List<Move> pseudoLegal(Position position, Square from) {
        Piece knight = position.at(from);
        List<Move> moves = new ArrayList<>();
        for (int[] leap : LEAPS) {
            Square to = from.step(leap[0], leap[1]);
            if (to == null) {
                continue;
            }
            Piece occupant = position.at(to);
            if (occupant == null || occupant.color() != knight.color()) {
                moves.add(Move.of(from, to));
            }
        }
        return moves;
    }
}
