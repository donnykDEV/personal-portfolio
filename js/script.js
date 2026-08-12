const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE_POINTER = window.matchMedia('(pointer: fine)').matches;
const HAS_GSAP = typeof gsap !== 'undefined';

document.addEventListener('DOMContentLoaded', () => {
    prepHeroIntro();

    initCursor();
    initNavToggle();
    initScrollChrome();
    initScrollSpy();
    initMarquee();
    initSpotlight();
    initMagnetic();
    initClock();
    initDurations();
    initMobileLayout();
    initScrollAnimations();
    initCounters();
    initTimeline();
    initSissy();
    initContactForm();

    // The hero entrance is held back until the loader clears so the two never
    // play on top of each other.
    initLoader(runHeroIntro);
});

/* ---------------------------------------------------------------
   INTRO LOADER
   --------------------------------------------------------------- */
function initLoader(onDone) {
    const el = document.getElementById('loader');
    if (!el) {
        onDone();
        return;
    }
    if (REDUCE) {
        el.remove();
        onDone();
        return;
    }

    const bar = el.querySelector('.loader-bar span');
    if (bar) requestAnimationFrame(() => (bar.style.width = '58%'));

    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        if (bar) bar.style.width = '100%';
        setTimeout(() => {
            el.classList.add('is-done');
            setTimeout(() => el.remove(), 550);
            onDone();
        }, 260);
    };

    if (document.readyState === 'complete') setTimeout(finish, 400);
    else window.addEventListener('load', () => setTimeout(finish, 300));

    // Failsafe: never let a hanging asset keep the page behind the curtain.
    setTimeout(finish, 2200);
}

/* ---------------------------------------------------------------
   HERO ENTRANCE — per-character masked reveal
   --------------------------------------------------------------- */
function splitChars(el) {
    const chars = [];
    el.childNodes.forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const frag = document.createDocumentFragment();
        node.textContent.split('').forEach(ch => {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = ch === ' ' ? ' ' : ch;
            frag.appendChild(span);
            chars.push(span);
        });
        node.replaceWith(frag);
    });
    return chars;
}

function prepHeroIntro() {
    if (!HAS_GSAP || REDUCE) return;

    document.querySelectorAll('.hero-name .mask-line-in').forEach(splitChars);

    gsap.set('.hero-name .char', {yPercent: 115, opacity: 0});
    gsap.set(['.hero-tag', '.hero-cta'], {opacity: 0, y: 18});
    gsap.set('.hero-tagline', {opacity: 0});
    gsap.set('#sissy-hero', {opacity: 0, scale: 0.82});
    gsap.set('.hero-deco', {opacity: 0, scale: 0.85});
    gsap.set('.hero-frame span', {opacity: 0});
    gsap.set(['.scroll-line', '.hero-corner'], {opacity: 0});
}

function runHeroIntro() {
    if (!HAS_GSAP || REDUCE) {
        initTypewriter(300);
        initHeroExitFade();
        return;
    }

    const tl = gsap.timeline({defaults: {ease: 'power3.out'}, onComplete: initHeroExitFade})
        .to('.hero-name .char', {yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.028}, 0)
        .to('.hero-tag', {opacity: 1, y: 0, duration: 0.6}, 0.1)
        .to('.hero-tagline', {opacity: 1, duration: 0.4}, 0.55)
        .to('.hero-cta', {opacity: 1, y: 0, duration: 0.7}, 0.7)
        .to('.hero-frame span', {opacity: 0.5, duration: 0.6, stagger: 0.08}, 0.6)
        .to(['.scroll-line', '.hero-corner'], {opacity: 1, duration: 0.6}, 0.9);

    // If the page was restored mid-scroll, Sissy has already flown to the corner —
    // fading her back in here would resurrect the hero copy on top of it.
    if ((window.scrollY || window.pageYOffset || 0) <= 100) {
        tl.to('#sissy-hero', {opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(1.5)'}, 0.3)
            .to('.hero-deco', {opacity: 1, scale: 1, duration: 1.1}, 0.45);
    }

    initTypewriter(700);
}

/* ---------------------------------------------------------------
   HERO EXIT FADE — "Roma, IT" / clock and the corner brackets sit at
   the bottom of a hero that is exactly one viewport tall. Riding along
   unfaded to the literal pixel edge meant they were still on screen,
   tucked under the fixed nav, well after About had scrolled into view
   and become the readable content below them.
   Deliberately created only once the entrance intro has finished (via
   the timeline's onComplete, or immediately under reduced motion,
   where there is no entrance to wait for): a scrubbed tween force-
   renders its start state the moment it is created, and creating it
   any earlier would have raced the intro's own fade-in and frozen
   these elements at their pre-intro opacity of 0.
   --------------------------------------------------------------- */
function initHeroExitFade() {
    if (!HAS_GSAP || typeof ScrollTrigger === 'undefined') return;

    const hero = document.getElementById('hero');
    const targets = document.querySelectorAll('.hero-frame, .hero-corner');
    if (!hero || !targets.length) return;

    // Percentage end (not a fixed px) so the fade completes at the same
    // fraction of hero's height on any viewport: gone by the time it's 35%
    // scrolled past, well before About is readable beneath it.
    if (REDUCE) {
        // A scrubbed fade is itself a scroll-linked motion effect, so reduced
        // motion gets a plain visibility toggle instead: instant, reflecting
        // live progress on every update rather than onEnter/onLeave — those
        // fire at the range's start/end boundaries in a given scroll
        // direction, not "did we pass the end", and start here is 0 (the
        // page's own top), so onEnter fired almost immediately instead of at
        // the 35% mark.
        ScrollTrigger.create({
            trigger: hero,
            start: 'top top',
            end: '35% top',
            onUpdate: self => gsap.set(targets, {autoAlpha: self.progress >= 1 ? 0 : 1}),
        });
        return;
    }

    gsap.to(targets, {
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: '35% top',
            scrub: true,
        },
    });
}

/* ---------------------------------------------------------------
   SCROLL CHROME — progress bar, nav state, background parallax
   --------------------------------------------------------------- */
function initScrollChrome() {
    const bar = document.querySelector('#scroll-progress span');
    const nav = document.getElementById('nav');
    const grid = document.querySelector('.bg-grid');
    let ticking = false;

    const update = () => {
        ticking = false;
        const y = window.scrollY || window.pageYOffset || 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;

        if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
        if (nav) nav.classList.toggle('is-scrolled', y > 40);
        if (grid && !REDUCE) grid.style.setProperty('--bg-shift', (y * -0.05).toFixed(2));
    };

    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll, {passive: true});
    update();
}

