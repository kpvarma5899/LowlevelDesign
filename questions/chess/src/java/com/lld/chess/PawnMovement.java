package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

public final class PawnMovement implements Movement {

    @Override
    public boolean attacks(Position position, Square from, Square target) {
        int direction = forward(position.at(from).color());
        return target.rank() - from.rank() == direction
                && Math.abs(target.file() - from.file()) == 1;
    }

    @Override
    public List<Move> pseudoLegal(Position position, Square from) {
        Piece pawn = position.at(from);
        int direction = forward(pawn.color());
        int startRank = pawn.color() == Color.WHITE ? 1 : 6;
        List<Move> moves = new ArrayList<>();
        Square one = from.step(0, direction);
        if (one != null && position.at(one) == null) {
            add(moves, from, one);
            if (from.rank() == startRank) {
                Square two = from.step(0, 2 * direction);
                if (two != null && position.at(two) == null) {
                    add(moves, from, two);
                }
            }
        }
        for (int fileDelta : new int[] {-1, 1}) {
            Square diagonal = from.step(fileDelta, direction);
            if (diagonal == null) {
                continue;
            }
            Piece occupant = position.at(diagonal);
            boolean enemy = occupant != null && occupant.color() != pawn.color();
            boolean enPassant = diagonal.equals(position.enPassant());
            if (enemy || enPassant) {
                add(moves, from, diagonal);
            }
        }
        return moves;
    }

    private static void add(List<Move> moves, Square from, Square to) {
        if (to.rank() != 0 && to.rank() != 7) {
            moves.add(Move.of(from, to));
            return;
        }
        moves.add(new Move(from, to, PieceType.QUEEN));
        moves.add(new Move(from, to, PieceType.ROOK));
        moves.add(new Move(from, to, PieceType.BISHOP));
        moves.add(new Move(from, to, PieceType.KNIGHT));
    }

    private static int forward(Color color) {
        return color == Color.WHITE ? 1 : -1;
    }
}
