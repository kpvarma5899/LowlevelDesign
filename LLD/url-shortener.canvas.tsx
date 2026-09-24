import {
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
  useCanvasState,
} from "cursor/canvas";

type Section = "round" | "design" | "codes" | "followups";

export default function UrlShortenerDesign() {
  const [section, setSection] = useCanvasState<Section>("section", "round");

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Design a URL shortener</H1>
        <Text tone="secondary">
          Question 1. A correct diagram is the opening. The score comes from
          how ids are generated, what happens under a race, and what you
          refuse to do on the hot path.
        </Text>
      </Stack>

      <Callout tone="info" title="The sentence to close on">
        The short code is an obfuscated unique id, the database unique key is
        the real lock, and the redirect path never writes to the link row.
      </Callout>

      <Row gap={24} wrap>
        <Stat value="302" label="Redirect you defend" />
        <Stat value="Base62" label="Code alphabet" />
        <Stat value="40k/s" label="Peak redirect reads" />
        <Stat value="Unique key" label="The real lock" />
      </Row>

      <Table
        headers={["", "High-level design", "Low-level design"]}
        rows={[
          [
            "You draw",
            "Clients, create service, redirect service, Redis, primary, replica, Kafka",
            "UrlService, IdGenerator, Encoder, UrlRepository",
          ],
          [
            "You defend",
            "302, cache-aside, async clicks, read-your-writes",
            "Unique constraint, bijection over the id, thread-safe id allocation",
          ],
          [
            "They are testing",
            "Whether you protect the hot path",
            "Whether the code stays correct when two requests race",
          ],
        ]}
      />

      <Row gap={8} wrap>
        <Pill active={section === "round"} onClick={() => setSection("round")}>
          The round
        </Pill>
        <Pill active={section === "design"} onClick={() => setSection("design")}>
          Design
        </Pill>
        <Pill active={section === "codes"} onClick={() => setSection("codes")}>
          Codes and races
        </Pill>
        <Pill active={section === "followups"} onClick={() => setSection("followups")}>
          Follow-ups
        </Pill>
      </Row>

      {section === "round" && <RoundSection />}
      {section === "design" && <DesignSection />}
      {section === "codes" && <CodesSection />}
      {section === "followups" && <FollowupsSection />}
    </Stack>
  );
}

function RoundSection() {
  return (
    <Stack gap={20}>
      <H2>How you spend the 45 minutes</H2>
      <Text>
        Requirements, a one-minute estimate, the API, the data model, the
        diagram, then the deep dive they pick. At this level the diagram is
        assumed. The follow-ups decide the score.
      </Text>
      <Text>
        High-level design is who talks to whom, where data lives, and what you
        trade for scale, latency, and availability. Low-level design is one
        box opened up: classes, method contracts, the algorithm, and the
        concurrency control. If two requests arrive at the same millisecond,
        what decides the winner?
      </Text>

      <H3>Requirements you say out loud</H3>
      <Text>
        In scope: create a short link from a long URL, resolve a short code
        and redirect, optional custom alias, optional expiry. Out of scope
        until they pull it back in: user accounts, link preview, a full
        analytics product. Name those so they can grab one.
      </Text>
      <Text>
        Redirect is the hot path. Reads dwarf writes, often around 100:1.
        A cache hit should be a few milliseconds. A created link must still
        resolve after a process restart. Short codes are unique. Availability
        of redirect matters more than availability of create. A user can retry
        creation. A broken redirect is a dead link.
      </Text>

      <H3>Estimate</H3>
      <Table
        headers={["Input", "Figure", "What it tells you"]}
        rows={[
          ["New links", "100 million / month", "About 40 writes/sec average"],
          ["Peak writes", "10×", "About 400 writes/sec"],
          ["Peak reads", "100:1", "About 40,000 redirects/sec"],
          ["Row size", "~500 bytes", "Tens of GB a month, not the constraint"],
          ["Code space", "base62 × 7", "62⁷ is about 3.5 trillion codes"],
        ]}
      />
      <Text tone="secondary" size="small">
        Six characters is already about 57 billion codes. Seven leaves room
        for custom aliases and for never recycling expired codes quickly.
        This is a lookup-latency and hot-key problem, not a storage problem.
      </Text>

      <H3>API</H3>
      <Card>
        <CardHeader>Create and redirect</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text>
              `POST /v1/urls` with `longUrl`, optional `alias`, optional
              `expireAt`. `201` returns `shortCode` and `shortUrl`.
            </Text>
            <Text>
              `GET /{"{shortCode}"}` returns `302` with `Location`. Unknown is
              `404`, expired is `410`, alias taken is `409`.
            </Text>
            <Text tone="secondary" size="small">
              GET is the product. Everything else exists to make that lookup
              boring and fast.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>Data model</H3>
      <Text>
        One table. `short_code` is the primary key and the only lookup on the
        hot path. `long_url` is the target. `user_id` and `expire_at` are
        nullable. `created_at` is audit. Do not put `click_count` on this row.
      </Text>
      <Text>
        SQL fits. The access pattern is a point read and a point write by
        key, and the uniqueness constraint is the reason to prefer a database
        that can enforce it.
      </Text>
    </Stack>
  );
}

