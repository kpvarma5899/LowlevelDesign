package com.lld.ratelimit;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

/** Checks the claims in the note. Run from the questions/rate-limiter directory. */
public final class AlgorithmDemo {
    public static void main(String[] args) throws Exception {
        fixedWindowAllowsBothBursts();
        slidingLogKeepsTheFirstBurst();
        tokenBucketRefillsOneToken();
        counterMatchesTheWorkedNumbers();
        leakyBucketDropsTheSpike();
        oneTokenIsTakenOnce();
        System.out.println("ok");
    }

    private static void fixedWindowAllowsBothBursts() {
        FixedWindow limiter = new FixedWindow(10_000, 10);
        int first = allows(limiter, 9_000, 10);
        int second = allows(limiter, 10_000, 10);
        check(first == 10 && second == 10, "fixed window hid the boundary");
    }

    private static void slidingLogKeepsTheFirstBurst() {
        SlidingWindowLog limiter = new SlidingWindowLog(10_000, 10);
        int first = allows(limiter, 9_000, 10);
        int second = allows(limiter, 10_000, 10);
        check(first == 10 && second == 0, "sliding log should still see t=9s");
    }

    private static void tokenBucketRefillsOneToken() {
        TokenBucket limiter = new TokenBucket(10, 1);
        int first = allows(limiter, 9_000, 10);
        int second = allows(limiter, 10_000, 10);
        check(first == 10 && second == 1, "bucket should refill one token in one second");
    }

    private static void counterMatchesTheWorkedNumbers() {
        long estimate = SlidingWindowCounter.estimate(80, 20, 15_000, 60_000);
        check(estimate == 80, "80 * 0.75 + 20 = 80");
        long over = SlidingWindowCounter.estimate(80, 41, 15_000, 60_000);
        check(over == 101, "80 * 0.75 + 41 = 101");
    }

    private static void leakyBucketDropsTheSpike() {
        LeakyBucket limiter = new LeakyBucket(1, 1);
        check(limiter.tryAcquire(0).allowed, "empty bucket takes one");
        check(!limiter.tryAcquire(0).allowed, "a second request at the same time waits");
        check(limiter.tryAcquire(1_000).allowed, "one second of leak makes room for one");
    }

    private static void oneTokenIsTakenOnce() throws Exception {
        KeyedTokenBuckets buckets = new KeyedTokenBuckets(1, 1);
        int threads = 32;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger allowed = new AtomicInteger();
        for (int i = 0; i < threads; i++) {
            new Thread(() -> {
                try {
                    start.await();
                    if (buckets.tryAcquire("user:42", 0).allowed) {
                        allowed.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await();
        check(allowed.get() == 1, "two threads took the last token");
    }

    private static int allows(Limiter limiter, long nowMs, int attempts) {
        int n = 0;
        for (int i = 0; i < attempts; i++) {
            if (limiter.tryAcquire(nowMs).allowed) {
                n++;
            }
        }
        return n;
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
