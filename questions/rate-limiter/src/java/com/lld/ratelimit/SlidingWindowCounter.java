package com.lld.ratelimit;

/**
 * Two counters: the previous clock bucket and the current one.
 *
 * This is the compromise when a sliding log is too big. You do not store
 * each timestamp, so you cannot know whether the previous bucket's requests
 * landed at its start or its end. The weight assumes they were spread evenly.
 * That is the approximation. Two ints are the whole state because that is
 * all the formula reads.
 *
 * Not a Redis sorted set. The sorted set is SlidingWindowLog.
 */
public final class SlidingWindowCounter implements Limiter {
    private final long windowMs;
    private final int limit;
    private long windowStart;
    private int previous;
    private int current;
    private boolean initialized;

    public SlidingWindowCounter(long windowMs, int limit) {
        this.windowMs = windowMs;
        this.limit = limit;
    }

    /** previous * overlap + current. Integer division matches the worked example. */
    public static long estimate(int previous, int current, long elapsedMs, long windowMs) {
        return (long) previous * (windowMs - elapsedMs) / windowMs + current;
    }

    @Override
    public synchronized Decision tryAcquire(long nowMs) {
        long start = Math.floorDiv(nowMs, windowMs) * windowMs;
        if (!initialized) {
            windowStart = start;
            initialized = true;
        } else if (start != windowStart) {
            long skipped = (start - windowStart) / windowMs;
            previous = skipped == 1 ? current : 0;
            current = 0;
            windowStart = start;
        }
        long elapsed = nowMs - windowStart;
        long estimated = estimate(previous, current, elapsed, windowMs);
        if (estimated >= limit) {
            return Decision.deny(limit, 0, windowStart + windowMs - nowMs);
        }
        current++;
        return Decision.allow(limit, Math.max(0, limit - estimated - 1));
    }
}