function DesignSection() {
  return (
    <Stack gap={20}>
      <H2>The system, then one box</H2>
      <Card>
        <CardHeader>High-level paths</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text>
              Create: client, API service, database primary, write-through to
              Redis, return the short URL.
            </Text>
            <Text>
              Redirect: client, redirect service, Redis, database replica on
              a miss, then `302`. A click event goes to Kafka and is not on
              the latency budget. An aggregator writes the analytics store.
            </Text>
            <Text tone="secondary" size="small">
              Services are stateless. Split create and redirect once traffic
              justifies it. They have different SLOs. Redirect must stay up
              when create is rate-limited or the primary is struggling.
            </Text>
          </Stack>
        </CardBody>
      </Card>
      <Text>
        What fails first is the database, if every redirect misses cache, or
        a single hot key, if one viral link is requested far above everyone
        else. Cache hit rate is the design.
      </Text>

      <H3>Classes</H3>
      <Card>
        <CardHeader>UrlService, opened up</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text>`UrlService.create(request) → ShortUrl`</Text>
            <Text>`UrlService.resolve(shortCode) → Redirect | NotFound | Expired`</Text>
            <Text>`IdGenerator.nextId() → long` — unique and thread-safe</Text>
            <Text>`Encoder.encode(long) → String` — base62</Text>
            <Text>`UrlRepository.insert` — uniqueness enforced by the database</Text>
            <Text>`Cache.get / Cache.put` — Redis, shared across instances</Text>
            <Text>`ClickPublisher.publish` — non-blocking</Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>create, without a custom alias</H3>
      <Text>
        Reject anything that is not `http` or `https`. `javascript:` and
        `data:` are an open-redirect bug. Allocate an id, encode
        `obfuscate(id)`, insert the row, put the mapping in cache, return the
        short URL.
      </Text>

      <H3>resolve</H3>
      <Text>
        Cache lookup first. On a hit, fire the click event and return `302`.
        On a miss, read by primary key. Missing row is `404`. `expire_at` in
        the past is `410`. Do not delete on the read path. Populate the
        cache, fire the click, return `302`.
      </Text>

      <Divider />

      <H3>Concurrency you say before they ask</H3>
      <Text>
        `IdGenerator` is thread-safe. An in-memory set of aliases is not,
        because two app servers will not see each other. Alias uniqueness is
        a unique constraint: insert and treat a violation as `409`. The cache
        is Redis. A local `HashMap` dies with the process and is invisible to
        the other instances.
      </Text>
    </Stack>
  );
}

