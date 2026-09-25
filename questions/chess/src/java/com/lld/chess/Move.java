package com.lld.chess;

/**
 * A square pair plus an optional promotion. Castling and en passant are not
 * separate types. {@link Position#apply} classifies them from the position.
 */
public record Move(Square from, Square to, PieceType promotion) {

    public Move {
        if (from.equals(to)) {
            throw new IllegalArgumentException("A move has to change squares");
        }
        if (promotion != null && !PieceType.isPromotion(promotion)) {
            throw new IllegalArgumentException("Promotion must be queen, rook, bishop, or knight");
        }
    }

    public static Move of(Square from, Square to) {
        return new Move(from, to, null);
    }

    public static Move parse(String uci) {
        if (uci == null || (uci.length() != 4 && uci.length() != 5)) {
            throw new IllegalArgumentException("Expected UCI like e2e4 or e7e8q");
        }
        Square from = Square.parse(uci.substring(0, 2));
        Square to = Square.parse(uci.substring(2, 4));
        PieceType promotion = uci.length() == 5 ? PieceType.fromLetter(uci.charAt(4)) : null;
        return new Move(from, to, promotion);
    }

    public String uci() {
        return from.algebraic() + to.algebraic() + (promotion == null ? "" : promotion.letter());
    }
}
