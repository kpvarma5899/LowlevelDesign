package com.lld.ratelimit;

/** The result of one check. remaining is whole tokens left after an allow. */
public final class Decision {
    public final boolean allowed;
    public final long limit;
    public final long remaining;
    public final long retryAfterMs;

    private Decision(boolean allowed, long limit, long remaining, long retryAfterMs) {
        this.allowed = allowed;
        this.limit = limit;
        this.remaining = remaining;
        this.retryAfterMs = retryAfterMs;
    }

    public static Decision allow(long limit, long remaining) {
        return new Decision(true, limit, remaining, 0);
    }

    public static Decision deny(long limit, long remaining, long retryAfterMs) {
        return new Decision(false, limit, remaining, Math.max(0, retryAfterMs));
    }
}
