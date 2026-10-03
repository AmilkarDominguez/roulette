'use strict';

/* =========================================================================
 *  Sorteo Tarija Tech Week
 *  - Rango de números configurable (por defecto 1..800)
 *  - Lista de premios: cada premio es un "pase" del sorteo
 *  - Aleatoriedad criptográfica (crypto.getRandomValues)
 *  - Estado guardado en localStorage: si se recarga la página no se pierde nada
 * ========================================================================= */

const STORAGE_KEY = 'sorteo-ttw-v1';
const MAX_RANGE = 1_000_000;

const DEFAULT_CONFIG = {
    title: 'Tarija Tech Week',
    min: 1,
    max: 800,
    prizes: ['Premio sorpresa x3', 'Kit de stickers y polera', 'Auriculares', 'Tablet', 'Laptop'].join('\n'),
    excluded: '',
    duration: 6,
    noRepeat: true,
    sound: true,
};

const $ = (id) => document.getElementById(id);

const els = {
    eventTitle: $('eventTitle'),
    prizeCount: $('prizeCount'),
    prizeName: $('prizeName'),
    reels: $('reels'),
    winnerLabel: $('winnerLabel'),
    btnDraw: $('btnDraw'),
    btnVoid: $('btnVoid'),
    btnNext: $('btnNext'),
    hint: $('hint'),
    winnersPanel: $('winnersPanel'),
    winnersList: $('winnersList'),
    poolInfo: $('poolInfo'),
    btnSound: $('btnSound'),
    settingsView: $('settingsView'),
    settingsForm: $('settingsForm'),
    finishView: $('finishView'),
    finishList: $('finishList'),
    finishTitle: $('finishTitle'),
    cfg: {
        title: $('cfgTitle'), min: $('cfgMin'), max: $('cfgMax'), prizes: $('cfgPrizes'),
        excluded: $('cfgExcluded'), duration: $('cfgDuration'), noRepeat: $('cfgNoRepeat'), sound: $('cfgSound'),
    },
    cfgSummary: $('cfgSummary'),
    cfgError: $('cfgError'),
    drawsInfo: $('drawsInfo'),
};

/* ----------------------------- Estado ----------------------------- */

let state = loadState();
// phase: 'idle' (listo para sortear) | 'spinning' | 'revealed' (mostrando ganador)
let phase = 'idle';

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            if (s && s.config && Array.isArray(s.draws)) {
                s.config = { ...DEFAULT_CONFIG, ...s.config };
                return s;
            }
        }
    } catch (e) { /* almacenamiento no disponible */ }
    return { config: { ...DEFAULT_CONFIG }, draws: [], configured: false };
}

function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ }
}

/* ----------------------------- Utilidades ----------------------------- */

function expandPrizes(text) {
    const out = [];
    for (const rawLine of String(text).split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const m = line.match(/^(.+?)\s+[xX×]\s*(\d+)$/);
        if (m) {
            const n = Math.min(parseInt(m[2], 10), 500);
            for (let i = 0; i < n; i++) out.push(m[1].trim());
        } else {
            out.push(line);
        }
    }
    return out;
}

function parseExcluded(text, min, max) {
    const set = new Set();
    const tokens = String(text).split(/[\s,;]+/).filter(Boolean);
    for (const t of tokens) {
        const r = t.match(/^(\d+)\s*-\s*(\d+)$/);
        if (r) {
            let a = parseInt(r[1], 10), b = parseInt(r[2], 10);
            if (a > b) [a, b] = [b, a];
            for (let n = Math.max(a, min); n <= Math.min(b, max); n++) set.add(n);
        } else if (/^\d+$/.test(t)) {
            const n = parseInt(t, 10);
            if (n >= min && n <= max) set.add(n);
        } else {
            throw new Error(`Valor no válido en números excluidos: "${t}"`);
        }
    }
    return set;
}

/** Entero aleatorio uniforme en [0, n) usando crypto, sin sesgo de módulo. */
function randomInt(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % n;
}

function prizes() { return expandPrizes(state.config.prizes); }
function validDraws() { return state.draws.filter((d) => d.status === 'valid'); }
function digitsCount() { return String(state.config.max).length; }

