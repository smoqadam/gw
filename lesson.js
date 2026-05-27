
      function el(tag, opts = {}, ...children) {
        const node = document.createElement(tag);
        if (opts.class) node.className = opts.class;
        if (opts.text != null) node.textContent = opts.text;
        if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
        for (const c of children) if (c) node.appendChild(c);
        return node;
      }

      let currentSaveCtx = null;
      let currentLessonLabel = "";

      function formatTime(seconds) {
        const s = Math.floor(seconds);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }

      function refreshDeckCount() {
        const counter = document.getElementById("deck-count");
        if (!counter || !window.Deck) return;
        const n = Deck.count();
        counter.textContent = n ? String(n) : "";
      }

      function sourceLabel(source) {
        if (!source || source.type === "ai" || !source.url) return null;
        try {
          const host = new URL(source.url).hostname.replace(/^www\./, "");
          if (host.includes("wikipedia")) return { label: "Wikipedia", url: source.url };
          return { label: host, url: source.url };
        } catch (_) {
          return { label: "Source", url: source.url };
        }
      }

      function renderMeta(lesson) {
        const meta = document.getElementById("meta");
        meta.textContent = "";
        const parts = [];

        if (lesson.date) {
          const d = new Date(lesson.date);
          if (!isNaN(d)) {
            parts.push(d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
          }
        }
        if (lesson.level) parts.push(lesson.level);

        parts.forEach((t, i) => {
          if (i > 0) meta.appendChild(el("span", { class: "dot", text: "·" }));
          meta.appendChild(el("span", { text: t }));
        });

        const src = sourceLabel(lesson.source);
        if (src) {
          if (parts.length) meta.appendChild(el("span", { class: "dot", text: "·" }));
          meta.appendChild(el("a", {
            text: src.label + " ↗",
            attrs: { href: src.url, target: "_blank", rel: "noopener" },
          }));
        }
      }

      const WORD_RE = /([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]*)/g;

      function tokenizeParagraph(text) {
        const out = [];
        let last = 0, m;
        while ((m = WORD_RE.exec(text)) !== null) {
          if (m.index > last) out.push({ word: false, text: text.slice(last, m.index) });
          out.push({ word: true, text: m[1] });
          last = m.index + m[1].length;
        }
        if (last < text.length) out.push({ word: false, text: text.slice(last) });
        return out;
      }

      function renderText(text) {
        const container = document.getElementById("text");
        container.textContent = "";
        const chunks = (text || "").split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        const paragraphs = chunks.length ? chunks : [text || ""];
        for (const p of paragraphs) {
          const para = document.createElement("p");
          for (const t of tokenizeParagraph(p)) {
            if (t.word) {
              const span = document.createElement("span");
              span.className = "word";
              span.textContent = t.text;
              span.dataset.q = t.text;
              para.appendChild(span);
            } else {
              para.appendChild(document.createTextNode(t.text));
            }
          }
          container.appendChild(para);
        }
      }

      function renderGlossary(containerId, items, keys) {
        const container = document.getElementById(containerId);
        container.textContent = "";
        for (const item of items || []) {
          const wrap = el("div", { class: "item" });
          wrap.appendChild(el("div", { class: "word", text: item[keys[0]] || "" }));
          wrap.appendChild(el("div", { class: "definition", text: item[keys[1]] || "" }));
          if (item[keys[2]]) {
            wrap.appendChild(el("div", { class: "example", text: "„" + item[keys[2]] + "”" }));
          }
          container.appendChild(wrap);
        }
      }

      function renderQuiz(items) {
        const list = document.getElementById("quiz");
        list.textContent = "";
        if (!items || !items.length) return false;

        items.forEach((item, idx) => {
          const li = document.createElement("li");
          li.dataset.type = item.type;

          const qRow = el("div", { class: "q" });
          const num = String(idx + 1).padStart(2, "0");
          qRow.appendChild(el("span", { class: "num", text: num }));
          const qBody = el("div", { class: "q-body" });

          if (item.type === "mcq") {
            qBody.appendChild(el("span", { text: item.q || "" }));
            qRow.appendChild(qBody);
            li.appendChild(qRow);

            const opts = el("div", { class: "options" });
            (item.options || []).forEach((optText, optIdx) => {
              const id = `q${idx}-${optIdx}`;
              const input = el("input", { attrs: { type: "radio", name: `q${idx}`, value: String(optIdx), id } });
              const label = document.createElement("label");
              label.setAttribute("for", id);
              label.appendChild(input);
              label.appendChild(el("span", { text: optText }));
              opts.appendChild(label);
            });
            li.appendChild(opts);
          } else if (item.type === "cloze") {
            qBody.appendChild(el("span", { text: item.sentence || "" }));
            qRow.appendChild(qBody);
            li.appendChild(qRow);

            const input = el("input", {
              class: "cloze-input",
              attrs: { type: "text", placeholder: "your answer", "aria-label": "Answer", autocomplete: "off", spellcheck: "false" },
            });
            li.appendChild(input);
          } else {
            return;
          }

          const check = el("button", { class: "check", text: "Check" });
          li.appendChild(check);

          const feedback = el("div", { class: "feedback", attrs: { hidden: "" } });
          li.appendChild(feedback);

          check.addEventListener("click", () => evaluateAnswer(li, item, feedback, check));
          li.querySelectorAll("input").forEach(inp => {
            inp.addEventListener("keydown", e => {
              if (e.key === "Enter") { e.preventDefault(); check.click(); }
            });
          });

          list.appendChild(li);
        });
        return true;
      }

      function evaluateAnswer(li, item, feedback, button) {
        if (li.classList.contains("answered")) return;
        let isCorrect = false;

        if (item.type === "mcq") {
          const chosen = li.querySelector('input[type="radio"]:checked');
          if (!chosen) {
            feedback.hidden = false;
            feedback.className = "feedback wrong";
            feedback.textContent = "Pick an option first.";
            return;
          }
          const yourIdx = Number(chosen.value);
          isCorrect = yourIdx === Number(item.answer);
          li.querySelectorAll(".options label").forEach((lbl, i) => {
            if (i === Number(item.answer)) lbl.classList.add("is-correct");
            else if (i === yourIdx && !isCorrect) lbl.classList.add("is-wrong");
            lbl.querySelector("input").disabled = true;
          });
        } else if (item.type === "cloze") {
          const input = li.querySelector(".cloze-input");
          const yours = (input.value || "").trim();
          isCorrect = yours.toLowerCase() === String(item.answer || "").trim().toLowerCase();
          input.disabled = true;
        }

        li.classList.add("answered");
        button.disabled = true;
        feedback.textContent = "";
        feedback.hidden = false;
        feedback.className = "feedback " + (isCorrect ? "correct" : "wrong");
        const head = el("strong", { text: isCorrect ? "Correct." : `Answer: ${item.answer}.` });
        feedback.appendChild(head);
        if (item.why) feedback.appendChild(document.createTextNode(" " + item.why));
      }

      const DICT_API = "https://dict.germanweekly.com/api/lookup/";
      const lookupCache = new Map();
      let activeWordEl = null;
      let currentLookup = null;

      function setActiveWord(el) {
        if (activeWordEl && activeWordEl !== el) activeWordEl.classList.remove("active");
        activeWordEl = el || null;
        if (activeWordEl) activeWordEl.classList.add("active");
      }

      function renderEntry(entry) {
        const headword = document.getElementById("panel-headword");
        const body = document.getElementById("panel-body");
        headword.textContent = "";
        if (entry.article) {
          headword.appendChild(el("span", { class: "panel-article", text: entry.article }));
          headword.appendChild(document.createTextNode(" " + (entry.word || "")));
        } else {
          headword.textContent = entry.word || "";
        }

        body.textContent = "";

        const saveTerm = entry.word || (currentSaveCtx && currentSaveCtx.word) || "";
        if (saveTerm && window.Deck) {
          const row = el("div", { class: "panel-save" });
          const btn = el("button", { class: "save-btn" });
          btn.type = "button";
          const setState = () => {
            if (Deck.has(saveTerm)) {
              btn.textContent = "Saved ✓";
              btn.classList.add("saved");
              btn.disabled = true;
            } else {
              btn.textContent = "+ Save to deck";
            }
          };
          setState();
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            Deck.add({
              term: saveTerm,
              article: entry.article || "",
              definition: entry.english_definition || entry.german_definition || "",
              example: (currentSaveCtx && currentSaveCtx.sentence) || "",
              source: currentLessonLabel || "",
            });
            setState();
            refreshDeckCount();
          });
          row.appendChild(btn);
          body.appendChild(row);
        }

        const metaParts = [];
        if (entry.part_of_speech) metaParts.push({ text: entry.part_of_speech });
        if (entry.ipa) metaParts.push({ text: entry.ipa, ipa: true });
        if (entry.plural) metaParts.push({ text: "pl. " + entry.plural });
        if (entry.conjugation) metaParts.push({ text: entry.conjugation });
        if (metaParts.length) {
          const meta = el("div", { class: "panel-meta" });
          metaParts.forEach((p, i) => {
            if (i > 0) meta.appendChild(document.createTextNode(" · "));
            meta.appendChild(el("span", { class: p.ipa ? "ipa" : "", text: p.text }));
          });
          body.appendChild(meta);
        }

        if (entry.german_definition) {
          body.appendChild(el("div", { class: "panel-def-de", text: entry.german_definition }));
        }
        if (entry.english_definition) {
          body.appendChild(el("div", { class: "panel-def-en", text: entry.english_definition }));
        }

        if (entry.examples && entry.examples.length) {
          const sec = el("div", { class: "panel-section" });
          sec.appendChild(el("div", { class: "panel-section-label", text: "Examples" }));
          for (const ex of entry.examples) {
            const item = el("div", { class: "panel-example" });
            item.appendChild(el("div", { class: "ex-de", text: ex.de || "" }));
            if (ex.en) item.appendChild(el("div", { class: "ex-en", text: ex.en }));
            sec.appendChild(item);
          }
          body.appendChild(sec);
        }

        if (entry.grammar_notes) {
          const sec = el("div", { class: "panel-section" });
          sec.appendChild(el("div", { class: "panel-section-label", text: "Grammar" }));
          sec.appendChild(el("div", { class: "panel-notes", text: entry.grammar_notes }));
          body.appendChild(sec);
        }

        if (entry.related_words && entry.related_words.length) {
          const sec = el("div", { class: "panel-section" });
          sec.appendChild(el("div", { class: "panel-section-label", text: "Related" }));
          const chips = el("div", { class: "panel-related" });
          for (const w of entry.related_words) {
            const chip = el("button", { class: "panel-chip", text: w });
            chip.type = "button";
            chip.addEventListener("click", (e) => { e.stopPropagation(); openLookup(w, null); });
            chips.appendChild(chip);
          }
          sec.appendChild(chips);
          body.appendChild(sec);
        }
      }

      async function openLookup(word, anchorEl) {
        if (!word) return;
        const panel = document.getElementById("lookup-panel");
        const headword = document.getElementById("panel-headword");
        const body = document.getElementById("panel-body");

        if (panel.classList.contains("open") && anchorEl && anchorEl === activeWordEl) {
          closeLookup();
          return;
        }

        setActiveWord(anchorEl);
        const sentenceEl = anchorEl && (anchorEl.closest("[data-sentence]") || anchorEl.closest("p"));
        const sentence = sentenceEl
          ? (sentenceEl.dataset.sentence || sentenceEl.textContent.trim())
          : "";
        currentSaveCtx = { word, sentence };

        panel.classList.add("open");
        panel.setAttribute("aria-hidden", "false");
        body.scrollTop = 0;

        if (lookupCache.has(word)) {
          renderEntry(lookupCache.get(word).entry);
          return;
        }

        headword.textContent = word;
        body.textContent = "";
        body.appendChild(el("div", { class: "panel-loading", text: "Looking up…" }));

        const token = Symbol("req");
        currentLookup = token;
        try {
          const response = await fetch(DICT_API + encodeURIComponent(word));
          if (!response.ok) throw new Error("HTTP " + response.status);
          const data = await response.json();
          if (currentLookup !== token) return;
          lookupCache.set(word, data);
          renderEntry(data.entry);
        } catch (err) {
          if (currentLookup !== token) return;
          body.textContent = "";
          const wrap = el("div", { class: "panel-error" });
          wrap.appendChild(el("span", { text: "Couldn't load definition." }));
          const retry = el("button", { class: "retry", text: "Retry" });
          retry.type = "button";
          retry.addEventListener("click", (e) => { e.stopPropagation(); openLookup(word, anchorEl); });
          wrap.appendChild(retry);
          body.appendChild(wrap);
        }
      }

      function closeLookup() {
        const panel = document.getElementById("lookup-panel");
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden", "true");
        setActiveWord(null);
        currentLookup = null;
      }

      function wireLookup() {
        document.querySelector("main").addEventListener("click", (e) => {
          const wordEl = e.target.closest(".word");
          if (!wordEl || !wordEl.dataset.q) return;
          e.stopPropagation();
          openLookup(wordEl.dataset.q, wordEl);
        });
        document.querySelector(".panel-close").addEventListener("click", closeLookup);
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") closeLookup();
        });
        document.addEventListener("click", (e) => {
          const panel = document.getElementById("lookup-panel");
          if (!panel.classList.contains("open")) return;
          if (panel.contains(e.target)) return;
          if (e.target.closest(".word")) return;
          closeLookup();
        });
      }

      let currentSegments = [];
      let ytPlayer = null;
      let syncTimer = null;
      let lastActiveStart = null;

      function renderSegments(segments) {
        const container = document.getElementById("transcript");
        container.textContent = "";
        segments.forEach((seg, i) => {
          const p = el("p", { class: "segment" });
          p.dataset.start = seg.start;
          p.dataset.index = i;
          p.dataset.sentence = seg.text;
          const time = el("button", { class: "seg-time", text: formatTime(seg.start) });
          time.type = "button";
          p.appendChild(time);
          for (const t of tokenizeParagraph(seg.text)) {
            if (t.word) {
              const span = document.createElement("span");
              span.className = "word";
              span.textContent = t.text;
              span.dataset.q = t.text;
              p.appendChild(span);
            } else {
              p.appendChild(document.createTextNode(t.text));
            }
          }
          container.appendChild(p);
        });
      }

      function wireSeek() {
        document.getElementById("transcript").addEventListener("click", (e) => {
          if (e.target.closest(".word")) return;
          const seg = e.target.closest(".segment");
          if (!seg || !ytPlayer || !ytPlayer.seekTo) return;
          ytPlayer.seekTo(Number(seg.dataset.start), true);
          if (ytPlayer.playVideo) ytPlayer.playVideo();
        });
      }

      function matchTranscriptHeight() {
        const layout = document.getElementById("video-layout");
        if (!layout || layout.hidden) return;
        const box = document.getElementById("transcript");
        const frame = layout.querySelector(".video-frame");
        if (window.innerWidth <= 720) { box.style.height = ""; return; }
        if (frame && box) box.style.height = frame.offsetHeight + "px";
      }
      window.addEventListener("resize", matchTranscriptHeight);

      function highlightByStart(activeStart) {
        const box = document.getElementById("transcript");
        let firstActive = null;
        box.querySelectorAll(".segment").forEach((p) => {
          const on = Number(p.dataset.start) === activeStart;
          p.classList.toggle("current", on);
          if (on && !firstActive) firstActive = p;
        });
        if (firstActive) {
          const top = firstActive.offsetTop - box.clientHeight / 2 + firstActive.offsetHeight / 2;
          box.scrollTo({ top, behavior: "smooth" });
        }
      }

      function startSync() {
        if (syncTimer) clearInterval(syncTimer);
        const starts = currentSegments.map((s) => Number(s.start));
        syncTimer = setInterval(() => {
          if (!ytPlayer || !ytPlayer.getCurrentTime) return;
          let t;
          try { t = ytPlayer.getCurrentTime(); } catch (_) { return; }
          let idx = -1;
          for (let i = 0; i < starts.length; i++) {
            if (starts[i] <= t + 0.05) idx = i;
            else break;
          }
          if (idx < 0) return;
          const activeStart = starts[idx];
          if (activeStart === lastActiveStart) return;
          lastActiveStart = activeStart;
          highlightByStart(activeStart);
        }, 250);
      }

      function loadYouTubePlayer(videoId) {
        window.onYouTubeIframeAPIReady = function () {
          ytPlayer = new YT.Player("player", {
            videoId,
            playerVars: { rel: 0, modestbranding: 1, cc_load_policy: 0 },
            events: { onReady: () => { matchTranscriptHeight(); startSync(); } },
          });
        };
        if (window.YT && window.YT.Player) {
          window.onYouTubeIframeAPIReady();
        } else if (!document.getElementById("yt-api")) {
          const tag = document.createElement("script");
          tag.id = "yt-api";
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
        }
      }

      function renderVideo(lesson) {
        document.body.classList.add("video-lesson");
        document.getElementById("audio").hidden = true;
        document.getElementById("text").hidden = true;
        currentSegments = lesson.segments || [];
        renderSegments(currentSegments);
        document.getElementById("video-layout").hidden = false;
        matchTranscriptHeight();
        wireSeek();
        if (lesson.video_id) loadYouTubePlayer(lesson.video_id);
      }

      function buildDrawer(index) {
        const list = document.getElementById("drawer-list");
        list.textContent = "";
        for (const e of index) {
          const a = el("a", { class: "drawer-item" });
          a.href = `?lesson=${encodeURIComponent(e.id)}`;
          a.dataset.id = e.id;
          a.appendChild(el("span", {
            class: "di-type " + (e.type === "video" ? "is-video" : "is-text"),
            text: e.type === "video" ? "▶" : "¶",
          }));
          const body = el("div", { class: "di-body" });
          body.appendChild(el("div", { class: "di-title", text: e.title || "Untitled" }));
          const d = new Date(e.date);
          const date = isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
          body.appendChild(el("div", { class: "di-meta", text: date + (e.level ? " · " + e.level : "") }));
          a.appendChild(body);
          list.appendChild(a);
        }
      }

      function markActiveInDrawer(id) {
        document.querySelectorAll(".drawer-item").forEach((a) =>
          a.classList.toggle("active", a.dataset.id === id));
      }

      function wireDrawer() {
        const drawer = document.getElementById("drawer");
        const overlay = document.getElementById("drawer-overlay");
        const open = () => { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); overlay.hidden = false; };
        const close = () => { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); overlay.hidden = true; };
        document.getElementById("menu-btn").addEventListener("click", open);
        overlay.addEventListener("click", close);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
      }

      async function loadLesson() {
        const meta = document.getElementById("meta");
        const title = document.getElementById("title");
        const text = document.getElementById("text");
        const audio = document.getElementById("audio");

        try {
          const indexResp = await fetch("lessons/index.json", { cache: "no-store" });
          if (!indexResp.ok) throw new Error("No lessons yet.");
          const index = await indexResp.json();
          buildDrawer(index);
          if (!index.length) throw new Error("No lessons yet.");

          const wanted = new URLSearchParams(location.search).get("lesson");
          let entry;
          if (wanted) {
            entry = index.find((e) => e.id === wanted);
            if (!entry) throw new Error("Lesson not found.");
          } else {
            entry = index[0];
          }
          markActiveInDrawer(entry.id);

          const response = await fetch(`lessons/${entry.id}.json`, { cache: "no-store" });
          if (!response.ok) throw new Error("Lesson not found.");
          const lesson = await response.json();

          title.textContent = lesson.title || "German Weekly";
          document.title = `${lesson.title || "German Weekly"} — German Weekly`;
          currentLessonLabel = lesson.title || "";

          renderMeta(lesson);

          // A non-video lesson must never show or load the YouTube player:
          // tear down any player, stop syncing, and hide the video layout.
          if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
          if (ytPlayer && ytPlayer.destroy) { try { ytPlayer.destroy(); } catch (_) {} }
          ytPlayer = null;
          lastActiveStart = null;
          document.body.classList.remove("video-lesson");
          document.getElementById("video-layout").hidden = true;
          text.hidden = false;

          if (lesson.type === "video") {
            renderVideo(lesson);
            return;
          }

          renderText(lesson.text || "");

          if (lesson.voice_path) {
            audio.src = lesson.voice_path;
            audio.hidden = false;
          }

          if (lesson.vocabs && lesson.vocabs.length) {
            renderGlossary("vocabs", lesson.vocabs, ["word", "definition", "example"]);
            document.getElementById("vocab-section").hidden = false;
          }
          if (lesson.phrases && lesson.phrases.length) {
            renderGlossary("phrases", lesson.phrases, ["phrase", "translation", "example"]);
            document.getElementById("phrases-section").hidden = false;
          }
          if (renderQuiz(lesson.quiz)) {
            document.getElementById("quiz-section").hidden = false;
          }
        } catch (error) {
          meta.innerHTML = `<span class="error">${error.message}</span>`;
          text.textContent = "Run the generator to create the first lesson.";
        }
      }

      wireLookup();
      wireDrawer();
      refreshDeckCount();
      loadLesson();