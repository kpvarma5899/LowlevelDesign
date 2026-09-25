package com.lld.ratelimit;

/**
 * Two numbers: how many tokens are left, and when that figure was computed.
 *
 * A queue of token objects would be size = capacity, and a thread would have
 * to drip them in. The two fields are that queue written as a formula.
 * Fractional tokens are a double on purpose: a rate of 5 per second has to
 * mean something between whole requests.
 *
 * On a denial the cost is not subtracted, but the refilled level and the
 * timestamp are still stored. If you skip that write, the next call adds the
 * same elapsed time again.
 */
public final class TokenBucket implements Limiter {
    private final double capacity;
    private final double refillPerSecond;
    private double tokens;
    private long lastRefillMs;
    private boolean initialized;

    public TokenBucket(double capacity, double refillPerSecond) {
        this.capacity = capacity;
        this.refillPerSecond = refillPerSecond;
    }

    @Override
    public synchronized Decision tryAcquire(long nowMs) {
        refill(nowMs);
        if (tokens < 1.0d) {
            long retryMs = (long) Math.ceil((1.0d - tokens) / refillPerSecond * 1000.0d);
            return Decision.deny(Math.round(capacity), 0, retryMs);
        }
        tokens -= 1.0d;
        return Decision.allow(Math.round(capacity), (long) Math.floor(tokens));
    }

    private void refill(long nowMs) {
        if (!initialized) {
            tokens = capacity;
            lastRefillMs = nowMs;
            initialized = true;
            return;
        }
        long elapsed = Math.max(0, nowMs - lastRefillMs);
        tokens = Math.min(capacity, tokens + elapsed * refillPerSecond / 1000.0d);
        lastRefillMs = nowMs;
    }
}
