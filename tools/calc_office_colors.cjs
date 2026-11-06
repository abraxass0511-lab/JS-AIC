// Calculate HSL to RGB / Office tint/shade
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function applyLum(hex, lumModPct, lumOffPct) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  let [h, s, l] = rgbToHsl(r, g, b);
  l = l * lumModPct + lumOffPct;
  l = Math.max(0, Math.min(1, l));
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return [nr, ng, nb].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
}

console.log('accent5 (#5B9BD5) with lumMod 40% lumOff 60%:', applyLum('5B9BD5', 0.4, 0.6));
console.log('accent5 (#5B9BD5) with lumMod 20% lumOff 80%:', applyLum('5B9BD5', 0.2, 0.8));
console.log('accent4 (#FFC000) with lumMod 60% lumOff 40%:', applyLum('FFC000', 0.6, 0.4));
