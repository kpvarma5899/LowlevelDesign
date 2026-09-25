package com.lld.chess;

/**
 * Derived from the position. There is no CheckState or CheckmateState.
 * Mate is an empty legal-move list plus an attacked king, and it wins over
 * the fifty-move count on the same ply.
 */
public enum GameStatus {
    ACTIVE,
    CHECK,
    CHECKMATE,
    STALEMATE,
    DRAW_FIFTY,
    DRAW_REPETITION,
    DRAW_MATERIAL,
    DRAW_AGREEMENT,
    RESIGNED,
    TIMEOUT,
    DRAW_TIMEOUT;

    public boolean terminal() {
        return this != ACTIVE && this != CHECK;
    }
}
