import {
  BarChart,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Divider,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  UsageBar,
  useCanvasState,
  useState,
} from "cursor/canvas";

type Section = "round" | "algorithms" | "architecture" | "classes" | "followups";

export default function RateLimiterDesign() {
  const [section, setSection] = useCanvasState<Section>("section", "round");

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Design a rate limiter</H1>
        <Text tone="secondary">
          Question 2. High-level design is a thin shell here. The score is the
          algorithm, the race between two servers, and what you do when the
          limiter itself is sick.
        </Text>
      </Stack>

      <Callout tone="info" title="The sentence to close on">
        Decide with one atomic check-and-consume on a shared counter, answer
        429 with Retry-After, and keep a Redis timeout from taking down the
        API the limiter is there to protect.
      </Callout>

      <Row gap={24} wrap>
        <Stat value="Token bucket" label="Algorithm to defend" />
        <Stat value="1 ms" label="Decision budget, same AZ" />
        <Stat value="429" label="HTTP status when denied" />
        <Stat value="Lua" label="The lock, inside Redis" />
      </Row>

      <Table
        headers={["", "High-level design", "Low-level design"]}
        rows={[
          [
            "You draw",
            "Gateway, Redis, local deny-cache, the API behind it",
            "Rule, TokenBucket, Store, Decision",
          ],
          [
            "You defend",
            "Where the check sits, fail-open vs fail-closed, hot keys",
            "Refill math, atomic consume, Retry-After",
          ],
          [
            "They are testing",
            "Whether N servers still enforce one limit",
            "Whether two concurrent requests can both take the last token",
          ],
        ]}
        columnAlign={["left", "left", "left"]}
      />

      <Row gap={8} wrap>
        <Pill active={section === "round"} onClick={() => setSection("round")}>
          The round
        </Pill>
        <Pill
          active={section === "algorithms"}
          onClick={() => setSection("algorithms")}
        >
          Algorithms
        </Pill>
        <Pill
          active={section === "architecture"}
          onClick={() => setSection("architecture")}
        >
          Architecture
        </Pill>
        <Pill active={section === "classes"} onClick={() => setSection("classes")}>
          Classes
        </Pill>
        <Pill
          active={section === "followups"}
          onClick={() => setSection("followups")}
        >
          Follow-ups
        </Pill>
      </Row>

      {section === "round" && <RoundSection />}
      {section === "algorithms" && <AlgorithmsSection />}
      {section === "architecture" && <ArchitectureSection />}
      {section === "classes" && <ClassesSection />}
      {section === "followups" && <FollowupsSection />}
    </Stack>
  );
}

