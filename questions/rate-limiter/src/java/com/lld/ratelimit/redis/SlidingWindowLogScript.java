package com.lld.ratelimit.redis;

/**
 * The Redis form of SlidingWindowLog.
 *
 * A sorted set is the structure because the shared log has to drop every
 * member with score &lt;= now-window and then count what remains. ZREMRANGEBYSCORE
 * does the drop. ZCARD does the count. ZADD records the request. A string
 * counter has no timestamps. A hash has no range delete. A list is ordered by
 * insertion, not by score, so "older than T" is a walk.
 *
 * The three commands have to be one Lua script. Sent separately, two clients
 * can both ZCARD under the limit and both ZADD. MULTI/EXEC cannot branch on
 * ZCARD before it decides to ZADD: the results come back only at EXEC, so the
 * ZADD was already queued. WATCH plus a retry works and falls over on a hot key.
 * Redis runs the script to completion with no other command interleaved.
 */
public final class SlidingWindowLogScript {
    public static final String LUA = """
            local now = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local limit = tonumber(ARGV[3])
            local member = ARGV[4]
            local cutoff = now - window
            redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
            local count = redis.call('ZCARD', KEYS[1])
            if count >= limit then
              local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
              local retry = 0
              if oldest[2] ~= nil then
                retry = tonumber(oldest[2]) + window - now
                if retry < 0 then retry = 0 end
              end
              redis.call('PEXPIRE', KEYS[1], window)
              return {0, count, retry}
            end
            redis.call('ZADD', KEYS[1], now, member)
            redis.call('PEXPIRE', KEYS[1], window)
            return {1, count + 1, 0}
            """;

    private SlidingWindowLogScript() {}
}
