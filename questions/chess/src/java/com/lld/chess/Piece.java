package com.lld.chess;

/** A color and a type. Coordinates and castling memory live on the position. */
public record Piece(Color color, PieceType type) {

    public char fen() {
        char letter = type.letter();
        return color == Color.WHITE ? Character.toUpperCase(letter) : letter;
    }

    public static Piece fromFen(char fen) {
        Color color = Character.isUpperCase(fen) ? Color.WHITE : Color.BLACK;
        return new Piece(color, PieceType.fromLetter(fen));
    }
}