function availablePool() {
    const { min, max, noRepeat } = state.config;
    const excluded = parseExcluded(state.config.excluded, min, max);
    if (noRepeat) for (const d of state.draws) excluded.add(d.number);
    const pool = [];
    for (let n = min; n <= max; n++) if (!excluded.has(n)) pool.push(n);
    return pool;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ----------------------------- Sonido ----------------------------- */

let audioCtx = null;
function audio() {
    if (!state.config.sound) return null;
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.15) {
    const ctx = audio();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
}

let lastTick = 0;
function tick() {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    tone(1400 + Math.random() * 300, 0, 0.035, 'square', 0.035);
}
function thud() { tone(160, 0, 0.18, 'triangle', 0.25); }
function fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.5, 'triangle', 0.18));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, 0.5, 1.1, 'sine', 0.09));
}

/* ----------------------------- Rodillos ----------------------------- */

let reelState = []; // [{ el, strip, current: number|null }]

function buildReels() {
    const n = digitsCount();
    els.reels.innerHTML = '';
    reelState = [];
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'reel';
        const strip = document.createElement('div');
        strip.className = 'strip';
        strip.innerHTML = '<span>?</span>';
        el.appendChild(strip);
        els.reels.appendChild(el);
        reelState.push({ el, strip, current: null });
    }
}

function setReelsStatic(number) {
    const str = number == null ? null : String(number).padStart(reelState.length, '0');
    reelState.forEach((r, i) => {
        r.strip.style.transition = 'none';
        r.strip.style.transform = 'translateY(0)';
        r.strip.innerHTML = `<span>${str ? str[i] : '?'}</span>`;
        r.current = str ? Number(str[i]) : null;
    });
    collapseLeadingZeros(str);
}

function collapseLeadingZeros(str) {
    let leading = true;
    reelState.forEach((r, i) => {
        const isZero = str && str[i] === '0' && i < reelState.length - 1;
        if (!isZero) leading = false;
        r.el.classList.toggle('collapsed', Boolean(str) && leading && isZero);
    });
}

function spinReelsTo(number, totalSeconds) {
    const str = String(number).padStart(reelState.length, '0');
    const n = reelState.length;
    reelState.forEach((r) => r.el.classList.remove('collapsed'));

    const durations = [];
    reelState.forEach((r, i) => {
        const target = Number(str[i]);
        const startDigit = r.current == null ? randomInt(10) : r.current;
        const dur = totalSeconds * (n === 1 ? 1 : 0.55 + 0.45 * (i / (n - 1)));
        const loops = Math.max(2, Math.round(dur * 4));
        const steps = loops * 10 + ((target - startDigit + 10) % 10);

        const chars = [r.current == null ? '?' : String(startDigit)];
        let d = startDigit;
        for (let k = 0; k < steps; k++) { d = (d + 1) % 10; chars.push(String(d)); }

        r.strip.style.transition = 'none';
        r.strip.style.transform = 'translateY(0)';
        r.strip.innerHTML = chars.map((c) => `<span>${c}</span>`).join('');
        r.steps = steps;
        r.target = target;
        durations.push(dur);
    });

    void els.reels.offsetHeight; // forzar reflow antes de animar

    reelState.forEach((r, i) => {
        r.strip.style.transition = `transform ${durations[i]}s cubic-bezier(.12,.62,.12,1)`;
        r.strip.style.transform = `translateY(-${r.steps}em)`;
        setTimeout(() => { if (phase === 'spinning') thud(); }, durations[i] * 1000);
    });

    // Sonido de "tic" mientras pasan los dígitos (se lee la posición del último rodillo)
    const last = reelState[n - 1];
    let lastIndex = -1;
    const fontPx = () => parseFloat(getComputedStyle(els.reels).fontSize);
    const loop = () => {
        if (phase !== 'spinning') return;
        const m = new DOMMatrixReadOnly(getComputedStyle(last.strip).transform);
        const idx = Math.floor(-m.m42 / fontPx());
        if (idx !== lastIndex) { lastIndex = idx; tick(); }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return Math.max(...durations);
}

/* ----------------------------- Confeti ----------------------------- */

const confetti = (() => {
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    const colors = ['#8b5cf6', '#22d3ee', '#f472b6', '#fde047', '#34d399', '#ffffff'];
    let parts = [];
    let running = false;

    function resize() {
        canvas.width = innerWidth * devicePixelRatio;
        canvas.height = innerHeight * devicePixelRatio;
    }
    addEventListener('resize', resize);
    resize();

    function burst(count = 260) {
        const W = canvas.width, H = canvas.height, s = devicePixelRatio;
        for (let i = 0; i < count; i++) {
            const fromLeft = i % 2 === 0;
            const angle = (fromLeft ? -60 : -120) * Math.PI / 180 + (Math.random() - 0.5) * 0.9;
            const speed = (12 + Math.random() * 16) * s;
            parts.push({
                x: fromLeft ? 0 : W, y: H * 0.85,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                w: (6 + Math.random() * 8) * s, h: (8 + Math.random() * 10) * s,
                rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
                color: colors[(Math.random() * colors.length) | 0],
                life: 0,
            });
        }
        if (!running) { running = true; requestAnimationFrame(step); }
    }

    function step() {
        const s = devicePixelRatio;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        parts = parts.filter((p) => p.y < canvas.height + 50 && p.life < 600);
        for (const p of parts) {
            p.vy += 0.35 * s;
            p.vx *= 0.985; p.vy *= 0.985;
            p.x += p.vx; p.y += p.vy;
            p.rot += p.vr; p.life++;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life * 0.1)));
            ctx.restore();
        }
        if (parts.length) requestAnimationFrame(step);
        else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    return { burst };
})();

