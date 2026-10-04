/* =========================================================
   CIELO — retino "Dither" della hero e della pagina (js/sky.js)

   Due canvas WebGL2, nessuna dipendenza, nessun cookie né storage:
   uno nella hero e uno, più rado, sotto tutto il resto della pagina.
   Condividono la stessa grammatica a pixel di Sissy: retino ordinato
   di Bayer 8×8 e cinque toni, letti dai token --sky-0…4 di base.css.
   Il canvas ha una cella per pixel e il CSS lo ingrandisce senza
   interpolare; il lato della cella è un numero intero di pixel del
   dispositivo, così ogni punto del retino è identico.

   Il file ha tre parti: gli shader e le utilità comuni, heroSky()
   e pageSky(). Ognuna degrada da sola: senza WebGL2, o se manca il
   suo contenitore, resta lo sfondo piatto.

   ---------------------------------------------------------
   HERO — sfondo "Dither"

   Una luna a 1 bit che spunta da dietro il terminale, con Sissy
   seduta davanti, in un cielo di stelle.

   - la luce sulla luna segue il puntatore, quindi la fase: col
     puntatore davanti è piena, ai lati falce. All'ingresso la
     luna parte nuova e la luce le gira intorno fino a lì;
   - i crateri sono celle di Voronoi in 3D intersecate con la
     sfera: conca e bordo rialzato, che con la luce radente
     fanno ombra da una parte e luce dall'altra;
   - le stelle brillano ognuna col suo ritmo: in ogni istante ce
     ne sono di piene e di fioche, mai tutte spente insieme;
   - col mouse sulla hero, ogni tanto una cometa taglia il cielo
     e passa dietro la luna. Senza hover (touch) ne passa una
     ogni tanto da sola, più di rado.

   Regole:
   - il canvas sta dentro #hero, absolute, sotto il contenuto:
     mai un layer fixed a tutta viewport (bug isola iOS 26);
   - gira solo con la hero a schermo e la scheda visibile;
   - con prefers-reduced-motion disegna un fotogramma fermo,
     senza ingresso e senza comete;
   - il puntatore arriva smorzato; senza puntatore (touch, o
     fermo da qualche secondo) lo sostituisce un "cursore
     fantasma" che si muove da solo, lentissimo.

   ---------------------------------------------------------
   PAGINA — il "Dither" in tono minore

   Sotto la hero la notte continua, ma rada e fioca: qui si
   legge, la vetrina è sopra.

   - stelle su due piani che scorrono più lenti del contenuto:
     il lontano più fitto e fioco, il vicino rado, con qualche
     crocetta. La parallasse dà profondità senza che niente si
     muova da solo;
   - il cielo sta solo nei vuoti: intorno a titoli, testi, card
     e form non c'è niente, e i blocchi si misurano dal DOM. Una
     stella che per la parallasse scivola sotto un blocco si
     spegne, invece di finire tra le parole;
   - quando la pagina corre (rotella veloce, salto dal menu) le
     stelle lasciano una scia verticale, come in una posa lunga:
     lunga quanto la velocità, nulla allo scroll di lettura;
   - il footer è l'orizzonte: sotto, terra, niente stelle. Sopra
     sorge una luna più piccola di quella della hero, nel vuoto
     che lasciano i contatti e grande quanto quel vuoto: sale con
     lo scroll e intanto cresce di fase, poi la luce segue il
     puntatore come nella hero. La pagina comincia e finisce con
     la luna;
   - comete solo con un motivo: una quando la luna è sorta, la
     prima volta, e uno sciame di tre a messaggio inviato.

   Regole:
   - niente layer fixed a tutta viewport (bug isola iOS 26): il
     canvas sta in una vista sticky alta 100lvh, dentro un
     contenitore absolute alto quanto la pagina, sotto le
     sezioni (z-index 0 contro 1);
   - disegna a ogni fotogramma solo mentre la pagina scorre o
     qualcosa si muove; da ferma quanto basta allo scintillio
     (15 fotogrammi al secondo, 30 con la luna). Si ferma con la
     scheda nascosta e quando la hero copre tutto lo schermo;
   - con prefers-reduced-motion niente parallasse, scie,
     scintillio e comete: le stelle stanno ferme sulla pagina e
     la luna è già sorta, con una luce fissa.
   ========================================================= */
