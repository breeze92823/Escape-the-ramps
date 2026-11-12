// Inline SVG icons for the HUD (drawn to match the reference's chunky,
// outlined cartoon icons). All use viewBox 0 0 100 100.
const OUT = '#1b1424'

function gearPath(cx, cy, ro, ri, teeth) {
  let d = ''
  const n = teeth * 4
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / n
    const r = i % 4 === 1 || i % 4 === 2 ? ro : ri
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`
  }
  return `${d}Z`
}

export const gem = `<svg viewBox="0 0 100 100"><path d="M50 6 88 28v44L50 94 12 72V28z" fill="#169a16" stroke="#0a3a0a" stroke-width="9" stroke-linejoin="round"/><path d="M50 26 70 38v24L50 74 30 62V38z" fill="#5cff3c"/><path d="M50 26 70 38 50 50 30 38z" fill="#b8ff9a"/></svg>`

export const trophy = `<svg viewBox="0 0 100 100"><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#ffe46a"/><stop offset=".55" stop-color="#ffc21a"/><stop offset="1" stop-color="#f09a00"/></linearGradient></defs>
<g stroke="${OUT}" stroke-width="5" stroke-linejoin="round"><path d="M27 22H11c0 17 9 24 21 24M73 22h16c0 17-9 24-21 24" fill="none" stroke-width="10"/><path d="M27 22H11c0 17 9 24 21 24M73 22h16c0 17-9 24-21 24" fill="none" stroke="#ffc21a" stroke-width="4"/>
<path d="M24 10h52v16c0 22-12 34-26 34S24 48 24 26z" fill="url(#tg)"/><path d="M42 58h16v14H42z" fill="#f0a000"/><path d="M28 72h44l5 16H23z" fill="url(#tg)"/></g>
<path d="M33 18c0 13 4 24 11 31" stroke="#fff7c0" stroke-width="6" fill="none" stroke-linecap="round" opacity=".85"/></svg>`

export const gear = (fill = '#8c939f') => `<svg viewBox="0 0 100 100"><path d="${gearPath(50, 50, 46, 34, 8)}" fill="${fill}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><circle cx="50" cy="50" r="22" fill="${fill}" stroke="#5d636e" stroke-width="4"/><circle cx="50" cy="50" r="12" fill="#ffffff" stroke="${OUT}" stroke-width="5"/><path d="M22 34a32 32 0 0 1 18-16" stroke="#e8ecf2" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/></svg>`

export const wheel = `<svg viewBox="0 0 100 100"><circle cx="56" cy="44" r="38" fill="#2c2e37" stroke="${OUT}" stroke-width="4"/><circle cx="56" cy="44" r="30" fill="none" stroke="#3d404b" stroke-width="5" stroke-dasharray="6 5"/><circle cx="56" cy="44" r="21" fill="#c4cad3" stroke="#5f6672" stroke-width="3"/>
${[0, 72, 144, 216, 288].map((a) => `<path d="M56 44 L${(56 + Math.cos((a * Math.PI) / 180) * 19).toFixed(1)} ${(44 + Math.sin((a * Math.PI) / 180) * 19).toFixed(1)}" stroke="#6b717d" stroke-width="5" stroke-linecap="round"/>`).join('')}
<circle cx="56" cy="44" r="6" fill="#f2f4f7" stroke="#5f6672" stroke-width="2"/>
<g fill="#ffffff" stroke="#c9d3e0" stroke-width="2"><circle cx="16" cy="80" r="11"/><circle cx="30" cy="76" r="13"/><circle cx="44" cy="84" r="10"/><circle cx="6" cy="86" r="7"/></g></svg>`

export const rebirth = `<svg viewBox="0 0 100 100"><circle cx="50" cy="52" r="38" fill="#d8ecff" stroke="${OUT}" stroke-width="5"/><circle cx="50" cy="52" r="30" fill="#ffffff"/>
<g fill="none" stroke-linecap="round"><path d="M24 44a28 28 0 0 1 46-14" stroke="${OUT}" stroke-width="17"/><path d="M76 60a28 28 0 0 1-46 14" stroke="${OUT}" stroke-width="17"/><path d="M24 44a28 28 0 0 1 46-14" stroke="#ff3f72" stroke-width="10"/><path d="M76 60a28 28 0 0 1-46 14" stroke="#ff3f72" stroke-width="10"/></g>
<path d="M60 18 82 26 70 44z" fill="#ff3f72" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/><path d="M40 86 18 78 30 60z" fill="#ff3f72" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/></svg>`

export const teleport = `<svg viewBox="0 0 100 100"><defs><radialGradient id="tp" cx=".4" cy=".35"><stop offset="0" stop-color="#f6d8ff"/><stop offset=".5" stop-color="#b45cff"/><stop offset="1" stop-color="#6a1fd0"/></radialGradient></defs><circle cx="50" cy="52" r="38" fill="url(#tp)" stroke="${OUT}" stroke-width="5"/>
<ellipse cx="50" cy="52" rx="28" ry="13" fill="none" stroke="#ffffff" stroke-width="5" transform="rotate(-18 50 52)"/><ellipse cx="50" cy="52" rx="16" ry="7" fill="#ffffff" opacity=".85" transform="rotate(-18 50 52)"/>
<path d="M78 14l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff6a0" stroke="${OUT}" stroke-width="2"/><path d="M20 76l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffffff"/></svg>`

export const tuning = `<svg viewBox="0 0 100 100"><path d="M60 10h26v22H66z" fill="#b8bec8" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><circle cx="46" cy="56" r="36" fill="#9aa1ad" stroke="${OUT}" stroke-width="5"/><circle cx="46" cy="56" r="25" fill="#c5cad3" stroke="#5f6672" stroke-width="4"/><circle cx="46" cy="56" r="15" fill="#6b717d" stroke="${OUT}" stroke-width="4"/>
${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M46 56 L${(46 + Math.cos((a * Math.PI) / 180) * 14).toFixed(1)} ${(56 + Math.sin((a * Math.PI) / 180) * 14).toFixed(1)}" stroke="#dfe3ea" stroke-width="4"/>`).join('')}<circle cx="46" cy="56" r="4" fill="#ffffff"/><path d="M20 34a34 34 0 0 1 22-14" stroke="#eef1f5" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`

export const cars = `<svg viewBox="0 0 100 100"><path d="M10 50l6-16 22-4 8-14h26l8 14 12 4 2 16z" fill="#ff7a1a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M48 21h22l6 11H42z" fill="#9fe2ff" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/><path d="M18 44h70" stroke="#ffb36a" stroke-width="4"/><path d="M28 36l10 6M60 38l12 4" stroke="#ff4a1a" stroke-width="4"/>
<rect x="34" y="50" width="34" height="10" fill="#4a4f5c" stroke="${OUT}" stroke-width="3"/>
${[24, 78].map((x) => `<circle cx="${x}" cy="68" r="19" fill="#22242c" stroke="${OUT}" stroke-width="4"/><circle cx="${x}" cy="68" r="9" fill="#9aa1ad" stroke="#4a4f5c" stroke-width="3"/>`).join('')}</svg>`

export const shop = `<svg viewBox="0 0 100 100"><path d="M14 40 50 52v40L14 80z" fill="#e62a5a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M86 40 50 52v40l36-12z" fill="#ff4f7e" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>
<path d="M14 40 50 28l36 12-36 12z" fill="#7a1030" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M14 40 4 22l36-12 10 18z" fill="#4fd8e8" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M86 40l10-18-36-12-10 18z" fill="#ff7aa0" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/></svg>`

