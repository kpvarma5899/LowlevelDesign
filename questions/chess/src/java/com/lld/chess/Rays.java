package com.lld.chess;

import java.util.List;

/** Shared ray walk for the bishop, rook, and queen strategies. */
final class Rays {

    private Rays() {}

    static void slide(Position position, Square from, int[][] directions, List<Move> out) {
        Piece mover = position.at(from);
        for (int[] direction : directions) {
            Square cursor = from;
            while (true) {
                cursor = cursor.step(direction[0], direction[1]);
                if (cursor == null) {
                    break;
                }
                Piece occupant = position.at(cursor);
                if (occupant == null) {
                    out.add(Move.of(from, cursor));
                    continue;
                }
                if (occupant.color() != mover.color()) {
                    out.add(Move.of(from, cursor));
                }
                break;
            }
        }
    }

    static boolean attacks(Position position, Square from, Square target, int[][] directions) {
        int fileDelta = Integer.compare(target.file(), from.file());
        int rankDelta = Integer.compare(target.rank(), from.rank());
        if (!isDirection(directions, fileDelta, rankDelta)) {
            return false;
        }
        int fileDistance = Math.abs(target.file() - from.file());
        int rankDistance = Math.abs(target.rank() - from.rank());
        if (fileDelta != 0 && rankDelta != 0 && fileDistance != rankDistance) {
            return false;
        }
        Square cursor = from;
        while (true) {
            cursor = cursor.step(fileDelta, rankDelta);
            if (cursor == null) {
                return false;
            }
            if (cursor.equals(target)) {
                return true;
            }
            if (position.at(cursor) != null) {
                return false;
            }
        }
    }

    private static boolean isDirection(int[][] directions, int fileDelta, int rankDelta) {
        for (int[] direction : directions) {
            if (direction[0] == fileDelta && direction[1] == rankDelta) {
                return true;
            }
        }
        return false;
    }
}
