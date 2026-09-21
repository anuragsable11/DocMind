/* =========================================================
   DocMind — frontend
   ========================================================= */

const $ = (id) => document.getElementById(id);

const els = {
    sidebar:   $("sidebar"),
    scrim:     $("scrim"),
    menuBtn:   $("menu-btn"),

    dropzone:  $("dropzone"),
    fileInput: $("file-input"),
    progress:  $("progress"),
    docCard:   $("doc-card"),
    docName:   $("doc-name"),
    docSub:    $("doc-sub"),
    docRemove: $("doc-remove"),

    statusDot:  $("status-dot"),
    statusText: $("status-text"),
    clearBtn:   $("clear-btn"),
    themeBtn:   $("theme-btn"),
    themeLabel: $("theme-label"),

    chat:     $("chat"),
    empty:    $("empty"),
    chips:    $("chips"),
    messages: $("messages"),

    composer: $("composer"),
    question: $("question"),
    send:     $("send"),

    toasts: $("toasts"),
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;   // 50 MB

const state = {
    documentId: null,
    filename:   null,
    busy:       false,
    controller: null,   // AbortController for the in-flight /chat request
};


/* =========================================================
   SAFE TEXT RENDERING

   Answers come from an LLM reading an arbitrary PDF, so they
   are untrusted. Everything is escaped first, then a small
   fixed set of Markdown constructs is re-introduced. No raw
   model output ever reaches innerHTML.
   ========================================================= */

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderInline(text) {
    return text
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

/** Minimal block-level Markdown over pre-escaped text. */
function renderMarkdown(raw) {
    const escaped = escapeHTML(raw.trim());
    const out = [];

    // Fenced code blocks are extracted first so their contents
    // are never treated as Markdown.
    const parts = escaped.split(/```/);

    parts.forEach((part, i) => {
        if (i % 2 === 1) {
            const body = part.replace(/^[a-zA-Z0-9_-]*\n/, "");
            out.push(`<pre><code>${body.replace(/\n$/, "")}</code></pre>`);
            return;
        }
        out.push(renderBlocks(part));
    });

    return out.join("");
}

function renderBlocks(chunk) {
    const lines = chunk.split("\n");
    const html = [];

    let listType = null;   // "ul" | "ol" | null
    let para = [];

    const flushPara = () => {
        if (!para.length) return;
        html.push(`<p>${renderInline(para.join(" "))}</p>`);
        para = [];
    };

    const closeList = () => {
        if (!listType) return;
        html.push(`</${listType}>`);
        listType = null;
    };

    for (const line of lines) {
        const t = line.trim();

        if (!t) { flushPara(); closeList(); continue; }

        const heading = t.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            flushPara(); closeList();
            const level = heading[1].length;
            html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^&gt;\s?/.test(t)) {
            flushPara(); closeList();
            html.push(`<blockquote>${renderInline(t.replace(/^&gt;\s?/, ""))}</blockquote>`);
            continue;
        }

        const bullet = t.match(/^[-*•]\s+(.*)$/);
        if (bullet) {
            flushPara();
            if (listType !== "ul") { closeList(); html.push("<ul>"); listType = "ul"; }
            html.push(`<li>${renderInline(bullet[1])}</li>`);
            continue;
        }

        const numbered = t.match(/^\d+[.)]\s+(.*)$/);
        if (numbered) {
            flushPara();
            if (listType !== "ol") { closeList(); html.push("<ol>"); listType = "ol"; }
            html.push(`<li>${renderInline(numbered[1])}</li>`);
            continue;
        }

        closeList();
        para.push(t);
    }

    flushPara();
    closeList();

    return html.join("");
}

/**
 * qwen3 emits its chain of thought inside <think> tags. Split it
 * out so the answer stays clean and the reasoning is available
 * behind a disclosure instead of being silently swallowed.
 */
function splitReasoning(raw) {
    const chunks = [];
    const answer = raw.replace(
        /<think>([\s\S]*?)(?:<\/think>|$)/gi,
        (_, inner) => { chunks.push(inner.trim()); return ""; }
    );
    return { reasoning: chunks.filter(Boolean).join("\n\n"), answer: answer.trim() };
}


/* =========================================================
   MESSAGES
   ========================================================= */

const AVATAR_AI = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
    <path d="M14 3v5h5"/>
    <path d="m11.6 11.9 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"/></svg>`;

const AVATAR_ME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/></svg>`;

function hideEmptyState() {
    els.empty.hidden = true;
}

function createMessage(role) {
    const el = document.createElement("article");
    el.className = `msg msg-${role === "me" ? "me" : "ai"}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.innerHTML = role === "me" ? AVATAR_ME : AVATAR_AI;

    const body = document.createElement("div");
    body.className = "body";

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = role === "me" ? "You" : "DocMind";

    body.append(who);
    el.append(avatar, body);

    return { el, body };
}

/** User turn — plain text only, never parsed as Markdown. */
function addUserMessage(text) {
    hideEmptyState();

    const { el, body } = createMessage("me");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    body.append(bubble);

    els.messages.append(el);
    scrollToEnd();
    return el;
}

function addAssistantMessage(raw, sources = [], isError = false) {
    hideEmptyState();

    const { el, body } = createMessage("ai");
    if (isError) el.classList.add("msg-error");

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const { reasoning, answer } = isError
        ? { reasoning: "", answer: raw }
        : splitReasoning(raw);

    if (reasoning) bubble.append(buildReasoning(reasoning));

    const content = document.createElement("div");
    content.innerHTML = renderMarkdown(answer || "_No answer returned._");
    bubble.append(content);

    body.append(bubble);

    if (sources.length) body.append(buildSources(sources));
    if (!isError && answer) body.append(buildActions(answer));

    els.messages.append(el);
    scrollToEnd();
    return el;
}

function buildReasoning(text) {
    const details = document.createElement("details");
    details.className = "think";

    const summary = document.createElement("summary");
    summary.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
    summary.append(document.createTextNode("Show reasoning"));

    const inner = document.createElement("div");
    inner.className = "think-body";
    inner.textContent = text;

    details.append(summary, inner);
    return details;
}

function buildSources(pages) {
    const wrap = document.createElement("div");
    wrap.className = "sources";

    const label = document.createElement("span");
    label.className = "sources-label";
    label.textContent = pages.length === 1 ? "Source" : "Sources";
    wrap.append(label);

    for (const page of pages) {
        const chip = document.createElement("span");
        chip.className = "source";
        chip.textContent = `Page ${page}`;
        wrap.append(chip);
    }
    return wrap;
}

function buildActions(text) {
    const wrap = document.createElement("div");
    wrap.className = "actions";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "act";
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const label = document.createTextNode("Copy");
    btn.append(label);

    btn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(text);
            label.textContent = "Copied";
            setTimeout(() => { label.textContent = "Copy"; }, 1600);
        } catch {
            toast("Could not copy to clipboard", "error");
        }
    });

    wrap.append(btn);
    return wrap;
}