/* ----------------------------- Flujo del sorteo ----------------------------- */

function currentPrizeIndex() { return validDraws().length; }

function draw() {
    if (phase !== 'idle') return;
    const list = prizes();
    const idx = currentPrizeIndex();
    if (idx >= list.length) { showFinish(); return; }

    const pool = availablePool();
    if (pool.length === 0) {
        alert('No quedan números disponibles en el rango configurado.');
        return;
    }
    const number = pool[randomInt(pool.length)];

    audio(); // desbloquear audio con el gesto del usuario
    phase = 'spinning';
    els.reels.classList.remove('revealed');
    els.reels.classList.add('spinning');
    setLabel('', false);
    renderControls();

    const total = spinReelsTo(number, state.config.duration);
    setTimeout(() => reveal(number, idx, list[idx]), total * 1000 + 120);
}

function reveal(number, prizeIndex, prizeName) {
    state.draws.push({ prizeIndex, prize: prizeName, number, status: 'valid', time: new Date().toISOString() });
    saveState();

    phase = 'revealed';
    setReelsStatic(number);
    els.reels.classList.remove('spinning');
    els.reels.classList.add('revealed');
    setLabel('¡Tenemos ganador!', true);
    fanfare();
    confetti.burst();
    setTimeout(() => confetti.burst(160), 450);
    render();
}

function voidLast() {
    if (phase !== 'revealed') return;
    const last = state.draws[state.draws.length - 1];
    if (!last || last.status !== 'valid') return;
    last.status = 'void';
    saveState();
    phase = 'idle';
    els.reels.classList.remove('revealed');
    setLabel(`Número ${last.number} ausente · volvemos a sortear`, true, true);
    render();
}

function nextPrize() {
    if (phase !== 'revealed') return;
    phase = 'idle';
    els.reels.classList.remove('revealed');
    if (currentPrizeIndex() >= prizes().length) {
        render();
        showFinish();
        return;
    }
    setReelsStatic(null);
    setLabel('', false);
    render();
}

function primaryAction() {
    if (!els.settingsView.classList.contains('hidden')) return;
    if (!els.finishView.classList.contains('hidden')) return;
    if (phase === 'idle') draw();
    else if (phase === 'revealed') nextPrize();
}

function setLabel(text, show, isVoid = false) {
    els.winnerLabel.textContent = text || ' ';
    els.winnerLabel.classList.toggle('show', Boolean(show));
    els.winnerLabel.classList.toggle('void', isVoid);
}

/* ----------------------------- Render ----------------------------- */

function render() {
    const list = prizes();
    els.eventTitle.textContent = state.config.title;
    els.finishTitle.textContent = state.config.title;
    document.title = `Sorteo · ${state.config.title}`;

    let idx = currentPrizeIndex();
    if (phase === 'revealed') idx -= 1; // se muestra el premio que se acaba de sortear
    if (idx < list.length) {
        els.prizeCount.textContent = `Premio ${idx + 1} de ${list.length}`;
        els.prizeName.textContent = list[idx];
    } else {
        els.prizeCount.textContent = `${list.length} premios sorteados`;
        els.prizeName.textContent = '¡Sorteo finalizado!';
    }

    renderControls();
    renderWinners();
    els.btnSound.classList.toggle('off', !state.config.sound);
    els.btnSound.textContent = state.config.sound ? '🔊' : '🔇';
}

