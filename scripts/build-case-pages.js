const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const GENERATED_NOTES_DIR = path.join(ROOT, "case-notes");

const SITE = {
  name: "South African Law Students SA.",
  tagline: "An authoritative BB FIRAC archive of Constitutional Court and Supreme Court of Appeal case notes.",
  topbar: "1996-2024 Constitutional Court and Supreme Court of Appeal case notes.",
  email: "salawstudentsa@hotmail.com"
};

const COLLECTIONS = [
  {
    key: "cc",
    label: "Constitutional Court",
    defaultCourt: "Constitutional Court of South Africa",
    sourceCandidates: ["CC CASE NOTES", "CC Case Notes"],
    outputPathFromRoot(year, fileBase) {
      return toPosix(path.join("case-notes", year, `${fileBase}.html`));
    }
  },
  {
    key: "sca",
    label: "Supreme Court of Appeal",
    defaultCourt: "Supreme Court of Appeal of South Africa",
    sourceCandidates: ["SCA CASE NOTES", "SCA Case Notes"],
    outputPathFromRoot(year, fileBase) {
      return toPosix(path.join("case-notes", "sca", year, `${fileBase}.html`));
    }
  }
];

main();

function main() {
  const activeCollections = resolveCollections();
  const posts = activeCollections
    .flatMap((collection) => listTextFiles(collection.dir).map((filePath) => parsePost(filePath, collection)))
    .sort(comparePosts);

  if (!posts.length) {
    throw new Error("No case note .txt files were found in posts.");
  }

  const stats = buildStats(posts, activeCollections);

  resetDir(GENERATED_NOTES_DIR);
  fs.mkdirSync(path.join(ROOT, "assets"), { recursive: true });

  writeFile(path.join(ROOT, "assets", "posts-index.js"), buildPostsIndex(posts, stats));

  for (const post of posts) {
    writePostPage(post, posts, stats);
  }

  console.log(
    `Built ${posts.length} case note pages across ${activeCollections
      .map((collection) => collection.label)
      .join(" and ")}.`
  );
}

function resolveCollections() {
  return COLLECTIONS.map((collection) => {
    const dirName = collection.sourceCandidates.find((candidate) =>
      fs.existsSync(path.join(ROOT, "posts", candidate))
    );

    if (!dirName) {
      return null;
    }

    return {
      ...collection,
      dirName,
      dir: path.join(ROOT, "posts", dirName)
    };
  }).filter(Boolean);
}

function listTextFiles(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => compareNatural(left.name, right.name));

  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files = files.concat(listTextFiles(fullPath));
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".txt") {
      files.push(fullPath);
    }
  }

  return files;
}

function parsePost(filePath, collection) {
  const rawText = fs
    .readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();

  const year = path.basename(path.dirname(filePath));
  const fileBase = path.basename(filePath, path.extname(filePath));
  const title =
    extractMainHeading(rawText) ||
    extractMetaField(rawText, "Case Title") ||
    humanizeFileBase(fileBase);
  const court = extractCourt(rawText, collection.defaultCourt);
  const deliveredOn = extractMetaField(rawText, "Delivered on") || extractMetaField(rawText, "Delivered");
  const heardOn = extractMetaField(rawText, "Heard on") || extractMetaField(rawText, "Heard");
  const judges =
    extractMetaField(rawText, "Judgment delivered by") ||
    extractMetaField(rawText, "Judgment by") ||
    extractMetaField(rawText, "Judges") ||
    extractMetaField(rawText, "Coram");
  const citation = extractMetaField(rawText, "Neutral Citation") || extractCitation(title, rawText);
  const bodyMarkdown = buildBodyMarkdown(rawText);
  const summary = extractSummary(bodyMarkdown);
  const searchText = trimText(normalizeWhitespace(stripMarkdown(bodyMarkdown)), 1800);
  const outputPathFromRoot = collection.outputPathFromRoot(year, fileBase);
  const sourcePathFromRoot = toPosix(path.relative(ROOT, filePath));

  return {
    id: `${collection.key}-${year}-${fileBase}`,
    collectionKey: collection.key,
    collectionLabel: collection.label,
    defaultCourt: collection.defaultCourt,
    year,
    fileBase,
    fileNumber: parseLeadingNumber(fileBase),
    title,
    court,
    citation,
    deliveredOn,
    heardOn,
    judges,
    summary,
    searchText,
    outputPathFromRoot,
    sourcePathFromRoot,
    href: encodeHref(outputPathFromRoot),
    sourceHref: encodeHref(sourcePathFromRoot),
    contentHtml: markdownToHtml(bodyMarkdown)
  };
}