export const daily = `<svg viewBox="0 0 100 100"><rect x="12" y="16" width="76" height="76" rx="10" fill="#ffffff" stroke="${OUT}" stroke-width="5"/><path d="M12 26a10 10 0 0 1 10-10h56a10 10 0 0 1 10 10v12H12z" fill="#ff3a5a" stroke="${OUT}" stroke-width="5"/>
<rect x="28" y="6" width="9" height="20" rx="4" fill="#d8dde6" stroke="${OUT}" stroke-width="4"/><rect x="63" y="6" width="9" height="20" rx="4" fill="#d8dde6" stroke="${OUT}" stroke-width="4"/><text x="50" y="80" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="38" fill="#1b1424">31</text></svg>`

export const exit = `<svg viewBox="0 0 100 100"><path d="M46 12H18v76h28" fill="none" stroke="${OUT}" stroke-width="16" stroke-linejoin="round"/><path d="M46 12H18v76h28" fill="none" stroke="#ff2a3a" stroke-width="8" stroke-linejoin="round"/>
<path d="M34 40h28V22l32 28-32 28V60H34z" fill="#ff2a3a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M40 46h26" stroke="#ff9aa2" stroke-width="5" stroke-linecap="round"/></svg>`

export const nitro = `<svg viewBox="0 0 100 100"><path d="M8 30c10-14 26-14 34-4-8 2-14 6-16 14-6-6-12-8-18-10z" fill="#ffffff" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/><path d="M14 22c8-10 22-10 30-2" fill="none" stroke="#c9e6ff" stroke-width="4"/>
<g transform="rotate(28 58 56)"><rect x="40" y="30" width="36" height="62" rx="12" fill="#8fd2ff" stroke="${OUT}" stroke-width="5"/><rect x="46" y="38" width="9" height="44" rx="4" fill="#e6f6ff"/><rect x="48" y="16" width="20" height="16" rx="4" fill="#ff7ab0" stroke="${OUT}" stroke-width="5"/><rect x="52" y="8" width="12" height="10" rx="3" fill="#d8dde6" stroke="${OUT}" stroke-width="4"/></g></svg>`

