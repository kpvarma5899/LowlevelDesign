package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

public final class BishopMovement implements Movement {

    static final int[][] DIRECTIONS = {{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    @Override
    public boolean attacks(Position position, Square from, Square target) {
        return Rays.attacks(position, from, target, DIRECTIONS);
    }

    @Override
    public List<Move> pseudoLegal(Position position, Square from) {
        List<Move> moves = new ArrayList<>();
        Rays.slide(position, from, DIRECTIONS, moves);
        return moves;
    }
}