function buildStats(posts, collections) {
  const years = [...new Set(posts.map((post) => post.year))].sort((left, right) => Number(right) - Number(left));
  const countsByCollection = collections.reduce((result, collection) => {
    result[collection.key] = posts.filter((post) => post.collectionKey === collection.key).length;
    return result;
  }, {});

  return {
    totalPosts: posts.length,
    years,
    firstYear: years[years.length - 1] || "",
    lastYear: years[0] || "",
    latestPosts: posts.slice(0, 6),
    countsByCollection,
    sourceFolders: collections.map((collection) => `posts/${collection.dirName}`)
  };
}

function comparePosts(left, right) {
  if (left.year !== right.year) {
    return Number(right.year) - Number(left.year);
  }

  if (left.fileNumber !== right.fileNumber) {
    return right.fileNumber - left.fileNumber;
  }

  if (left.collectionKey !== right.collectionKey) {
    return compareNatural(left.collectionKey, right.collectionKey);
  }

  return compareNatural(left.title, right.title);
}

function compareNatural(left, right) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function parseLeadingNumber(value) {
  const match = value.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function extractMainHeading(rawText) {
  const match = rawText.match(/^#\s+(.+)$/m);
  if (!match) {
    return "";
  }

  return stripMarkdown(match[1])
    .replace(/^FIRAC\s+Case Note(?:\s+(?:for|on))?\s*:?\s*/i, "")
    .replace(/^(?:Case Note|Case Summary)(?:\s+(?:for|on))?\s*:?\s*/i, "")
    .replace(/^Case Title:\s*/i, "")
    .trim();
}

function extractCourt(rawText, defaultCourt) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    const markdownMatch = line.match(/^\*\*Court\*\*:\s*(.+)$/i);
    if (markdownMatch) {
      return normalizeCourtName(markdownMatch[1], defaultCourt);
    }

    const plainMatch = line.match(/^Court:\s*(.+)$/i);
    if (plainMatch) {
      return normalizeCourtName(plainMatch[1], defaultCourt);
    }

    const caseNoteMatch = line.match(/^Case Note:\s*(.+)$/i);
    if (caseNoteMatch && looksLikeCourt(caseNoteMatch[1])) {
      return normalizeCourtName(caseNoteMatch[1], defaultCourt);
    }
  }

  return defaultCourt;
}

function looksLikeCourt(value) {
  return /(constitutional court|supreme court of appeal|\bzasca\b|\bzacc\b|\bcourt of south africa\b|\bsca\b)/i.test(
    value
  );
}

function normalizeCourtName(value, defaultCourt) {
  const normalized = normalizeWhitespace(stripMarkdown(value)).replace(/^the\s+/i, "");

  if (/constitutional court/i.test(normalized) || /\bzacc\b/i.test(normalized)) {
    return "Constitutional Court of South Africa";
  }

  if (/supreme court of appeal/i.test(normalized) || /\bzasca\b/i.test(normalized) || /\bsca\b/i.test(normalized)) {
    return "Supreme Court of Appeal of South Africa";
  }

  return defaultCourt;
}

function extractMetaField(rawText, label) {
  const markdownPattern = new RegExp(`\\*\\*${escapeRegex(label)}\\*\\*:\\s*(.+)$`, "mi");
  const markdownMatch = rawText.match(markdownPattern);
  if (markdownMatch) {
    return normalizeWhitespace(stripMarkdown(markdownMatch[1]));
  }

  const plainPattern = new RegExp(`^${escapeRegex(label)}:\\s*(.+)$`, "mi");
  const plainMatch = rawText.match(plainPattern);
  if (plainMatch) {
    return normalizeWhitespace(stripMarkdown(plainMatch[1]));
  }

  return "";
}

