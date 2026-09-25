package com.lld.chess;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class ChessTest {

    private static int failures;

    public static void main(String[] args) throws Exception {
        startingPosition();
        pawnAttackIsNotAPawnMove();
        pinnedKnight();
        castleThroughCheck();
        castleOutOfCheck();
        queensideIgnoresAttackOnB1();
        enPassantOpensTheFile();
        promotionRequired();
        mateBeatsFiftyMove();
        stalemateAndMate();
        insufficientMaterial();
        repetitionIgnoresHarmlessEnPassant();
        threefoldInAMatch();
        twoSubmitsSamePly();
        retryIsIdempotent();
        logDownDoesNotApply();
        twoMatchesDoNotShareABoard();
        clockFlagAndDrawAgainstBareKing();
        capturedRookLosesTheRight();
        foldReplaysTheLog();
        resignAndAgreedDraw();
        if (failures > 0) {
            System.exit(1);
        }
        System.out.println("all chess tests passed");
    }

    private static void startingPosition() {
        Position start = Position.standard();
        eq("start fen", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", start.fen());
        eq("perft 1", 20L, perft(start, 1));
        eq("perft 2", 400L, perft(start, 2));
        eq("perft 3", 8902L, perft(start, 3));
        Position kiwipete = Position.parse(
                "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
        eq("kiwipete 1", 48L, perft(kiwipete, 1));
        eq("kiwipete 2", 2039L, perft(kiwipete, 2));
    }

    private static void pawnAttackIsNotAPawnMove() {
        Position position = Position.parse("4k3/8/8/8/4p3/8/8/4K3 w - - 0 1");
        Square pawn = Square.parse("e4");
        check("pawn attacks d3", position.isAttacked(Square.parse("d3"), Color.BLACK));
        check("pawn attacks f3", position.isAttacked(Square.parse("f3"), Color.BLACK));
        check("pawn does not attack e3", !position.isAttacked(Square.parse("e3"), Color.BLACK));
        check("attacks ignores the empty diagonal", Movements.of(PieceType.PAWN).attacks(position, pawn, Square.parse("d3")));
    }

    private static void pinnedKnight() {
        Position pin = Position.parse("4r3/8/8/8/8/8/4N3/4K3 w - - 0 1");
        eq("knight geometry", 6, from(Legality.pseudoLegal(pin), "e2").size());
        eq("knight legal", 0, from(Legality.legalMoves(pin), "e2").size());
        check("king still has a move", !from(Legality.legalMoves(pin), "e1").isEmpty());
    }

    private static void castleThroughCheck() {
        Position position = Position.parse("5r2/8/8/8/8/8/8/4K2R w K - 0 1");
        check("g1 is not attacked", !position.isAttacked(Square.parse("g1"), Color.BLACK));
        check("f1 is attacked", position.isAttacked(Square.parse("f1"), Color.BLACK));
        check("castle through f1 is dropped", !Legality.contains(position, Move.parse("e1g1")));
    }

    private static void castleOutOfCheck() {
        Position position = Position.parse("4r3/8/8/8/8/8/8/4K2R w K - 0 1");
        check("king is in check", position.isAttacked(Square.parse("e1"), Color.BLACK));
        check("g1 is safe", !position.isAttacked(Square.parse("g1"), Color.BLACK));
        check("cannot castle out of check", !Legality.contains(position, Move.parse("e1g1")));
    }

    private static void queensideIgnoresAttackOnB1() {
        Position position = Position.parse("1r6/8/8/8/8/8/8/R3K3 w Q - 0 1");
        check("b1 is attacked", position.isAttacked(Square.parse("b1"), Color.BLACK));
        check("queenside castle stands", Legality.contains(position, Move.parse("e1c1")));
    }

    private static void enPassantOpensTheFile() {
        Position position = Position.parse("7k/8/8/r2pP1K1/8/8/8/8 w - d6 0 1");
        check("geometry allows the capture", contains(Legality.pseudoLegal(position), "e5d6"));
        check("king safety drops it", !Legality.contains(position, Move.parse("e5d6")));
    }

    private static void promotionRequired() {
        Position position = Position.parse("7k/4P3/8/8/8/8/8/4K3 w - - 0 1");
        check("queen", Legality.contains(position, Move.parse("e7e8q")));
        check("rook", Legality.contains(position, Move.parse("e7e8r")));
        check("bishop", Legality.contains(position, Move.parse("e7e8b")));
        check("knight", Legality.contains(position, Move.parse("e7e8n")));
        throwsIllegal(() -> position.apply(Move.parse("e7e8")));
    }

    private static void mateBeatsFiftyMove() {
        Position position = Position.parse("k7/8/K7/8/8/8/8/7Q w - - 99 1");
        Position next = position.apply(Move.parse("h1b7"));
        eq("mate over fifty", GameStatus.CHECKMATE, Rules.assess(next, 1));
        eq("halfmove reached 100", 100, next.halfmove());
    }

    private static void stalemateAndMate() {
        eq("stalemate", GameStatus.STALEMATE, Rules.assess(Position.parse("k7/8/KQ6/8/8/8/8/8 b - - 0 1"), 1));
        eq("mate", GameStatus.CHECKMATE, Rules.assess(Position.parse("k7/1Q6/K7/8/8/8/8/8 b - - 0 1"), 1));
    }

    private static void insufficientMaterial() {
        eq("bare kings", GameStatus.DRAW_MATERIAL, Rules.assess(Position.parse("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), 1));
        eq("knight versus king", GameStatus.DRAW_MATERIAL, Rules.assess(Position.parse("4k3/8/8/8/8/8/8/4K2N w - - 0 1"), 1));
        eq("same color bishops", GameStatus.DRAW_MATERIAL,
                Rules.assess(Position.parse("7k/8/8/8/8/2b5/8/B3K3 w - - 0 1"), 1));
        eq("opposite bishops play on", GameStatus.ACTIVE,
                Rules.assess(Position.parse("7k/8/8/8/8/1b6/8/B3K3 w - - 0 1"), 1));
        eq("two knights is not dead", GameStatus.ACTIVE,
                Rules.assess(Position.parse("4k3/8/8/8/8/8/8/2N1K1N1 w - - 0 1"), 1));
    }

    private static void repetitionIgnoresHarmlessEnPassant() {
        Position harmless = Position.parse("8/7p/8/8/8/8/P7/4K2k w - e6 0 1");
        Position plain = Position.parse("8/7p/8/8/8/8/P7/4K2k w - - 0 1");
        eq("harmless ep key", plain.repetitionKey(), harmless.repetitionKey());
        Position real = Position.parse("8/8/8/3P4/8/8/8/4K2k w - e6 0 1");
        Position missing = Position.parse("8/8/8/3P4/8/8/8/4K2k w - - 0 1");
        check("a real ep square is part of the key", !real.repetitionKey().equals(missing.repetitionKey()));
    }

    private static void threefoldInAMatch() {
        Match match = Match.start("white", "black", 60_000, 0, 0);
        String[] dance = {"b1c3", "b8c6", "c3b1", "c6b8", "b1c3", "b8c6", "c3b1", "c6b8"};
        SubmitResult last = null;
        for (int i = 0; i < dance.length; i++) {
            String player = i % 2 == 0 ? "white" : "black";
            last = match.submit(player, Move.parse(dance[i]), i, "ply-" + i, 0);
            eq("dance ply " + i, 200, last.statusCode());
        }
        eq("threefold", GameStatus.DRAW_REPETITION, last.gameStatus());
    }

    private static void twoSubmitsSamePly() throws Exception {
        Match match = Match.start("white", "black", 60_000, 0, 0);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        try {
            Future<SubmitResult> e4 = pool.submit(() -> {
                ready.countDown();
                go.await();
                return match.submit("white", Move.parse("e2e4"), 0, "e4", 0);
            });
            Future<SubmitResult> d4 = pool.submit(() -> {
                ready.countDown();
                go.await();
                return match.submit("white", Move.parse("d2d4"), 0, "d4", 0);
            });
            ready.await();
            go.countDown();
            SubmitResult first = e4.get();
            SubmitResult second = d4.get();
            int wins = (first.statusCode() == 200 ? 1 : 0) + (second.statusCode() == 200 ? 1 : 0);
            int conflicts = (first.statusCode() == 409 ? 1 : 0) + (second.statusCode() == 409 ? 1 : 0);
            eq("one applied", 1, wins);
            eq("one rejected", 1, conflicts);
            SubmitResult winner = first.statusCode() == 200 ? first : second;
            SubmitResult loser = first.statusCode() == 409 ? first : second;
            eq("409 sees the winner", winner.fen(), loser.fen());
            eq("ply advanced once", 1, match.snapshot().ply());
        } finally {
            pool.shutdownNow();
        }
    }

    private static void retryIsIdempotent() {
        InMemoryMoveLog log = new InMemoryMoveLog();
        Match match = Match.start("m", "white", "black", 60_000, 0, null, log, 0);
        SubmitResult first = match.submit("white", Move.parse("e2e4"), 0, "same", 0);
        SubmitResult retry = match.submit("white", Move.parse("e2e4"), 0, "same", 5_000_000_000L);
        eq("retry status", 200, retry.statusCode());
        eq("retry fen", first.fen(), retry.fen());
        eq("one record", 1, log.records().size());
        SubmitResult other = match.submit("white", Move.parse("d2d4"), 0, "same", 0);
        eq("same id, different move", 409, other.statusCode());
    }

    private static void logDownDoesNotApply() {
        Match match = Match.start("m", "white", "black", 60_000, 0, null, record -> {
            throw new IllegalStateException("log down");
        }, 0);
        SubmitResult result = match.submit("white", Move.parse("e2e4"), 0, "x", 0);
        eq("fail closed", 503, result.statusCode());
        eq("ply stays", 0, result.ply());
        eq("fen stays", Position.standard().fen(), result.fen());
    }

    private static void twoMatchesDoNotShareABoard() {
        Match left = Match.start("white", "black", 60_000, 0, 0);
        Match right = Match.start("white", "black", 60_000, 0, 0);
        left.submit("white", Move.parse("e2e4"), 0, "left", 0);
        eq("other match is untouched", Position.standard().fen(), right.snapshot().fen());
    }

    private static void clockFlagAndDrawAgainstBareKing() {
        Match lost = Match.start("white", "black", 1000, 0, 0);
        SubmitResult flag = lost.submit("white", Move.parse("e2e4"), 0, "late", 2_000_000_000L);
        eq("flag status code", 200, flag.statusCode());
        eq("flag", GameStatus.TIMEOUT, flag.gameStatus());
        eq("flag does not move", Position.standard().fen(), flag.fen());

        Match draw = Match.start("m", "white", "black", 1000, 0,
                "4k3/8/8/8/8/8/8/4K2Q w - - 0 1", new InMemoryMoveLog(), 0);
        SubmitResult bare = draw.submit("white", Move.parse("e1d1"), 0, "late", 2_000_000_000L);
        eq("flag against a bare king", GameStatus.DRAW_TIMEOUT, bare.gameStatus());
    }

    private static void capturedRookLosesTheRight() {
        Position position = Position.parse("4k3/8/8/8/8/8/7q/4K2R b K - 0 1");
        Position next = position.apply(Move.parse("h2h1"));
        check("kingside right cleared", next.fen().contains(" w - "));
    }

    private static void foldReplaysTheLog() {
        InMemoryMoveLog log = new InMemoryMoveLog();
        Match match = Match.start("m", "white", "black", 60_000, 0, null, log, 0);
        match.submit("white", Move.parse("e2e4"), 0, "a", 0);
        match.submit("black", Move.parse("e7e5"), 1, "b", 0);
        List<Move> moves = new ArrayList<>();
        for (LogRecord record : log.records()) {
            moves.add(Move.parse(record.event()));
        }
        eq("fold", match.position().fen(), Position.fold(Position.standard(), moves).fen());
    }

    private static void resignAndAgreedDraw() {
        Match resigned = Match.start("white", "black", 60_000, 0, 0);
        eq("resign", GameStatus.RESIGNED, resigned.resign("black").gameStatus());
        eq("no move after resign", 422, resigned.submit("white", Move.parse("e2e4"), 0, "z", 0).statusCode());

        Match draw = Match.start("white", "black", 60_000, 0, 0);
        draw.offerDraw("white");
        draw.submit("white", Move.parse("e2e4"), 0, "e4", 0);
        eq("a move clears the offer", 422, draw.acceptDraw("black").statusCode());
        draw.offerDraw("black");
        eq("agreement", GameStatus.DRAW_AGREEMENT, draw.acceptDraw("white").gameStatus());
    }

    private static long perft(Position position, int depth) {
        List<Move> moves = Legality.legalMoves(position);
        if (depth == 1) {
            return moves.size();
        }
        long nodes = 0;
        for (Move move : moves) {
            nodes += perft(position.apply(move), depth - 1);
        }
        return nodes;
    }

    private static List<Move> from(List<Move> moves, String square) {
        List<Move> out = new ArrayList<>();
        for (Move move : moves) {
            if (move.from().algebraic().equals(square)) {
                out.add(move);
            }
        }
        return out;
    }

    private static boolean contains(List<Move> moves, String uci) {
        Move target = Move.parse(uci);
        return moves.contains(target);
    }

    private static void throwsIllegal(Runnable action) {
        try {
            action.run();
            failures++;
            System.out.println("FAIL expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // promotion omitted
        }
    }

    private static void check(String name, boolean value) {
        if (!value) {
            failures++;
            System.out.println("FAIL " + name);
        }
    }

    private static void eq(String name, Object expected, Object actual) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            failures++;
            System.out.println("FAIL " + name + " expected " + expected + " actual " + actual);
        }
    }
}
