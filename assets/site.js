(function () {
  const caseData = window.CASE_NOTE_DATA || {};
  const posts = Array.isArray(window.CASE_NOTE_INDEX)
    ? window.CASE_NOTE_INDEX.slice()
    : Array.isArray(caseData.posts)
      ? caseData.posts.slice()
      : [];

  const ARCHIVE_LIMIT = 80;
  const SEARCH_LIMIT = 50;
  const HOME_LIMIT = 6;

  document.addEventListener("DOMContentLoaded", () => {
    markActiveNav();
    injectCurrentYear();
    initAdRail();
    initHomePage();
    initArchivePage();
    initSearchPage();
    initContactForm();
  });

  function markActiveNav() {
    const page = document.body.dataset.page;
    if (!page) {
      return;
    }

    document.querySelectorAll("[data-nav-key]").forEach((link) => {
      if (link.dataset.navKey === page) {
        link.classList.add("is-active");
      }
    });
  }

  function injectCurrentYear() {
    document.querySelectorAll("[data-current-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initAdRail() {
    const main = document.querySelector("main");
    const footer = document.querySelector(".site-footer");
    if (!main || !footer || document.querySelector(".site-ad-rail")) {
      return;
    }

    let shell = document.querySelector(".site-content-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "site-content-shell";
      document.body.insertBefore(shell, footer);
      shell.appendChild(main);
    }

    const rail = document.createElement("aside");
    rail.className = "site-ad-rail";
    rail.setAttribute("aria-label", "Advertising spaces");

    const slots = [
      { className: "ad-slot ad-slot--box", label: "Advertisement space 1, 300 by 250" },
      { className: "ad-slot ad-slot--box", label: "Advertisement space 2, 300 by 250" },
      { className: "ad-slot ad-slot--tall", label: "Advertisement space 3, 300 by 600" },
      { className: "ad-slot ad-slot--tall", label: "Advertisement space 4, 300 by 600" }
    ];

    slots.forEach((slot) => {
      const node = document.createElement("div");
      node.className = slot.className;
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", slot.label);
      rail.appendChild(node);
    });

    shell.appendChild(rail);
  }

  function initHomePage() {
    if (document.body.dataset.page !== "home") {
      return;
    }

    const resultsNode = document.getElementById("home-latest-results");
    const summaryNode = document.getElementById("home-latest-summary");

    if (!resultsNode || !summaryNode) {
      return;
    }

    if (!posts.length) {
      summaryNode.textContent = "The combined case-note index is not available yet.";
      resultsNode.innerHTML =
        '<article class="feature-card"><h3>Case notes unavailable</h3><p>Run the site build to regenerate the Constitutional Court and SCA archive.</p></article>';
      return;
    }

    const latestPosts = posts.slice(0, HOME_LIMIT);
    const countsByCollection = caseData.countsByCollection || {};
    const ccCount = Number(countsByCollection.cc || 0);
    const scaCount = Number(countsByCollection.sca || 0);

    summaryNode.textContent = `Showing ${ccCount.toLocaleString()} Constitutional Court and ${scaCount.toLocaleString()} Supreme Court of Appeal case notes.`;
    resultsNode.innerHTML = latestPosts.map(renderFeatureCard).join("");
  }

  function initArchivePage() {
    if (document.body.dataset.page !== "archive") {
      return;
    }

    const queryInput = document.getElementById("archive-query");
    const yearSelect = document.getElementById("archive-year");
    const courtSelect = document.getElementById("archive-court");
    const countNode = document.getElementById("archive-count");
    const resultsNode = document.getElementById("archive-results");

    if (!queryInput || !yearSelect || !courtSelect || !countNode || !resultsNode) {
      return;
    }

    if (!posts.length) {
      countNode.textContent = "The archive index is not available.";
      return;
    }

    populateYearOptions(yearSelect);
    populateCourtOptions(courtSelect);

    const params = new URLSearchParams(window.location.search);
    queryInput.value = params.get("q") || "";
    yearSelect.value = params.get("year") || "";
    courtSelect.value = params.get("court") || "";

    const update = () => {
      const query = queryInput.value.trim();
      const year = yearSelect.value.trim();
      const court = courtSelect.value.trim();

      const filtered = posts.filter((post) => {
        const matchesYear = !year || String(post.year) === year;
        const matchesCourt = !court || String(post.collectionKey) === court;
        const matchesQuery = !query || buildHaystack(post).includes(normalize(query));
        return matchesYear && matchesCourt && matchesQuery;
      });

      const visible = filtered.slice(0, ARCHIVE_LIMIT);
      resultsNode.innerHTML = visible.length
        ? visible.map(renderArchiveItem).join("")
        : '<article class="archive-item"><div class="archive-item__body"><h2>No matching case notes</h2><p>Try a broader query or clear one of the filters.</p></div></article>';

      countNode.textContent = buildArchiveSummary(filtered.length, visible.length, query, year, court);

      syncQueryString({
        q: query || null,
        year: year || null,
        court: court || null
      });
    };

    queryInput.addEventListener("input", update);
    yearSelect.addEventListener("change", update);
    courtSelect.addEventListener("change", update);
    update();
  }

  function initSearchPage() {
    if (document.body.dataset.page !== "search") {
      return;
    }

    const queryInput = document.getElementById("search-query");
    const courtSelect = document.getElementById("search-court");
    const countNode = document.getElementById("search-count");
    const resultsNode = document.getElementById("search-results");

    if (!queryInput || !courtSelect || !countNode || !resultsNode) {
      return;
    }

    if (!posts.length) {
      countNode.textContent = "The search index is not available.";
      return;
    }

    populateCourtOptions(courtSelect);

    const params = new URLSearchParams(window.location.search);
    queryInput.value = params.get("q") || "";
    courtSelect.value = params.get("court") || "";

    const update = () => {
      const query = queryInput.value.trim();
      const court = courtSelect.value.trim();
      const filteredBase = court ? posts.filter((post) => post.collectionKey === court) : posts;
      const ranked = query ? rankPosts(query, filteredBase) : filteredBase.slice(0, 15);
      const visible = ranked.slice(0, SEARCH_LIMIT);

      resultsNode.innerHTML = visible.length
        ? visible.map(renderSearchItem).join("")
        : '<article class="search-card"><h2>No matching case notes</h2><p>Try fewer keywords or clear the court filter.</p></article>';

      countNode.textContent = buildSearchSummary(query, court, ranked.length, visible.length);

      syncQueryString({
        q: query || null,
        court: court || null
      });
    };

    queryInput.addEventListener("input", update);
    courtSelect.addEventListener("change", update);
    update();
  }

  function initContactForm() {
    if (document.body.dataset.page !== "contact") {
      return;
    }

    const form = document.getElementById("contact-form");
    const statusNode = document.getElementById("contact-form-status");

    if (!form || !statusNode) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const recipient = form.dataset.recipient || "";
      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const subject = String(formData.get("subject") || "").trim();
      const message = String(formData.get("message") || "").trim();

      if (!recipient || !name || !email || !subject || !message) {
        statusNode.textContent = "Please complete every field before drafting the email.";
        return;
      }

      const body = [`Name: ${name}`, `Email: ${email}`, "", message].join("\n");
      const mailto = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      statusNode.textContent = "Opening your email client with the drafted message.";
      window.location.href = mailto;
    });
  }

  function populateYearOptions(select) {
    const years = [...new Set(posts.map((post) => String(post.year)))].sort((left, right) => Number(right) - Number(left));
    const selected = select.value;
    select.innerHTML = ['<option value="">All years</option>']
      .concat(years.map((year) => `<option value="${escapeAttribute(year)}">${escapeHtml(year)}</option>`))
      .join("");
    select.value = selected;
  }

  function populateCourtOptions(select) {
    const collections = posts.reduce((result, post) => {
      if (!post.collectionKey || !post.collectionLabel || result.some((item) => item.key === post.collectionKey)) {
        return result;
      }

      result.push({
        key: post.collectionKey,
        label: post.collectionLabel
      });
      return result;
    }, []);

    const selected = select.value;
    select.innerHTML = ['<option value="">All courts</option>']
      .concat(
        collections.map(
          (collection) =>
            `<option value="${escapeAttribute(collection.key)}">${escapeHtml(collection.label)}</option>`
        )
      )
      .join("");
    select.value = selected;
  }

  function rankPosts(query, collectionPosts) {
    const normalizedQuery = normalize(query);

    return collectionPosts
      .map((post) => ({
        post,
        score: scorePost(post, normalizedQuery)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.post.year !== left.post.year) {
          return Number(right.post.year) - Number(left.post.year);
        }

        return Number(right.post.fileNumber || 0) - Number(left.post.fileNumber || 0);
      })
      .map((item) => item.post);
  }

  function scorePost(post, query) {
    const title = normalize(post.title);
    const citation = normalize(post.citation);
    const court = normalize(post.court);
    const collection = normalize(post.collectionLabel);
    const judges = normalize(post.judges);
    const summary = normalize(post.summary);
    const searchText = normalize(post.searchText);
    const year = normalize(String(post.year || ""));

    let score = 0;

    if (title.includes(query)) {
      score += title.startsWith(query) ? 80 : 48;
    }

    if (citation.includes(query)) {
      score += 35;
    }

    if (year.includes(query)) {
      score += 28;
    }

    if (judges.includes(query)) {
      score += 20;
    }

    if (court.includes(query) || collection.includes(query)) {
      score += 18;
    }

    if (summary.includes(query)) {
      score += 12;
    }

    if (searchText.includes(query)) {
      score += 8;
    }

    return score;
  }

  function buildHaystack(post) {
    return normalize(
      [
        post.title,
        post.year,
        post.collectionLabel,
        post.court,
        post.citation,
        post.deliveredOn,
        post.heardOn,
        post.judges,
        post.summary,
        post.searchText
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  function buildArchiveSummary(totalMatches, visibleMatches, query, year, court) {
    if (!query && !year && !court) {
      if (totalMatches > visibleMatches) {
        return `Showing the latest ${visibleMatches} of ${totalMatches} case notes. Use search or filters to narrow the archive.`;
      }

      return `Showing all ${totalMatches} case notes.`;
    }

    if (!totalMatches) {
      return "No case notes matched your current filters.";
    }

    if (totalMatches > visibleMatches) {
      return `Showing the first ${visibleMatches} of ${totalMatches} matching case notes. Narrow the results to see more relevant matches.`;
    }

    return `Showing all ${totalMatches} matching case notes.`;
  }

  function buildSearchSummary(query, court, totalMatches, visibleMatches) {
    if (!query) {
      if (court) {
        return `Showing ${visibleMatches} recent case notes for the selected court. Type to search the full archive.`;
      }

      return `Showing ${visibleMatches} recent case notes. Type to search the full archive.`;
    }

    if (!totalMatches) {
      return "No matching case notes were found.";
    }

    if (totalMatches > visibleMatches) {
      return `Found ${totalMatches} matching case notes. Showing the top ${visibleMatches} results.`;
    }

    return `Found ${totalMatches} matching case notes.`;
  }

  function renderArchiveItem(post) {
    return `
      <article class="archive-item">
        <div class="archive-item__body">
          <p class="archive-item__meta">${escapeHtml(buildMetaLine(post))}</p>
          <h2><a href="${post.href}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.summary)}</p>
        </div>
        <div class="archive-item__side">
          <span class="pill">${escapeHtml(post.collectionLabel)}</span>
          <span class="pill">${escapeHtml(post.year)}</span>
          ${post.citation ? `<span class="pill">${escapeHtml(post.citation)}</span>` : ""}
          <a class="text-link" href="${post.sourceHref}">Source .txt</a>
        </div>
      </article>
    `;
  }

  function renderSearchItem(post) {
    return `
      <article class="search-card">
        <p class="archive-item__meta">${escapeHtml(buildMetaLine(post))}</p>
        <h2><a href="${post.href}">${escapeHtml(post.title)}</a></h2>
        <p>${escapeHtml(post.summary)}</p>
        <div class="search-card__links">
          <span class="pill">${escapeHtml(post.collectionLabel)}</span>
          <a class="text-link" href="${post.href}">Read post</a>
          <a class="text-link" href="${post.sourceHref}">Open source .txt</a>
        </div>
      </article>
    `;
  }

  function renderFeatureCard(post) {
    const footerMeta = post.citation ? `${post.collectionLabel} · ${post.citation}` : post.collectionLabel;

    return `
      <article class="feature-card">
        <span class="pill">${escapeHtml(post.collectionLabel)}</span>
        <h3><a href="${post.href}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.summary)}</p>
        <div class="feature-card__footer">
          <span>${escapeHtml(footerMeta)}</span>
          <a class="text-link" href="${post.href}">Read note</a>
        </div>
      </article>
    `;
  }

  function buildMetaLine(post) {
    return [post.year, post.court, post.citation, post.deliveredOn ? `Delivered ${post.deliveredOn}` : ""]
      .filter(Boolean)
      .join(" · ");
  }

  function syncQueryString(values) {
    const url = new URL(window.location.href);

    Object.entries(values).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      } else {
        url.searchParams.delete(key);
      }
    });

    const newUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", newUrl);
  }

  function normalize(value) {
    return String(value || "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
