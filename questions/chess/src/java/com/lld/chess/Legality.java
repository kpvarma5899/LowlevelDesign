package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

/**
 * The position decides. A piece has already proposed squares. This keeps a
 * proposal only when the mover's king is safe, and for a castle also when
 * the king is not in check and does not cross an attacked square.
 */
public final class Legality {

    private Legality() {}

    public static List<Move> pseudoLegal(Position position) {
        List<Move> moves = new ArrayList<>();
        Color side = position.sideToMove();
        for (int i = 0; i < 64; i++) {
            Piece piece = position.at(Square.fromIndex(i));
            if (piece == null || piece.color() != side) {
                continue;
            }
            moves.addAll(Movements.of(piece.type()).pseudoLegal(position, Square.fromIndex(i)));
        }
        return moves;
    }

    public static List<Move> legalMoves(Position position) {
        Color us = position.sideToMove();
        Color them = us.opposite();
        List<Move> legal = new ArrayList<>();
        for (Move move : pseudoLegal(position)) {
            if (castle(position, move)) {
                if (position.isAttacked(move.from(), them) || position.isAttacked(transit(move), them)) {
                    continue;
                }
            }
            Position next = position.apply(move);
            if (!next.isAttacked(next.kingSquare(us), them)) {
                legal.add(move);
            }
        }
        return legal;
    }

    public static boolean contains(Position position, Move move) {
        return legalMoves(position).contains(move);
    }

    /** King and knight, king and bishop, or bare king. A help-mate with two knights still counts. */
    public static boolean hasMatingMaterial(Position position, Color color) {
        int knights = 0;
        int bishops = 0;
        for (int i = 0; i < 64; i++) {
            Piece piece = position.at(Square.fromIndex(i));
            if (piece == null || piece.color() != color || piece.type() == PieceType.KING) {
                continue;
            }
            switch (piece.type()) {
                case QUEEN, ROOK, PAWN -> {
                    return true;
                }
                case KNIGHT -> knights++;
                case BISHOP -> bishops++;
                case KING -> {
                }
            }
        }
        if (bishops >= 2 || knights >= 2 || (bishops >= 1 && knights >= 1)) {
            return true;
        }
        return false;
    }

    /**
     * Dead position: king versus king, one minor versus king, or bishops of
     * the same color. Two knights is not dead.
     */
    public static boolean insufficientMaterial(Position position) {
        int whiteMinors = 0;
        int blackMinors = 0;
        Boolean whiteBishopDark = null;
        Boolean blackBishopDark = null;
        int whiteBishops = 0;
        int blackBishops = 0;
        for (int i = 0; i < 64; i++) {
            Piece piece = position.at(Square.fromIndex(i));
            if (piece == null || piece.type() == PieceType.KING) {
                continue;
            }
            if (piece.type() == PieceType.QUEEN || piece.type() == PieceType.ROOK || piece.type() == PieceType.PAWN) {
                return false;
            }
            if (piece.color() == Color.WHITE) {
                whiteMinors++;
            } else {
                blackMinors++;
            }
            if (piece.type() == PieceType.BISHOP) {
                boolean dark = (Square.fromIndex(i).file() + Square.fromIndex(i).rank()) % 2 == 0;
                if (piece.color() == Color.WHITE) {
                    whiteBishops++;
                    whiteBishopDark = dark;
                } else {
                    blackBishops++;
                    blackBishopDark = dark;
                }
            }
        }
        if (whiteMinors + blackMinors <= 1) {
            return true;
        }
        return whiteBishops == 1
                && blackBishops == 1
                && whiteMinors == 1
                && blackMinors == 1
                && whiteBishopDark != null
                && whiteBishopDark.equals(blackBishopDark);
    }

    private static boolean castle(Position position, Move move) {
        Piece mover = position.at(move.from());
        return mover != null
                && mover.type() == PieceType.KING
                && Math.abs(move.to().file() - move.from().file()) == 2;
    }

    /** The square the king crosses. Kingside f1/f8, queenside d1/d8. */
    private static Square transit(Move move) {
        int file = (move.from().file() + move.to().file()) / 2;
        return new Square(file, move.from().rank());
    }
}
