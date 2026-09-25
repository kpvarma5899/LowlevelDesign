package com.lld.ratelimit;

/**
 * One identity, one rule. nowMs is an argument so a test can move time
 * without sleeping and without reading the wall clock.
 */
public interface Limiter {
    Decision tryAcquire(long nowMs);
}
