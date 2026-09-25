package com.lld.chess;

import java.util.EnumMap;
import java.util.Map;

/** Factory for the six shared movement strategies. The only type switch in the rules. */
public final class Movements {

    private static final Map<PieceType, Movement> BY_TYPE = build();

    private Movements() {}

    public static Movement of(PieceType type) {
        return BY_TYPE.get(type);
    }

    private static Map<PieceType, Movement> build() {
        RookMovement rook = new RookMovement();
        BishopMovement bishop = new BishopMovement();
        EnumMap<PieceType, Movement> map = new EnumMap<>(PieceType.class);
        map.put(PieceType.PAWN, new PawnMovement());
        map.put(PieceType.KNIGHT, new KnightMovement());
        map.put(PieceType.BISHOP, bishop);
        map.put(PieceType.ROOK, rook);
        map.put(PieceType.QUEEN, new QueenMovement(rook, bishop));
        map.put(PieceType.KING, new KingMovement());
        return Map.copyOf(map);
    }
}