function renderControls() {
    const done = currentPrizeIndex() >= prizes().length;
    els.btnDraw.classList.toggle('hidden', phase === 'revealed');
    els.btnDraw.disabled = phase === 'spinning';
    els.btnDraw.textContent = phase === 'spinning' ? 'SORTEANDO…' : (done ? 'VER RESULTADOS' : 'SORTEAR');
    els.btnVoid.classList.toggle('hidden', phase !== 'revealed');
    els.btnNext.classList.toggle('hidden', phase !== 'revealed');
    els.btnNext.textContent = done ? 'Ver resultados ➜' : 'Siguiente premio ➜';
    els.hint.innerHTML = phase === 'revealed'
        ? `Pulsa <kbd>Espacio</kbd> para continuar`
        : phase === 'spinning' ? '&nbsp;' : `Pulsa <kbd>Espacio</kbd> para sortear`;
}

function winnersHtml(draws, highlightLast) {
    if (!draws.length) return '<li class="empty">Aún no hay ganadores</li>';
    const total = prizes().length;
    return draws.map((d, i) => `
        <li class="${d.status === 'void' ? 'void' : ''} ${highlightLast && i === draws.length - 1 && d.status === 'valid' ? 'latest' : ''}">
            <span class="w-num">${d.number}</span>
            <span class="w-prize">${escapeHtml(d.prize)}
                <small>Premio ${d.prizeIndex + 1} de ${total}${d.status === 'void' ? ' · anulado (ausente)' : ''}</small>
            </span>
        </li>`).join('');
}

function renderWinners() {
    const draws = [...state.draws].reverse();
    els.winnersList.innerHTML = winnersHtml(draws, false);
    const first = els.winnersList.querySelector('li');
    if (phase === 'revealed' && first) first.classList.add('latest');
    try {
        els.poolInfo.textContent = `${availablePool().length} números disponibles`;
    } catch (e) { els.poolInfo.textContent = ''; }
}

function showFinish() {
    els.finishList.innerHTML = winnersHtml(validDraws(), false);
    els.finishView.classList.remove('hidden');
    confetti.burst(320);
    fanfare();
}

/* ----------------------------- Exportar ----------------------------- */