/* ---------------------------------------------------------------
   SCROLLSPY — highlights the nav link for the section in view
   --------------------------------------------------------------- */
function initScrollSpy() {
    const links = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    const byId = new Map();
    links.forEach(a => {
        const section = document.querySelector(a.getAttribute('href'));
        if (section) byId.set(section, a);
    });

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            links.forEach(a => a.classList.remove('is-active'));
            const active = byId.get(entry.target);
            if (active) active.classList.add('is-active');
        });
    }, {rootMargin: '-45% 0px -50% 0px', threshold: 0});

    byId.forEach((_, section) => observer.observe(section));
}

/* ---------------------------------------------------------------
   MARQUEE — clone the set once so translateX(-50%) loops seamlessly
   --------------------------------------------------------------- */
function initMarquee() {
    const track = document.getElementById('marquee-track');
    if (!track) return;
    const set = track.querySelector('.marquee-set');
    if (!set) return;
    track.appendChild(set.cloneNode(true));
}

/* ---------------------------------------------------------------
   SPOTLIGHT — radial highlight that follows the pointer across a card
   --------------------------------------------------------------- */
function initSpotlight() {
    if (!FINE_POINTER) return;

    document.querySelectorAll('.spot').forEach(el => {
        el.addEventListener('mousemove', e => {
            const rect = el.getBoundingClientRect();
            el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
            el.style.setProperty('--my', `${e.clientY - rect.top}px`);
        });
    });
}

/* ---------------------------------------------------------------
   MAGNETIC BUTTONS
   --------------------------------------------------------------- */
function initMagnetic() {
    if (!FINE_POINTER || REDUCE || !HAS_GSAP) return;

    document.querySelectorAll('.magnetic').forEach(el => {
        // One reusable tween per axis instead of a fresh gsap.to() on every
        // mousemove event.
        const xTo = gsap.quickTo(el, 'x', {duration: 0.45, ease: 'power3'});
        const yTo = gsap.quickTo(el, 'y', {duration: 0.45, ease: 'power3'});

        el.addEventListener('mousemove', e => {
            const rect = el.getBoundingClientRect();
            xTo((e.clientX - rect.left - rect.width / 2) * 0.22);
            yTo((e.clientY - rect.top - rect.height / 2) * 0.32);
        }, {passive: true});

        el.addEventListener('mouseleave', () => {
            xTo(0);
            yTo(0);
        });
    });
}

/* ---------------------------------------------------------------
   LIVE CLOCK — Rome local time in the hero corner
   --------------------------------------------------------------- */
