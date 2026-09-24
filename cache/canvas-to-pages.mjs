#!/usr/bin/env node
/**
 * Builds the GitHub Pages site in docs/ from each LLD question folder.
 *
 * Input, per question:
 *   questions/<slug>/README.md   the note (the publishable form of the canvas)
 *   questions/<slug>/page.json   catalog entry: number, kicker, optional stats
 *
 * HTML comments in the note become widgets implemented below:
 *   <!-- widget:boundary-chart -->
 *   <!-- widget:token-bucket -->
 *
 * Run from the repository root:
 *   node cache/canvas-to-pages.mjs
 *
 * docs/ is generated. Edit the note, the page catalog, or this cache, then rerun.
 */

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://kpvarma5899.github.io/LowlevelDesign";
const REPO = "https://github.com/kpvarma5899/LowlevelDesign";
const HERE = dirname(fileURLToPath(import.meta.url));

const repoFlag = process.argv.indexOf("--repo");
const repoRoot = resolve(
  repoFlag === -1 ? process.cwd() : process.argv[repoFlag + 1],
);

const questionsDir = join(repoRoot, "questions");
const docsDir = join(repoRoot, "docs");

const questions = loadQuestions();
buildSite(questions);
console.log(
  `Wrote ${questions.length} pages to ${docsDir}\n${questions
    .map((q) => `  ${q.number}. ${q.slug}`)
    .join("\n")}`,
);

function loadQuestions() {
  const slugs = readdirSync(questionsDir).filter((name) => {
    const dir = join(questionsDir, name);
    return statSync(dir).isDirectory() && name !== "src";
  });

  const questions = slugs.map((slug) => {
    const dir = join(questionsDir, slug);
    const pagePath = join(dir, "page.json");
    const notePath = join(dir, "README.md");
    const page = JSON.parse(readFileSync(pagePath, "utf8"));
    if (typeof page.number !== "number" || !page.kicker) {
      throw new Error(`${pagePath} needs "number" and "kicker"`);
    }
    const note = readFileSync(notePath, "utf8").replace(/\r\n/g, "\n");
    const blocks = parseMarkdown(note);
    const splitAt = blocks.findIndex((block) => block.type === "h2");
    const preamble = splitAt === -1 ? blocks : blocks.slice(0, splitAt);
    const body = splitAt === -1 ? [] : blocks.slice(splitAt);
    const opening = readOpening(preamble, page);
    const grouped = groupFollowups(body);
    return {
      slug,
      number: page.number,
      kicker: page.kicker,
      title: opening.title || page.title || slug,
      lede: opening.lede,
      preface: opening.preface,
      close: opening.close,
      stats: opening.stats,
      compare: opening.compare,
      sections: grouped.filter((block) => block.type === "h2"),
      body: grouped,
    };
  });

  questions.sort((a, b) => a.number - b.number);
  return questions;
}

function readOpening(blocks, page) {
  const opening = {
    title: "",
    lede: "",
    preface: [],
    close: "",
    stats: page.stats ?? [],
    compare: null,
  };

  for (const block of blocks) {
    if (block.type === "h1") {
      opening.title = plain(block.text);
      continue;
    }
    if (block.type === "p" && /close on this/i.test(block.text)) {
      opening.close = sentenceCase(
        block.text.replace(/^\*\*Close on this:\*\*\s*/i, ""),
      );
      continue;
    }
    if (block.type === "table") {
      const emptyHeader = block.headers.every((cell) => cell.trim() === "");
      if (emptyHeader && block.headers.length === 2 && page.stats == null) {
        opening.stats = block.rows.map((row) => ({
          label: row[0] ?? "",
          value: row[1] ?? "",
        }));
        continue;
      }
      if (emptyHeader && block.headers.length === 2 && page.stats) {
        continue;
      }
      if (!opening.compare && block.headers.length >= 3) {
        opening.compare = block;
        continue;
      }
    }
    if (block.type === "p") {
      if (/^Page:/i.test(plain(block.text))) continue;
      if (!opening.lede) opening.lede = block.text;
      else opening.preface.push(block.text);
    }
  }

  if (page.stats) opening.stats = page.stats;
  return opening;
}

