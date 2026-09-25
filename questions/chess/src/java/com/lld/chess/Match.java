package com.lld.chess;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Facade and the single writer for one match. The lock is the actor: two
 * submits for the same ply are ordered, and {@code expectedPly} is the
 * compare-and-swap. The log append happens before any field changes, so a
 * down log leaves the ply where it was.
 */
public final class Match {

    private final Object actor = new Object();
    private final String matchId;
    private final String whiteId;
    private final String blackId;
    private final long incrementMs;
    private final MoveLog log;

    private Position position;
    private GameStatus status;
    private int ply;
    private long whiteMs;
    private long blackMs;
    private long lastNanos;
    private String pendingDraw;
    private final Map<String, Integer> seen = new HashMap<>();
    private final Map<String, String> moveByClientId = new HashMap<>();
    private final Map<String, SubmitResult> resultByClientId = new HashMap<>();
    private Position cachedFor;
    private List<Move> cachedLegal = List.of();

    private Match(
            String matchId,
            String whiteId,
            String blackId,
            long initialMs,
            long incrementMs,
            Position position,
            MoveLog log,
            long nowNanos) {
        this.matchId = matchId;
        this.whiteId = whiteId;
        this.blackId = blackId;
        this.incrementMs = incrementMs;
        this.position = position;
        this.log = log;
        this.whiteMs = initialMs;
        this.blackMs = initialMs;
        this.lastNanos = nowNanos;
        this.seen.put(position.repetitionKey(), 1);
        this.status = Rules.assess(position, 1);
    }

    public static Match start(String whiteId, String blackId, long initialMs, long incrementMs, long nowNanos) {
        return start("match", whiteId, blackId, initialMs, incrementMs, null, new InMemoryMoveLog(), nowNanos);
    }

    public static Match start(
            String matchId,
            String whiteId,
            String blackId,
            long initialMs,
            long incrementMs,
            String fen,
            MoveLog log,
            long nowNanos) {
        Position position = fen == null ? Position.standard() : Position.parse(fen);
        return new Match(matchId, whiteId, blackId, initialMs, incrementMs, position, log, nowNanos);
    }

    public SubmitResult submit(String playerId, Move move, int expectedPly, String clientMoveId, long nowNanos) {
        synchronized (actor) {
            SubmitResult replay = replay(clientMoveId, move);
            if (replay != null) {
                return replay;
            }
            if (clientMoveId != null && moveByClientId.containsKey(clientMoveId)) {
                return current(409);
            }
            if (status.terminal()) {
                return current(422);
            }
            if (expectedPly != ply) {
                return current(409);
            }
            if (!playerId.equals(seat(position.sideToMove()))) {
                return current(422);
            }
            Color mover = position.sideToMove();
            long elapsedMs = Math.max(0L, (nowNanos - lastNanos) / 1_000_000L);
            long remaining = remaining(mover) - elapsedMs;
            if (remaining <= 0) {
                return flag(mover, remaining, clientMoveId, nowNanos);
            }
            if (!Legality.contains(position, move)) {
                return current(422);
            }
            Position next = position.apply(move);
            int repetitions = seen.getOrDefault(next.repetitionKey(), 0) + 1;
            GameStatus nextStatus = Rules.assess(next, repetitions);
            long nextWhite = mover == Color.WHITE ? remaining + incrementMs : whiteMs;
            long nextBlack = mover == Color.BLACK ? remaining + incrementMs : blackMs;
            if (!append(new LogRecord(matchId, ply + 1, move.uci(), clientMoveId, nowNanos))) {
                return current(503);
            }
            position = next;
            seen.put(next.repetitionKey(), repetitions);
            status = nextStatus;
            whiteMs = nextWhite;
            blackMs = nextBlack;
            lastNanos = nowNanos;
            ply++;
            pendingDraw = null;
            cachedFor = null;
            SubmitResult ok = current(200);
            if (clientMoveId != null) {
                moveByClientId.put(clientMoveId, move.uci());
                resultByClientId.put(clientMoveId, ok);
            }
            return ok;
        }
    }

    public SubmitResult resign(String playerId) {
        synchronized (actor) {
            if (status.terminal() || !seated(playerId)) {
                return current(422);
            }
            if (!append(new LogRecord(matchId, ply, "resign", playerId, lastNanos))) {
                return current(503);
            }
            status = GameStatus.RESIGNED;
            cachedFor = null;
            cachedLegal = List.of();
            return current(200);
        }
    }

    public SubmitResult offerDraw(String playerId) {
        synchronized (actor) {
            if (status.terminal() || !seated(playerId)) {
                return current(422);
            }
            pendingDraw = playerId;
            return current(200);
        }
    }

    public SubmitResult acceptDraw(String playerId) {
        synchronized (actor) {
            if (status.terminal() || !seated(playerId) || pendingDraw == null || pendingDraw.equals(playerId)) {
                return current(422);
            }
            if (!append(new LogRecord(matchId, ply, "draw", playerId, lastNanos))) {
                return current(503);
            }
            status = GameStatus.DRAW_AGREEMENT;
            pendingDraw = null;
            cachedFor = null;
            cachedLegal = List.of();
            return current(200);
        }
    }

    public SubmitResult snapshot() {
        synchronized (actor) {
            return current(200);
        }
    }

    public Position position() {
        synchronized (actor) {
            return position;
        }
    }

    private SubmitResult flag(Color mover, long remaining, String clientMoveId, long nowNanos) {
        GameStatus flagged = Legality.hasMatingMaterial(position, mover.opposite())
                ? GameStatus.TIMEOUT
                : GameStatus.DRAW_TIMEOUT;
        if (!append(new LogRecord(matchId, ply, "timeout", clientMoveId, nowNanos))) {
            return current(503);
        }
        if (mover == Color.WHITE) {
            whiteMs = remaining;
        } else {
            blackMs = remaining;
        }
        lastNanos = nowNanos;
        status = flagged;
        cachedFor = null;
        cachedLegal = List.of();
        return current(200);
    }

    private SubmitResult replay(String clientMoveId, Move move) {
        if (clientMoveId == null || !moveByClientId.containsKey(clientMoveId)) {
            return null;
        }
        if (move.uci().equals(moveByClientId.get(clientMoveId))) {
            return resultByClientId.get(clientMoveId);
        }
        return null;
    }

    private boolean append(LogRecord record) {
        try {
            log.append(record);
            return true;
        } catch (RuntimeException down) {
            return false;
        }
    }

    private SubmitResult current(int statusCode) {
        List<Move> legal = status.terminal() ? List.of() : legalMoves();
        return new SubmitResult(statusCode, ply, position.fen(), status, whiteMs, blackMs, legal);
    }

    private List<Move> legalMoves() {
        if (cachedFor != position) {
            cachedLegal = List.copyOf(Legality.legalMoves(position));
            cachedFor = position;
        }
        return cachedLegal;
    }

    private long remaining(Color color) {
        return color == Color.WHITE ? whiteMs : blackMs;
    }

    private String seat(Color color) {
        return color == Color.WHITE ? whiteId : blackId;
    }

    private boolean seated(String playerId) {
        return playerId.equals(whiteId) || playerId.equals(blackId);
    }
}
