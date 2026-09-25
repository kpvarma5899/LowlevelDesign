package com.lld.chess;

public enum Color {
    WHITE,
    BLACK;

    public Color opposite() {
        return this == WHITE ? BLACK : WHITE;
    }

    public String fen() {
        return this == WHITE ? "w" : "b";
    }
}