function RoundSection() {
  return (
    <Stack gap={20}>
      <H2>How you spend the 45 minutes</H2>
      <Text>
        Start in one process so the algorithm is correct. Then add a second
        server and let the interviewer watch the limit become N times too
        large. That jump is the whole design. Requirements, a one-minute
        estimate, the decision API, then the deep dive they pick — almost
        always the algorithm or the race.
      </Text>

      <H3>Requirements you say out loud</H3>
      <Text>
        Functional, in scope: given an identity and a rule, allow or deny this
        request. Identity is a user id, an API key, or an IP. A request can
        sit under several rules at once (10 per second and 1,000 per day; per
        user and per IP). On deny, the caller learns how long to wait. Rules
        differ by route and by plan.
      </Text>
      <Text>
        Out of scope until they pull it back in: volumetric network DDoS (that
        is a scrubbing center and a WAF), billing, and a full admin UI for
        rules. Name those so the interviewer can grab one.
      </Text>
      <Text>
        Non-functional: the decision is on the critical path, so budget about
        1 ms inside the same availability zone. Accuracy means “a client
        cannot sustain more than the rule,” with a small burst allowed on
        purpose. Availability of the limiter matters because a hung check
        becomes a hung API. The limit must hold across every app server, which
        is the requirement a single-process map fails.
      </Text>

      <H3>Estimate</H3>
      <Text>
        Use round numbers. 10,000 requests per second at the gateway. A few
        million active identities. Each decision reads and writes a few dozen
        bytes. A couple of million keys at ~100 bytes is on the order of a
        few hundred MB. Storage is not the constraint. The constraint is an
        extra millisecond on every request, and one Redis key that a single
        abusive client can hammer.
      </Text>
      <Table
        headers={["Input", "Figure", "What it tells you"]}
        rows={[
          ["Gateway traffic", "10,000 req/s", "Every one of these pays for a decision"],
          ["Hot identities", "~2 million", "Key cardinality, not request log size"],
          ["State per key", "~100 bytes", "A few hundred MB total. Forget storage."],
          ["Redis in-AZ round trip", "~0.5–1 ms", "One script. Four round trips is already the budget."],
          ["Decision budget", "1 ms p99", "Timeouts have to be shorter than the API timeout"],
        ]}
      />

      <H3>API</H3>
      <Text>
        This is middleware on the gateway, plus a small internal function.
        Lead with the function. The HTTP shape is how the client experiences
        the deny.
      </Text>
      <Table
        headers={["Surface", "Shape"]}
        rows={[
          [
            "Library",
            "decide(request) → { allowed, limit, remaining, retryAfterMs }",
          ],
          [
            "Allow",
            "Call the upstream. Set X-RateLimit-Limit, Remaining, Reset.",
          ],
          [
            "Deny",
            "429 Too Many Requests. Retry-After in seconds, ceiling of retryAfterMs.",
          ],
          [
            "Identity",
            "User id when authenticated, else API key, else IP. Tell them which, in that order.",
          ],
        ]}
      />
      <Text tone="secondary" size="small">
        Retry-After is an integer number of seconds in the common header.
        Sub-second waits still round up to 1. Say that before they ask.
      </Text>

      <H3>Data model</H3>
      <Text>
        A token bucket is two numbers. That is the entire record. Keyed by
        rule plus identity, for example rl:create_url:user:42.
      </Text>
      <Table
        headers={["Field", "Meaning"]}
        rows={[
          ["tokens", "Fractional tokens available right now"],
          ["last_refill_ms", "When those tokens were last computed"],
          ["TTL", "Long enough to refill from empty to full, then the key can disappear"],
        ]}
      />
      <Text>
        An idle user costs nothing after the TTL. A missing key means a full
        bucket, because they have not spent anything in this window of
        interest. That default is easy to get backwards: a missing key means
        “no budget left” only if you are storing a denial, never if you are
        storing the bucket.
      </Text>
    </Stack>
  );
}

