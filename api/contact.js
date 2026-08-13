// POST /api/contact — riceve il form contatti e inoltra la mail via Resend.
// Serverless function Vercel (runtime Node). Nessuna dipendenza npm: usa la
// fetch globale disponibile da Node 18 in su.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const TO = process.env.CONTACT_TO || 'lorenzodoneddudev@gmail.com';
const FROM = process.env.CONTACT_FROM || 'Sito lorenzodoneddu.dev <noreply@lorenzodoneddu.dev>';

const LIMITS = {
    nome: [2, 80],
    email: [5, 160],
    messaggio: [10, 4000],
};

// Rate limit best-effort: la Map vive quanto l'istanza lambda, quindi non è una
// difesa forte, ma taglia i submit ripetuti dallo stesso IP a costo zero.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 3;
const hits = new Map();

function rateLimited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);

    // Evita che la Map cresca all'infinito su istanze longeve.
    if (hits.size > 500) {
        for (const [key, stamps] of hits) {
            if (!stamps.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
        }
    }

    return recent.length > RATE_MAX;
}

function parseBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }
    return req.body;
}

function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// La spunta arriva come booleano dal fetch di script.js, ma un invio senza
// JavaScript (o da un client diverso) la manderebbe come stringa: si accettano
// entrambe le forme, e nient'altro.
function consentGiven(value) {
    return value === true || value === 'yes' || value === 'on' || value === 'true';
}

function validate(data) {
    const errors = [];
    for (const [field, [min, max]] of Object.entries(LIMITS)) {
        const value = data[field];
        if (value.length < min || value.length > max) {
            errors.push(field);
        }
    }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(data.email)) {
        if (!errors.includes('email')) errors.push('email');
    }
    // Header injection: nessun campo che finisce negli header può contenere a capo.
    if (/[\r\n]/.test(data.nome) || /[\r\n]/.test(data.email)) {
        errors.push('formato');
    }
    return errors;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ok: false, error: 'Metodo non consentito.'});
    }

    if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY mancante');
        return res.status(500).json({ok: false, error: 'Servizio email non configurato.'});
    }

    const body = parseBody(req);

    // Honeypot: i bot compilano tutto, un umano non vede mai questo campo.
    if (clean(body.website)) {
        return res.status(200).json({ok: true});
    }

    // Consenso privacy. Il required sulla checkbox si aggira con due righe di
    // console, quindi la base giuridica va verificata anche qui: senza spunta
    // il messaggio non viene inoltrato.
    if (!consentGiven(body.privacy)) {
        return res.status(400).json({
            ok: false,
            error: 'Per inviare il messaggio devi accettare la Privacy Policy.',
        });
    }

    const data = {
        nome: clean(body.nome),
        email: clean(body.email),
        messaggio: clean(body.messaggio),
    };

    const errors = validate(data);
    if (errors.length) {
        return res.status(400).json({
            ok: false,
            error: 'Controlla i campi: ' + errors.join(', ') + '.',
        });
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (rateLimited(ip)) {
        return res.status(429).json({ok: false, error: 'Troppi invii ravvicinati. Riprova tra un minuto.'});
    }

    // Prova del consenso (art. 7.1 GDPR): la mail è l'unico posto dove il
    // messaggio viene archiviato, quindi la traccia va scritta lì dentro.
    const consentStamp = new Date().toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
        dateStyle: 'short',
        timeStyle: 'medium',
    });

    const text =
        `Nome: ${data.nome}\n` +
        `Email: ${data.email}\n\n` +
        `${data.messaggio}\n\n` +
        `---\n` +
        `Privacy Policy accettata il ${consentStamp} (ora italiana).\n`;

    const html =
        `<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.6">` +
        `<p><strong>Nome:</strong> ${escapeHtml(data.nome)}<br>` +
        `<strong>Email:</strong> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></p>` +
        `<hr style="border:none;border-top:1px solid #ddd">` +
        `<p style="white-space:pre-wrap">${escapeHtml(data.messaggio)}</p>` +
        `<hr style="border:none;border-top:1px solid #ddd">` +
        `<p style="font-size:12px;color:#666">Privacy Policy accettata il ${escapeHtml(consentStamp)} (ora italiana).</p>` +
        `</div>`;

    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM,
                to: [TO],
                reply_to: data.email,
                subject: `Nuovo messaggio dal sito — ${data.nome}`,
                text,
                html,
            }),
        });

        if (!response.ok) {
            const detail = await response.text();
            console.error('Resend ha risposto', response.status, detail);
            return res.status(502).json({ok: false, error: 'Invio non riuscito. Riprova più tardi.'});
        }

        return res.status(200).json({ok: true});
    } catch (err) {
        console.error('Errore invio mail', err);
        return res.status(502).json({ok: false, error: 'Invio non riuscito. Riprova più tardi.'});
    }
};
