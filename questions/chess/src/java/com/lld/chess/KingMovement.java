package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

public final class KingMovement implements Movement {

    private static final int[][] STEPS = {
        {1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}
    };

    @Override
    public boolean attacks(Position position, Square from, Square target) {
        int fileDelta = Math.abs(target.file() - from.file());
        int rankDelta = Math.abs(target.rank() - from.rank());
        return Math.max(fileDelta, rankDelta) == 1;
    }

    @Override
    public List<Move> pseudoLegal(Position position, Square from) {
        Piece king = position.at(from);
        List<Move> moves = new ArrayList<>();
        for (int[] step : STEPS) {
            Square to = from.step(step[0], step[1]);
            if (to == null) {
                continue;
            }
            Piece occupant = position.at(to);
            if (occupant == null || occupant.color() != king.color()) {
                moves.add(Move.of(from, to));
            }
        }
        addCastles(position, from, king, moves);
        return moves;
    }

    /**
     * Geometry only: the rights are still set, the king and rook are home, and
     * the squares between them are empty. Check on the transit square is
     * {@link Legality}'s job.
     */
    private static void addCastles(Position position, Square from, Piece king, List<Move> moves) {
        if (king.color() == Color.WHITE && from.equals(Square.parse("e1"))) {
            if (position.hasRight(Position.WHITE_KINGSIDE)
                    && homeRook(position, Square.parse("h1"), Color.WHITE)
                    && empty(position, "f1", "g1")) {
                moves.add(Move.parse("e1g1"));
            }
            if (position.hasRight(Position.WHITE_QUEENSIDE)
                    && homeRook(position, Square.parse("a1"), Color.WHITE)
                    && empty(position, "b1", "c1", "d1")) {
                moves.add(Move.parse("e1c1"));
            }
        }
        if (king.color() == Color.BLACK && from.equals(Square.parse("e8"))) {
            if (position.hasRight(Position.BLACK_KINGSIDE)
                    && homeRook(position, Square.parse("h8"), Color.BLACK)
                    && empty(position, "f8", "g8")) {
                moves.add(Move.parse("e8g8"));
            }
            if (position.hasRight(Position.BLACK_QUEENSIDE)
                    && homeRook(position, Square.parse("a8"), Color.BLACK)
                    && empty(position, "b8", "c8", "d8")) {
                moves.add(Move.parse("e8c8"));
            }
        }
    }

    private static boolean homeRook(Position position, Square square, Color color) {
        Piece piece = position.at(square);
        return piece != null && piece.color() == color && piece.type() == PieceType.ROOK;
    }

    private static boolean empty(Position position, String... squares) {
        for (String algebraic : squares) {
            if (position.at(Square.parse(algebraic)) != null) {
                return false;
            }
        }
        return true;
    }
}