function buildSite(items) {
  rmSync(docsDir, { recursive: true, force: true });
  mkdirSync(join(docsDir, "assets"), { recursive: true });
  copyFileSync(join(HERE, "site.css"), join(docsDir, "assets", "site.css"));
  copyFileSync(join(HERE, "site.js"), join(docsDir, "assets", "site.js"));
  writeFileSync(join(docsDir, ".nojekyll"), "");
  writeFileSync(join(docsDir, "index.html"), homePage(items));

  for (const item of items) {
    const dir = join(docsDir, item.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), questionPage(item, items));
  }
}

function homePage(items) {
  const cards = items
    .map((item) => {
      const n = String(item.number).padStart(2, "0");
      return `<li>
        <a href="${escapeAttr(item.slug)}/">
          <span class="num">${n}</span>
          <span class="card-title">${inline(item.title)}</span>
          <span class="card-close">${inline(item.close)}</span>
        </a>
      </li>`;
    })
    .join("\n");

  const body = `<main class="wrap home">
    <p class="kicker">Interview notes</p>
    <h1>Low-level design, one question at a time.</h1>
    <p class="lede">Each question is a folder. The note is the design you defend. The page is that note, readable. The <span class="path">src</span> directory is where the implementation will live.</p>
    <ol class="index">${cards}</ol>
  </main>`;

  return shell({
    title: "LowlevelDesign",
    description:
      "High-level and low-level design notes for interview prep. One folder, one page, per question.",
    depth: 0,
    canonical: `${SITE}/`,
    body,
  });
}

function questionPage(item, items) {
  const asset = "../";
  const others = items.filter((other) => other.slug !== item.slug);
  const stats =
    item.stats.length > 0
      ? `<div class="stats">${item.stats
          .map(
            (stat) =>
              `<div class="stat"><span class="stat-value">${inline(stat.value)}</span><span class="stat-label">${inline(stat.label)}</span></div>`,
          )
          .join("")}</div>`
      : "";
  const preface = item.preface
    .map((text) => `<p class="preface">${inline(text)}</p>`)
    .join("");
  const compare = item.compare ? renderTable(item.compare, "compare") : "";
  const sections = `<nav class="sections" aria-label="Sections">${item.sections
    .map((section) => {
      const id = slugify(section.text);
      return `<a href="#${id}">${inline(plain(section.text))}</a>`;
    })
    .join("")}</nav>`;
  const more = others
    .map(
      (other) =>
        `<a href="../${other.slug}/">${inline(plain(other.title))}</a>`,
    )
    .join("");
  const nav = `${others
    .map(
      (other) =>
        `<a href="../${other.slug}/">${escapeHtml(shortTitle(other.title))}</a>`,
    )
    .join("")}<a href="${REPO}">Source</a>`;

  const body = `<main class="wrap question">
    <p class="kicker">${inline(item.kicker)}</p>
    <h1>${inline(item.title)}</h1>
    <p class="lede">${inline(item.lede)}</p>
    ${preface}
    <blockquote class="close"><span class="close-label">Close on this</span>${inline(item.close)}</blockquote>
    ${stats}
    ${compare}
    ${sections}
    <article class="prose">${renderBlocks(item.body)}</article>
    <footer class="end">
      <p>${more}</p>
      <p class="end-links">
        <a href="${REPO}/blob/main/questions/${item.slug}/README.md">Note in the repo</a>
        <a href="${REPO}/tree/main/questions/${item.slug}/src">Implementation folder</a>
      </p>
    </footer>
  </main>`;

  return shell({
    title: `${plain(item.title)} · LowlevelDesign`,
    description: plain(item.close || item.lede),
    canonical: `${SITE}/${item.slug}/`,
    assetPrefix: asset,
    nav,
    body,
  });
}

