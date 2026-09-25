package com.lld.chess;

import java.util.List;

/**
 * Strategy. One stateless object per piece type, shared by every match.
 * {@code attacks} is geometry only. It must not call {@link Legality}.
 */
public interface Movement {

    List<Move> pseudoLegal(Position position, Square from);

    boolean attacks(Position position, Square from, Square target);
}
