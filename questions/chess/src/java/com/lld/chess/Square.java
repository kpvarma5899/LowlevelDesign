package com.lld.chess;

public record Square(int file, int rank) {

    public Square {
        if (file < 0 || file > 7 || rank < 0 || rank > 7) {
            throw new IllegalArgumentException("Off the board: " + file + "," + rank);
        }
    }

    public static Square parse(String algebraic) {
        if (algebraic == null || algebraic.length() != 2) {
            throw new IllegalArgumentException("Expected a square like e4");
        }
        return new Square(algebraic.charAt(0) - 'a', algebraic.charAt(1) - '1');
    }

    public static Square fromIndex(int index) {
        return new Square(index % 8, index / 8);
    }

    public int index() {
        return rank * 8 + file;
    }

    public String algebraic() {
        return "" + (char) ('a' + file) + (char) ('1' + rank);
    }

    /** The neighbor, or null when that step leaves the board. */
    public Square step(int fileDelta, int rankDelta) {
        int nextFile = file + fileDelta;
        int nextRank = rank + rankDelta;
        if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) {
            return null;
        }
        return new Square(nextFile, nextRank);
    }
}