function CodesSection() {
  return (
    <Stack gap={20}>
      <H2>The short code is an obfuscated id</H2>
      <Table
        headers={["Scheme", "What you get", "What you refuse"]}
        rows={[
          [
            "Counter, then base62",
            "No collisions, shortest codes, easy to debug",
            "Guessable. `cb`, `cc`, `cd` walks the table. One sequence is a funnel.",
          ],
          [
            "Hash the long URL, keep 7 characters",
            "The same URL always maps to the same code",
            "Collisions are real. Dedup is often wrong: two owners, two expiries.",
          ],
          [
            "Distributed id, then base62",
            "Unique without a database round trip per create",
            "Still roughly time-ordered, so still guessable until you mix it.",
          ],
        ]}
        rowTone={["warning", "danger", "success"]}
      />
      <Text>
        Give the third answer. A Snowflake-style id is 41 bits of timestamp,
        10 bits of machine id, and 12 bits of per-machine sequence. At 400
        writes a second this is idle. Uniqueness holds while machine ids are
        distinct and the clock does not jump backwards.
      </Text>

      <H3>Stop people enumerating every link</H3>
      <Text>
        Keep the unique id. Hide it with a bijection: a Feistel permutation
        or a small block cipher over the id space, then base62. Every id maps
        to one code, every code maps back to one id, and neighboring ids land
        far apart. No collision handling. Scanning `aaaaaaa`, `aaaaaab` does
        not walk creation order. The database unique key is the safety net.
      </Text>
      <Text>
        Base62 is `[0-9a-zA-Z]`, safe in a path. Base64 uses `+`, `/`, and
        `=`. Base58 drops ambiguous characters if a person will type the
        link. For a click-only link, base62 is the usual choice.
      </Text>

      <H3>Two users request the alias sale</H3>
      <Table
        headers={["Step", "What a check-then-insert does", "What you do"]}
        rows={[
          ["Both read", "Both see the alias free", "Insert directly"],
          ["Both write", "One mapping disappears, or a timing-dependent 500", "Unique-constraint violation is 409"],
          ["The lock", "An in-memory set on one server", "The database unique index"],
        ]}
        rowTone={[undefined, "danger", "success"]}
      />
      <Text>
        Same pattern if a generated code hits the unique index: allocate a
        new id and retry. You do not take an application lock across servers
        to protect one row.
      </Text>

      <H3>301 or 302</H3>
      <Text>
        `302` (or `307` if you must preserve the method). A `301` is cached
        by browsers as permanent. The next click never reaches you, so
        expiry, takedown, and click analytics silently stop. Use `301` only
        when the product wants a permanent mapping and you have accepted that
        you will not see those clicks again.
      </Text>

      <H3>A celebrity tweet</H3>
      <Text>
        One key is fine for Redis and for a primary-key read. It is fatal if
        every click does `UPDATE urls SET click_count = click_count + 1`.
        Append a click event to Kafka and return. Aggregate by
        `(short_code, minute)` off the hot path. If the hot key expires at
        the peak, every request falls through together. Do not TTL a key that
        is being hit, or let one request reload while the rest wait.
      </Text>
    </Stack>
  );
}

