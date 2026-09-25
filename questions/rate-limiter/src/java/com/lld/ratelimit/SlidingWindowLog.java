package com.lld.ratelimit;

import java.util.ArrayDeque;

/**
 * One timestamp per allowed request, oldest at the front.
 *
 * ArrayDeque is the structure because requests only expire from the old end.
 * peekFirst is the oldest, removeFirst drops it, addLast records a new hit.
 * All three are O(1). A HashSet cannot find "older than T" without a scan.
 * A HashMap keyed only by timestamp collapses two requests in the same
 * millisecond into one entry. A TreeMap pays for ordered delete of an
 * arbitrary key, and this algorithm never deletes from the middle.
 *
 * The same shape in Redis is a sorted set: score is the timestamp, member
 * is a unique id. See redis/sliding-window-log.lua. A Redis list is the
 * wrong shared structure because it cannot delete by score in one command.
 */
public final class SlidingWindowLog implements Limiter {
    private final ArrayDeque<Long> hits = new ArrayDeque<>();
    private final long windowMs;
    private final int limit;

    public SlidingWindowLog(long windowMs, int limit) {
        this.windowMs = windowMs;
        this.limit = limit;
    }

    @Override
    public synchronized Decision tryAcquire(long nowMs) {
        long cutoff = nowMs - windowMs;
        while (!hits.isEmpty() && hits.peekFirst() <= cutoff) {
            hits.removeFirst();
        }
        if (hits.size() >= limit) {
            long retryAt = hits.peekFirst() + windowMs;
            return Decision.deny(limit, 0, retryAt - nowMs);
        }
        hits.addLast(nowMs);
        return Decision.allow(limit, limit - hits.size());
    }
}