function AlgorithmsSection() {
  return (
    <Stack gap={20}>
      <H2>Five algorithms, one recommendation</H2>
      <Text>
        Pick the token bucket. It allows a bounded burst and then enforces a
        steady rate, the state is O(1) per key, and the consume step is one
        atomic script. Walk the other four only to show you know the bug each
        one leaves behind.
      </Text>

      <Table
        headers={["Algorithm", "State per key", "Burst", "What you tell the interviewer"]}
        rows={[
          [
            "Token bucket",
            "2 numbers",
            "Up to capacity, then the refill rate",
            "Default. Burst is a parameter, not an accident.",
          ],
          [
            "Leaky bucket",
            "Queue depth, or a last-leak time",
            "Output is flat. Excess waits or is dropped.",
            "Use when the downstream cannot accept a spike at all.",
          ],
          [
            "Fixed window",
            "1 counter + window start",
            "Up to 2× the limit, straddling the boundary",
            "Cheap, and wrong in a way you can demonstrate with two timestamps.",
          ],
          [
            "Sliding log",
            "One timestamp per request",
            "Exact over any window",
            "Right answer at low QPS. Memory and CPU follow the request rate.",
          ],
          [
            "Sliding window counter",
            "2 counters",
            "Approximate",
            "The compromise when a log is too big and a fixed window is too crude.",
          ],
        ]}
        rowTone={["success", "info", "warning", "neutral", "neutral"]}
      />

      <H3>The boundary bug, in one picture</H3>
      <Text>
        Rule: 10 requests in any 10 seconds. The client has a full budget,
        then sends 10 requests at t = 9s and another 10 at t = 10s. Fixed
        windows are aligned to t = 0, so those bursts fall in two different
        counters and both succeed. Twenty requests land in one second.
      </Text>
      <BarChart
        categories={["Burst at t = 9s", "Burst at t = 10s"]}
        series={[
          { name: "Fixed window", data: [10, 10], tone: "warning" },
          { name: "Sliding log", data: [10, 0], tone: "success" },
          { name: "Token bucket (capacity 10, 1/s)", data: [10, 1], tone: "info" },
        ]}
        yMax={12}
        showValues
        height={240}
        referenceLines={[{ value: 10, label: "Stated limit", tone: "neutral" }]}
      />
      <Text tone="secondary" size="small">
        Requests allowed (count) from each burst of 10. Y-axis is requests
        allowed. Source: worked example, idle client, full budget before t =
        9s. Fixed-window buckets are [0, 10) and [10, 20).
      </Text>
      <Text>
        The sliding log keeps every timestamp, drops those older than 10
        seconds, and at t = 10s still sees the ten from t = 9s, so the second
        burst is fully denied. The token bucket spends all 10 tokens at t =
        9s, refills one token over the next second, and allows a single
        request from the second burst. Same steady rate, and the burst size
        is exactly the capacity you configured.
      </Text>

      <H3>Token bucket math</H3>
      <Text>
        Capacity is the burst. Refill rate is the sustained rate. On each
        request, at time now:
      </Text>
      <Text weight="medium">
        tokens = min(capacity, tokens + (now − last) × rate)
      </Text>
      <Text>
        If tokens ≥ cost (usually 1), subtract the cost and allow. Otherwise
        deny. The wait is (cost − tokens) / rate. Store the new token count
        and last = now. Because refill is computed from timestamps, you do
        not run a background thread that drips tokens. Idle keys simply
        expire.
      </Text>
      <Card>
        <CardHeader trailing={<Pill size="sm" active>capacity 5, rate 1/s</Pill>}>
          Worked consume
        </CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text>
              t = 0, bucket full at 5. Five requests are allowed and the
              bucket hits 0. A sixth request at t = 0.2s sees 0.2 tokens,
              is denied, and Retry-After is ceil(0.8s) = 1 second, because
              the header is whole seconds. At t = 3s the bucket has 3 tokens
              and three requests pass.
            </Text>
            <Text tone="secondary" size="small">
              Fractional tokens are the feature. They make a rate of 5 per
              second meaningful between whole requests.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <TokenBucketLab />

      <H3>Sliding window counter, when they push past “just use a log”</H3>
      <Text>
        Keep the previous window’s count and the current window’s count.
        Estimate how many requests fall inside the last full window of time:
      </Text>
      <Text weight="medium">
        estimate = previous × (1 − elapsed / window) + current
      </Text>
      <Text>
        Window 60s, limit 100. Previous window closed at 80. We are 15s into
        the current window, and 20 requests have landed in it. The previous
        window still overlaps the sliding 60s by 45/60 = 0.75, so estimate =
        80 × 0.75 + 20 = 80. The next request is allowed. If the current
        count were 41, estimate = 60 + 41 = 101, and you deny.
      </Text>
      <Text>
        The lie in the formula: it assumes the previous window’s requests
        were spread evenly. If all 80 arrived in the last second of that
        window, the true sliding count is higher than the estimate, and you
        let a bit too much through. Say that limitation in the same breath
        as the formula. Interviewers who know this question are listening
        for it.
      </Text>

      <H3>Leaky bucket, in one contrast that is a real choice</H3>
      <Text>
        A leaky bucket drains at a constant rate. A request either occupies a
        slot in a queue that empties at that rate, or it is dropped when the
        queue is full. The downstream sees a flat arrival rate. A token
        bucket lets the client spend a saved-up burst immediately, which is
        what you want for an interactive API. A leaky bucket is what you
        want in front of a database or a worker pool that falls over on
        spikes and is fine at a steady pace. Pick per rule, not once for the
        whole company.
      </Text>
    </Stack>
  );
}