function shell({
  title,
  description,
  canonical,
  body,
  assetPrefix = "",
  nav = `<a href="${REPO}">Source</a>`,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,640&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${assetPrefix}assets/site.css">
</head>
<body>
  <header class="top">
    <div class="wrap top-inner">
      <a class="mark" href="${assetPrefix || "./"}">LowlevelDesign</a>
      <nav class="top-nav" aria-label="Questions">
        ${nav}
      </nav>
    </div>
  </header>
  ${body}
  <script src="${assetPrefix}assets/site.js"></script>
</body>
</html>
`;
}

function renderBlocks(blocks) {
  return blocks.map(renderBlock).join("\n");
}

function renderBlock(block) {
  switch (block.type) {
    case "h2": {
      const id = slugify(block.text);
      return `<h2 id="${id}">${inline(block.text)}</h2>`;
    }
    case "h3":
      return `<h3>${inline(block.text)}</h3>`;
    case "p":
      return `<p>${inline(block.text)}</p>`;
    case "code":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "ul":
      return `<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
    case "ol":
      return `<ol>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`;
    case "table":
      return renderTable(block);
    case "widget":
      return renderWidget(block.name);
    case "details":
      return `<details class="qa"${block.open ? " open" : ""}>
        <summary>${inline(block.title)}</summary>
        <div class="qa-body">${renderBlocks(block.blocks)}</div>
      </details>`;
    default:
      return "";
  }
}