function addTypingMessage() {
    hideEmptyState();

    const { el, body } = createMessage("ai");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
    body.append(bubble);

    els.messages.append(el);
    scrollToEnd();
    return el;
}

function scrollToEnd() {
    requestAnimationFrame(() => {
        els.chat.scrollTop = els.chat.scrollHeight;
    });
}


/* =========================================================
   TOASTS
   ========================================================= */

function toast(message, kind = "info", ms = 3800) {
    const el = document.createElement("div");
    el.className = `toast${kind === "error" ? " is-error" : kind === "ok" ? " is-ok" : ""}`;
    el.textContent = message;
    els.toasts.append(el);

    setTimeout(() => {
        el.classList.add("is-out");
        el.addEventListener("animationend", () => el.remove(), { once: true });
    }, ms);
}


/* =========================================================
   UPLOAD
   ========================================================= */

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function uploadFile(file) {
    if (!file) return;

    const isPDF = file.type === "application/pdf" ||
                  file.name.toLowerCase().endsWith(".pdf");

    if (!isPDF) {
        toast("Only PDF files are supported", "error");
        return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
        toast(`That file is ${formatBytes(file.size)} — the limit is 50 MB`, "error");
        return;
    }

    setUploading(true);

    const form = new FormData();
    form.append("file", file);

    try {
        const res = await fetch("/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);

        const data = await res.json();

        // The API returns 200 with an { error } body for rejected types.
        if (data.error) throw new Error(data.error);

        state.documentId = data.document_id;
        state.filename   = data.filename;

        showDocument(data.filename, `${data.chunks} chunks · ${formatBytes(file.size)}`);
        syncComposer();

        addAssistantMessage(
            `**${data.filename}** is indexed and ready — ${data.chunks} passages ` +
            `are searchable. Ask me anything about it.`
        );
        toast("Document ready", "ok");
        els.question.focus();

    } catch (err) {
        console.error(err);
        toast(err.message || "Upload failed", "error");
    } finally {
        setUploading(false);
        els.fileInput.value = "";
    }
}

function setUploading(on) {
    els.progress.hidden = !on;
    els.dropzone.classList.toggle("is-busy", on);
    els.dropzone.querySelector(".dz-title").textContent =
        on ? "Processing…" : "Upload a PDF";
    els.dropzone.querySelector(".dz-hint").textContent =
        on ? "Extracting and embedding" : "Click to browse or drop a file";
}

function showDocument(name, sub) {
    els.docName.textContent = name;
    els.docName.title = name;
    els.docSub.textContent = sub;
    els.docCard.hidden = false;
}

function clearDocument() {
    state.documentId = null;
    state.filename = null;
    els.docCard.hidden = true;
    syncComposer();
    toast("Document removed");
}


/* =========================================================
   ASK
   ========================================================= */

async function ask(question) {
    if (!question || state.busy) return;

    if (!state.documentId) {
        toast("Upload a PDF first", "error");
        openSidebar();
        return;
    }

    addUserMessage(question);

    els.question.value = "";
    autoGrow();
    setBusy(true);

    const typing = addTypingMessage();
    state.controller = new AbortController();

    try {
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                document_id: state.documentId,
            }),
            signal: state.controller.signal,
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        typing.remove();

        addAssistantMessage(data.answer ?? "", data.sources ?? []);

    } catch (err) {
        typing.remove();

        if (err.name === "AbortError") {
            addAssistantMessage("_Request cancelled._", [], false);
        } else {
            console.error(err);
            addAssistantMessage(
                `Could not reach DocMind — ${err.message}. ` +
                `Check that the server and Ollama are both running.`,
                [], true
            );
        }
    } finally {
        state.controller = null;
        setBusy(false);
        els.question.focus();
    }
}

