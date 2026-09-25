/**
 * One chess match.
 *
 * <p>Strategy: {@link Movement} and the six piece classes. {@code attacks} is
 * geometry only and does not call {@link Legality}.
 *
 * <p>Immutable value: {@link Position#apply} returns a new position. A
 * {@link Move} is from, to, and an optional promotion.
 *
 * <p>Factory: {@link Position#standard}, {@link Position#parse}, and
 * {@link Movements#of}.
 *
 * <p>Facade: {@link Match} is the only writer. Status is a value from
 * {@link Rules}, not a state class per outcome.
 */
package com.lld.chess;
