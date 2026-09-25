package com.lld.chess;

public enum PieceType {
    KING('k'),
    QUEEN('q'),
    ROOK('r'),
    BISHOP('b'),
    KNIGHT('n'),
    PAWN('p');

    private final char letter;

    PieceType(char letter) {
        this.letter = letter;
    }

    public char letter() {
        return letter;
    }

    public static PieceType fromLetter(char fen) {
        char lower = Character.toLowerCase(fen);
        for (PieceType type : values()) {
            if (type.letter == lower) {
                return type;
            }
        }
        throw new IllegalArgumentException("No piece for '" + fen + "'");
    }

    public static boolean isPromotion(PieceType type) {
        return type == QUEEN || type == ROOK || type == BISHOP || type == KNIGHT;
    }
}