function FollowupsSection() {
  return (
    <Stack gap={8}>
      <H2>Questions they ask after the diagram</H2>
      <Text tone="secondary">
        These are the probes that show up after a correct diagram, on Hello
        Interview, in Alex Xu, and in the threads candidates actually get
        asked. The first three decide most loops.
      </Text>

      <CollapsibleSection title="How do you guarantee a unique short code?" defaultOpen>
        <Text>
          A counter, then base62. Hashing the URL and keeping a prefix
          collides, and it wrongly dedupes two owners. Redis `INCR` is one
          atomic number because Redis runs one command at a time. A billion
          ids is still 6 characters (`15ftgG`). The database unique key is
          the backstop if a batch is lost. Sequential ids are guessable, so
          the next question is opacity, not uniqueness.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="The codes are sequential. How do you stop enumeration?" defaultOpen>
        <Text>
          Mix the id with a reversible bijection, a Feistel round or XOR with
          a secret, then base62. Neighboring ids land far apart, and you can
          still decode the code back to the id. Do not store a set of used
          codes. If the product is public links and enumeration is acceptable,
          say that tradeoff out loud instead of pretending the counter is
          secret.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="The user creates a link and the click 404s" defaultOpen>
        <Text>
          You wrote the primary and the redirect read a replica that has not
          applied the insert. On create, write the cache entry yourself. The
          click never needs the replica. For a short window, a just-created
          code can be read from the primary. The client already knows the
          long URL from the create response.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="How does the id generator stay correct with many servers?" defaultOpen>
        <Text>
          Snowflake on each server: no coordination per id, distinct machine
          ids, and refuse to issue ids if the clock moves backwards. Or lease
          a block from a database sequence, for example 10,000 ids, and hand
          them out from memory. A crash loses the unused tail. Gaps are
          acceptable. At 40 to 400 writes a second, either design is
          comfortable. The bottleneck you removed is a network round trip on
          every create.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="The same long URL is submitted twice" defaultOpen>
        <Text>
          Default: two short codes. Callers have different owners, expiries,
          and analytics. Deduping by URL couples strangers, and deletion
          becomes wrong. If the product wants dedup, the key is
          `(user_id, long_url)`, not an accident of hashing.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="How do expired links get cleaned up?">
        <Text>
          On the read path, compare `expire_at` and return `410`. A scheduled
          job archives rows that expired days ago, off the hot path. Do not
          recycle a code immediately. Caches, browser history, and shared
          posts will send people to a new destination. The code space is
          large enough to quarantine codes for a long time, or forever.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="The primary database is down. What still works?">
        <Text>
          Redirects for cached codes keep working. Creates fail, and they
          fail fast. Uncached codes fail until the primary or a promotable
          replica is back. A read replica can serve misses only inside the
          staleness budget. It cannot accept the unique insert.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="What do you rate-limit?">
        <Text>
          Creation, per user and per IP. Redirects get a much higher ceiling
          whose job is to blunt random scanning. A cheap reject for the wrong
          length or a bad alphabet happens before Redis. A viral link is a
          cache problem, not a rate-limit problem.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="How do you keep redirects fast once the table is large?">
        <Text>
          `short_code` is the primary key, so the lookup is an index point
          read, not a scan. That is still disk. Put the mapping in Redis.
          Memory is the difference between a cache hit and a database read.
          A CDN or edge worker is the step after the hottest codes are
          identified, not the opening design: invalidation, cost, and a
          deleted link that keeps redirecting are the bill. Most of the win
          is the cache in front of one indexed table.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="The owner deletes the link or changes the target">
        <Text>
          Update or delete the row, then delete the cache key in the same
          request. A redirect that only trusts Redis will keep sending people
          to the old URL until the TTL. Expiry is checked on read, so a stale
          cache entry can still return 410. This is also why every link does
          not live at the CDN from day one.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Which database, and when do you shard?">
        <Text>
          About 500 bytes a row. A billion links is a few hundred GB. One
          Postgres is enough, and you pick it because the unique index is the
          lock. Writes are tens to hundreds per second after the read path is
          cached. Shard when a single primary cannot take the write rate or
          the working set, not because the interview has the word scale in it.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Many write servers need one counter">
        <Text>
          A single Redis `INCR` per create is fine at this write rate. If you
          want fewer round trips, each server leases a block, for example
          1,000 ids, and hands them out locally. A crash burns the tail.
          Gaps are fine. Across regions, give each region a disjoint range so
          they do not coordinate. If Redis fails before the increment is
          replicated, you lose a few values and the unique constraint rejects
          a duplicate code.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Someone uses you as a phishing host">
        <Text>
          Reject non-`http` and non-`https` schemes on create. Rate-limit
          create per user and per IP. Do not follow redirects when you
          validate the target. A blocklist of domains is a product decision
          you name, not a lookup on the redirect path. Scanning the code
          space is a cheap alphabet-and-length reject before Redis, plus a
          high ceiling on `GET`, not the same limit as create.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="What breaks first at 10×?">
        <Text>
          Not storage. Hot keys, cache stampede, and click-event volume. The
          next design change is partitioning the analytics stream and
          treating the top keys as their own cache tier.
        </Text>
      </CollapsibleSection>
    </Stack>
  );
}