function extractCitation(title, rawText) {
  const candidates = [
    title,
    rawText
      .split("\n")
      .slice(0, 20)
      .join(" ")
  ];

  const patterns = [
    /\[[0-9]{4}\][^\n]{0,120}?\b(?:ZACC|ZASCA|ZALAC|SA|SACR|SALR)\b[^\n]{0,50}/i,
    /\bCCT\s+\d+\/\d+(?:\s+and\s+CCT\s+\d+\/\d+)?\b/i,
    /\b[0-9]{4}\s*\([^)]*\)\s*[A-Z. ]+\s*\d+\b/i
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match) {
        return normalizeWhitespace(stripMarkdown(match[0]));
      }
    }
  }

  return "";
}

function buildBodyMarkdown(rawText) {
  return rawText
    .replace(/^Case Note:.*\n?/m, "")
    .replace(/^Source Folder:.*\n?/m, "")
    .trim()
    .replace(/^#\s+.*\n?/m, "")
    .trim();
}

function extractSummary(bodyMarkdown) {
  const blocks = bodyMarkdown
    .split(/\n\s*\n/)
    .map((block) => normalizeWhitespace(stripMarkdown(block)))
    .filter(Boolean);

  for (const block of blocks) {
    if (block.length < 80) {
      continue;
    }

    if (
      /^(FIRAC Method|References|Neutral Citation|Court|Coram|Heard|Delivered|Judgment delivered by|Judgment by|Judges)\b/i.test(
        block
      )
    ) {
      continue;
    }

    if (/^(F|I|R|A|C)\s*[–-]/i.test(block)) {
      continue;
    }

    if (/^(Facts|Issues|Rules|Application|Conclusion)\b/i.test(block) && block.length < 120) {
      continue;
    }

    return trimText(block, 280);
  }

  return trimText(normalizeWhitespace(stripMarkdown(bodyMarkdown)), 280);
}

function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  const paragraph = [];
  let listType = "";

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }

    const content = formatInline(paragraph.join("\n")).replace(/\n/g, "<br>");
    html.push(`<p>${content}</p>`);
    paragraph.length = 0;
  }

  function closeList() {
    if (!listType) {
      return;
    }

    html.push(`</${listType}>`);
    listType = "";
  }

  function openList(type) {
    if (listType === type) {
      return;
    }

    closeList();
    html.push(`<${type}>`);
    listType = type;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      if (listType) {
        const nextListType = findNextListType(lines, index + 1);
        if (nextListType !== listType) {
          closeList();
        }
      }
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = Math.min(headingMatch[1].length, 6);
      html.push(`<h${level}>${formatInline(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      openList("ul");
      html.push(`<li>${formatInline(unorderedMatch[1].trim())}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      openList("ol");
      html.push(`<li>${formatInline(orderedMatch[1].trim())}</li>`);
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}

function findNextListType(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      return "ul";
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      return "ol";
    }

    return "";
  }

  return "";
}

function formatInline(value) {
  const tokens = [];
  let output = value;

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const token = `__TOKEN_${tokens.length}__`;
    tokens.push(`<a href="${escapeAttribute(url)}">${escapeHtml(label)}</a>`);
    return token;
  });

  output = escapeHtml(output);
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,;!?]|$)/g, "$1<em>$2</em>");
  output = output.replace(/(^|[\s(])_([^_]+)_(?=[\s).,;!?]|$)/g, "$1<em>$2</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");

  for (let index = 0; index < tokens.length; index += 1) {
    output = output.replace(`__TOKEN_${index}__`, tokens[index]);
  }

  return output;
}