export const friends = `<svg viewBox="0 0 100 100"><rect x="44" y="18" width="48" height="48" rx="12" fill="#ffd21a" stroke="${OUT}" stroke-width="5"/><rect x="8" y="34" width="50" height="50" rx="12" fill="#ffe14a" stroke="${OUT}" stroke-width="5"/>
<circle cx="24" cy="54" r="4" fill="${OUT}"/><circle cx="42" cy="54" r="4" fill="${OUT}"/><path d="M22 66q11 9 22 0" stroke="${OUT}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="64" cy="38" r="3.5" fill="${OUT}"/><circle cx="80" cy="38" r="3.5" fill="${OUT}"/><path d="M64 48q8 6 16 0" stroke="${OUT}" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`

// Speaker for the sound toggle: 'on' (waves), 'sfx' (music off: crossed note), 'off' (red X).
export const sound = (mode) => `<svg viewBox="0 0 100 100"><path d="M12 38h16l24-20v64L28 62H12z" fill="#ffd21a" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/><path d="M18 44h10" stroke="#fff3a0" stroke-width="5" stroke-linecap="round"/>
${mode === 'off'
  ? `<path d="M64 36 88 64M88 36 64 64" stroke="${OUT}" stroke-width="15" stroke-linecap="round"/><path d="M64 36 88 64M88 36 64 64" stroke="#ff3a4a" stroke-width="8" stroke-linecap="round"/>`
  : `<path d="M62 38q8 12 0 24" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round"/><path d="M62 38q8 12 0 24" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>${mode === 'sfx'
    ? `<g transform="translate(70 18)"><path d="M10 4v20" stroke="${OUT}" stroke-width="5"/><circle cx="6" cy="25" r="6" fill="#5cd2ff" stroke="${OUT}" stroke-width="4"/><path d="M-2 2 22 30" stroke="#ff3a4a" stroke-width="6" stroke-linecap="round"/></g>`
    : `<path d="M74 26q18 24 0 48" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round"/><path d="M74 26q18 24 0 48" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`}`}</svg>`

