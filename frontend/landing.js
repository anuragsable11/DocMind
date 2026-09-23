/* =========================================================
   DocMind — Landing page
   ========================================================= */

const $  = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/* =========================================================
   THEME  (shares the "docmind-theme" key with the app)
   ========================================================= */

function currentTheme() {
    const set = document.documentElement.dataset.theme;
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

$("theme-btn").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;

    try {
        localStorage.setItem("docmind-theme", next);
    } catch { /* storage unavailable — theme lasts for this session only */ }
});


/* =========================================================
   NAV — condense on scroll, highlight the current section
   ========================================================= */

const nav = $("nav");

function syncNav() {
    nav.classList.toggle("is-scrolled", window.scrollY > 12);
}

window.addEventListener("scroll", syncNav, { passive: true });
syncNav();

const navLinks = $$(".nav-links a");

const sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of navLinks) {
            link.classList.toggle("is-active", link.hash === `#${entry.target.id}`);
        }
    }
}, { rootMargin: "-45% 0px -50% 0px" });

for (const link of navLinks) {
    const section = document.querySelector(link.hash);
    if (section) sectionObserver.observe(section);
}


/* =========================================================
   SCROLL REVEAL
   ========================================================= */

const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
    }
}, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

$$(".reveal").forEach((el) => revealObserver.observe(el));


/* =========================================================
   COUNT-UP STATS
   ========================================================= */

function countUp(el) {
    const target   = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);

    if (reducedMotion) {
        el.textContent = target.toFixed(decimals);
        return;
    }

    const duration = 1400;
    const start = performance.now();

    function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
        el.textContent = (target * eased).toFixed(decimals);
        if (t < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

const countObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        countUp(entry.target);
        observer.unobserve(entry.target);
    }
}, { threshold: 0.6 });

$$("[data-count]").forEach((el) => countObserver.observe(el));


/* =========================================================
   HERO DEMO — a looping question → retrieval → answer
   ========================================================= */

const demo = {
    user:     $("d-user"),
    question: $("d-question"),
    status:   $("d-status"),
    statusText: $("d-status-text"),
    bot:      $("d-bot"),
    answer:   $("d-answer"),
    sources:  $("d-sources"),
    chunks:   $$(".chunk"),
};

const SCRIPT = [
    {
        q: "How much did revenue grow last year?",
        a: "Revenue grew 18% year over year to $4.2M, driven mainly by new enterprise contracts in the second half.",
        chunks: [0, 1],
    },
    {
        q: "What risks does the report highlight?",
        a: "It flags two: dependence on a single cloud supplier, and rising customer-acquisition costs in Europe.",
        chunks: [1, 0],
    },
];

function resetDemo() {
    demo.user.classList.remove("is-shown", "is-done");
    demo.bot.classList.remove("is-shown");
    demo.status.classList.remove("is-shown");
    demo.sources.classList.remove("is-shown");
    demo.question.textContent = "";
    demo.answer.textContent = "";
    demo.chunks.forEach((c) => c.classList.remove("is-hit"));
}

async function typeInto(el, text, speed) {
    for (let i = 1; i <= text.length; i++) {
        el.textContent = text.slice(0, i);
        await sleep(speed + Math.random() * speed * 0.6);
    }
}

async function streamInto(el, text) {
    const words = text.split(" ");
    for (let i = 1; i <= words.length; i++) {
        el.textContent = words.slice(0, i).join(" ");
        await sleep(55 + Math.random() * 45);
    }
}

function showFinalDemoFrame() {
    const { q, a, chunks } = SCRIPT[0];
    demo.question.textContent = q;
    demo.answer.textContent = a;
    demo.user.classList.add("is-shown", "is-done");
    demo.bot.classList.add("is-shown");
    demo.sources.classList.add("is-shown");
    chunks.forEach((i) => demo.chunks[i].classList.add("is-hit"));
}

async function runDemo() {
    let turn = 0;

    while (true) {
        const { q, a, chunks } = SCRIPT[turn % SCRIPT.length];
        resetDemo();
        await sleep(700);

        // 1. The user types a question
        demo.user.classList.add("is-shown");
        await typeInto(demo.question, q, 38);
        demo.user.classList.add("is-done");
        await sleep(350);

        // 2. Retrieval: passages light up in the document
        demo.statusText.textContent = "Searching passages…";
        demo.status.classList.add("is-shown");
        for (const i of chunks) {
            await sleep(520);
            demo.chunks[i].classList.add("is-hit");
        }
        await sleep(400);
        demo.statusText.textContent = "Writing answer from 3 passages…";
        await sleep(700);
        demo.status.classList.remove("is-shown");

        // 3. The answer streams in, then its sources pop
        demo.bot.classList.add("is-shown");
        await streamInto(demo.answer, a);
        await sleep(200);
        demo.sources.classList.add("is-shown");

        await sleep(4200);
        turn++;
    }
}

if (reducedMotion) showFinalDemoFrame();
else runDemo();


/* =========================================================
   CONFIDENCE METER
   ========================================================= */

const THRESHOLD = 0.5;

async function playMeter(card) {
    const rows = $$(".meter-row", card);

    for (const row of rows) {
        const dist = parseFloat(row.dataset.dist);
        row.classList.toggle("is-far", dist > THRESHOLD);
        row.querySelector(".meter-fill").style.width = `${Math.min(dist, 1) * 100}%`;

        if (!reducedMotion) await sleep(900);
        row.classList.add("is-done");
        if (!reducedMotion) await sleep(250);
    }
}

const meterObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        playMeter(entry.target);
        observer.unobserve(entry.target);
    }
}, { threshold: 0.45 });

meterObserver.observe($("meter"));


/* =========================================================
   POINTER EFFECTS  (skipped on touch and reduced motion)
   ========================================================= */

const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (finePointer && !reducedMotion) {

    // Feature cards: spotlight follows the cursor
    for (const card of $$(".feature")) {
        card.addEventListener("pointermove", (e) => {
            const r = card.getBoundingClientRect();
            card.style.setProperty("--mx", `${e.clientX - r.left}px`);
            card.style.setProperty("--my", `${e.clientY - r.top}px`);
        });
    }

    // Primary CTAs lean gently towards the cursor
    for (const btn of $$(".magnetic")) {
        btn.addEventListener("pointermove", (e) => {
            const r = btn.getBoundingClientRect();
            const x = (e.clientX - r.left - r.width  / 2) * 0.18;
            const y = (e.clientY - r.top  - r.height / 2) * 0.28;
            btn.style.transform = `translate(${x}px, ${y}px)`;
        });
        btn.addEventListener("pointerleave", () => {
            btn.style.transform = "";
        });
    }

    // Background orbs drift slightly with scroll for depth
    const orbs = $$(".orb");
    let ticking = false;

    window.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            orbs.forEach((orb, i) => {
                orb.style.translate = `0 ${y * (0.08 + i * 0.05)}px`;
            });
            ticking = false;
        });
    }, { passive: true });
}
