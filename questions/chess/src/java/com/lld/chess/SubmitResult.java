package com.lld.chess;

import java.util.List;

public record SubmitResult(
        int statusCode,
        int ply,
        String fen,
        GameStatus gameStatus,
        long whiteMs,
        long blackMs,
        List<Move> legalMoves) {}
