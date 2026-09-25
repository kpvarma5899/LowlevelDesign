package com.lld.chess;

public record LogRecord(String matchId, int ply, String event, String clientMoveId, long receiptNanos) {}