(function () {
    'use strict';

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Comete in volo insieme, al massimo: è anche la misura dell'array di
    // uniform nello shader.
    const MAX_COMETS = 4;

    /* ---------------------------------------------------------------
       SHADER — un triangolo che copre lo schermo, niente buffer: le
       coordinate escono da gl_VertexID.
       --------------------------------------------------------------- */
    const VERT = `#version 300 es
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

    // Simplex noise 3D di Ashima Arts / Stefan Gustavson (licenza MIT).
    const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

    // Grammatica del retino: Bayer, hash, palette, crateri, superficie e
    // alone della luna. È in comune col cielo del resto della pagina
    // (pageSky), così stelle e lune sono fatte allo stesso modo.
    const LIB = `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// Hash senza seno (Dave Hoskins): niente motivi a righe dove le
// coordinate crescono.
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec3 hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

float sdBox(vec2 p, vec4 r) {
    vec2 q = abs(p - (r.xy + r.zw) * 0.5) - (r.zw - r.xy) * 0.5;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// Il --bg e quattro toni. Il quinto, il più chiaro, solo per i nuclei
// delle stelle grandi e le teste delle comete. Arrivano dal CSS (vedi
// palette() più sotto), così cambiarli non tocca gli shader.
uniform vec3 uPal[5];
vec3 shade(float lv) {
    return lv < 0.5 ? uPal[0] : lv < 1.5 ? uPal[1] : lv < 2.5 ? uPal[2] : lv < 3.5 ? uPal[3] : uPal[4];
}

// Un valore continuo in livelli: la parte intera più il retino sulla
// frazionaria. La soglia sta a metà del gradino di Bayer, così una
// frazione nulla resta davvero spenta in tutte le celle.
float dq(float v, vec2 f) {
    return floor(v) + step(bayer8(f) + 0.0078125, fract(v));
}

// Crateri: in alcune celle di Voronoi c'è un cratere, conca al centro e
// bordo rialzato. Il profilo è lo stesso a ogni scala, come nei crateri
// veri: la profondità cresce col raggio.
//   h(u) = 0.9 (u² - 1) dentro, più il bordo 0.3 exp(-((u - 1) / 0.2)²)
// Restituisce la pendenza (xyz), che poi piega la normale, e uno scarto
// di albedo (w): fondo un po' più scuro, bordo un po' più chiaro, così i
// crateri si leggono anche a luna piena, quando le ombre spariscono.
vec4 craters(vec3 q, float freq, float density) {
    vec3 p = q * freq;
    vec3 ip = floor(p);
    vec3 g = vec3(0.0);
    float alb = 0.0;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
        vec3 c = ip + vec3(float(x), float(y), float(z));
        vec3 h = hash3(c);
        if (h.z > density) continue;
        vec3 d = p - (c + 0.25 + 0.5 * hash3(c + 17.0));
        float dist = length(d);
        float u = dist / (0.22 + 0.24 * h.x);
        if (u > 1.7) continue;
        float e = (u - 1.0) * 5.0;
        float rim = exp(-e * e);
        float dh = (u < 1.0 ? 1.8 * u : 0.0) - 3.0 * e * rim;
        g += dh * d / max(dist, 1e-4);
        alb += 0.09 * rim - 0.12 * (1.0 - smoothstep(0.55, 0.9, u));
    }
    return vec4(g, alb);
}

// Superficie della luna nel punto p del disco (raggio 1, y in su), con
// r2 = |p|². La luna ruota piano su se stessa col tempo.
float moonLevel(vec2 p, float r2, vec3 light, float time, vec2 f) {
    vec3 n = vec3(p, sqrt(1.0 - r2));
    float a = time * 0.025;
    float c = cos(a), s = sin(a);
    vec3 q = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z) + 3.7;
    float maria = snoise(q * 1.25) * 0.65 + snoise(q * 2.6) * 0.35;
    float grain = snoise(q * 7.0) * 0.6 + snoise(q * 15.0) * 0.4;
    // Due famiglie di crateri, pochi grandi e molti piccoli. La pendenza
    // nasce nello spazio della luna che ruota: si riporta in quello della
    // vista e si tiene solo la parte tangente alla sfera.
    vec4 big = craters(q, 3.0, 0.42);
    vec4 small = craters(q + 21.0, 6.5, 0.5);
    vec3 g = big.xyz * 0.32 + small.xyz * 0.16;
    g = vec3(c * g.x - s * g.z, g.y, s * g.x + c * g.z);
    g -= dot(g, n) * n;
    vec3 nb = normalize(n - g + 0.05 * vec3(snoise(q * 6.0 + 1.0), snoise(q * 6.0 + 9.0), 0.0));
    float lam = max(dot(nb, light), 0.0);
    float albedo = 0.86 - 0.3 * smoothstep(-0.15, 0.45, maria) + 0.08 * grain + big.w + 0.6 * small.w;
    // Luce cinerea: il lato in ombra non è mai nero del tutto.
    float L = (lam + 0.05 * n.z) * albedo;
    return dq(clamp(L, 0.0, 1.0) * 3.0, f);
}

// Alone fuori dal disco (r = |p| > 1, radius in celle): il bordo
// illuminato sfuma nel cielo per qualche cella. La normale del bordo è
// inclinata verso chi guarda: con la luna piena l'alone c'è tutto intorno,
// con la falce solo dalla parte della luce.
float moonHalo(vec2 p, float r, float radius, vec3 light, vec2 f) {
    float rim = max(dot(vec3(p / r * 0.8, 0.6), light), 0.0);
    return dq(0.45 * rim * (1.0 - smoothstep(1.0, 1.0 + 7.0 / radius, r)), f);
}
`;

    // Comete: una testa larga due celle e una coda larga una, tracciata come
    // farebbe Bresenham (una cella per colonna, o per riga se ripida), che si
    // sfalda nel retino verso la fine. uComet: testa e direzione di volo;
    // uCometK: lunghezza della coda e intensità. Lo shader che la include
    // dichiara i due array di uniform.
    const COMETS = `
float comets(vec2 f, float calm) {
    float lv = 0.0;
    for (int i = 0; i < ${MAX_COMETS}; i++) {
        float amt = uCometK[i].y * calm;
        if (amt <= 0.0) continue;
        float len = uCometK[i].x;
        vec2 dir = uComet[i].zw;
        vec2 rel = f - uComet[i].xy;
        float along = -dot(rel, dir);
        if (along < -0.5 || along > len) continue;
        float across = abs(rel.x * dir.y - rel.y * dir.x);
        float hw = 0.5 * max(abs(dir.x), abs(dir.y));
        if (across > hw * (along < 1.5 ? 1.9 : 1.0)) continue;
        float s = clamp(along / len, 0.0, 1.0);
        lv = max(lv, dq(4.0 * amt * pow(1.0 - s, 1.8), f));
    }
    return lv;
}
`;

    // Compila e collega un programma con il vertex shader comune e lo usa.
    // Restituisce le posizioni delle uniform per nome, o null. Gli array
    // arrivano come "uComet[0]": la posizione del primo elemento vale per
    // tutto l'array.
    function program(gl, frag, tag) {
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
            console.warn(tag, gl.getShaderInfoLog(s));
            return null;
        };
        const vs = compile(gl.VERTEX_SHADER, VERT);
        const fs = compile(gl.FRAGMENT_SHADER, frag);
        if (!vs || !fs) return null;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn(tag, gl.getProgramInfoLog(prog));
            return null;
        }
        gl.useProgram(prog);
        gl.bindVertexArray(gl.createVertexArray());

        const u = {};
        const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const name = gl.getActiveUniform(prog, i).name;
            u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, name);
        }
        return u;
    }

    // I cinque toni del retino: --sky-0…4 su :root, in esadecimale, così il
    // cielo segue la palette del CSS. Se un token manca vale il grigio
    // caldo qui sotto.
    const PALETTE = [
        0.051, 0.051, 0.051,
        0.106, 0.106, 0.098,
        0.196, 0.192, 0.180,
        0.345, 0.337, 0.322,
        0.560, 0.552, 0.530,
    ];

    function palette() {
        const cs = getComputedStyle(document.documentElement);
        const out = new Float32Array(PALETTE);
        for (let i = 0; i < 5; i++) {
            const m = /^#([0-9a-f]{6})$/i.exec(cs.getPropertyValue('--sky-' + i).trim());
            if (!m) continue;
            const n = parseInt(m[1], 16);
            out.set([(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255], i * 3);
        }
        return out;
    }


    /* ===============================================================
       HERO
       =============================================================== */
    function heroSky() {
        const MAX_QUIET = 4;
        const hero = document.getElementById('hero');
        const host = hero && hero.querySelector('.hero-bg');
        if (!hero || !host) return;

        const HOVER = window.matchMedia('(hover: hover)').matches;

        // Tutte le coordinate sono in celle, con l'origine in basso a sinistra
        // come gl_FragCoord. I rettangoli calmi sono (x0, y0, x1, y1).
        const FRAG = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uLight;
uniform float uTime;
uniform vec4 uQuiet[${MAX_QUIET}];
uniform vec4 uComet[${MAX_COMETS}];
uniform vec2 uCometK[${MAX_COMETS}];
out vec4 outColor;
${NOISE}
${LIB}
${COMETS}
// Stelle piccole: una cella su qualche centinaio. Presenza, luminosità e
// ritmo vengono da tre hash diversi, quindi ogni stella pulsa per conto
// suo. Resta accesa quasi sempre: il calo è breve, solo nel fondo
// dell'onda, e a volte la spegne per un attimo.
float smallStar(vec2 cell, float t) {
    if (hash(cell) < 0.998) return 0.0;
    float b = hash(cell + 31.7);
    float r = hash(cell + 77.3);
    float w = sin(t * (0.35 + 1.3 * r) + 6.2832 * fract(b * 7.0 + r * 13.0));
    // b² tiene fioche quasi tutte: una su sette arriva al grigio più chiaro.
    float lum = (0.3 + 0.7 * b * b) * (1.0 - 0.8 * pow(max(-w, 0.0), 4.0));
    return lum > 0.75 ? 3.0 : lum > 0.45 ? 2.0 : lum > 0.2 ? 1.0 : 0.0;
}

// Stelle grandi: al più una per blocco, disegnate come una crocetta che
// allunga i bracci quando brilla. Stanno lontane dai bordi del blocco,
// così i bracci non finiscono mai nel blocco accanto.
float bigStar(vec2 cell, float t) {
    const float B = 44.0;
    vec2 blk = floor(cell / B);
    if (hash(blk + 5.0) < 0.76) return 0.0;
    vec2 at = blk * B + 4.0 + floor(vec2(hash(blk + 13.1), hash(blk + 27.9)) * (B - 8.0));
    vec2 d = abs(cell - at);
    float m = min(d.x, d.y);
    float M = max(d.x, d.y);
    if (m > 0.5 || M > 2.5) return 0.0;
    float r = hash(blk + 41.3);
    float tw = 0.5 + 0.5 * sin(t * (0.3 + 0.8 * r) + 70.0 * r);
    if (M < 0.5) return tw > 0.6 ? 4.0 : 3.0;
    if (M < 1.5) return tw > 0.3 ? 2.0 : 1.0;
    return tw > 0.75 ? 1.0 : 0.0;
}

void main() {
    vec2 f = gl_FragCoord.xy;
    vec2 cell = floor(f);
    vec2 p = (f - uCenter) / uRadius;
    float r2 = dot(p, p);
    float lv = 0.0;

    if (r2 < 1.0) {
        lv = moonLevel(p, r2, uLight, uTime, f);
    } else {
        float r = sqrt(r2);
        lv = moonHalo(p, r, uRadius, uLight, f);

        // Intorno al testo piccolo (tagline, bottoni, ticker, nav) il cielo
        // è sgombro: un puntino accanto a una parola sembra punteggiatura.
        // Le comete ci sfumano dentro invece di sparire di colpo.
        float qd = 1e5;
        for (int i = 0; i < ${MAX_QUIET}; i++) qd = min(qd, sdBox(f, uQuiet[i]));
        float calm = smoothstep(0.0, 6.0, qd);
        if (calm > 0.5) lv = max(lv, smallStar(cell, uTime));
        if (calm > 0.99) lv = max(lv, bigStar(cell, uTime));
        lv = max(lv, comets(f, calm));
    }
    outColor = vec4(shade(lv), 1.0);
}`;

        /* ---------------------------------------------------------------
           WEBGL
           --------------------------------------------------------------- */
        const canvas = document.createElement('canvas');
        host.appendChild(canvas);

        let gl = null;
        let u = {};

        function initGL() {
            // alpha: false — il canvas è opaco e dipinge da sé il --bg: niente
            // composizione con quello che c'è sotto.
            gl = canvas.getContext('webgl2', {
                alpha: false, antialias: false, depth: false, stencil: false,
                powerPreference: 'low-power',
            });
            if (!gl) return false;
            u = program(gl, FRAG, '[sky:hero]');
            if (!u) return false;
            gl.uniform3fv(u.uPal, palette());
            return true;
        }

        if (!initGL()) {
            canvas.remove();
            return;
        }

        /* ---------------------------------------------------------------
           MISURE — posizioni relative alla hero, quindi indipendenti
           dallo scroll.
           --------------------------------------------------------------- */
        let W = hero.clientWidth;
        let H = hero.offsetHeight;
        let cell = 3;
        let rows = 1;
        const moon = {x: 0, y: 0, r: 1};

        function rel(el) {
            if (!el) return {x: 0, y: 0, w: 0, h: 0};
            const hr = hero.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return {x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height};
        }

        // La nav è fixed: la sua posizione nella hero è quella a pagina in
        // cima (la hero parte dall'inizio della pagina), qualunque sia lo
        // scroll al momento della misura.
        function relFixed(el) {
            if (!el) return {x: 0, y: 0, w: 0, h: 0};
            const r = el.getBoundingClientRect();
            return {x: r.left - hero.getBoundingClientRect().left, y: r.top, w: r.width, h: r.height};
        }

        // Rettangoli CSS → celle, con l'origine in basso; un elemento che manca
        // (o è nascosto, come i link della nav su telefono) va lontanissimo.
        const quiet = new Float32Array(MAX_QUIET * 4);
        function setQuiet(rects) {
            const pad = 8;
            quiet.fill(-1e5);
            rects.slice(0, MAX_QUIET).forEach((r, i) => {
                if (!r.w || !r.h) return;
                quiet.set([
                    (r.x - pad) / cell, rows - (r.y + r.h + pad) / cell,
                    (r.x + r.w + pad) / cell, rows - (r.y - pad) / cell,
                ], i * 4);
            });
            gl.uniform4fv(u.uQuiet, quiet);
        }

        function layout() {
            W = hero.clientWidth;
            H = hero.offsetHeight;

            const dpr = window.devicePixelRatio || 1;
            const dev = Math.max(2, Math.round((W < 640 ? 2 : 3) * dpr));
            cell = dev / dpr;
            const cols = Math.ceil(W / cell);
            rows = Math.ceil(H / cell);
            canvas.width = cols;
            canvas.height = rows;
            canvas.style.width = cols * cell + 'px';
            canvas.style.height = rows * cell + 'px';
            gl.viewport(0, 0, cols, rows);

            // La luna sorge dal bordo del terminale: centro sul bordo, larga
            // poco più del terminale, abbastanza alta da stare dietro a Sissy
            // ma non da salire fino ai bottoni (su telefono sono subito sopra).
            const term = rel(hero.querySelector('.term-win'));
            const sissy = rel(hero.querySelector('.sissy-btn'));
            moon.x = term.x + term.w * 0.5;
            moon.y = term.y;
            moon.r = Math.max(80, Math.min(term.w * 0.6, sissy.h * 1.35));
            gl.uniform2f(u.uCenter, moon.x / cell, rows - moon.y / cell);
            gl.uniform1f(u.uRadius, moon.r / cell);

            setQuiet([
                rel(hero.querySelector('.hero-copy')),
                rel(hero.querySelector('.hero-stack')),
                relFixed(document.querySelector('#nav .nav-logo')),
                relFixed(document.querySelector('#nav .nav-links')),
            ]);
        }

        /* ---------------------------------------------------------------
           PUNTATORE
           --------------------------------------------------------------- */
        const t0 = performance.now();

        // Cursore fantasma: una lenta figura di Lissajous sulla metà destra,
        // dove sta il terminale; un giro completo dura alcuni minuti.
        function ghost(now) {
            const s = now / 1000;
            // Su telefono la luna è per metà dietro il terminale: la luce sta
            // sopra di lei, così a riposo è illuminata la parte che si vede.
            if (W < 640) return [moon.x + moon.r * 0.2 * Math.sin(s * 0.11), moon.y - moon.r * 1.1];
            return [W * (0.62 + 0.3 * Math.sin(s * 0.11)), H * (0.42 + 0.26 * Math.sin(s * 0.17 + 1.3))];
        }

        const [gx, gy] = ghost(t0);
        const ptr = {x: gx, y: gy, tx: gx, ty: gy, last: -Infinity};

        function trackPointer(now, dt) {
            const idle = now - ptr.last > 2500;
            if (idle) [ptr.tx, ptr.ty] = ghost(now);
            const k = 1 - Math.exp(-dt * (idle ? 1.2 : 6));
            ptr.x += (ptr.tx - ptr.x) * k;
            ptr.y += (ptr.ty - ptr.y) * k;
        }

        /* ---------------------------------------------------------------
           LUCE — va verso il puntatore, sempre un po' davanti alla luna,
           con un'inerzia sua più lenta del puntatore: la fase cambia
           come quella di un astro, non come un riflettore.
           --------------------------------------------------------------- */
        const aim = {x: 0, y: 0, ready: false};
        let revealAt = 0;
        let introSide = 1;

        const norm3 = (x, y, z) => {
            const l = Math.hypot(x, y, z) || 1;
            return [x / l, y / l, z / l];
        };
        const smooth = (a, b, x) => {
            const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
            return t * t * (3 - 2 * t);
        };

        // Ingresso: dopo il loader la luna parte nuova, con la luce alle
        // spalle, e la luce le gira intorno fino al puntatore: il terminatore
        // la attraversa tutta in un paio di secondi.
        function introAmount(now) {
            if (REDUCED) return 1;
            if (!revealAt) return 0;
            return smooth(0, 1, (now - revealAt - 400) / 2600);
        }

        function light(now, dt) {
            const tx = (ptr.x - moon.x) / moon.r;
            const ty = (moon.y - ptr.y) / moon.r;
            if (!aim.ready) {
                aim.x = tx;
                aim.y = ty;
                aim.ready = true;
            } else {
                const k = 1 - Math.exp(-dt * 2.4);
                aim.x += (tx - aim.x) * k;
                aim.y += (ty - aim.y) * k;
            }
            const end = norm3(aim.x, aim.y, 0.55);
            const e = introAmount(now);
            if (e >= 1) return end;
            const start = norm3(0.35 * introSide, 0.1, -1);
            return norm3(...start.map((v, i) => v + (end[i] - v) * e));
        }

        /* ---------------------------------------------------------------
           COMETE
           Partono tutte dallo stesso radiante, fuori schermo in alto a
           destra, come in uno sciame: direzioni diverse ma coerenti,
           verso il basso a sinistra. Passano vicino al puntatore, nella
           metà alta del cielo. La coda nasce col volo (non c'è scia
           prima del punto di partenza); intensità e coda salgono in
           fretta e si spengono piano.
           --------------------------------------------------------------- */
        const comets = [];
        const cometA = new Float32Array(MAX_COMETS * 4);
        const cometK = new Float32Array(MAX_COMETS * 2);
        const hover = {on: false, next: Infinity, last: -Infinity};

        function spawnComet(now) {
            if (comets.length >= MAX_COMETS) return;
            const sc = Math.min(Math.max(W / 1440, 0.45), 1.15);
            const rnd = (a, b) => a + Math.random() * (b - a);

            const px = Math.min(Math.max(ptr.x + rnd(-0.25, 0.25) * W, W * 0.05), W * 0.95);
            const py = H * rnd(0.06, 0.55);
            let dx = px - W * 1.3;
            let dy = py + H * 0.8;
            const l = Math.hypot(dx, dy);
            dx /= l;
            dy /= l;

            // Si accende già dentro il cielo, mai oltre il bordo alto o destro:
            // il tratto più luminoso è il primo, e fuori schermo andrebbe perso.
            const speed = rnd(520, 840) * sc;
            const life = rnd(0.9, 1.4);
            const back = Math.max(0, Math.min(
                speed * life * rnd(0.3, 0.6),
                (py - H * 0.04) / dy,
                (W * 0.97 - px) / -dx,
            ));
            comets.push({
                x: px - dx * back, y: py - dy * back, dx, dy,
                speed, life, len: rnd(110, 220) * sc, age: 0,
            });
            hover.last = now;
        }

        // Col mouse sulla hero, e solo finché si muove: una cometa ogni due o
        // tre secondi, la prima appena entrati. Senza hover, una ogni tanto.
        function scheduleComets(now) {
            const active = hover.on ? now - ptr.last < 3000 : !HOVER && revealAt;
            if (!active || now < hover.next) return;
            spawnComet(now);
            hover.next = now + (hover.on ? 1600 + Math.random() * 2400 : 7000 + Math.random() * 8000);
        }

        function updateComets(dt) {
            cometK.fill(0);
            for (let i = comets.length - 1; i >= 0; i--) {
                const c = comets[i];
                c.age += dt;
                if (c.age >= c.life) comets.splice(i, 1);
            }
            comets.forEach((c, i) => {
                const d = c.speed * c.age;
                const v = c.age / c.life;
                cometA[i * 4] = (c.x + c.dx * d) / cell;
                cometA[i * 4 + 1] = rows - (c.y + c.dy * d) / cell;
                cometA[i * 4 + 2] = c.dx;
                cometA[i * 4 + 3] = -c.dy;
                cometK[i * 2] = Math.max(1, Math.min(c.len, d) / cell);
                cometK[i * 2 + 1] = smooth(0, 0.12, v) * (1 - smooth(0.45, 1, v));
            });
        }

        /* ---------------------------------------------------------------
           DISEGNO E CICLO
           --------------------------------------------------------------- */
        function draw(now, dt) {
            updateComets(dt);
            gl.uniform3f(u.uLight, ...light(now, dt));
            gl.uniform1f(u.uTime, (now - t0) / 1000);
            gl.uniform4fv(u.uComet, cometA);
            gl.uniform2fv(u.uCometK, cometK);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        let raf = 0;
        let lastTick = 0;
        let lastDraw = 0;
        let onScreen = true;
        let lost = false;

        function tick(now) {
            raf = requestAnimationFrame(tick);
            const dt = Math.min((now - lastTick) / 1000, 0.1);
            lastTick = now;
            trackPointer(now, dt);
            scheduleComets(now);
            // A 30 fotogrammi la luna basta; con una cometa in volo si sale a
            // 60, se no la testa avanza a salti di dieci celle.
            const interval = comets.length ? 1000 / 60 : 1000 / 30;
            if (now - lastDraw < interval - 2) return;
            const fdt = Math.min((now - lastDraw) / 1000, 0.1);
            lastDraw = now;
            draw(now, fdt);
        }

        function start() {
            if (raf || REDUCED || lost || !onScreen || document.hidden) return;
            lastTick = lastDraw = performance.now();
            raf = requestAnimationFrame(tick);
        }

        function stop() {
            cancelAnimationFrame(raf);
            raf = 0;
        }

        function relayout() {
            if (lost) return;
            layout();
            draw(performance.now(), 0);
        }

        /* ---- EVENTI ---- */
        hero.addEventListener('pointermove', e => {
            const r = hero.getBoundingClientRect();
            ptr.tx = e.clientX - r.left;
            ptr.ty = e.clientY - r.top;
            ptr.last = performance.now();
            if (REDUCED || e.pointerType === 'touch' || hover.on) return;
            hover.on = true;
            hover.next = Math.max(ptr.last + 250 + Math.random() * 450, hover.last + 1200);
        }, {passive: true});

        hero.addEventListener('pointerleave', () => {
            hover.on = false;
        });

        canvas.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            lost = true;
            stop();
        });
        canvas.addEventListener('webglcontextrestored', () => {
            if (!initGL()) return;
            lost = false;
            relayout();
            start();
        });

        new ResizeObserver(relayout).observe(hero);
        // Con il font vero il nome cambia misura e sposta tutto quello che sta
        // sotto senza cambiare l'altezza della hero: si rimisura a parte.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
        window.addEventListener('load', relayout);

        new IntersectionObserver(entries => {
            onScreen = entries[0].isIntersecting;
            if (onScreen) start();
            else stop();
        }).observe(hero);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else start();
        });

        /* ---- AVVIO ----
           Il fondo entra dopo il loader, mentre il nome sale: prima le
           lettere su nero, poi il mondo intorno. */
        layout();
        // Il cursore fantasma dipende dalla posizione della luna, nota solo ora.
        [ptr.x, ptr.tx] = [ghost(t0)[0], ghost(t0)[0]];
        [ptr.y, ptr.ty] = [ghost(t0)[1], ghost(t0)[1]];
        draw(performance.now(), 0);
        start();

        const reveal = () => {
            if (revealAt) return;
            revealAt = performance.now();
            introSide = aim.x < 0 ? -1 : 1;
            // Su touch la prima cometa passa a ingresso finito.
            if (!HOVER) hover.next = revealAt + 4000;
            host.classList.add('is-ready');
        };
        const loader = document.getElementById('loader');
        if (!loader || REDUCED) {
            reveal();
        } else {
            const mo = new MutationObserver(() => {
                if (!loader.isConnected || loader.classList.contains('is-done')) {
                    mo.disconnect();
                    setTimeout(reveal, 700);
                }
            });
            mo.observe(loader, {attributes: true});
            mo.observe(document.body, {childList: true});
            setTimeout(reveal, 4000);
        }
    }

    /* ===============================================================
       PAGINA
       =============================================================== */
    function pageSky() {
        const host = document.querySelector('.page-sky');
        const view = host && host.querySelector('.page-sky-view');
        if (!view) return;

        const MAX_QUIET = 24;
        // Scia più lunga, in celle: è anche il numero di giri del ciclo nello
        // shader. Il piano lontano ne ha una più corta, in proporzione.
        const MAX_TRAIL = 12;
        // Velocità dei due piani rispetto al contenuto (1 = fermi sulla pagina).
        const DEPTH = REDUCED ? [1, 1] : [0.42, 0.7];

        // Blocchi da tenere sgombri. Contenitori interi e non le singole card:
        // tra una card e l'altra una stella non ci starebbe comunque, e su
        // telefono le rotaie delle skill scorrono di lato senza cambiare il
        // layout. `.timeline` comprende anche lo spazio del pin delle
        // esperienze su telefono, dove le schede si muovono per conto loro.
        const QUIET = [
            '.section-label', '.about-big', '.about-stats', '.about-meta', '.about-text',
            '.skills-tier', '.timeline', '.servizi-grid',
            '.contact-big', '.contact-aside', '.contact-form',
        ].join(',');

        /* ---------------------------------------------------------------
           SHADER
           Coordinate in celle. v è il canvas con y in giù; la pagina è v
           più il bordo alto della vista (uTop). I rettangoli calmi, il
           cielo (uSky: dove comincia sotto la hero, dove finisce
           all'orizzonte) e la luna sono in coordinate di pagina; le
           comete, come nella hero, in quelle di gl_FragCoord.
           --------------------------------------------------------------- */
        const FRAG = `#version 300 es
precision highp float;
uniform float uRows;
uniform float uTop;
uniform float uTime;
uniform float uGain;
uniform vec2 uDepth;
uniform vec2 uTrail;
uniform vec2 uSky;
uniform vec4 uQuiet[${MAX_QUIET}];
uniform vec4 uMoon;
uniform vec3 uLight;
uniform vec4 uComet[${MAX_COMETS}];
uniform vec2 uCometK[${MAX_COMETS}];
out vec4 outColor;
${NOISE}
${LIB}
${COMETS}
// Quanto è sgombro il cielo in un punto della pagina: 0 dentro i blocchi
// e sotto l'orizzonte, 1 lontano da tutto. Sotto la hero entra piano,
// mentre quella sfuma.
float calmAt(vec2 pg) {
    if (pg.y > uSky.y - 1.0) return 0.0;
    float d = 1e5;
    for (int i = 0; i < ${MAX_QUIET}; i++) d = min(d, sdBox(pg, uQuiet[i]));
    return smoothstep(0.0, 6.0, d) * smoothstep(uSky.x, uSky.x + 50.0, pg.y);
}

// Stelle piccole del piano z (0 lontano, 1 vicino). Come nella hero
// presenza, luminosità e ritmo vengono da hash diversi, ma sono più rade
// e il piano lontano si ferma al secondo grigio.
float star(vec2 c, float z, float t) {
    c += z * 113.0;
    if (hash(c) < (z < 0.5 ? 0.9986 : 0.99935)) return 0.0;
    float b = hash(c + 31.7);
    float r = hash(c + 77.3);
    float w = sin(t * (0.35 + 1.3 * r) + 6.2832 * fract(b * 7.0 + r * 13.0));
    float lum = (0.3 + 0.7 * b * b) * (1.0 - 0.8 * pow(max(-w, 0.0), 4.0));
    if (z < 0.5) return lum > 0.7 ? 2.0 : lum > 0.25 ? 1.0 : 0.0;
    return lum > 0.75 ? 3.0 : lum > 0.45 ? 2.0 : lum > 0.2 ? 1.0 : 0.0;
}

// Crocette: solo sul piano vicino, più rare che nella hero e col nucleo al
// terzo grigio. Il quarto resta alla luna e alle comete.
float bigStar(vec2 c, float t) {
    const float B = 60.0;
    vec2 blk = floor(c / B);
    if (hash(blk + 5.0) < 0.85) return 0.0;
    vec2 at = blk * B + 4.0 + floor(vec2(hash(blk + 13.1), hash(blk + 27.9)) * (B - 8.0));
    vec2 d = abs(c - at);
    float m = min(d.x, d.y);
    float M = max(d.x, d.y);
    if (m > 0.5 || M > 2.5) return 0.0;
    float r = hash(blk + 41.3);
    float tw = 0.5 + 0.5 * sin(t * (0.3 + 0.8 * r) + 70.0 * r);
    if (M < 0.5) return 3.0;
    if (M < 1.5) return tw > 0.35 ? 2.0 : 1.0;
    return tw > 0.75 ? 1.0 : 0.0;
}

// Scia della posa lunga: la cella è accesa se una stella ci è passata
// negli ultimi istanti, cioè se ce n'è una poco più su (più giù, se la
// pagina risale) lungo il verso dello scorrimento. Sfuma nel retino.
float trail(vec2 c, float z, float len, float t, vec2 f) {
    float n = abs(len);
    if (n < 1.0) return 0.0;
    float lv = 0.0;
    for (int j = 1; j <= ${MAX_TRAIL}; j++) {
        float fj = float(j);
        if (fj > n) break;
        float s = star(c - vec2(0.0, sign(len) * fj), z, t);
        if (s > 0.0) lv = max(lv, dq(0.85 * s * pow(1.0 - fj / (n + 1.0), 1.4), f));
    }
    return lv;
}

void main() {
    vec2 f = gl_FragCoord.xy;
    vec2 v = vec2(f.x, uRows - f.y);
    vec2 pg = v + vec2(0.0, uTop);
    float lv = 0.0;

    // La luna sta sopra l'orizzonte: la parte ancora sotto non si vede.
    if (uMoon.z > 0.0 && pg.y < uSky.y) {
        vec2 p = (pg - uMoon.xy) / uMoon.z;
        p.y = -p.y;
        float r2 = dot(p, p);
        if (r2 < 1.0) {
            outColor = vec4(shade(moonLevel(p, r2, uLight, uTime, f)), 1.0);
            return;
        }
        lv = moonHalo(p, sqrt(r2), uMoon.z, uLight, f);
    }

    vec2 cf = floor(v + vec2(0.0, uTop * uDepth.x));
    vec2 cn = floor(v + vec2(0.0, uTop * uDepth.y));
    float s = max(star(cf, 0.0, uTime), star(cn, 1.0, uTime));
    s = max(s, max(trail(cf, 0.0, uTrail.x, uTime, f), trail(cn, 1.0, uTrail.y, uTime, f)));
    float b = bigStar(cn, uTime);
    float k = comets(f, 1.0);
    // La distanza dai blocchi costa: si calcola solo dove c'è qualcosa.
    if (s + b + k > 0.0) {
        float calm = calmAt(pg);
        if (calm > 0.5) lv = max(lv, dq(s * uGain, f));
        if (calm > 0.99) lv = max(lv, dq(b * uGain, f));
        if (k > 0.0) lv = max(lv, comets(f, calm));
    }
    outColor = vec4(shade(lv), 1.0);
}`;

        /* ---------------------------------------------------------------
           WEBGL
           --------------------------------------------------------------- */
        const canvas = document.createElement('canvas');
        view.appendChild(canvas);

        let gl = null;
        let u = null;

        function initGL() {
            // Opaco come quello della hero: dipinge da sé il --bg.
            gl = canvas.getContext('webgl2', {
                alpha: false, antialias: false, depth: false, stencil: false,
                powerPreference: 'low-power',
            });
            if (!gl) return false;
            u = program(gl, FRAG, '[sky:page]');
            if (!u) return false;
            gl.uniform2f(u.uDepth, DEPTH[0], DEPTH[1]);
            gl.uniform3fv(u.uPal, palette());
            return true;
        }

        if (!initGL()) {
            canvas.remove();
            return;
        }

        /* ---------------------------------------------------------------
           MISURE — in px di pagina; allo shader arrivano in celle.
           --------------------------------------------------------------- */
        let cell = 3;
        let rows = 1;
        let vw = 0;
        let vh = 0;
        let hostH = 0;
        let docH = 0;
        let skyFrom = 0;
        let horizon = 0;
        let blocks = [];
        const quiet = new Float32Array(MAX_QUIET * 4);
        // Centro x, raggio, ordinata del centro da nascosta e da sorta, e dove
        // comincia il vuoto in cui sorge.
        const moon = {x: 0, r: 0, low: 0, high: 0, zone: 0};

        // Il posto di un blocco a riposo. offsetTop e offsetLeft ignorano i
        // transform: i blocchi entrano con GSAP spostati di qualche decina di
        // px, e una misura presa prima o durante l'ingresso sposterebbe le zone
        // calme di altrettanto (le stelle finivano accanto alle etichette).
        function box(el) {
            let x = 0;
            let y = 0;
            for (let n = el; n; n = n.offsetParent) {
                x += n.offsetLeft;
                y += n.offsetTop;
            }
            return {x, y, w: el.offsetWidth, h: el.offsetHeight, b: y + el.offsetHeight};
        }

        // Una cella per pixel del canvas, con il lato in pixel interi del
        // dispositivo: le stesse misure della hero.
        function resize() {
            vw = view.clientWidth;
            vh = view.clientHeight;
            const dpr = window.devicePixelRatio || 1;
            const dev = Math.max(2, Math.round((vw < 640 ? 2 : 3) * dpr));
            cell = dev / dpr;
            const cols = Math.ceil(vw / cell);
            rows = Math.ceil(vh / cell);
            canvas.width = cols;
            canvas.height = rows;
            canvas.style.width = cols * cell + 'px';
            canvas.style.height = rows * cell + 'px';
            gl.viewport(0, 0, cols, rows);
            gl.uniform1f(u.uRows, rows);
        }

        function measure() {
            const hero = document.getElementById('hero');
            const footer = document.querySelector('footer');
            hostH = host.offsetHeight;
            docH = document.documentElement.scrollHeight;
            // Il cielo comincia mentre la hero sfuma (la sua maschera parte dal
            // 78%) e finisce sul bordo alto del footer.
            skyFrom = hero ? box(hero).y + hero.offsetHeight * 0.72 : 0;
            horizon = footer ? box(footer).y : docH;
            gl.uniform2f(u.uSky, skyFrom / cell, horizon / cell);

            const pad = 14;
            blocks = Array.from(document.querySelectorAll(QUIET), box)
                .filter(r => r.w && r.h)
                .slice(0, MAX_QUIET);
            quiet.fill(-1e5);
            blocks.forEach((r, i) => {
                quiet.set([
                    (r.x - pad) / cell, (r.y - pad) / cell,
                    (r.x + r.w + pad) / cell, (r.b + pad) / cell,
                ], i * 4);
            });
            gl.uniform4fv(u.uQuiet, quiet);
            placeMoon();
        }

        // La luna sorge nel vuoto più grande sopra l'orizzonte, grande quanto
        // quel vuoto. Si legge il profilo di quello che le sta sopra (titolo,
        // contatti, campi, bottone) e, dal raggio più grande in giù, si cerca
        // dove la cupola ci sta senza toccarlo: vince il primo raggio che entra,
        // al centro del tratto in cui entra. Con contatti e form affiancati
        // finisce sotto i contatti; su telefono accanto al bottone di invio. Se
        // non c'è posto per una luna leggibile, la luna non c'è.
        function placeMoon() {
            moon.r = 0;
            const row = document.querySelector('.contact-row');
            const sec = document.getElementById('contatti');
            if (!row || !sec) return;
            const lane = box(row);
            const ceil = box(sec).y;
            const above = Array.from(document.querySelectorAll('.contact-big, .contact-aside, .contact-form > *'), box)
                .filter(b => b.w && b.h && b.x < vw && b.x + b.w > 0);
            // Il fondo di quello che sta sopra tra x0 e x1, con 16px di respiro.
            const floorAt = (x0, x1) => above.reduce(
                (f, b) => (b.x < x1 + 16 && b.x + b.w > x0 - 16 ? Math.max(f, b.b) : f), ceil);
            const left = Math.max(lane.x - 16, 8);
            const right = Math.min(lane.x + lane.w + 16, vw - 8);

            for (let r = 150; r >= 36; r -= 3) {
                const fits = [];
                for (let x = left + r; x <= right - r; x += 4) {
                    const free = horizon - floorAt(x - r, x + r) - 24;
                    if (r <= free * 0.72) fits.push([x, free]);
                }
                if (!fits.length) continue;
                const [x, free] = fits[fits.length >> 1];
                moon.r = r;
                moon.x = x;
                // Nascosta, la cima tocca l'orizzonte. Sorta, il centro sale poco
                // sopra: sempre una cupola appena più alta di mezza luna, che non
                // si stacca dall'orizzonte e non arriva a toccare quello che ha sopra.
                moon.low = horizon + r;
                moon.high = horizon - Math.min(r * 0.15, free * 0.82 - r);
                moon.zone = horizon - free;
                return;
            }
        }

        // Distanza, in px, dal blocco calmo più vicino (0 dentro).
        function clearance(x, y) {
            let d = Infinity;
            blocks.forEach(b => {
                const qx = Math.max(b.x - x, 0, x - b.x - b.w);
                const qy = Math.max(b.y - y, 0, y - b.b);
                d = Math.min(d, Math.hypot(qx, qy));
            });
            return d;
        }

        /* ---------------------------------------------------------------
           SCROLL — la vista sticky si ferma in fondo al contenitore, quindi
           il suo bordo alto non è sempre scrollY (su iOS, in fondo, con le
           barre di Safari aperte). La velocità fa la scia.
           --------------------------------------------------------------- */
        let lastY = window.scrollY;
        let vel = 0;
        const trailLen = [0, 0];

        const viewTop = y => Math.max(0, Math.min(y, hostH - vh));

        function trackScroll(y, dt) {
            if (REDUCED || dt <= 0) return;
            vel += ((y - lastY) / dt - vel) * (1 - Math.exp(-dt * 10));
            lastY = y;
            if (Math.abs(vel) < 8) vel = 0;
            // La strada fatta in 1/30 di secondo, oltre la velocità di lettura:
            // la rotella lenta non lascia scie, un salto dal menu sì.
            const len = Math.sign(vel) * Math.max(0, Math.abs(vel) - 420) / 30 / cell;
            DEPTH.forEach((k, i) => {
                const cap = MAX_TRAIL * k / DEPTH[1];
                trailLen[i] = Math.max(-cap, Math.min(cap, len * k));
            });
        }

        /* ---------------------------------------------------------------
           LUNA — sorge con lo scroll e cresce di fase. La luce va verso il
           puntatore come nella hero, con un'inerzia sua; senza puntatore
           (touch, o fermo da qualche secondo) la guida un cursore
           fantasma sopra la luna, lentissimo.
           --------------------------------------------------------------- */
        const t0 = performance.now();
        const ptr = {x: 0, y: 0, tx: 0, ty: 0, last: -Infinity, ready: false};
        const aim = {x: 0, y: 0, ready: false};
        let rise = REDUCED ? 1 : 0;

        const norm3 = (x, y, z) => {
            const l = Math.hypot(x, y, z) || 1;
            return [x / l, y / l, z / l];
        };
        const smooth = (a, b, x) => {
            const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
            return t * t * (3 - 2 * t);
        };

        // Da 0 (il vuoto sopra l'orizzonte entra dal basso) a 1 (fondo pagina).
        function riseGoal(y) {
            if (REDUCED) return 1;
            const span = docH - moon.zone;
            if (span <= 0) return 1;
            return Math.min(Math.max((y + window.innerHeight - moon.zone) / span, 0), 1);
        }

        // Centro della luna sullo schermo, a fase di salita data.
        function moonScreen(top) {
            const e = 1 - Math.pow(1 - rise, 3);
            return [moon.x, moon.low + (moon.high - moon.low) * e - top];
        }

        // In vista se la cima è sopra il fondo dello schermo e l'orizzonte
        // sotto il bordo alto.
        const moonInView = (my, top) => moon.r > 0 && my - moon.r < vh && horizon > top;

        function trackPointer(now, dt, mx, my) {
            const idle = now - ptr.last > 2500;
            if (idle) {
                const s = now / 1000;
                ptr.tx = mx + moon.r * 2.4 * Math.sin(s * 0.11);
                ptr.ty = my - moon.r * (1.0 + 0.6 * Math.sin(s * 0.17 + 1.3));
            }
            if (!ptr.ready) {
                ptr.x = ptr.tx;
                ptr.y = ptr.ty;
                ptr.ready = true;
            }
            const k = 1 - Math.exp(-dt * (idle ? 1.2 : 6));
            ptr.x += (ptr.tx - ptr.x) * k;
            ptr.y += (ptr.ty - ptr.y) * k;
        }

        // Da nascosta la luna è nuova, con la luce alle spalle; sorgendo la
        // luce le gira intorno fino al puntatore.
        function light(dt, mx, my) {
            if (REDUCED) return norm3(-0.45, 0.4, 0.55);
            const tx = (ptr.x - mx) / moon.r;
            const ty = (my - ptr.y) / moon.r;
            if (!aim.ready) {
                aim.x = tx;
                aim.y = ty;
                aim.ready = true;
            } else {
                const k = 1 - Math.exp(-dt * 2.4);
                aim.x += (tx - aim.x) * k;
                aim.y += (ty - aim.y) * k;
            }
            const end = norm3(aim.x, aim.y, 0.55);
            const e = smooth(0.1, 1, rise);
            if (e >= 1) return end;
            const start = norm3(aim.x < 0 ? -0.35 : 0.35, 0.1, -1);
            return norm3(...start.map((v, i) => v + (end[i] - v) * e));
        }

        /* ---------------------------------------------------------------
           COMETE — dallo stesso radiante della hero, in alto a destra.
           Qui il cielo è a pezzi, tra un blocco e l'altro: una cometa
           tirata a caso passerebbe quasi tutta dietro a un testo, dove si
           spegne. Se ne provano un po' e parte quella che resta più a lungo
           nel cielo sgombro, nel suo tratto più luminoso; con la luna in
           vista, meglio se le passa accanto (dietro, no: non si vedrebbe).
           Coordinate dello schermo.
           --------------------------------------------------------------- */
        const comets = [];
        const cometA = new Float32Array(MAX_COMETS * 4);
        const cometK = new Float32Array(MAX_COMETS * 2);
        const rnd = (a, b) => a + Math.random() * (b - a);
        // Intensità lungo la vita (v da 0 a 1): sale in fretta, si spegne piano.
        const glow = v => smooth(0, 0.12, v) * (1 - smooth(0.45, 1, v));
        let risenOnce = REDUCED;

        // Una cometa che passa per (px, py): si accende già sullo schermo, mai
        // oltre il bordo alto o destro, dove il tratto più luminoso andrebbe perso.
        function cometThrough(px, py) {
            const sc = Math.min(Math.max(vw / 1440, 0.45), 1.15);
            let dx = px - vw * 1.3;
            let dy = py + vh * 0.8;
            const l = Math.hypot(dx, dy);
            dx /= l;
            dy /= l;
            const speed = rnd(520, 840) * sc;
            const life = rnd(0.9, 1.4);
            const back = Math.max(0, Math.min(
                speed * life * rnd(0.3, 0.6),
                (py - vh * 0.04) / dy,
                (vw * 0.97 - px) / -dx,
            ));
            return {
                x: px - dx * back, y: py - dy * back, dx, dy,
                speed, life, len: rnd(110, 220) * sc, age: 0,
            };
        }

        // Quanto si vede: la testa campionata lungo la vita, pesata per la
        // sua luminosità, solo dove è in cielo sgombro e fuori dalla luna.
        function visibleRun(c, top, nav) {
            const [mx, my] = moonScreen(top);
            const lunar = moonInView(my, top);
            let run = 0;
            for (let k = 1; k <= 16; k++) {
                const v = k / 16;
                const x = c.x + c.dx * c.speed * c.life * v;
                const y = c.y + c.dy * c.speed * c.life * v;
                if (x < 0 || x > vw || y < nav || y > vh) continue;
                if (top + y < skyFrom + 80 || top + y > horizon - 8) continue;
                if (clearance(x, top + y) < 24) continue;
                let w = glow(v);
                if (lunar) {
                    const d = Math.hypot(x - mx, y - my) / moon.r;
                    if (d < 1.05) continue;
                    if (d < 1.9) w *= 2;
                }
                run += w;
            }
            return run;
        }

        function spawnComet() {
            if (comets.length >= MAX_COMETS) return;
            const top = viewTop(window.scrollY);
            const navEl = document.getElementById('nav');
            const nav = navEl ? navEl.offsetHeight : 0;
            let best = null;
            let bestRun = 2.5;
            for (let i = 0; i < 32; i++) {
                const c = cometThrough(vw * rnd(0.05, 0.95), vh * rnd(0.1, 0.8));
                const run = visibleRun(c, top, nav);
                if (run > bestRun) {
                    bestRun = run;
                    best = c;
                }
            }
            if (!best) return;
            comets.push(best);
            start();
        }

        function updateComets(dt) {
            cometK.fill(0);
            for (let i = comets.length - 1; i >= 0; i--) {
                comets[i].age += dt;
                if (comets[i].age >= comets[i].life) comets.splice(i, 1);
            }
            comets.forEach((c, i) => {
                const d = c.speed * c.age;
                const v = c.age / c.life;
                cometA[i * 4] = (c.x + c.dx * d) / cell;
                cometA[i * 4 + 1] = rows - (c.y + c.dy * d) / cell;
                cometA[i * 4 + 2] = c.dx;
                cometA[i * 4 + 3] = -c.dy;
                cometK[i * 2] = Math.max(1, Math.min(c.len, d) / cell);
                cometK[i * 2 + 1] = glow(v);
            });
        }

        // Messaggio inviato: uno sciame di tre, a intervalli irregolari.
        function shower() {
            if (REDUCED) return;
            [0, 420, 1050].forEach(ms => setTimeout(spawnComet, ms));
        }

        /* ---------------------------------------------------------------
           DISEGNO E CICLO
           --------------------------------------------------------------- */
        // Sviluppo: dopo il loader le stelle affiorano nel retino invece di
        // comparire di colpo (si vede solo ricaricando a metà pagina).
        const loader = document.getElementById('loader');
        const loaderGone = () => !loader || !loader.isConnected || loader.classList.contains('is-done');
        let gain = REDUCED ? 1 : 0;

        function draw(now, dt, y) {
            const top = viewTop(y);
            updateComets(dt);
            gl.uniform1f(u.uTop, top / cell);
            gl.uniform1f(u.uTime, REDUCED ? 0 : (now - t0) / 1000);
            gl.uniform1f(u.uGain, gain);
            gl.uniform2f(u.uTrail, trailLen[0], trailLen[1]);
            gl.uniform4fv(u.uComet, cometA);
            gl.uniform2fv(u.uCometK, cometK);

            const [mx, my] = moonScreen(top);
            if (moonInView(my, top)) {
                trackPointer(now, dt, mx, my);
                gl.uniform4f(u.uMoon, mx / cell, (my + top) / cell, moon.r / cell, 0);
                gl.uniform3f(u.uLight, ...light(dt, mx, my));
            } else {
                gl.uniform4f(u.uMoon, 0, 0, 0, 0);
            }
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        let raf = 0;
        let lastTick = 0;
        let lastDraw = 0;
        let drawnY = NaN;
        let lost = false;

        function tick(now) {
            raf = requestAnimationFrame(tick);
            const dt = Math.min((now - lastTick) / 1000, 0.1);
            lastTick = now;
            const y = window.scrollY;
            // Con la hero a coprire tutto lo schermo il cielo non si vede:
            // riparte al primo scroll.
            if (y + window.innerHeight < skyFrom) {
                stop();
                return;
            }
            trackScroll(y, dt);
            if (gain < 1 && loaderGone()) gain = Math.min(1, gain + dt / 1.6);

            const goal = riseGoal(y);
            rise += (goal - rise) * (1 - Math.exp(-dt * 4));
            if (Math.abs(goal - rise) < 0.0005) rise = goal;
            const moonOn = moonInView(moonScreen(viewTop(y))[1], viewTop(y));
            if (moonOn && !risenOnce && rise > 0.97) {
                risenOnce = true;
                setTimeout(spawnComet, 700);
            }

            // A ogni fotogramma solo se qualcosa si muove: scroll, scia,
            // comete, luna che sale, stelle che affiorano.
            const busy = y !== drawnY || vel !== 0 || comets.length || rise !== goal || gain < 1;
            const interval = busy ? 0 : moonOn ? 1000 / 30 : 1000 / 15;
            if (now - lastDraw < interval - 2) return;
            const fdt = Math.min((now - lastDraw) / 1000, 0.1);
            lastDraw = now;
            drawnY = y;
            draw(now, fdt, y);
        }

        function start() {
            if (raf || REDUCED || lost || document.hidden) return;
            lastTick = lastDraw = performance.now();
            lastY = window.scrollY;
            vel = 0;
            raf = requestAnimationFrame(tick);
        }

        function stop() {
            cancelAnimationFrame(raf);
            raf = 0;
        }

        // Con reduced motion non c'è ciclo: un fotogramma a ogni scroll.
        let pending = false;
        function redraw() {
            if (lost || pending) return;
            pending = true;
            requestAnimationFrame(() => {
                pending = false;
                draw(performance.now(), 0, window.scrollY);
            });
        }

        function relayout(sized) {
            if (lost) return;
            if (sized) resize();
            measure();
            redraw();
        }

        /* ---- EVENTI ---- */
        window.addEventListener('scroll', () => (REDUCED ? redraw() : start()), {passive: true});

        window.addEventListener('pointermove', e => {
            if (e.pointerType === 'touch') return;
            ptr.tx = e.clientX;
            ptr.ty = e.clientY;
            ptr.last = performance.now();
        }, {passive: true});

        // Messaggio inviato: il toast si apre senza is-error.
        const toast = document.getElementById('toast');
        if (toast) {
            let wasOk = false;
            new MutationObserver(() => {
                const ok = toast.classList.contains('is-open') && !toast.classList.contains('is-error');
                if (ok && !wasOk) shower();
                wasOk = ok;
            }).observe(toast, {attributes: true, attributeFilter: ['class']});
        }

        canvas.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            lost = true;
            stop();
        });
        canvas.addEventListener('webglcontextrestored', () => {
            if (!initGL()) return;
            lost = false;
            relayout(true);
            start();
        });

        // La vista cambia misura solo col viewport; la pagina anche quando si
        // apre una card dei servizi, un pin di ScrollTrigger si allunga o
        // arriva il font vero.
        new ResizeObserver(() => relayout(true)).observe(view);
        new ResizeObserver(() => relayout(false)).observe(document.body);
        if (window.ScrollTrigger) window.ScrollTrigger.addEventListener('refresh', () => relayout(false));
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => relayout(false));
        window.addEventListener('load', () => relayout(false));

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else start();
        });

        /* ---- AVVIO ---- */
        resize();
        measure();
        redraw();
        start();
    }

    heroSky();
    pageSky();
})();