function initClock() {
    const el = document.getElementById('local-time');
    if (!el) return;

    let format;
    try {
        format = new Intl.DateTimeFormat('it-IT', {
            timeZone: 'Europe/Rome',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch (err) {
        format = new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
    }

    const tick = () => (el.textContent = format.format(new Date()));
    tick();
    setInterval(tick, 1000);
}

/* ---------------------------------------------------------------
   ROLE DURATIONS — derived from the dates already on the page so the
   current role stays accurate without anyone editing it.
   --------------------------------------------------------------- */
function initDurations() {
    const parseYM = ym => {
        const [y, m] = String(ym).split('-').map(Number);
        return Number.isFinite(y) && Number.isFinite(m) ? new Date(y, m - 1, 1) : null;
    };

    document.querySelectorAll('.exp-duration[data-start]').forEach(el => {
        const start = parseYM(el.dataset.start);
        if (!start) return;
        const end = el.dataset.end ? parseYM(el.dataset.end) : new Date();
        if (!end) return;

        // Inclusive of both the first and last month, matching how CVs count.
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        if (months < 1) return;

        const years = Math.floor(months / 12);
        const rest = months % 12;
        const parts = [];
        if (years) parts.push(years === 1 ? '1 anno' : `${years} anni`);
        if (rest) parts.push(rest === 1 ? '1 mese' : `${rest} mesi`);
        el.textContent = parts.join(' ');
    });
}

/* ---------------------------------------------------------------
   MOBILE LAYOUT — rails, accordion and collapsible copy.
   All three only exist under 640px and are torn down again above it,
   so resizing or rotating never leaves the desktop layout in a
   half-mobile state.
   --------------------------------------------------------------- */
function initMobileLayout() {
    const mq = window.matchMedia('(max-width: 639px)');
    const teardowns = [];

    const enable = () => {
        teardowns.push(enableSkillRails(), enableServiziAccordion(), enableExpStack());
    };

    const disable = () => {
        while (teardowns.length) {
            const fn = teardowns.pop();
            if (typeof fn === 'function') fn();
        }
    };

    const sync = () => {
        disable();
        if (mq.matches) enable();
        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
    };

    sync();
    mq.addEventListener('change', sync);
}

function enableSkillRails() {
    const rails = [];

    document.querySelectorAll('#skills .tier-grid').forEach(rail => {
        // Only rails that actually overflow get an indicator.
        if (rail.scrollWidth <= rail.clientWidth + 4) return;

        const track = document.createElement('div');
        track.className = 'rail-progress';
        const thumb = document.createElement('span');
        track.appendChild(thumb);
        rail.insertAdjacentElement('afterend', track);

        const update = () => {
            const max = rail.scrollWidth - rail.clientWidth;
            const trackW = track.clientWidth;
            const thumbW = Math.max(28, trackW * (rail.clientWidth / rail.scrollWidth));
            thumb.style.width = `${thumbW}px`;
            const ratio = max > 0 ? rail.scrollLeft / max : 0;
            thumb.style.transform = `translateX(${ratio * (trackW - thumbW)}px)`;
        };

        rail.addEventListener('scroll', update, {passive: true});
        window.addEventListener('resize', update, {passive: true});
        update();

        rails.push(() => {
            rail.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            track.remove();
            rail.scrollLeft = 0;
        });
    });

    return () => rails.forEach(fn => fn());
}

function setServizioOpen(card, open) {
    if (card.classList.contains('is-open') === open) return;
    card.classList.toggle('is-open', open);
    card.setAttribute('aria-expanded', String(open));
    // No ScrollTrigger.refresh() here on purpose. The accordion reads live
    // rects, so it needs no cached positions of its own, and refreshing mid
    // scroll re-measured the pinned Esperienze stage while it was reverted,
    // corrupting both that pin and this section's own trigger. The only cost
    // is that the Contatti reveal below may fade in marginally early.
}

function enableServiziAccordion() {
    const cards = Array.from(document.querySelectorAll('.servizio-card'));
    if (!cards.length) return null;

    const onActivate = e => {
        const card = e.currentTarget;
        const willOpen = !card.classList.contains('is-open');
        setServizioOpen(card, willOpen);
        // The lit state has to follow the tap immediately: evaluate() only runs
        // on scroll, so without this a tapped card would open unlit until the
        // next scroll event.
        if (willOpen) cards.forEach(c => c.classList.toggle('is-active', c === card));
        else card.classList.remove('is-active');
    };

    const onKey = e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onActivate(e);
    };

    cards.forEach((card, i) => {
        const body = card.querySelector('.servizio-body');
        if (body && !body.id) body.id = `servizio-body-${i + 1}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        if (body) card.setAttribute('aria-controls', body.id);
        card.classList.toggle('is-open', i === 0);
        card.classList.toggle('is-active', i === 0);
        card.setAttribute('aria-expanded', String(i === 0));
        card.addEventListener('click', onActivate);
        card.addEventListener('keydown', onKey);
    });

    // Scroll-driven unfolding. gsap.matchMedia scopes it to the breakpoint and
    // reverts every ScrollTrigger it creates when the query stops matching.
    // The reduced-motion clause means those users keep a plain tap accordion.
    let mm = null;
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        mm = gsap.matchMedia();
        mm.add('(max-width: 639px) and (prefers-reduced-motion: no-preference)', () => {
            const section = document.getElementById('servizi');
            if (!section) return;

            // One ScrollTrigger drives the whole section and positions are read
            // live from getBoundingClientRect on every update. Per-card triggers
            // cannot work here: collapsed, the four headers span only ~330px, so
            // their cached start points sit within a few pixels of each other and
            // all four fire at once. Live rects also absorb the layout growth as
            // panels expand, with no refresh needed to stay correct.
            const evaluate = () => {
                const openLine = window.innerHeight * 0.74;
                // Hysteresis: a card opens high and only closes well below, so a
                // card drifting across a single line mid-transition cannot flicker.
                const closeLine = window.innerHeight * 0.88;

                cards.forEach((card, i) => {
                    if (i === 0) return; // the first panel is the section's resting state
                    const top = card.getBoundingClientRect().top;
                    const isOpen = card.classList.contains('is-open');
                    if (!isOpen && top < openLine) setServizioOpen(card, true);
                    else if (isOpen && top > closeLine) setServizioOpen(card, false);
                });

                // Exactly one card carries the lit state, mirroring hover on
                // desktop. Panels open cumulatively, so by the end of the
                // section every one of them is open — lighting them all would
                // wash the section green and stop signalling anything. The
                // active one is the last that crossed the line: the one being
                // read right now.
                let active = -1;
                cards.forEach((card, i) => {
                    if (card.classList.contains('is-open')) active = i;
                });
                cards.forEach((card, i) => card.classList.toggle('is-active', i === active));
            };

            ScrollTrigger.create({
                trigger: section,
                // Deliberately spans the whole page. Correctness comes entirely
                // from the live rects read in evaluate(), so any cached window
                // is dead weight — and a cached one was wrong anyway: this
                // trigger is built before the Esperienze pin inserts its spacer,
                // which shifts this section down by the pin's length. Costs four
                // rect reads per scroll event.
                start: 0,
                end: 'max',
                onUpdate: evaluate,
                // No refreshPriority: setting it on only some triggers puts the
                // refresh order out of step with page order, which is what
                // pushed this trigger's start negative. Positions here are read
                // live anyway, so refresh order is irrelevant to correctness.
            });
        });
    }

    return () => {
        if (mm) mm.revert();
        cards.forEach(card => {
            card.removeEventListener('click', onActivate);
            card.removeEventListener('keydown', onKey);
            ['role', 'tabindex', 'aria-controls', 'aria-expanded'].forEach(a => card.removeAttribute(a));
            card.classList.remove('is-open', 'is-active');
        });
    };
}

/* Esperienze: the stage is pinned and each experience slides up over the one
   before it. Descriptions stay open throughout — nothing is hidden behind a
   toggle. Falls back to a plain list only when motion is reduced or the
   viewport is not a phone. */
function enableExpStack() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;

    const stage = document.querySelector('.exp-stage');
    const timeline = document.querySelector('#esperienze .timeline');
    if (!stage || !timeline) return null;

    const cards = gsap.utils.toArray('.exp-stage .exp-item');
    if (cards.length < 2) return null;

    let steps = null;
    const mm = gsap.matchMedia();

    mm.add('(max-width: 639px) and (prefers-reduced-motion: no-preference)', () => {
        stage.classList.add('is-stacked');
        timeline.classList.add('is-stacked-parent');

        // Built before the measurement below: the HUD occupies a fixed band at
        // the top of the stage and the panels are inset underneath it, so its
        // height is part of the space the copy has to fit into.
        steps = buildExpSteps(stage, cards.length);

        // scrollHeight is useless for this: the panels are absolutely
        // positioned to fill the stage and centre their content, so when the
        // copy is too tall it overflows equally in both directions — and
        // scrollHeight only ever reports overflow past the bottom edge. It
        // therefore reported "fits" on viewports where the text was in fact
        // being clipped top and bottom. Measure the intrinsic height instead,
        // by letting the panel size to its own content for one read.
        const measureTallest = () => Math.max(...cards.map(c => {
            const inline = c.getAttribute('style');
            c.style.position = 'static';
            c.style.height = 'auto';
            c.style.inset = 'auto';
            const natural = c.offsetHeight;
            if (inline === null) c.removeAttribute('style');
            else c.setAttribute('style', inline);
            return natural;
        }));

        const available = () => stage.clientHeight - steps.height();

        // The fit result now only chooses how tightly the panel is set — it can
        // no longer cancel the animation. Dropping to the plain list keyed off a
        // measurement that goes wrong in too many real conditions (a browser
        // without svh collapsing the stage onto its min-height, Android text
        // scaling inflating the copy), which is why the section arrived
        // unanimated on some phones and animated on others.
        let tallest = measureTallest();
        if (tallest > available()) {
            stage.classList.add('is-compact');
            tallest = measureTallest();
        }

        // Last resort: set the copy from the top instead of centring it, so any
        // remaining overflow falls off the bottom edge only rather than being
        // clipped at the head and the foot at once.
        stage.classList.toggle('is-tight', tallest > available());

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: stage,
                // Fixed px, not a percentage: this clears the fixed-height nav
                // (81px), which does not scale with viewport height. Kept in
                // step with the stage's height reserve in the stylesheet.
                start: 'top 84px',
                end: () => '+=' + Math.round(window.innerHeight * 0.85 * (cards.length - 1)),
                pin: true,
                scrub: 0.5,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                onUpdate: self => steps.update(self.progress),
            },
        });

        // ease: 'none' keeps the panel's travel locked 1:1 to the scrub.
        for (let i = 1; i < cards.length; i++) {
            tl.fromTo(cards[i], {yPercent: 100}, {yPercent: 0, ease: 'none'}, i - 1)
                .fromTo(cards[i - 1], {scale: 1, opacity: 1}, {
                    scale: 0.94,
                    opacity: 0.3,
                    ease: 'none',
                }, i - 1);
        }

        return () => {
            stage.classList.remove('is-stacked', 'is-compact', 'is-tight');
            timeline.classList.remove('is-stacked-parent');
            if (steps) steps.destroy();
            steps = null;
            gsap.set(cards, {clearProps: 'transform,opacity,scale'});
        };
    });

    return () => {
        mm.revert();
        if (steps) steps.destroy();
    };
}

/* The progress HUD. It used to float over the bottom-left corner of the stage,
   where a centred panel's own copy ran straight underneath it; it now owns a
   band across the top of the stage that the panels are inset below, so the two
   cannot collide whatever the length of the text. */
function buildExpSteps(stage, count) {
    const hud = document.createElement('div');
    hud.className = 'exp-hud';
    hud.setAttribute('aria-hidden', 'true');

    const meta = document.createElement('div');
    meta.className = 'exp-hud-meta';

    const title = document.createElement('span');
    title.className = 'exp-hud-title';
    title.textContent = 'Percorso';

    const counter = document.createElement('span');
    counter.className = 'exp-hud-count';
    const current = document.createElement('span');
    current.className = 'exp-hud-cur';
    current.textContent = '01';
    const total = document.createElement('span');
    total.textContent = ` / ${String(count).padStart(2, '0')}`;
    counter.append(current, total);

    meta.append(title, counter);

    const rail = document.createElement('div');
    rail.className = 'exp-hud-rail';

    const segments = [];
    for (let i = 0; i < count; i++) {
        const seg = document.createElement('span');
        seg.className = 'exp-hud-seg';
        const fill = document.createElement('i');
        fill.className = 'exp-hud-fill';
        seg.appendChild(fill);
        rail.appendChild(seg);
        segments.push({seg, fill});
    }

    hud.append(meta, rail);
    stage.appendChild(hud);

    // count panels but count - 1 transitions: the first segment is full from
    // the outset, and segment i drains its fill across transition i - 1. Each
    // fill is scaled rather than toggled so the rail tracks the scrub
    // continuously instead of snapping a step at a time.
    const spans = Math.max(1, count - 1);

    const api = {
        update(progress) {
            const pos = gsap.utils.clamp(0, spans, progress * spans);
            segments.forEach(({seg, fill}, i) => {
                const value = i === 0 ? 1 : gsap.utils.clamp(0, 1, pos - (i - 1));
                fill.style.transform = `scaleX(${value})`;
                seg.classList.toggle('is-on', value > 0.001);
            });
            const active = Math.min(count - 1, Math.round(pos));
            current.textContent = String(active + 1).padStart(2, '0');
        },
        // Read back rather than assumed: the fit measurement subtracts this from
        // the stage, so a restyled HUD stays in step with it on its own.
        height() {
            return hud.offsetHeight;
        },
        destroy() {
            hud.remove();
        },
    };

    api.update(0);
    return api;
}

/* ---------------------------------------------------------------
   ANIMATED COUNTERS
   --------------------------------------------------------------- */
function initCounters() {
    if (!HAS_GSAP || REDUCE || typeof ScrollTrigger === 'undefined') return;

    document.querySelectorAll('.stat-num[data-count]').forEach(el => {
        const target = parseInt(el.dataset.count, 10);
        if (Number.isNaN(target)) return;
        const suffix = el.dataset.suffix || '';
        const counter = {value: 0};

        gsap.to(counter, {
            value: target,
            duration: 1.6,
            ease: 'power2.out',
            scrollTrigger: {trigger: el, start: 'top 90%', once: true},
            onStart: () => (el.textContent = `0${suffix}`),
            onUpdate: () => (el.textContent = Math.round(counter.value) + suffix),
        });
    });
}

/* ---------------------------------------------------------------
   TIMELINE — the rail draws itself as you scroll, dots light up
   --------------------------------------------------------------- */
function initTimeline() {
    if (!HAS_GSAP || typeof ScrollTrigger === 'undefined') return;

    const fill = document.querySelector('.timeline-fill');
    const timeline = document.querySelector('.timeline');

    if (fill && timeline && !REDUCE) {
        gsap.to(fill, {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: {trigger: timeline, start: 'top 72%', end: 'bottom 78%', scrub: 0.4},
        });
    }

    gsap.utils.toArray('.exp-item').forEach(item => {
        ScrollTrigger.create({
            trigger: item,
            start: 'top 82%',
            once: true,
            onEnter: () => item.classList.add('is-active'),
        });
    });
}

/* ---------------------------------------------------------------
   CUSTOM CURSOR
   --------------------------------------------------------------- */
function initCursor() {
    // Without GSAP the class is never added, so `cursor: none` never applies
    // and the native pointer stays visible.
    if (!FINE_POINTER || !HAS_GSAP) return;

    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;

    document.body.classList.add('has-cursor');

    // xPercent/yPercent centre the markers on the pointer, so x/y stay pure
    // viewport coordinates and GSAP owns the whole transform.
    gsap.set([dot, ring], {xPercent: -50, yPercent: -50});

    // quickTo reuses a single tween per property instead of allocating one per
    // mousemove, and writes x/y transforms rather than top/left — the previous
    // version forced layout on every pointer move across the entire page.
    const dotX = gsap.quickTo(dot, 'x', {duration: 0.06, ease: 'power3'});
    const dotY = gsap.quickTo(dot, 'y', {duration: 0.06, ease: 'power3'});
    const ringX = gsap.quickTo(ring, 'x', {duration: 0.5, ease: 'power3'});
    const ringY = gsap.quickTo(ring, 'y', {duration: 0.5, ease: 'power3'});

    let seen = false;
    document.addEventListener('mousemove', e => {
        if (!seen) {
            seen = true;
            // Land both markers on the pointer before revealing them, so
            // nothing sails in from the top-left corner.
            gsap.set([dot, ring], {x: e.clientX, y: e.clientY});
            gsap.to(dot, {autoAlpha: 1, duration: 0.25});
            gsap.to(ring, {autoAlpha: 0.6, duration: 0.25});
        }
        dotX(e.clientX);
        dotY(e.clientY);
        ringX(e.clientX);
        ringY(e.clientY);
    }, {passive: true});

    // Scale rather than width/height: same look, no layout on hover.
    const hoverables = 'a, button, .skill-card, .skill-tag, .servizio-card, .contact-status, .am-row, .marquee';
    document.querySelectorAll(hoverables).forEach(el => {
        el.addEventListener('mouseenter', () => gsap.to(ring, {scale: 1.7, opacity: 0.3, duration: 0.25}));
        el.addEventListener('mouseleave', () => gsap.to(ring, {scale: 1, opacity: 0.6, duration: 0.25}));
    });
}

function initNavToggle() {
    const toggle = document.getElementById('nav-toggle');
    const panel = document.getElementById('nav-panel');
    const nav = document.getElementById('nav');
    const main = document.getElementById('main');

    if (!toggle || !panel) return;

    const desktop = window.matchMedia('(min-width: 1024px)');
    const isOpen = () => panel.classList.contains('open');

    // Durata del fade dell'overlay, allineata alla transition in style.css.
    const FADE_MS = 400;
    let collapseTimer = null;

    const setOpen = (open) => {
        panel.classList.toggle('open', open);

        // È <nav> ad allungarsi a tutto schermo: il pannello gli sta dentro in
        // absolute, così nessun browser può ancorarlo altrove (vedi style.css).
        // In chiusura <nav> torna basso solo a fade concluso, altrimenti il
        // pannello — che ne eredita i confini — verrebbe troncato all'altezza
        // della barra e l'uscita sparirebbe di colpo. Il ritardo sta qui e non
        // in CSS perché height non è interpolabile verso auto: la transizione
        // veniva semplicemente saltata.
        clearTimeout(collapseTimer);
        if (nav) {
            if (open) nav.classList.add('is-open');
            else collapseTimer = setTimeout(() => nav.classList.remove('is-open'), FADE_MS);
        }
        // Lo scroll lock sta su <html>, non su <body>: body è già un contesto
        // delicato per i pin di ScrollTrigger (vedi il commento in style.css).
        document.documentElement.classList.toggle('nav-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');

        main.style.opacity = open ? '0' : '1';

        // Il focus non viene spostato a mano: dopo un click il browser lo
        // assegna comunque al toggle, che è già il primo elemento del trap qui
        // sotto. Da lì Tab entra nelle voci ed Escape chiude. Quando il menu è
        // chiuso i link restano fuori dal tab order grazie a visibility:
        // hidden, quindi non serve nemmeno aria-hidden.
    };

    const closeMenu = ({returnFocus = false} = {}) => {
        if (!isOpen()) return;
        setOpen(false);
        if (returnFocus) toggle.focus({preventScroll: true});
    };

    toggle.addEventListener('click', () => setOpen(!isOpen()));

    // iOS ignora overflow: hidden su <html> quando il gesto parte da un
    // elemento non scrollabile: la pagina scorreva dietro l'overlay, e con lei
    // si muovevano le barre traslucide di Safari. Il touchmove va bloccato solo
    // quando il pannello non ha nulla da scorrere, altrimenti su schermi bassi
    // impedirebbe di raggiungere i contatti in fondo.
    panel.addEventListener('touchmove', (e) => {
        if (isOpen() && panel.scrollHeight <= panel.clientHeight) e.preventDefault();
    }, {passive: false});

    panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => closeMenu()));

    document.addEventListener('keydown', (e) => {
        if (!isOpen()) return;

        if (e.key === 'Escape') {
            closeMenu({returnFocus: true});
            return;
        }

        // Focus trap: finché l'overlay copre la pagina, Tab gira al suo interno.
        if (e.key !== 'Tab') return;
        const focusable = [toggle, ...panel.querySelectorAll('a')];
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
        }
    });

    // Ruotando il telefono o allargando la finestra oltre i 1024px l'overlay
    // non esiste più: senza questo lo scroll lock resterebbe attivo.
    const onBreakpoint = (e) => {
        if (e.matches) closeMenu();
    };
    if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
    else desktop.addListener(onBreakpoint);
}

/* ---------------------------------------------------------------
   SECTION REVEALS
   --------------------------------------------------------------- */
function initScrollAnimations() {
    if (!HAS_GSAP) return;
    gsap.registerPlugin(ScrollTrigger);
    if (REDUCE) return;

    // Every scroll reveal below uses fromTo, never from: from() records the
    // end state when the tween is built, so a ScrollTrigger.refresh() (which
    // also fires on viewport change) could latch the offset start as the final
    // value and strand elements permanently translated.
    document.querySelectorAll('.about-big, .contact-big').forEach(el => {
        const lines = el.querySelectorAll('.mask-line-in');
        if (!lines.length) return;
        gsap.fromTo(lines, {yPercent: 115}, {
            yPercent: 0,
            duration: 0.95,
            ease: 'power3.out',
            stagger: 0.09,
            scrollTrigger: {trigger: el, start: 'top 88%', once: true},
        });
    });

    // Sections whose children are staggered individually (below) are skipped here
    // to avoid double-animating the same elements, which caused the overlap glitch.
    const staggeredSectionIds = new Set(['skills', 'servizi', 'esperienze']);
    document.querySelectorAll('section:not(#hero)').forEach(section => {
        if (staggeredSectionIds.has(section.id)) return;
        gsap.fromTo(section, {opacity: 0, y: 30}, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: section,
                start: 'top 82%',
                toggleActions: 'play none none none',
            },
        });
    });

    const staggerGroups = [
        '#skills .tier-label, #skills .tier1-group-label, #skills .skill-card, #skills .skill-tag',
        '#servizi .servizio-card',
        '#esperienze .exp-item',
    ];
    staggerGroups.forEach(selector => {
        const items = gsap.utils.toArray(selector);
        if (!items.length) return;
        const section = items[0].closest('section');
        // Animate the section label alongside the items so the whole section
        // still reads as "entering from below" without double-transforming the cards.
        const label = section.querySelector('.section-label');
        gsap.fromTo([label, ...items].filter(Boolean), {opacity: 0, y: 24}, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: 'power2.out',
            stagger: 0.08,
            scrollTrigger: {
                trigger: section,
                start: 'top 82%',
                toggleActions: 'play none none none',
            },
        });
    });

    // Secondary detail rows get their own light stagger.
    const detailGroups = ['#about .am-row', '#contatti .contact-link'];
    detailGroups.forEach(selector => {
        const items = gsap.utils.toArray(selector);
        if (!items.length) return;
        gsap.fromTo(items, {opacity: 0, x: -14}, {
            opacity: 1,
            x: 0,
            duration: 0.5,
            ease: 'power2.out',
            stagger: 0.07,
            scrollTrigger: {trigger: items[0], start: 'top 92%', once: true},
        });
    });
}

function initTypewriter(startDelay) {
    if (REDUCE) return;

    const target = document.querySelector('.hero-tagline .type-target');
    if (!target) return;

    const text = target.textContent;
    target.textContent = '';

    let i = 0;
    const typeNext = () => {
        target.textContent = text.slice(0, i);
        i++;
        if (i <= text.length) setTimeout(typeNext, 32);
    };

    setTimeout(typeNext, startDelay);
}

function initSissy() {
    const heroImg = document.getElementById('sissy-hero');
    const fixedImg = document.getElementById('sissy-fixed');
    if (!heroImg || !fixedImg) return;

    const deco = document.querySelector('.hero-deco');

    // Click-to-top works regardless of GSAP/ScrollTrigger availability.
    fixedImg.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));

    if (!HAS_GSAP) return;
    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

    const reduceMotion = REDUCE;

    let heroFloatTween = null;
    let heroWiggleTl = null;
    let fixedFloatTween = null;
    let transitionTl = null;
    let state = 'hero'; // 'hero' | 'fixed' | 'to-fixed' | 'to-hero'

    function startHeroIdle() {
        if (reduceMotion) return;
        heroFloatTween = gsap.to(heroImg, {y: -10, duration: 2.5, ease: 'sine.inOut', yoyo: true, repeat: -1});
        heroWiggleTl = gsap.timeline({repeat: -1, repeatDelay: 5})
            .to(heroImg, {rotation: -3, duration: 0.3, ease: 'elastic.out'})
            .to(heroImg, {rotation: 3, duration: 0.3, ease: 'elastic.out'})
            .to(heroImg, {rotation: 0, duration: 0.3, ease: 'elastic.out'});
    }

    function stopHeroIdle() {
        if (heroFloatTween) {
            heroFloatTween.kill();
            heroFloatTween = null;
        }
        if (heroWiggleTl) {
            heroWiggleTl.kill();
            heroWiggleTl = null;
        }
    }

    function startFixedIdle() {
        if (reduceMotion) return;
        fixedFloatTween = gsap.to(fixedImg, {y: -5, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1});
    }

    function stopFixedIdle() {
        if (fixedFloatTween) {
            fixedFloatTween.kill();
            fixedFloatTween = null;
        }
    }

    gsap.set(fixedImg, {opacity: 0, scale: 0});
    startHeroIdle();

    // #sissy-fixed sits at a fixed bottom:80px/right:16px (see CSS) — the fly-away
    // target below is computed to match that exact box so the hand-off lands cleanly.
    function goToFixed() {
        if (state === 'fixed' || state === 'to-fixed') return;
        state = 'to-fixed';
        stopHeroIdle();
        stopFixedIdle();
        if (transitionTl) transitionTl.kill();

        // The orb/rings belong to the hero pose only — they fade with the take-off.
        if (deco) gsap.to(deco, {opacity: 0, scale: 0.85, duration: 0.35, ease: 'power2.in'});

        const rect = heroImg.getBoundingClientRect();
        gsap.set(heroImg, {
            position: 'fixed', top: rect.top, left: rect.left,
            width: rect.width, height: rect.height, margin: 0,
            x: 0, y: 0, rotation: 0, scale: 1, opacity: 1,
        });
        gsap.set(fixedImg, {opacity: 0, scale: 0, pointerEvents: 'none'});

        // Read the resting box from CSS rather than hardcoding it: #sissy-fixed
        // is smaller and sits lower on mobile. offsetWidth/Height are layout
        // values, so the scale:0 applied above does not affect them.
        const fixedCS = getComputedStyle(fixedImg);
        const fixedW = fixedImg.offsetWidth || 60;
        const fixedH = fixedImg.offsetHeight || 60;
        const targetLeft = window.innerWidth - (parseFloat(fixedCS.right) || 0) - fixedW;
        const targetTop = window.innerHeight - (parseFloat(fixedCS.bottom) || 0) - fixedH;

        if (reduceMotion) {
            gsap.set(heroImg, {autoAlpha: 0});
            gsap.set(fixedImg, {opacity: 1, scale: 1, pointerEvents: 'auto'});
            state = 'fixed';
            startFixedIdle();
            return;
        }

        transitionTl = gsap.timeline({
            onComplete: () => {
                // autoAlpha, not opacity: this leaves a position:fixed element
                // parked over the corner, and visibility:hidden guarantees it
                // cannot intercept anything once it is invisible.
                gsap.set(heroImg, {autoAlpha: 0});
                gsap.set(fixedImg, {pointerEvents: 'auto'});
                state = 'fixed';
                startFixedIdle();
            },
        });
        transitionTl
            .to(heroImg, {y: -80, scale: 1.2, duration: 0.3, ease: 'power2.out'})
            .to(heroImg, {
                x: targetLeft - rect.left,
                y: targetTop - rect.top,
                scale: 0,
                duration: 0.5,
                ease: 'power2.in',
            })
            .to(fixedImg, {opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.7)'}, '-=0.1');
    }

    function goToHero() {
        if (state === 'hero' || state === 'to-hero') return;
        state = 'to-hero';
        stopFixedIdle();
        if (transitionTl) transitionTl.kill();

        gsap.set(fixedImg, {pointerEvents: 'none'});
        if (deco) gsap.to(deco, {opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out', delay: 0.25});

        if (reduceMotion) {
            gsap.set(fixedImg, {opacity: 0, scale: 0});
            gsap.set(heroImg, {clearProps: 'position,top,left,width,height,margin,x,y,scale,rotation,opacity,visibility'});
            state = 'hero';
            startHeroIdle();
            return;
        }

        transitionTl = gsap.timeline({
            onComplete: () => {
                gsap.set(heroImg, {clearProps: 'position,top,left,width,height,margin,x,y,scale,rotation,opacity,visibility'});
                state = 'hero';
                startHeroIdle();
            },
        });
        transitionTl
            .to(fixedImg, {opacity: 0, scale: 0, duration: 0.3, ease: 'power2.in'})
            .set(heroImg, {autoAlpha: 1})
            .to(heroImg, {x: 0, y: -80, scale: 1.2, duration: 0.5, ease: 'power2.out'})
            .to(heroImg, {x: 0, y: 0, scale: 1, rotation: 0, duration: 0.3, ease: 'power2.out'});
    }

    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.create({
            start: 100,
            onEnter: goToFixed,
            onLeaveBack: goToHero,
        });
    }

    fixedImg.addEventListener('mouseenter', () => {
        if (state !== 'fixed') return;
        gsap.to(fixedImg, {scale: 1.2, duration: 0.3, ease: 'power2.out'});
    });
    fixedImg.addEventListener('mouseleave', () => {
        if (state !== 'fixed') return;
        gsap.to(fixedImg, {scale: 1, duration: 0.3, ease: 'power2.out'});
    });
}

/* ---------------------------------------------------------------
   FORM CONTATTI
   Invio asincrono verso /api/contact (serverless function su Vercel,
   che a sua volta inoltra la mail via Resend). L'esito arriva come
   toast animato, senza mai ricaricare la pagina.
   --------------------------------------------------------------- */
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const toast = initToast();
    const btn = form.querySelector('.form-submit');
    const btnLabel = btn ? btn.querySelector('span') : null;
    const idleLabel = btnLabel ? btnLabel.textContent : '';
    let sending = false;

    const setLoading = (on) => {
        if (!btn) return;
        btn.disabled = on;
        btn.classList.toggle('is-loading', on);
        if (btnLabel) btnLabel.textContent = on ? 'Invio in corso' : idleLabel;
    };

    const clearInvalid = () => {
        form.querySelectorAll('.form-input').forEach((el) => el.removeAttribute('aria-invalid'));
    };

    form.querySelectorAll('.form-input').forEach((el) => {
        el.addEventListener('input', () => el.removeAttribute('aria-invalid'));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (sending) return;

        clearInvalid();
        if (!form.checkValidity()) {
            const invalid = form.querySelectorAll('.form-input:invalid');
            invalid.forEach((el) => el.setAttribute('aria-invalid', 'true'));
            if (invalid[0]) invalid[0].focus();
            toast.show('error', 'Campi da rivedere', 'Compila nome, email e messaggio prima di inviare.');
            return;
        }

        const payload = {
            nome: form.elements.nome.value.trim(),
            email: form.elements.email.value.trim(),
            messaggio: form.elements.messaggio.value.trim(),
            website: form.elements.website ? form.elements.website.value : '',
        };

        sending = true;
        setLoading(true);

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });

            let data = {};
            try {
                data = await res.json();
            } catch {
                // Risposta non-JSON (es. pagina di errore della piattaforma):
                // resta un oggetto vuoto e si cade nel ramo di errore.
            }

            if (res.ok && data.ok) {
                form.reset();
                clearInvalid();
                toast.show('success', 'Messaggio inviato', 'Grazie! Ti rispondo di solito entro 24 ore.');
            } else {
                toast.show('error', 'Invio non riuscito', data.error || 'Riprova tra poco o scrivimi a lorenzodoneddudev@gmail.com.');
            }
        } catch {
            toast.show('error', 'Connessione assente', 'Controlla la rete oppure scrivimi a lorenzodoneddudev@gmail.com.');
        } finally {
            sending = false;
            setLoading(false);
        }
    });
}

/* ---------------------------------------------------------------
   TOAST
   --------------------------------------------------------------- */
function initToast() {
    const el = document.getElementById('toast');
    if (!el) return {show: () => {}, hide: () => {}};

    const titleEl = el.querySelector('.toast-title');
    const msgEl = el.querySelector('.toast-msg');
    const iconEl = el.querySelector('.toast-icon');
    const barEl = el.querySelector('.toast-bar');
    const closeBtn = el.querySelector('.toast-close');
    const animate = HAS_GSAP && !REDUCE;

    let hideTimer = null;
    let tl = null;

    function hide() {
        clearTimeout(hideTimer);
        if (tl) tl.kill();

        if (!animate) {
            el.classList.remove('is-open');
            return;
        }

        tl = gsap.to(el, {
            opacity: 0,
            y: 16,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => el.classList.remove('is-open'),
        });
    }

    function show(kind, title, message) {
        const isError = kind === 'error';
        const life = isError ? 8000 : 6000;

        clearTimeout(hideTimer);
        if (tl) tl.kill();

        titleEl.textContent = title;
        msgEl.textContent = message;
        iconEl.textContent = isError ? '!' : '✓';
        el.classList.toggle('is-error', isError);
        el.classList.add('is-open');

        if (animate) {
            tl = gsap.timeline();
            tl.fromTo(el,
                {opacity: 0, y: 24, scale: 0.97},
                {opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out'});
            // La barra scorre da piena a vuota: è il countdown visivo
            // dell'auto-chiusura qui sotto.
            tl.fromTo(barEl,
                {scaleX: 1},
                {scaleX: 0, duration: life / 1000, ease: 'none'}, 0);
        }

        hideTimer = setTimeout(hide, life);
    }

    closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.classList.contains('is-open')) hide();
    });

    return {show, hide};
}
