package com.lld.chess;

import java.util.Arrays;

/**
 * Immutable value. {@link #apply} returns the next position. Castling memory
 * is four bits here, not a flag on a rook.
 */
public final class Position {

    static final int WHITE_KINGSIDE = 1;
    static final int WHITE_QUEENSIDE = 2;
    static final int BLACK_KINGSIDE = 4;
    static final int BLACK_QUEENSIDE = 8;

    private final Piece[] squares;
    private final Color sideToMove;
    private final int castling;
    private final Square enPassant;
    private final int halfmove;
    private final int fullmove;

    private Position(Piece[] squares, Color sideToMove, int castling, Square enPassant, int halfmove, int fullmove) {
        this.squares = squares;
        this.sideToMove = sideToMove;
        this.castling = castling;
        this.enPassant = enPassant;
        this.halfmove = halfmove;
        this.fullmove = fullmove;
    }

    public static Position standard() {
        return parse("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    }

    public static Position parse(String fen) {
        String[] fields = fen.trim().split(" +");
        if (fields.length != 6) {
            throw new IllegalArgumentException("FEN needs 6 fields: " + fen);
        }
        Piece[] squares = new Piece[64];
        String[] ranks = fields[0].split("/");
        if (ranks.length != 8) {
            throw new IllegalArgumentException("FEN board needs 8 ranks");
        }
        for (int rankFromTop = 0; rankFromTop < 8; rankFromTop++) {
            int rank = 7 - rankFromTop;
            int file = 0;
            for (int i = 0; i < ranks[rankFromTop].length(); i++) {
                char token = ranks[rankFromTop].charAt(i);
                if (Character.isDigit(token)) {
                    file += token - '0';
                    continue;
                }
                if (file > 7) {
                    throw new IllegalArgumentException("FEN rank overflow");
                }
                squares[rank * 8 + file] = Piece.fromFen(token);
                file++;
            }
            if (file != 8) {
                throw new IllegalArgumentException("FEN rank is not 8 squares: " + ranks[rankFromTop]);
            }
        }
        Color side = "w".equals(fields[1]) ? Color.WHITE : Color.BLACK;
        if (!"w".equals(fields[1]) && !"b".equals(fields[1])) {
            throw new IllegalArgumentException("Side to move must be w or b");
        }
        int rights = 0;
        if (!"-".equals(fields[2])) {
            for (char right : fields[2].toCharArray()) {
                rights |= switch (right) {
                    case 'K' -> WHITE_KINGSIDE;
                    case 'Q' -> WHITE_QUEENSIDE;
                    case 'k' -> BLACK_KINGSIDE;
                    case 'q' -> BLACK_QUEENSIDE;
                    default -> throw new IllegalArgumentException("Bad castling right " + right);
                };
            }
        }
        Square ep = "-".equals(fields[3]) ? null : Square.parse(fields[3]);
        return new Position(squares, side, rights, ep, Integer.parseInt(fields[4]), Integer.parseInt(fields[5]));
    }

    public Piece at(Square square) {
        return squares[square.index()];
    }

    public Color sideToMove() {
        return sideToMove;
    }

    public Square enPassant() {
        return enPassant;
    }

    public int halfmove() {
        return halfmove;
    }

    public int fullmove() {
        return fullmove;
    }

    boolean hasRight(int right) {
        return (castling & right) != 0;
    }

    public Square kingSquare(Color color) {
        for (int i = 0; i < 64; i++) {
            Piece piece = squares[i];
            if (piece != null && piece.color() == color && piece.type() == PieceType.KING) {
                return Square.fromIndex(i);
            }
        }
        throw new IllegalStateException("No " + color + " king");
    }

    /**
     * Asks each opposing piece {@link Movement#attacks}. Does not generate
     * legal moves, so a king check cannot recurse.
     */
    public boolean isAttacked(Square square, Color by) {
        for (int i = 0; i < 64; i++) {
            Piece piece = squares[i];
            if (piece == null || piece.color() != by) {
                continue;
            }
            if (Movements.of(piece.type()).attacks(this, Square.fromIndex(i), square)) {
                return true;
            }
        }
        return false;
    }

    public Position apply(Move move) {
        Piece mover = at(move.from());
        if (mover == null) {
            throw new IllegalArgumentException("No piece on " + move.from().algebraic());
        }
        if (mover.color() != sideToMove) {
            throw new IllegalArgumentException("Not " + sideToMove + "'s piece");
        }
        Piece[] next = squares.clone();
        Piece captured = at(move.to());
        boolean castle = mover.type() == PieceType.KING && Math.abs(move.to().file() - move.from().file()) == 2;
        boolean enPassantCapture = mover.type() == PieceType.PAWN
                && enPassant != null
                && move.to().equals(enPassant);
        boolean doublePush = mover.type() == PieceType.PAWN
                && Math.abs(move.to().rank() - move.from().rank()) == 2;
        boolean promotionRank = mover.type() == PieceType.PAWN
                && (move.to().rank() == 0 || move.to().rank() == 7);

        if (promotionRank && move.promotion() == null) {
            throw new IllegalArgumentException("Promotion required");
        }
        if (!promotionRank && move.promotion() != null) {
            throw new IllegalArgumentException("Promotion is only legal on the last rank");
        }

        next[move.from().index()] = null;
        if (castle) {
            boolean kingSide = move.to().file() == 6;
            Square rookFrom = Square.parse(rookHome(mover.color(), kingSide));
            Square rookTo = Square.parse(rookLanding(mover.color(), kingSide));
            Piece rook = next[rookFrom.index()];
            if (rook == null) {
                throw new IllegalArgumentException("Castle with no rook");
            }
            next[rookFrom.index()] = null;
            next[rookTo.index()] = rook;
            next[move.to().index()] = mover;
        } else if (enPassantCapture) {
            Square capturedPawn = new Square(move.to().file(), move.from().rank());
            next[capturedPawn.index()] = null;
            next[move.to().index()] = mover;
            captured = at(capturedPawn);
        } else {
            Piece arriving = move.promotion() == null ? mover : new Piece(mover.color(), move.promotion());
            next[move.to().index()] = arriving;
        }

        int rights = castling;
        if (mover.type() == PieceType.KING) {
            rights = mover.color() == Color.WHITE
                    ? rights & ~(WHITE_KINGSIDE | WHITE_QUEENSIDE)
                    : rights & ~(BLACK_KINGSIDE | BLACK_QUEENSIDE);
        }
        rights = clearRookRight(rights, move.from());
        rights = clearRookRight(rights, move.to());

        Square nextEp = null;
        if (doublePush) {
            nextEp = new Square(move.from().file(), (move.from().rank() + move.to().rank()) / 2);
        }
        boolean capture = captured != null || enPassantCapture;
        int nextHalf = (mover.type() == PieceType.PAWN || capture) ? 0 : halfmove + 1;
        int nextFull = sideToMove == Color.BLACK ? fullmove + 1 : fullmove;
        return new Position(next, sideToMove.opposite(), rights, nextEp, nextHalf, nextFull);
    }

    public static Position fold(Position start, Iterable<Move> moves) {
        Position position = start;
        for (Move move : moves) {
            position = position.apply(move);
        }
        return position;
    }

    /**
     * Placement, side, castling, and en passant only when a pawn can take it.
     * Halfmove and fullmove are not part of the key.
     */
    public String repetitionKey() {
        String ep = "-";
        if (enPassant != null && pawnCanTakeEnPassant()) {
            ep = enPassant.algebraic();
        }
        return placement() + " " + sideToMove.fen() + " " + castlingFen() + " " + ep;
    }

    public String fen() {
        return placement() + " " + sideToMove.fen() + " " + castlingFen() + " "
                + (enPassant == null ? "-" : enPassant.algebraic()) + " " + halfmove + " " + fullmove;
    }

    private boolean pawnCanTakeEnPassant() {
        int direction = sideToMove == Color.WHITE ? 1 : -1;
        int rank = enPassant.rank() - direction;
        if (rank < 0 || rank > 7) {
            return false;
        }
        for (int fileDelta : new int[] {-1, 1}) {
            int file = enPassant.file() + fileDelta;
            if (file < 0 || file > 7) {
                continue;
            }
            Piece piece = squares[rank * 8 + file];
            if (piece != null && piece.color() == sideToMove && piece.type() == PieceType.PAWN) {
                return true;
            }
        }
        return false;
    }

    private String placement() {
        StringBuilder board = new StringBuilder();
        for (int rank = 7; rank >= 0; rank--) {
            int empty = 0;
            for (int file = 0; file < 8; file++) {
                Piece piece = squares[rank * 8 + file];
                if (piece == null) {
                    empty++;
                    continue;
                }
                if (empty > 0) {
                    board.append(empty);
                    empty = 0;
                }
                board.append(piece.fen());
            }
            if (empty > 0) {
                board.append(empty);
            }
            if (rank > 0) {
                board.append('/');
            }
        }
        return board.toString();
    }

    private String castlingFen() {
        if (castling == 0) {
            return "-";
        }
        StringBuilder rights = new StringBuilder();
        if ((castling & WHITE_KINGSIDE) != 0) {
            rights.append('K');
        }
        if ((castling & WHITE_QUEENSIDE) != 0) {
            rights.append('Q');
        }
        if ((castling & BLACK_KINGSIDE) != 0) {
            rights.append('k');
        }
        if ((castling & BLACK_QUEENSIDE) != 0) {
            rights.append('q');
        }
        return rights.toString();
    }

    private static int clearRookRight(int rights, Square square) {
        if (square.equals(Square.parse("h1"))) {
            return rights & ~WHITE_KINGSIDE;
        }
        if (square.equals(Square.parse("a1"))) {
            return rights & ~WHITE_QUEENSIDE;
        }
        if (square.equals(Square.parse("h8"))) {
            return rights & ~BLACK_KINGSIDE;
        }
        if (square.equals(Square.parse("a8"))) {
            return rights & ~BLACK_QUEENSIDE;
        }
        return rights;
    }

    private static String rookHome(Color color, boolean kingSide) {
        if (color == Color.WHITE) {
            return kingSide ? "h1" : "a1";
        }
        return kingSide ? "h8" : "a8";
    }

    private static String rookLanding(Color color, boolean kingSide) {
        if (color == Color.WHITE) {
            return kingSide ? "f1" : "d1";
        }
        return kingSide ? "f8" : "d8";
    }

    @Override
    public boolean equals(Object other) {
        if (!(other instanceof Position position)) {
            return false;
        }
        return Arrays.equals(squares, position.squares)
                && sideToMove == position.sideToMove
                && castling == position.castling
                && java.util.Objects.equals(enPassant, position.enPassant)
                && halfmove == position.halfmove
                && fullmove == position.fullmove;
    }

    @Override
    public int hashCode() {
        return fen().hashCode();
    }
}