function TokenBucketLab() {
  const capacity = 5;
  const rate = 1;
  const [tokens, setTokens] = useState(capacity);
  const [seconds, setSeconds] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  function advance() {
    setTokens((current) => Math.min(capacity, current + rate));
    setSeconds((current) => current + 1);
  }

  function send(count: number) {
    let next = tokens;
    let allowed = 0;
    let denied = 0;
    for (let i = 0; i < count; i++) {
      if (next >= 1) {
        next -= 1;
        allowed += 1;
      } else {
        denied += 1;
      }
    }
    const retrySec = next >= 1 ? 0 : (1 - next) / rate;
    setTokens(next);
    const denial =
      denied > 0 ? `, retry after ${retrySec.toFixed(1)}s` : "";
    setLog((prev) =>
      [
        `t=${seconds}s  send ${count}  →  ${allowed} allowed, ${denied} denied${denial}`,
        ...prev,
      ].slice(0, 5),
    );
  }

  function reset() {
    setTokens(capacity);
    setSeconds(0);
    setLog([]);
  }

  return (
    <Card>
      <CardHeader trailing={<Pill size="sm">capacity 5 · refill 1/s</Pill>}>
        Token bucket you can click
      </CardHeader>
      <CardBody>
        <Stack gap={12}>
          <UsageBar
            total={capacity}
            topLeftLabel={`t = ${seconds}s`}
            topRightLabel={`${tokens.toFixed(1)} / ${capacity} tokens`}
            segments={[{ id: "tokens", value: tokens, color: "green" }]}
          />
          <Row gap={8} wrap>
            <Button onClick={advance}>+1 second</Button>
            <Button variant="primary" onClick={() => send(1)}>
              Send 1
            </Button>
            <Button variant="secondary" onClick={() => send(5)}>
              Send 5
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </Row>
          <Text tone="secondary" size="small">
            Start full. Send 5, then send 1 immediately: the last one is
            denied and the wait is 1.0s. Advance one second and a single
            send is allowed again. That is the burst, then the rate.
          </Text>
          {log.length > 0 && (
            <Text size="small" style={{ whiteSpace: "pre-wrap" }}>
              {log.join("\n")}
            </Text>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}

function ArchitectureSection() {
  return (
    <Stack gap={20}>
      <H2>One limit, many servers</H2>
      <Text>
        An in-process map is the correct low-level design for one process and
        the wrong system the moment a second process starts. Twenty pods each
        enforcing 100 requests per second allow 2,000. The configured number
        and the real number diverge by your replica count.
      </Text>

      <H3>Where the check lives</H3>
      <Table
        headers={["Placement", "What it actually guarantees"]}
        rows={[
          [
            "Client",
            "Courtesy only. A client you do not control simply skips it.",
          ],
          [
            "API gateway, shared store",
            "One policy for every route and every replica. This is the default.",
          ],
          [
            "Inside each service, in memory",
            "Correct only for a limit that is allowed to scale with the number of pods.",
          ],
          [
            "Dedicated limiter service",
            "Worth it when many languages must share one policy. It is an extra hop on the hot path.",
          ],
        ]}
        rowTone={["warning", "success", "warning", "info"]}
      />
      <Text>
        Draw the gateway in front of the API. The gateway calls Redis with
        one script and, on allow, forwards upstream. Next to that, a small
        in-process cache of active denials: if this identity is already
        rejected until time T, return 429 without a network call. That cache
        is an optimization against retry storms. The source of truth stays
        in Redis.
      </Text>

      <H3>The race you will be asked to perform</H3>
      <Text>
        Two gateway nodes, one token left. Each does GET, sees 1, decides to
        allow, then SET 0. Two requests pass. The budget was one.
      </Text>
      <Table
        headers={["Step", "Server A", "Server B", "Redis tokens"]}
        rows={[
          ["Read", "sees 1", "sees 1", "1"],
          ["Decide", "allow", "allow", "1"],
          ["Write", "SET 0", "SET 0", "0"],
          ["Outcome", "allowed", "allowed", "2 spends of 1 token"],
        ]}
        rowTone={[undefined, undefined, undefined, "danger"]}
      />
      <Text>
        The fix is to stop splitting the read and the write across the
        network. Redis runs the refill and the decrement inside one Lua
        script, and Redis runs that script atomically on the key. The second
        caller sees the first caller’s result. An application mutex orders
        threads inside one process; it does not order two processes. The
        unique constraint played this role for the URL shortener. The script
        plays it here.
      </Text>
      <Text>
        INCR plus EXPIRE is atomic enough for a fixed-window counter, and it
        is still the wrong algorithm because of the boundary bug. Use it only
        if you have already accepted that approximation. For a token bucket,
        INCR cannot express “add the elapsed refill, then subtract one, and
        do both or neither.”
      </Text>

      <H3>Several rules on one request</H3>
      <Text>
        A create-link call might face a per-user rule and a per-IP rule. If
        the IP rule is going to deny, consuming the user’s tokens charges
        them for a request you rejected. Evaluate every rule inside one
        script and commit every decrement only if all of them allow. One
        round trip, all or nothing.
      </Text>
      <Text>
        Order identities as user, then API key, then IP, and apply the most
        specific matching rules. A global ceiling per pod, held in memory,
        sits in front of Redis as a coarse fuse: it is allowed to be
        approximate because its job is to keep one box from melting, not to
        implement the customer’s plan.
      </Text>

      <H3>Redis is slow or down</H3>
      <Table
        headers={["Traffic", "On timeout", "Why"]}
        rows={[
          [
            "Ordinary product API",
            "Fail open, behind a local emergency cap",
            "A limiter outage should not become a full API outage. The local cap stops an unbounded flood while Redis is gone.",
          ],
          [
            "Login, OTP, password reset, payment create",
            "Fail closed",
            "Abuse during the outage costs more than a short period of 429s.",
          ],
        ]}
        rowTone={["info", "danger"]}
      />
      <Text>
        The timeout is a few milliseconds, shorter than the request deadline.
        A Redis that answers in 800 ms is a failed Redis. Waiting on it moves
        the outage into every API call. Record fail-open events as a metric;
        a silent fail-open hides a long Redis incident behind healthy API
        graphs.
      </Text>

      <H3>The hot key</H3>
      <Text>
        One API key at 50,000 requests per second lands on one Redis key, and
        in cluster mode on one slot and one node. The rest of the cluster is
        idle. Mitigations, in the order you should say them: the local
        deny-cache absorbs the retries after the first denial; a per-pod
        pre-limit sheds load before Redis; for a global limit that must stay
        exact under that much traffic, you shard the counter and accept a
        more complicated sum. Most product limits never need the third step.
        Name it so they know you saw the ceiling.
      </Text>
    </Stack>
  );
}

function ClassesSection() {
  return (
    <Stack gap={20}>
      <H2>The service, opened up</H2>
      <Text>
        Four types. The service does not know Redis. The store does not know
        HTTP. Tests run against an in-memory store that implements the same
        atomic consume, so the race logic is unit-testable without a network.
      </Text>

      <Card>
        <CardHeader>Types</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text>
              RateLimitRule — id, capacity, refillPerSecond, cost, failClosed
            </Text>
            <Text>
              Decision — allowed, limit, remaining, retryAfterMs
            </Text>
            <Text>
              TokenBucketStore.tryConsume(key, rule, nowMs) → Decision
            </Text>
            <Text>
              RateLimiter.decide(request, nowMs) → Decision
            </Text>
            <Text tone="secondary" size="small">
              RedisLuaTokenBucket and InMemoryTokenBucket both implement
              TokenBucketStore. LocalDenyCache sits in RateLimiter, in front
              of the store.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>decide</H3>
      <Text>
        Resolve the identity. If the local deny-cache says this key is
        blocked until a future time, return 429 with the remaining wait.
        Build the list of rules that apply. Call tryConsume once with all of
        them. If the decision is a denial, cache it until now + retryAfter.
        If the store timed out, follow the rule’s fail mode: a local
        emergency cap for fail-open, a denial for fail-closed. Translate a
        denial into HTTP 429 and Retry-After = ceil(retryAfterMs / 1000).
      </Text>

      <H3>tryConsume, the whole algorithm</H3>
      <Text>Inside the atomic section, for a single rule:</Text>
      <Table
        headers={["Step", "Operation"]}
        rows={[
          ["1", "Read tokens and last_refill_ms. Missing key → tokens = capacity, last = now."],
          ["2", "elapsed = max(0, now − last). Guard a backwards clock."],
          ["3", "tokens = min(capacity, tokens + elapsed × rate)"],
          ["4", "If tokens < cost, return denied. retry = (cost − tokens) / rate. Do not write a spend."],
          ["5", "Else tokens = tokens − cost, write both fields, refresh TTL, return allowed."],
        ]}
      />
      <Text>
        For several rules, run steps 1–4 for every rule first. If any rule
        denies, write nothing. If all allow, apply every decrement and then
        return. That is the all-or-nothing consume.
      </Text>
      <Text>
        now is an argument, not a hidden call to the system clock. Tests
        advance time explicitly. Production passes the gateway’s clock. This
        is also how you explain clock skew: the timestamp that matters is the
        one Redis uses if you move now into the script, so two app servers
        with drifting clocks cannot both refill the bucket from their own
        watches. Prefer Redis TIME inside the script, or accept app-server
        time and keep servers on NTP with a skew far below your window.
      </Text>

      <H3>Concurrency inside one process</H3>
      <Text>
        The in-memory store still has threads. One lock per key, or a
        striped lock, covers the read-modify-write of that bucket. A single
        global lock serializes unrelated users and becomes the bottleneck you
        just built. The Redis implementation takes no application lock around
        the script. Holding a lock while you wait on the network stalls
        every other request that hashes to the same stripe.
      </Text>

      <Divider />

      <H3>What you monitor</H3>
      <Table
        headers={["Signal", "Why it pages"]}
        rows={[
          ["Decision latency p99", "The limiter is on the critical path"],
          ["Redis timeout rate", "Fail-open may be hiding a down dependency"],
          ["Deny rate by rule", "A bad rule deploy looks like an outage"],
          ["Hot-key request rate", "One identity pinning one Redis node"],
          ["Fail-open count", "Must not be a silent zero in the dashboard"],
        ]}
      />
    </Stack>
  );
}

function FollowupsSection() {
  return (
    <Stack gap={8}>
      <H2>Questions they ask after you pick token bucket</H2>
      <Text tone="secondary">
        Open these in order. They are the probes from the distributed rate
        limiter rounds: the algorithm, the race, then scale, failure, and
        configuration.
      </Text>

      <CollapsibleSection title="Why token bucket, in one sentence?" defaultOpen>
        <Stack gap={8}>
          <Text>
            It enforces a sustained rate, the burst is an explicit capacity
            you chose, and the state is two numbers so the atomic update stays
            cheap. A fixed window hides a 2× burst on the boundary. A sliding
            log is exact and stores every request. A leaky bucket is the
            right tool when the thing behind you cannot take a burst; it is
            the wrong default for an interactive API that should feel
            responsive after a quiet period.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="Show the fixed-window bug with timestamps" defaultOpen>
        <Stack gap={8}>
          <Text>
            Limit 10 per 10 seconds. Windows [0, 10) and [10, 20). Ten
            requests at t = 9.9s fill window 1. Ten requests at t = 10.0s
            fill window 2. Twenty requests succeed in 100 milliseconds. The
            chart on the Algorithms tab is this bug. The cure is a window
            that moves with the request, or a token bucket that never resets
            a counter to zero just because a wall-clock boundary passed.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="Two servers see one token. Walk the race." defaultOpen>
        <Stack gap={8}>
          <Text>
            GET, decide, SET on both servers allows the request twice. The
            serialization point has to be the place that holds the counter.
            One Lua script on that Redis key refills and decrements before
            anyone else runs. `MULTI`/`EXEC` does not save a design that
            still does the read in one round trip and the write in another.
            `INCR` cannot express “add the elapsed refill, then subtract, or
            do neither.” A `SETNX` lock is a second round trip and a TTL to
            get wrong. The Redis event loop is the lock.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="The limit is 100 per second and you run 20 pods.">
        <Stack gap={8}>
          <Text>
            An in-memory limiter allows 2,000 per second. State the real
            number out loud; that is the answer. Shared Redis brings it back
            to 100. A per-pod ceiling still belongs in the design as a fuse,
            set high enough that normal traffic never hits it and low enough
            that one pod cannot exhaust the box. It is a different rule, with
            a different job, from the customer’s 100 per second.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="How do you compute Retry-After?">
        <Stack gap={8}>
          <Text>
            Deficit divided by refill rate. Cost is 1, tokens left are 0.2,
            rate is 2 per second: wait is 0.8 / 2 = 0.4 seconds. The HTTP
            header is whole seconds, so you send Retry-After: 1. Also return
            the precise millisecond value in a body or in X-RateLimit-Reset
            if the client is yours and can use it. A client that retries
            immediately is the reason for the local deny-cache: once you have
            told them to wait, stop asking Redis on every angry retry.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="User rule would allow it. IP rule denies it. What did you charge?">
        <Stack gap={8}>
          <Text>
            Nothing, if you wrote the script correctly. Check every applicable
            bucket, and decrement only when every check passes. Charging the
            user for a request the IP rule rejected empties a legitimate
            user’s budget because they share a NAT with a noisy neighbor.
            One script, one round trip, commit at the end.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="Redis times out. Do you allow the request?">
        <Stack gap={8}>
          <Text>
            Say which product you are protecting before you pick. Ordinary
            APIs fail open behind a local emergency cap, so a limiter outage
            is not an API outage. Login, OTP, and payment create fail closed.
            A feed or a viral write path can also fail closed: if Redis died
            because traffic already spiked, failing open dumps that spike onto
            the database. The timeout is a few milliseconds. A Redis that
            answers in 800 ms is a failed Redis. Put the fail-open count on a
            dashboard. Replicas and automatic failover are how you avoid the
            choice, not a substitute for having made it.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="One key sends 50,000 requests a second.">
        <Stack gap={8}>
          <Text>
            Every decision hits the same Redis key, so cluster mode does not
            save you; the slot lives on one node. After the first denial, the
            gateway remembers the denial locally and stops forwarding the
            retries. A per-pod pre-limit sheds the rest. Sharding that one
            counter across keys is the step you take only if this key is
            supposed to be allowed to run that hot and you still need a tight
            global number. Most of the time the right product behavior is to
            deny early and cheaply.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="Whose clock refills the bucket?">
        <Stack gap={8}>
          <Text>
            Two app servers with clocks a few seconds apart will each compute
            a generous refill and both write it back. Take the time inside
            Redis, in the same script as the update, so there is one clock.
            If you pass the app’s timestamp, NTP has to keep skew well under
            the smallest window you enforce, and a backwards step must not
            add a negative refill. elapsed = max(0, now − last) is that
            guard.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="A client retries the same payment. Does it count twice?">
        <Stack gap={8}>
          <Text>
            A rate limiter counts attempts, not successful business outcomes.
            The retry is another request and it spends another token. That is
            what you want against a client looping on purpose. Idempotency is
            a different mechanism: an Idempotency-Key makes the second
            payment a no-op in the payment service. You still rate-limit the
            HTTP call. If a hot client retries so hard that the limiter
            blocks a legitimate replay, the Retry-After path is the relief
            valve, not an exemption for “this one looks like a retry.”
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="Do you need Raft or a consensus protocol?">
        <Stack gap={8}>
          <Text>
            No. You need atomic read-modify-write on one key. Redis already
            gives you that. Consensus would order the decision across a
            quorum and add tens of milliseconds to a check you budgeted at
            one. Reach for a stronger store only if the limit is a financial
            control that cannot fail open and cannot tolerate Redis’s
            failover story. Even then you are buying a single-key atomic
            update with a tougher availability story, not a distributed
            agreement on every request.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="Where does this sit on the URL shortener?">
        <Stack gap={8}>
          <Text>
            Limit create, per user and per IP. Creation is the abuse path:
            filling the key space, using you as an open redirect factory,
            scanning aliases. The redirect path is the product and is two
            orders of magnitude hotter, so give it a much higher ceiling
            whose job is to blunt random code scanning, not to shape normal
            clicks. A viral link is one short code being read, which is a
            cache problem, not a rate-limit problem. Put the limiter on the
            gateway in front of POST /v1/urls, fail open on Redis trouble so
            a limiter blip does not block link creation during an incident
            you would rather degrade, and fail closed on anonymous create if
            that endpoint is the one being farmed.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="How do you get to a million checks a second?">
        <Stack gap={8}>
          <Text>
            One Redis does on the order of 100,000 operations a second, and a
            token-bucket check is a read-modify-write, so one node falls over
            well before a million requests. Shard by the identity you limit
            on: user id, API key, or IP. The same client must always land on
            the same shard, or the bucket splits and the limit becomes N
            times too large. Consistent hashing or Redis Cluster’s hash slots
            do that routing. Ten shards is the shape of the answer, not a
            bigger single box.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="How do you keep the extra hop under a millisecond?">
        <Stack gap={8}>
          <Text>
            Same availability zone, a connection pool, and one script. A new
            TCP handshake per check is tens of milliseconds and is the bug.
            Do not cache an allow in the process: a stale bucket over-admits.
            The local cache is for denials only. Multi-region rate limits are
            a product decision. A user in one region talking to a bucket in
            another pays the round trip, so either pin the identity to a home
            region or accept that two regions each enforce their own ceiling.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="An endpoint has no rule. A rule changes during an incident.">
        <Stack gap={8}>
          <Text>
            A missing endpoint uses a default limit. You do not reject the
            request because configuration is absent. Rules that change without
            a deploy are polled, on the order of every 30 seconds, from a
            table the gateways cache. That delay is fine for a pricing change
            and too slow for an attack in progress. Push, from a config
            service or pub/sub, is the step you name when the limit has to
            move in seconds. You do not start with that machinery.
          </Text>
        </Stack>
      </CollapsibleSection>

      <CollapsibleSection title="What breaks first at 10×?">
        <Stack gap={8}>
          <Text>
            Not memory. The first break is Redis CPU on the hottest keys, then
            the gateway thread pool if a slow Redis is allowed to occupy a
            thread per request. The change you make is a tight timeout, a
            local deny-cache, and collapsing every rule for a request into
            one script. The change you do not make first is a bigger Redis,
            unless the working set of keys has actually outgrown memory.
          </Text>
        </Stack>
      </CollapsibleSection>
    </Stack>
  );
}
