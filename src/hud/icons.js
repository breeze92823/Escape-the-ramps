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

export const plus = `<svg viewBox="0 0 100 100"><path d="M40 14h20v26h26v20H60v26H40V60H14V40h26z" fill="#ffffff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/></svg>`
