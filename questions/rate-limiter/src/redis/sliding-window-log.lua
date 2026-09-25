-- One identity. One sorted set.
-- Score is the request time in milliseconds. Member is a unique id, never
-- the timestamp alone: two requests in the same millisecond would overwrite
-- one ZSET member and the limit would under-count.
--
-- KEYS[1]  the sorted set
-- ARGV[1]  now, ms
-- ARGV[2]  window, ms
-- ARGV[3]  limit
-- ARGV[4]  unique member
--
-- Returns {allowed, count, retryAfterMs}

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
    if retry < 0 then
      retry = 0
    end
  end
  redis.call('PEXPIRE', KEYS[1], window)
  return {0, count, retry}
end

redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window)
return {1, count + 1, 0}