function exportCsv() {
    const rows = [['Orden', 'Premio', 'Número', 'Estado', 'Hora']];
    state.draws.forEach((d, i) => rows.push([
        i + 1, d.prize, d.number, d.status === 'valid' ? 'Ganador' : 'Anulado (ausente)',
        new Date(d.time).toLocaleString('es-BO'),
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ganadores-${state.config.title.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ----------------------------- Configuración ----------------------------- */

function openSettings() {
    if (phase === 'spinning') return;
    const c = state.config;
    els.cfg.title.value = c.title;
    els.cfg.min.value = c.min;
    els.cfg.max.value = c.max;
    els.cfg.prizes.value = c.prizes;
    els.cfg.excluded.value = c.excluded;
    els.cfg.duration.value = c.duration;
    els.cfg.noRepeat.checked = c.noRepeat;
    els.cfg.sound.checked = c.sound;
    els.cfgError.textContent = '';
    $('btnCancelSettings').classList.toggle('hidden', !state.configured);
    els.drawsInfo.textContent = state.draws.length
        ? `Hay ${state.draws.length} sorteo(s) registrados. Guardar no los borra; usa "Reiniciar sorteo" para empezar de cero.`
        : '';
    updateSummary();
    els.settingsView.classList.remove('hidden');
    els.cfg.title.focus();
}

function readForm() {
    const min = parseInt(els.cfg.min.value, 10);
    const max = parseInt(els.cfg.max.value, 10);
    if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error('El rango debe ser de números enteros.');
    if (min < 0) throw new Error('El número mínimo no puede ser negativo.');
    if (max <= min) throw new Error('El número máximo debe ser mayor que el mínimo.');
    if (max - min + 1 > MAX_RANGE) throw new Error(`El rango no puede superar ${MAX_RANGE.toLocaleString('es')} números.`);
    const prizeList = expandPrizes(els.cfg.prizes.value);
    if (!prizeList.length) throw new Error('Agrega al menos un premio.');
    const excluded = parseExcluded(els.cfg.excluded.value, min, max);
    const duration = Math.min(20, Math.max(1, parseFloat(els.cfg.duration.value) || DEFAULT_CONFIG.duration));
    const size = max - min + 1 - excluded.size;
    if (els.cfg.noRepeat.checked && size < prizeList.length) {
        throw new Error(`Hay ${prizeList.length} premios pero solo ${size} números participantes.`);
    }
    return {
        config: {
            title: els.cfg.title.value.trim() || DEFAULT_CONFIG.title,
            min, max,
            prizes: els.cfg.prizes.value.trim(),
            excluded: els.cfg.excluded.value.trim(),
            duration,
            noRepeat: els.cfg.noRepeat.checked,
            sound: els.cfg.sound.checked,
        },
        prizeCount: prizeList.length,
        size,
    };
}

function updateSummary() {
    try {
        const { prizeCount, size, config } = readForm();
        els.cfgSummary.textContent = `${size} números participantes (del ${config.min} al ${config.max}) · ${prizeCount} premio(s) a sortear.`;
        els.cfgError.textContent = '';
    } catch (e) {
        els.cfgSummary.textContent = '';
        els.cfgError.textContent = e.message;
    }
}

function saveSettings(ev) {
    ev.preventDefault();
    try {
        const { config } = readForm();
        const digitsChanged = String(config.max).length !== String(state.config.max).length;
        state.config = config;
        state.configured = true;
        saveState();
        if (digitsChanged || !reelState.length) buildReels();
        if (phase === 'revealed') nextPrize();
        els.settingsView.classList.add('hidden');
        render();
    } catch (e) {
        els.cfgError.textContent = e.message;
    }
}

function resetDraws() {
    if (!state.draws.length) return;
    if (!confirm('¿Seguro? Se borrarán todos los ganadores registrados.')) return;
    state.draws = [];
    saveState();
    phase = 'idle';
    els.reels.classList.remove('revealed');
    setReelsStatic(null);
    setLabel('', false);
    els.drawsInfo.textContent = 'Sorteo reiniciado.';
    render();
}

/* ----------------------------- Eventos ----------------------------- */

function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
}

function toggleSound() {
    state.config.sound = !state.config.sound;
    saveState();
    render();
}

els.btnDraw.addEventListener('click', () => {
    if (currentPrizeIndex() >= prizes().length) showFinish(); else draw();
});
els.btnVoid.addEventListener('click', voidLast);
els.btnNext.addEventListener('click', nextPrize);
$('btnWinners').addEventListener('click', () => els.winnersPanel.classList.toggle('open'));
$('btnCloseWinners').addEventListener('click', () => els.winnersPanel.classList.remove('open'));
$('btnFullscreen').addEventListener('click', toggleFullscreen);
$('btnSettings').addEventListener('click', openSettings);
els.btnSound.addEventListener('click', toggleSound);
$('btnExport').addEventListener('click', exportCsv);
$('btnFinishExport').addEventListener('click', exportCsv);
$('btnFinishClose').addEventListener('click', () => els.finishView.classList.add('hidden'));
$('btnCancelSettings').addEventListener('click', () => els.settingsView.classList.add('hidden'));
$('btnReset').addEventListener('click', resetDraws);
els.settingsForm.addEventListener('submit', saveSettings);
els.settingsForm.addEventListener('input', updateSummary);

document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape' && state.configured) els.settingsView.classList.add('hidden');
        return;
    }
    if (!els.settingsView.classList.contains('hidden')) {
        if (e.key === 'Escape' && state.configured) els.settingsView.classList.add('hidden');
        return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.target.tagName === 'BUTTON') e.target.blur();
        primaryAction();
        return;
    }
    switch (e.key.toLowerCase()) {
        case 'g': els.winnersPanel.classList.toggle('open'); break;
        case 'f': toggleFullscreen(); break;
        case 's': toggleSound(); break;
        case 'c': openSettings(); break;
        case 'escape':
            els.winnersPanel.classList.remove('open');
            els.finishView.classList.add('hidden');
            break;
    }
});

/* ----------------------------- Inicio ----------------------------- */

buildReels();
setReelsStatic(null);
render();
if (!state.configured) openSettings();