function renderTable(block, className = "") {
  const head = block.headers
    .map((cell, index) =>
      index === 0 && cell.trim() === ""
        ? "<th></th>"
        : `<th>${inline(cell)}</th>`,
    )
    .join("");
  const rows = block.rows
    .map((row) => {
      const cells = row
        .map((cell, index) =>
          index === 0
            ? `<th scope="row">${inline(cell)}</th>`
            : `<td>${inline(cell)}</td>`,
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const cls = className ? ` class="${className}"` : "";
  return `<div class="table-wrap"><table${cls}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderWidget(name) {
  if (name === "boundary-chart") return boundaryChart();
  if (name === "token-bucket") return tokenBucketLab();
  throw new Error(`Unknown widget: ${name}`);
}

function boundaryChart() {
  const series = [
    { name: "Fixed window", tone: "warn", data: [10, 10] },
    { name: "Sliding log", tone: "ok", data: [10, 0] },
    { name: "Token bucket (capacity 10, 1/s)", tone: "info", data: [10, 1] },
  ];
  const categories = ["Burst at t = 9s", "Burst at t = 10s"];
  const max = 12;
  const legend = series
    .map(
      (item) =>
        `<li><i class="swatch ${item.tone}"></i>${escapeHtml(item.name)}</li>`,
    )
    .join("");
  const groups = categories
    .map((category, index) => {
      const bars = series
        .map((item) => {
          const value = item.data[index];
          const height = Math.max((value / max) * 100, value === 0 ? 0 : 2);
          return `<div class="bar ${item.tone}" style="height:${height}%"><span>${value}</span></div>`;
        })
        .join("");
      return `<div class="chart-group"><div class="chart-bars">${bars}</div><div class="chart-cat">${escapeHtml(category)}</div></div>`;
    })
    .join("");

  return `<figure class="chart">
    <figcaption>
      <span class="chart-title">Requests allowed from each burst of 10</span>
      <span class="chart-note">Y-axis: requests allowed (count). Categories: the two bursts. Idle client, full budget before t = 9s. Fixed-window buckets are [0, 10) and [10, 20). Source: worked example in this note.</span>
    </figcaption>
    <ul class="legend">${legend}</ul>
    <div class="chart-plot">
      <div class="chart-limit" style="bottom:${(10 / max) * 100}%"><span>Stated limit · 10</span></div>
      ${groups}
    </div>
  </figure>`;
}

function tokenBucketLab() {
  return `<section class="lab" data-lab="token-bucket" data-capacity="5" data-rate="1">
    <div class="lab-head">
      <h3>Token bucket you can click</h3>
      <p>capacity 5 · refill 1/s</p>
    </div>
    <div class="meter">
      <div class="meter-top"><span data-time>t = 0s</span><span data-count>5.0 / 5 tokens</span></div>
      <div class="meter-track"><div class="meter-fill" data-fill></div></div>
    </div>
    <div class="lab-actions">
      <button type="button" data-act="advance">+1 second</button>
      <button type="button" data-act="send1">Send 1</button>
      <button type="button" data-act="send5">Send 5</button>
      <button type="button" data-act="reset">Reset</button>
    </div>
    <p class="lab-help">Start full. Send 5, then send 1 immediately: the last one is denied and the wait is 1.0s. Advance one second and a single send is allowed again. That is the burst, then the rate.</p>
    <pre class="lab-log" data-log hidden></pre>
  </section>`;
}

function groupFollowups(blocks) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "h2" && /follow-up/i.test(plain(block.text))) {
      out.push(block);
      i += 1;
      while (i < blocks.length && blocks[i].type !== "h2" && blocks[i].type !== "h3") {
        out.push(blocks[i]);
        i += 1;
      }
      while (i < blocks.length && blocks[i].type !== "h2") {
        const title = blocks[i];
        i += 1;
        const inner = [];
        while (
          i < blocks.length &&
          blocks[i].type !== "h3" &&
          blocks[i].type !== "h2"
        ) {
          inner.push(blocks[i]);
          i += 1;
        }
        out.push({
          type: "details",
          title: title.type === "h3" ? title.text : "Follow-up",
          blocks: title.type === "h3" ? inner : [title, ...inner],
          open: false,
        });
      }
      continue;
    }
    out.push(block);
    i += 1;
  }
  const first = out.find((block) => block.type === "details");
  if (first) first.open = true;
  return out;
}

function parseMarkdown(source) {
  const lines = source.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const widget = line.trim().match(/^<!--\s*widget:([a-z0-9-]+)\s*-->$/);
    if (widget) {
      blocks.push({ type: "widget", name: widget[1] });
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: `h${heading[1].length}`, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const items = [];
      while (i < lines.length && (ordered ? isOl(lines[i]) : isUl(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }

    const para = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines, i)) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return blocks;
}

function startsBlock(lines, index) {
  const line = lines[index];
  return (
    line.startsWith("```") ||
    /^(#{1,3})\s+/.test(line) ||
    isUl(line) ||
    isOl(line) ||
    isTableStart(lines, index) ||
    /^<!--\s*widget:/.test(line.trim())
  );
}

function isTableStart(lines, index) {
  if (!lines[index].includes("|") || index + 1 >= lines.length) return false;
  const header = splitRow(lines[index]);
  const separator = splitRow(lines[index + 1]);
  return (
    header.length > 1 &&
    separator.length === header.length &&
    separator.every((cell) => /^:?-+:?$/.test(cell))
  );
}

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

function isUl(line) {
  return /^[-*]\s+/.test(line);
}

function isOl(line) {
  return /^\d+\.\s+/.test(line);
}

function inline(raw) {
  const parts = String(raw).split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return formatText(part);
    })
    .join("");
}

function formatText(raw) {
  let text = escapeHtml(raw);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    return `<a href="${escapeAttr(rewriteHref(href))}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return text;
}

function rewriteHref(href) {
  if (href === "rate-limiter.md" || href.endsWith("/rate-limiter/README.md")) {
    return "../rate-limiter/";
  }
  if (href === "url-shortener.md" || href.endsWith("/url-shortener/README.md")) {
    return "../url-shortener/";
  }
  return href;
}

function shortTitle(title) {
  return plain(title).replace(/^Design an?\s+/i, "");
}

function sentenceCase(text) {
  const value = String(text).trim();
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function plain(raw) {
  return String(raw)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function slugify(raw) {
  const text = plain(raw)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return text || "section";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