export const plus = `<svg viewBox="0 0 100 100"><path d="M40 14h20v26h26v20H60v26H40V60H14V40h26z" fill="#ffffff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/></svg>`

// --- Window icons ------------------------------------------------------------------
export const close = `<svg viewBox="0 0 100 100"><path d="M24 24 76 76M76 24 24 76" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/></svg>`
export const check = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#2fc85a" stroke="#ffffff" stroke-width="8"/><path d="M28 52l15 15 30-32" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`
export const arrow = `<svg viewBox="0 0 100 100"><path d="M10 34h40V12l42 38-42 38V66H10z" fill="#ffffff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/><path d="M16 60h38v16l28-26" fill="none" stroke="#b9c6dc" stroke-width="5" stroke-linejoin="round"/></svg>`
export const bars = `<svg viewBox="0 0 100 100"><rect x="10" y="50" width="24" height="40" rx="4" fill="#2f7dff" stroke="${OUT}" stroke-width="3"/><rect x="38" y="12" width="26" height="78" rx="4" fill="#ffc21a" stroke="${OUT}" stroke-width="3"/><rect x="66" y="30" width="24" height="60" rx="4" fill="#ff3a3a" stroke="${OUT}" stroke-width="3"/><rect x="42" y="16" width="8" height="70" fill="#ffe680" opacity=".8"/></svg>`
export const gift = `<svg viewBox="0 0 100 100"><rect x="14" y="44" width="72" height="46" rx="4" fill="#ffffff"/><rect x="8" y="28" width="84" height="20" rx="4" fill="#ffffff"/><rect x="44" y="28" width="12" height="62" fill="#a23ce0"/><path d="M50 28c-8-16-30-16-26-4 2 6 16 6 26 4zM50 28c8-16 30-16 26-4-2 6-16 6-26 4z" fill="none" stroke="#ffffff" stroke-width="7"/></svg>`
// Power-up chips (hud.js): Balloons, Wings.
export const balloon = `<svg viewBox="0 0 100 100"><path d="M50 70q-6 12 4 24" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/><ellipse cx="50" cy="38" rx="27" ry="32" fill="#e8263a" stroke="${OUT}" stroke-width="5"/><path d="M44 70h12l-6 7z" fill="#e8263a" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/><ellipse cx="40" cy="26" rx="7" ry="11" fill="#ffffff" opacity=".55"/></svg>`
export const wing = `<svg viewBox="0 0 100 100"><path d="M12 70C20 40 50 18 92 18L72 34l14 2-18 12 10 4-20 10 6 4C46 74 26 78 12 70z" fill="#8fe0ff" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M22 64c16-6 32-16 48-30" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".8"/></svg>`
export const timer = `<svg viewBox="0 0 100 100"><circle cx="50" cy="56" r="38" fill="#ffd21a" stroke="${OUT}" stroke-width="5"/><circle cx="50" cy="56" r="29" fill="#ffffff" stroke="${OUT}" stroke-width="3"/><rect x="42" y="6" width="16" height="12" rx="3" fill="#ffd21a" stroke="${OUT}" stroke-width="4"/><path d="M50 56V36M50 56l12 8" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/><path d="M80 22l8 8" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/></svg>`
export const restock = `<svg viewBox="0 0 100 100"><g fill="none" stroke-linecap="round"><path d="M18 46a32 32 0 0 1 56-20" stroke="${OUT}" stroke-width="16"/><path d="M82 54a32 32 0 0 1-56 20" stroke="${OUT}" stroke-width="16"/><path d="M18 46a32 32 0 0 1 56-20" stroke="#ffffff" stroke-width="8"/><path d="M82 54a32 32 0 0 1-56 20" stroke="#ffffff" stroke-width="8"/></g><path d="M64 12l22 6-8 22z" fill="#ffffff" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M36 88l-22-6 8-22z" fill="#ffffff" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/></svg>`

