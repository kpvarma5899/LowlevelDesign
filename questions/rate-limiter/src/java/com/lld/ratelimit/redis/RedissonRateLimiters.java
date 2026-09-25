package com.lld.ratelimit.redis;

import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.redisson.Redisson;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RScript;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.redisson.config.Config;

/**
 * Redisson already runs a Lua rate limiter. It is a token bucket, not a sorted set.
 *
 * RRateLimiter.tryAcquire refills permits from elapsed time inside one script.
 * RateType.OVERALL is the shared limit across every gateway pod. PER_CLIENT
 * gives each Redisson instance its own budget, which is the 20-pod bug again.
 *
 * The sorted-set sliding log is not what RRateLimiter stores. RScoredSortedSet
 * is the Java type for the ZSET, and removeRangeByScore then size then add is
 * three commands. Atomicity still means RScript.eval of SlidingWindowLogScript.
 */
public final class RedissonRateLimiters {
    private final RedissonClient redisson;

    public RedissonRateLimiters(String redisAddress) {
        Config config = new Config();
        config.useSingleServer().setAddress(redisAddress);
        this.redisson = Redisson.create(config);
    }

    /** Token bucket. 10 permits per second, one shared bucket for this name. */
    public boolean tryAcquireTokenBucket(String name) {
        RRateLimiter limiter = redisson.getRateLimiter(name);
        limiter.trySetRate(RateType.OVERALL, 10, 1, RateIntervalUnit.SECONDS);
        return limiter.tryAcquire(5, TimeUnit.MILLISECONDS);
    }

    /** Exact sliding window. The script is the lock. The member must be unique. */
    public boolean tryAcquireSlidingLog(String key, long nowMs, long windowMs, int limit) {
        String member = nowMs + ":" + UUID.randomUUID();
        Object raw = redisson.getScript(StringCodec.INSTANCE).eval(
                RScript.Mode.READ_WRITE,
                SlidingWindowLogScript.LUA,
                RScript.ReturnType.MULTI,
                Collections.singletonList((Object) key),
                String.valueOf(nowMs),
                String.valueOf(windowMs),
                String.valueOf(limit),
                member);
        return raw instanceof java.util.List<?> result && "1".equals(String.valueOf(result.get(0)));
    }

    public void close() {
        redisson.shutdown();
    }
}