function setBusy(on) {
    state.busy = on;
    els.send.setAttribute("aria-label", on ? "Stop generating" : "Send question");
    syncComposer();
}

/** The send button is enabled when there is something to do. */
function syncComposer() {
    const hasText = els.question.value.trim().length > 0;
    els.send.disabled = state.busy ? false : !(hasText && state.documentId);
    els.question.placeholder = state.documentId
        ? "Ask something about your document…"
        : "Upload a PDF to get started…";
}


/* =========================================================
   COMPOSER BEHAVIOUR
   ========================================================= */

function autoGrow() {
    els.question.style.height = "auto";
    els.question.style.height = `${Math.min(els.question.scrollHeight, 190)}px`;
}

els.question.addEventListener("input", () => { autoGrow(); syncComposer(); });

els.question.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        els.composer.requestSubmit();
    }
});

els.composer.addEventListener("submit", (e) => {
    e.preventDefault();

    if (state.busy) {
        state.controller?.abort();
        return;
    }
    ask(els.question.value.trim());
});


/* =========================================================
   UPLOAD EVENTS
   ========================================================= */

els.dropzone.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", () => uploadFile(els.fileInput.files[0]));

els.docRemove.addEventListener("click", clearDocument);

["dragenter", "dragover"].forEach((evt) =>
    els.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropzone.classList.add("is-dragging");
    })
);

["dragleave", "drop"].forEach((evt) =>
    els.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropzone.classList.remove("is-dragging");
    })
);

els.dropzone.addEventListener("drop", (e) => {
    uploadFile(e.dataTransfer?.files?.[0]);
});

// Dropping anywhere else should not navigate away from the app.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());


/* =========================================================
   SUGGESTION CHIPS
   ========================================================= */

els.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;

    els.question.value = chip.textContent.trim();
    autoGrow();
    syncComposer();
    els.question.focus();
});


/* =========================================================
   SIDEBAR (mobile drawer)
   ========================================================= */

function openSidebar() {
    els.sidebar.classList.add("is-open");
    els.scrim.hidden = false;
    els.menuBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
    els.sidebar.classList.remove("is-open");
    els.scrim.hidden = true;
    els.menuBtn.setAttribute("aria-expanded", "false");
}

els.menuBtn.addEventListener("click", () =>
    els.sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar()
);

els.scrim.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
});


/* =========================================================
   NEW CONVERSATION
   ========================================================= */

els.clearBtn.addEventListener("click", () => {
    els.messages.replaceChildren();
    els.empty.hidden = false;
    els.question.value = "";
    autoGrow();
    syncComposer();
    closeSidebar();
    els.question.focus();
});


/* =========================================================
   THEME
   ========================================================= */

function currentTheme() {
    const set = document.documentElement.dataset.theme;
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeLabel() {
    els.themeLabel.textContent =
        currentTheme() === "dark" ? "Light mode" : "Dark mode";
}

els.themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;

    try {
        localStorage.setItem("docmind-theme", next);
    } catch { /* storage unavailable — theme lasts for this session only */ }

    syncThemeLabel();
});


/* =========================================================
   SERVER STATUS
   ========================================================= */

async function checkHealth() {
    try {
        const res = await fetch("/health");
        if (!res.ok) throw new Error();

        els.statusDot.classList.remove("is-off");
        els.statusText.textContent = "Local AI · connected";
    } catch {
        els.statusDot.classList.add("is-off");
        els.statusText.textContent = "Server unreachable";
    }
}


/* =========================================================
   INIT
   ========================================================= */

syncThemeLabel();
syncComposer();
autoGrow();
checkHealth();

window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", syncThemeLabel);
