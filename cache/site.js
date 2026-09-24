function initLabs() {
  document.querySelectorAll("[data-lab='token-bucket']").forEach((root) => {
    const capacity = Number(root.dataset.capacity);
    const rate = Number(root.dataset.rate);
    let tokens = capacity;
    let seconds = 0;
    const log = [];
    const fill = root.querySelector("[data-fill]");
    const time = root.querySelector("[data-time]");
    const count = root.querySelector("[data-count]");
    const logEl = root.querySelector("[data-log]");

    function paint() {
      fill.style.width = `${(tokens / capacity) * 100}%`;
      time.textContent = `t = ${seconds}s`;
      count.textContent = `${tokens.toFixed(1)} / ${capacity} tokens`;
      if (log.length === 0) {
        logEl.hidden = true;
        logEl.textContent = "";
        return;
      }
      logEl.hidden = false;
      logEl.textContent = log.join("\n");
    }

    function send(n) {
      let next = tokens;
      let allowed = 0;
      let denied = 0;
      for (let i = 0; i < n; i += 1) {
        if (next >= 1) {
          next -= 1;
          allowed += 1;
        } else {
          denied += 1;
        }
      }
      const retrySec = next >= 1 ? 0 : (1 - next) / rate;
      tokens = next;
      const denial = denied > 0 ? `, retry after ${retrySec.toFixed(1)}s` : "";
      log.unshift(
        `t=${seconds}s  send ${n}  →  ${allowed} allowed, ${denied} denied${denial}`,
      );
      log.splice(5);
      paint();
    }

    root.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.act === "advance") {
        tokens = Math.min(capacity, tokens + rate);
        seconds += 1;
        paint();
      } else if (button.dataset.act === "send1") {
        send(1);
      } else if (button.dataset.act === "send5") {
        send(5);
      } else if (button.dataset.act === "reset") {
        tokens = capacity;
        seconds = 0;
        log.length = 0;
        paint();
      }
    });

    paint();
  });
}

function initSpy() {
  const links = [...document.querySelectorAll(".sections a")];
  const heads = links
    .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
    .filter(Boolean);
  if (heads.length === 0) return;

  const mark = () => {
    let current = heads[0];
    for (const head of heads) {
      if (head.getBoundingClientRect().top <= 140) current = head;
    }
    for (const link of links) {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${current.id}`);
    }
  };

  document.addEventListener("scroll", mark, { passive: true });
  mark();
}

initLabs();
initSpy();
