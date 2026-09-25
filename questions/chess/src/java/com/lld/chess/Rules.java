package com.lld.chess;

public final class Rules {

    private Rules() {}

    public static GameStatus assess(Position position, int repetitions) {
        Color side = position.sideToMove();
        boolean inCheck = position.isAttacked(position.kingSquare(side), side.opposite());
        boolean anyMove = !Legality.legalMoves(position).isEmpty();
        if (!anyMove && inCheck) {
            return GameStatus.CHECKMATE;
        }
        if (!anyMove) {
            return GameStatus.STALEMATE;
        }
        if (position.halfmove() >= 100) {
            return GameStatus.DRAW_FIFTY;
        }
        if (repetitions >= 3) {
            return GameStatus.DRAW_REPETITION;
        }
        if (Legality.insufficientMaterial(position)) {
            return GameStatus.DRAW_MATERIAL;
        }
        return inCheck ? GameStatus.CHECK : GameStatus.ACTIVE;
    }
}