// Tuning parts (viewBox 0 0 120 100, shaded like the reference's parts).
const METAL = 'url(#pm)'
export const partDefs = `<defs><linearGradient id="pm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#c9ced8"/><stop offset="1" stop-color="#7c8494"/></linearGradient></defs>`
const ring = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2)).join('')
const p1 = (v) => v.toFixed(1)
export const parts = {
  oil: `<svg viewBox="0 0 120 100"><path d="M62 30 36 8 24 6" fill="none" stroke="${OUT}" stroke-width="9" stroke-linecap="round"/><path d="M62 30 36 8 24 6" fill="none" stroke="#c9ced8" stroke-width="4" stroke-linecap="round"/>
<path d="M78 34h18l8 20-6 6-10-16H78z" fill="${METAL}" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/><rect x="38" y="24" width="42" height="14" rx="4" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><rect x="52" y="12" width="14" height="14" rx="3" fill="#ffc21a" stroke="${OUT}" stroke-width="4"/>
<rect x="28" y="36" width="60" height="58" rx="10" fill="#ffc21a" stroke="${OUT}" stroke-width="5"/><rect x="28" y="54" width="60" height="22" fill="#e8202a" stroke="${OUT}" stroke-width="4"/><text x="58" y="71" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="17" fill="#ffffff" stroke="${OUT}" stroke-width="1.2">OIL</text><rect x="34" y="40" width="7" height="48" rx="3" fill="#fff0a0" opacity=".7"/></svg>`,
  plug: `<svg viewBox="0 0 120 100"><g transform="rotate(-35 60 50)"><rect x="54" y="0" width="12" height="14" rx="3" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><path d="M48 14h24l-2 30H50z" fill="#f4f6fa" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/><path d="M52 22h16M52 30h16M52 38h16" stroke="#c9ced8" stroke-width="3"/><path d="M44 44h32v14H44z" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><path d="M50 58h20v24H50z" fill="#c9ced8" stroke="${OUT}" stroke-width="4"/><path d="M50 64h20M50 70h20M50 76h20" stroke="#7c8494" stroke-width="3"/><path d="M60 82v12h8" fill="none" stroke="${OUT}" stroke-width="5"/></g><path d="M88 70l6-6M94 80l8-2M88 88l6 4" stroke="#ffd21a" stroke-width="5" stroke-linecap="round"/></svg>`,
  exhaust: `<svg viewBox="0 0 120 100"><rect x="4" y="44" width="24" height="12" rx="3" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><rect x="22" y="40" width="8" height="20" rx="2" fill="#ffc21a" stroke="${OUT}" stroke-width="3"/><path d="M30 32h50l8 6v24l-8 6H30z" fill="${METAL}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M36 40h40" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
<g fill="${METAL}" stroke="${OUT}" stroke-width="4"><path d="M84 30l22 4v14l-22-2z"/><path d="M84 52l22 2v14l-22-4z"/></g><ellipse cx="106" cy="41" rx="6" ry="8" fill="#3a3f4a" stroke="${OUT}" stroke-width="4"/><ellipse cx="106" cy="61" rx="6" ry="8" fill="#3a3f4a" stroke="${OUT}" stroke-width="4"/></svg>`,
  tires: `<svg viewBox="0 0 120 100"><circle cx="60" cy="50" r="44" fill="#2c2e37" stroke="${OUT}" stroke-width="5"/><circle cx="60" cy="50" r="36" fill="none" stroke="#454955" stroke-width="7" stroke-dasharray="8 6"/><circle cx="60" cy="50" r="24" fill="#c4cad3" stroke="#5f6672" stroke-width="4"/>${ring(5, (a) => `<path d="M60 50L${p1(60 + Math.cos(a) * 21)} ${p1(50 + Math.sin(a) * 21)}" stroke="#6b717d" stroke-width="6" stroke-linecap="round"/>`)}<circle cx="60" cy="50" r="7" fill="#f2f4f7" stroke="#5f6672" stroke-width="3"/><path d="M28 28a40 40 0 0 1 20-14" stroke="#6b717d" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,
  clutch: `<svg viewBox="0 0 120 100"><circle cx="60" cy="50" r="46" fill="#7c8494" stroke="${OUT}" stroke-width="5"/><circle cx="60" cy="50" r="40" fill="${METAL}"/>${ring(8, (a) => `<circle cx="${p1(60 + Math.cos(a) * 34)}" cy="${p1(50 + Math.sin(a) * 34)}" r="5" fill="#ffd21a" stroke="${OUT}" stroke-width="2.5"/>`)}
<circle cx="60" cy="50" r="26" fill="#3a3f4a" stroke="${OUT}" stroke-width="4"/>${ring(16, (a) => `<path d="M${p1(60 + Math.cos(a) * 12)} ${p1(50 + Math.sin(a) * 12)}L${p1(60 + Math.cos(a) * 24)} ${p1(50 + Math.sin(a) * 24)}" stroke="#ffd21a" stroke-width="3"/>`)}<circle cx="60" cy="50" r="11" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><circle cx="60" cy="50" r="4" fill="${OUT}"/></svg>`,
  turbo: `<svg viewBox="0 0 120 100"><path d="M70 6h30v24H76z" fill="#b8bec8" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><circle cx="56" cy="56" r="40" fill="#9aa1ad" stroke="${OUT}" stroke-width="5"/><circle cx="56" cy="56" r="28" fill="#c5cad3" stroke="#5f6672" stroke-width="4"/><circle cx="56" cy="56" r="17" fill="#6b717d" stroke="${OUT}" stroke-width="4"/>${ring(6, (a) => `<path d="M56 56L${p1(56 + Math.cos(a) * 16)} ${p1(56 + Math.sin(a) * 16)}" stroke="#dfe3ea" stroke-width="4"/>`)}<circle cx="56" cy="56" r="4" fill="#ffffff"/></svg>`,
  transmission: `<svg viewBox="0 0 120 100"><rect x="2" y="44" width="22" height="12" rx="3" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><path d="M22 34h20l6-6h46l14 12v20l-14 12H48l-6-6H22z" fill="${METAL}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>
<path d="M54 30v40M64 30v40M74 30v40M84 30v40" stroke="#7c8494" stroke-width="4"/><path d="M28 40h12" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><rect x="58" y="12" width="14" height="18" rx="3" fill="#ffc21a" stroke="${OUT}" stroke-width="4"/><circle cx="65" cy="10" r="6" fill="#ffc21a" stroke="${OUT}" stroke-width="4"/><rect x="104" y="44" width="14" height="12" rx="3" fill="${METAL}" stroke="${OUT}" stroke-width="4"/></svg>`,
  engine: `<svg viewBox="0 0 120 100"><path d="M14 40h92v40l-10 12H24L14 80z" fill="#3a3f4a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M24 50h72v24H24z" fill="${METAL}" stroke="${OUT}" stroke-width="4"/>${[36, 52, 68, 84].map((x) => `<circle cx="${x}" cy="62" r="6" fill="#7c8494" stroke="${OUT}" stroke-width="3"/>`).join('')}
<path d="M30 40V22h60v18" fill="#e8202a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M38 28h44" stroke="#ff8a8a" stroke-width="5" stroke-linecap="round"/><rect x="50" y="6" width="20" height="16" rx="4" fill="${METAL}" stroke="${OUT}" stroke-width="4"/><path d="M4 56h10M106 56h10" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/></svg>`,
}
export const crate = `<svg viewBox="0 0 100 100"><path d="M10 50 50 64v28L10 78z" fill="#ffb01a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M90 50 50 64v28l40-14z" fill="#ffd21a" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M10 50 50 36l40 14-40 14z" fill="#ffe680" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M50 8 68 26H57v18H43V26H32z" fill="#ffffff" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/></svg>`
