package com.lld.ratelimit;

/**
 * Two numbers again: the water level, and when it was last leaked.
 *
 * The picture people draw is a queue that drains at a fixed rate. The queue
 * is the right drawing and the wrong store. You only need the level, because
 * the drain is "elapsed times rate" and the arrival is "+1". A queue would
 * store every request the bucket is already summarizing.
 *
 * Unlike a token bucket, saved quiet time does not become a burst. The level
 * cannot go below zero, and it cannot jump up by more than one request.
 */
public final class LeakyBucket implements Limiter {
    private final double capacity;
    private final double leakPerSecond;
    private double level;
    private long lastLeakMs;
    private boolean initialized;

    public LeakyBucket(double capacity, double leakPerSecond) {
        this.capacity = capacity;
        this.leakPerSecond = leakPerSecond;
    }

    @Override
    public synchronized Decision tryAcquire(long nowMs) {
        leak(nowMs);
        if (level + 1.0d > capacity) {
            long retryMs = (long) Math.ceil((level + 1.0d - capacity) / leakPerSecond * 1000.0d);
            return Decision.deny(Math.round(capacity), 0, retryMs);
        }
        level += 1.0d;
        return Decision.allow(Math.round(capacity), (long) Math.floor(capacity - level));
    }

    private void leak(long nowMs) {
        if (!initialized) {
            lastLeakMs = nowMs;
            initialized = true;
            return;
        }
        long elapsed = Math.max(0, nowMs - lastLeakMs);
        level = Math.max(0.0d, level - elapsed * leakPerSecond / 1000.0d);
        lastLeakMs = nowMs;
    }
}