function buildPostsIndex(posts, stats) {
  const data = posts.map((post) => ({
    title: post.title,
    href: post.href,
    sourceHref: post.sourceHref,
    year: post.year,
    court: post.court,
    collectionKey: post.collectionKey,
    collectionLabel: post.collectionLabel,
    citation: post.citation,
    deliveredOn: post.deliveredOn,
    heardOn: post.heardOn,
    judges: post.judges,
    summary: post.summary,
    searchText: post.searchText,
    fileNumber: post.fileNumber
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    totalPosts: stats.totalPosts,
    firstYear: stats.firstYear,
    lastYear: stats.lastYear,
    countsByCollection: stats.countsByCollection,
    posts: data
  };

  return `window.CASE_NOTE_DATA = ${safeJson(payload)};\nwindow.CASE_NOTE_INDEX = window.CASE_NOTE_DATA.posts;\n`;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function writePostPage(post, posts, stats) {
  const outputFile = path.join(ROOT, ...post.outputPathFromRoot.split("/"));
  const yearPeers = posts
    .filter(
      (candidate) =>
        candidate.year === post.year &&
        candidate.collectionKey === post.collectionKey &&
        candidate.id !== post.id
    )
    .slice(0, 6);

  const content = `
    <section class="page-hero page-hero--post">
      <div class="container">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="${linkFrom(outputFile, "index.html")}">Home</a>
          <span>/</span>
          <a href="${linkFrom(outputFile, "archive.html")}">Archive</a>
          <span>/</span>
          <span>${escapeHtml(post.collectionLabel)}</span>
          <span>/</span>
          <span>${escapeHtml(post.year)}</span>
        </nav>
        <span class="eyebrow">${escapeHtml(post.collectionLabel)}</span>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="page-hero__lede">${escapeHtml(post.summary)}</p>
        <div class="meta-pill-row">
          <span class="pill">${escapeHtml(post.collectionLabel)}</span>
          <span class="pill">${escapeHtml(post.year)}</span>
          ${post.citation ? `<span class="pill">${escapeHtml(post.citation)}</span>` : ""}
          ${post.deliveredOn ? `<span class="pill">Delivered ${escapeHtml(post.deliveredOn)}</span>` : ""}
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="container article-shell">
        <article class="article-main">
          <div class="markdown-body">
            ${post.contentHtml}
          </div>

          <section class="comments-shell">
            <div class="comments-shell__header">
              <h2>Comments</h2>
              <p>Readers can discuss this case note using GitHub-powered comments.</p>
            </div>
            <div class="comments-shell__embed">
              <script
                src="https://utteranc.es/client.js"
                repo="jakin250/SALS"
                issue-term="pathname"
                label="comments"
                theme="github-light"
                crossorigin="anonymous"
                async
              ></script>
            </div>
          </section>
        </article>

        <aside class="article-sidebar">
          <div class="sidebar-card">
            <h2>Case Details</h2>
            <dl class="meta-list">
              <dt>Collection</dt>
              <dd>${escapeHtml(post.collectionLabel)}</dd>
              <dt>Court</dt>
              <dd>${escapeHtml(post.court)}</dd>
              <dt>Year</dt>
              <dd>${escapeHtml(post.year)}</dd>
              ${post.citation ? `<dt>Citation</dt><dd>${escapeHtml(post.citation)}</dd>` : ""}
              ${post.heardOn ? `<dt>Heard on</dt><dd>${escapeHtml(post.heardOn)}</dd>` : ""}
              ${post.deliveredOn ? `<dt>Delivered on</dt><dd>${escapeHtml(post.deliveredOn)}</dd>` : ""}
              ${post.judges ? `<dt>Judges</dt><dd>${escapeHtml(post.judges)}</dd>` : ""}
            </dl>
            <div class="sidebar-actions">
              <a class="btn btn-full" href="${linkFrom(outputFile, "archive.html")}">Browse archive</a>
              <a class="btn btn-secondary btn-full" href="${linkFrom(outputFile, post.sourcePathFromRoot)}">Open source .txt</a>
            </div>
          </div>

          ${
            yearPeers.length
              ? `
          <div class="sidebar-card">
            <h2>More from ${escapeHtml(post.collectionLabel)} ${escapeHtml(post.year)}</h2>
            <ul class="link-list">
              ${yearPeers
                .map(
                  (candidate) => `
                <li>
                  <a href="${linkFrom(outputFile, candidate.outputPathFromRoot)}">${escapeHtml(candidate.title)}</a>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
          `
              : ""
          }

          <div class="sidebar-card">
            <h2>Use the Archive</h2>
            <p>Search by court, year, case title, citation, or judge across the full Constitutional Court and SCA collection.</p>
            <a class="text-link" href="${linkFrom(outputFile, "search.html")}">Open search</a>
          </div>
        </aside>
      </div>
    </section>
  `;

  writeFile(
    outputFile,
    renderShell({
      outputFile,
      title: `${post.title} | ${SITE.name}`,
      description: post.summary,
      pageKey: "post",
      footerSource: stats.sourceFolders,
      content
    })
  );
}

function renderShell({ outputFile, title, description, pageKey, content, footerSource }) {
  const stylesHref = linkFrom(outputFile, "assets/styles.css");
  const siteJsHref = linkFrom(outputFile, "assets/site.js");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}">
  <link rel="stylesheet" href="${stylesHref}">
</head>
<body data-page="${escapeAttribute(pageKey)}">
  <div class="topbar">
    <div class="container topbar__inner">
      <span>${escapeHtml(SITE.topbar)}</span>
      <a href="${linkFrom(outputFile, "search.html")}">Search the archive</a>
    </div>
  </div>

  <header class="site-header">
    <div class="container site-header__inner">
      <a class="brand" href="${linkFrom(outputFile, "index.html")}">
        <span class="brand__mark">
          <img src="${linkFrom(outputFile, "assets/brand/Logo.jpg")}" alt="South African Law Students SA. logo">
        </span>
        <span class="brand__text">${escapeHtml(SITE.name)}</span>
      </a>

      <nav class="site-nav" aria-label="Primary">
        <a href="${linkFrom(outputFile, "index.html")}" data-nav-key="home">Home</a>
        <a href="${linkFrom(outputFile, "archive.html")}" data-nav-key="archive">Archive</a>
        <a href="${linkFrom(outputFile, "search.html")}" data-nav-key="search">Search</a>
        <a href="${linkFrom(outputFile, "about.html")}" data-nav-key="about">About</a>
        <a href="${linkFrom(outputFile, "contact.html")}" data-nav-key="contact">Contact</a>
      </nav>
    </div>
  </header>

  <main>
    ${content}
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <h2>${escapeHtml(SITE.name)}</h2>
        <p>${escapeHtml(SITE.tagline)}</p>
      </div>
      <div>
        <h3>Navigate</h3>
        <ul class="footer-links">
          <li><a href="${linkFrom(outputFile, "archive.html")}">Archive</a></li>
          <li><a href="${linkFrom(outputFile, "search.html")}">Search</a></li>
          <li><a href="${linkFrom(outputFile, "about.html")}">About</a></li>
          <li><a href="${linkFrom(outputFile, "contact.html")}">Contact</a></li>
        </ul>
      </div>
      <div>
        <h3>Source</h3>
        <p>Built from <code>${escapeHtml(footerSource.join(" + "))}</code>.</p>
        <p>&copy; <span data-current-year></span> ${escapeHtml(SITE.name)}</p>
      </div>
    </div>
  </footer>

  <script src="${siteJsHref}"></script>
</body>
</html>
`;
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^---+$/gm, "")
    .trim();
}

function trimText(value, limit) {
  if (!value || value.length <= limit) {
    return value;
  }

  const sentence = value.slice(0, limit).match(/^.*?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length > 80) {
    return sentence[0].trim();
  }

  const slice = value.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const cutoff = lastSpace > 100 ? lastSpace : limit;
  return `${slice.slice(0, cutoff).trim()}...`;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function humanizeFileBase(fileBase) {
  return fileBase
    .replace(/[_-]+/g, " ")
    .replace(/\bcase note\b/i, "Case Note")
    .replace(/\s+/g, " ")
    .trim();
}

function linkFrom(outputFile, targetFromRoot) {
  const relativePath = path.relative(path.dirname(outputFile), path.join(ROOT, ...targetFromRoot.split("/")));
  return encodeHref(relativePath || ".");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function encodeHref(value) {
  return toPosix(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function writeFile(filePath, content) {
  const resolved = ensureInsideRoot(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf8");
}

function resetDir(directory) {
  const resolved = ensureInsideRoot(directory);
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function ensureInsideRoot(targetPath) {
  const resolvedRoot = path.resolve(ROOT);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside the workspace: ${resolvedTarget}`);
  }

  return resolvedTarget;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
