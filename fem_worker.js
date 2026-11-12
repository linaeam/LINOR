/* Modèle EF 3D du fémur proximal avec PTH : tiges (Van Cauter, PTH – Choix de l'implant, UCLouvain 2013),
   cotyles, épaisseur de ciment réglable. Fémur de référence ou adapté aux mesures d'une radio de face.
   Voxels géométriques 1 mm, éléments hexaédriques 2 mm, matériaux mixtes homogénéisés (Voigt-Reuss-Hill)
   sur 4×4×4 points par élément. Solveur : gradient conjugué préconditionné (Jacobi), sans assemblage. */
"use strict";
const BOX = { x: [-50, 106], y: [-36, 36], z: [0, 256] };
const HF = 1.0, H = 2.0, NU = 0.3;
const FX = 156, FY = 72, FZ = 256, NX = 78, NY = 36, NZ = 128;
const MAT = { E_STEM: 110000, E_HEAD: 210000, E_CEM: 2400, E_INTF: 50, E_PE: 1000, E_TI: 110000, E_CER: 380000 };
const L_VOID = 0, L_BONE = 1, L_STEM = 2, L_CEM = 3, L_INTF = 4, L_CUP = 5;
const LOADS = { compression: [0, 0, -2500], flexion: [-700, 0, 0], torsion: [0, 500, 0] };
const PROFILES = { normal: [1800, 300, 1.0], osteopenie: [1600, 180, 0.85], osteoporose: [1400, 100, 0.65] };

// ------------------------------------------------------------------ tiges (synthèse Van Cauter 2013)
// fill: remplissante (FPF/SPF), sec: rect | oval, tip: cote de la pointe (mm), ccd: angle cervico-diaphysaire
const STEMS = {
  corail:   { label: "Type Corail / Spotorno", cem: false, code: "SF, SS, FPF, SPF, rect.", fpf: true,  spf: true,  sec: "rect", tip: 70,  ccd: 130, grooves: true, finish: "ha",
              note: "Non cimentée, section quadrangulaire conique en métaphysaire : résiste aux forces axiales et en torsion." },
  wagner:   { label: "Type Wagner Cone",       cem: false, code: "SF, SS, ovale",            fpf: false, spf: false, sec: "oval", tip: 40,  ccd: 130, diaph: true, fins: true, finish: "blast",
              note: "Non cimentée, stabilité métaphysaire et diaphysaire ; compromis si le stock osseux métaphysaire est insuffisant." },
  short:    { label: "Short stem",             cem: false, code: "tige courte métaphysaire", fpf: true,  spf: true,  sec: "oval", tip: 112, ccd: 130, finish: "ha",
              note: "Non cimentée, réservée à un os spongieux de bonne qualité ; ne pardonne pas le mauvais positionnement." },
  charnley: { label: "Type Charnley",          cem: true,  code: "SF, SS, rect.",            fpf: false, spf: false, sec: "rect", tip: 70,  ccd: 125,
              note: "Cimentée, non remplissante de face et de profil, sans collerette ; angle cervico-diaphysaire de 125°." },
  kerboull: { label: "Type Kerboull",          cem: true,  code: "SF, SS, FPF, SPF, ovale",  fpf: true,  spf: true,  sec: "oval", tip: 70,  ccd: 130,
              note: "Cimentée, remplissante dans tous les plans, ovale à la coupe ; angle porté à 130° pour réduire les contraintes varisantes." },
  exeter:   { label: "Type Exeter",            cem: true,  code: "SF, SS, FPF, SPF, rect.",  fpf: true,  spf: true,  sec: "rect", tip: 70,  ccd: 130,
              note: "Cimentée, comme le type Kerboull mais à section rectangulaire." },
  muller:   { label: "Type Müller",            cem: true,  code: "SF, SS, FPF, rect.",       fpf: true,  spf: false, sec: "rect", tip: 70,  ccd: 130, ribs: true,
              note: "Cimentée, droite et conique, nervures antérieures et postérieures qui rendent le manteau de ciment irrégulier." },
  lubinus:  { label: "Type Lubinus SP",        cem: true,  code: "SF, CS, FPF, SPF, ovale, col.", fpf: true, spf: true, sec: "oval", tip: 70, ccd: 130, curve: true, collar: true,
              note: "Cimentée, anatomique (courbe dans le plan sagittal) avec collerette d'appui sur le calcar." },
};
// ------------------------------------------------------------------ cotyles (couches de l'intérieur vers l'extérieur, mm)
const CUPS = {
  // cimentés
  pe_cim:        { label: "PE cimenté", group: "Cimentés", layers: [["PE", 8], ["CEM", 2]], note: "Polyéthylène d'au moins 8 mm, scellé au ciment ; macrostructure externe pour l'accroche du ciment." },
  metalback_cim: { label: "Métal-back cimenté", group: "Cimentés", layers: [["PE", 6], ["TI", 3], ["CEM", 2]], note: "Insert PE dans une coque métallique scellée : deux interfaces de rigidités différentes." },
  ceramique_cim: { label: "Céramique cimentée (historique)", group: "Cimentés", layers: [["CER", 8], ["CEM", 2]], note: "Trop rigide : nombreux descellements, n'est plus commercialisé." },
  // non cimentés
  pressfit:      { label: "Press-fit hémisphérique", group: "Non cimentés", layers: [["PE", 6], ["TI", 3]], note: "Cupule impactée ; stabilité primaire par press-fit, secondaire par ostéo-intégration." },
  pressfit_vis:  { label: "Press-fit avec vis", group: "Non cimentés", layers: [["PE", 6], ["TI", 3]], screws: true, note: "Cupule perforée complétée par des vis pour la stabilité primaire en os de mauvaise qualité." },
  rigide:        { label: "Cupule rigide (débord équatorial)", group: "Non cimentés", layers: [["PE", 6], ["TI", 3]], flare: true, note: "Pas totalement hémisphérique : déborde de 1 à 2 mm à l'équateur pour renforcer le press-fit." },
  elastique:     { label: "Cupule élastique (fendue)", group: "Non cimentés", layers: [["PE", 6], ["TI", 3]], slits: true, note: "Cupule fendue : les ailettes maintiennent une pression sur les parois, l'insert augmente l'expansion." },
  vissee:        { label: "Cotyle vissé", group: "Non cimentés", layers: [["PE", 6], ["TI", 3]], thread: true, note: "Filetage externe : extraction difficile et défects osseux importants à l'ablation." },
  // double mobilité
  dm_pressfit:   { label: "Double mobilité press-fit", group: "Double mobilité", headR: 11.1, layers: [["PE", 10.4], ["TI", 2.5]], dm: true, note: "Tête de 22,2 mm dans un insert PE mobile, qui s'articule lui-même dans une cupule métallique polie." },
  dm_cim:        { label: "Double mobilité cimentée", group: "Double mobilité", headR: 11.1, layers: [["PE", 10.4], ["TI", 2.5], ["CEM", 2]], dm: true, note: "Même principe, cupule métallique scellée au ciment." },
};
const HEAD_R = 14;                    // tête prothétique Ø 28 mm (Ø 22,2 mm en double mobilité)
const CUP_AXIS = [Math.SQRT1_2, 0, Math.SQRT1_2];   // pôle du cotyle (abduction 45°)
const SCREWS = [[0.6, 0.35, 0.7], [0.6, -0.35, 0.7]].map(v => { const n = Math.hypot(...v); return v.map(c => c / n); });

// fémur réel (Visible Human, femme ; BMFToolkit, licence zlib), voxels 1 mm, aligné : diaphyse sur z, tête en +x
const REF = { alpha: 120.6, offset: 47.5, headD: 47.7, shaftD: 31, HC: [47.53, 0, 184.13], HR: 23.87, B: [0, 0, 156], naf: [0.861, 0, 0.509] };
let REALMASK = null;   // Uint8Array FX*FY*FZ, fourni par la page
let SRC = null;
function srcEdges() {
  if (SRC) return SRC;
  const lat = new Float32Array(FZ).fill(NaN), med = new Float32Array(FZ).fill(NaN), yl = new Float32Array(FZ).fill(NaN), yh = new Float32Array(FZ).fill(NaN);
  for (let k = 0; k < FZ; k++) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < FX; i++) for (let j = 0; j < FY; j++) if (REALMASK[(i * FY + j) * FZ + k]) {
      const x = BOX.x[0] + i + 0.5, y = BOX.y[0] + j + 0.5;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 > x0) { lat[k] = x0 - 0.5; med[k] = x1 + 0.5; yl[k] = y0 - 0.5; yh[k] = y1 + 0.5; } }
  SRC = { lat, med, yl, yh }; return SRC;
}
const atZ = (arr, z) => { const k = Math.min(FZ - 1, Math.max(0, Math.round(z - 0.5))); return arr[k]; };
function boneProfile(p) {
  if (p.dxa && p.dxa.f > 0) { const f = Math.min(1.4, Math.max(0.35, p.dxa.f)); return [1800 * Math.sqrt(f), 300 * f, 1.0]; }
  const P = PROFILES;
  if (p.profile !== "auto") return P[p.profile];
  const c = p.cti, lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  if (c >= 0.55) return P.normal;
  if (c >= 0.47) return lerp(P.osteopenie, P.normal, (c - 0.47) / 0.08);
  if (c >= 0.40) return lerp(P.osteoporose, P.osteopenie, (c - 0.40) / 0.07);
  return P.osteoporose;
}
const morgan = hu => 6850 * Math.pow(Math.max(0.05, 0.001 * hu), 1.49);

// ------------------------------------------------------------------ distance chanfrein (3-4-5) dans un masque
function chamfer(mask) {
  const n = mask.length, d = new Float32Array(n);
  for (let q = 0; q < n; q++) d[q] = mask[q] ? 1e9 : 0;
  const off = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const s = Math.abs(a) + Math.abs(b) + Math.abs(c); if (!s) continue;
    off.push([a, b, c, s === 1 ? 1 : s === 2 ? 4 / 3 : 5 / 3]);
  }
  const fwd = off.filter(o => o[0] < 0 || (o[0] === 0 && (o[1] < 0 || (o[1] === 0 && o[2] < 0))));
  const bwd = off.filter(o => !fwd.includes(o));
  for (const [list, rev] of [[fwd, false], [bwd, true]]) {
    for (let ii = 0; ii < FX; ii++) { const i = rev ? FX - 1 - ii : ii;
      for (let jj = 0; jj < FY; jj++) { const j = rev ? FY - 1 - jj : jj;
        for (let kk = 0; kk < FZ; kk++) { const k = rev ? FZ - 1 - kk : kk;
          const q = (i * FY + j) * FZ + k; if (!mask[q]) continue;
          let m = d[q];
          for (const o of list) { const a = i + o[0], b = j + o[1], c = k + o[2];
            if (c < 0) continue;   // la coupe basse du modèle n'est pas une surface osseuse
            if (a < 0 || b < 0 || a >= FX || b >= FY || c >= FZ) { m = Math.min(m, o[3] * 0.5); continue; }
            const v = d[(a * FY + b) * FZ + c] + o[3]; if (v < m) m = v; }
          d[q] = m; } } }
  }
  return d;
}

// ------------------------------------------------------------------ géométrie osseuse (voxels 1 mm)
function smooth01(a, b, t) { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); }
function geometry(p) {
  // déformation du fémur réel pour respecter les mesures : échelle globale, angle et longueur du col, taille de la tête
  const s = p.shaftD / REF.shaftD, O = [0, 0, 150];
  const B = [O[0] + (REF.B[0] - O[0]) * s, 0, O[2] + (REF.B[2] - O[2]) * s];
  const L0 = Math.hypot(REF.HC[0] - REF.B[0], REF.HC[2] - REF.B[2]) * s;
  const a0 = Math.atan2(REF.naf[0], REF.naf[2]);                    // angle du col avec la verticale (rad)
  const a1 = (180 - p.alpha) * Math.PI / 180;
  const L1 = p.offset / Math.sin(a1);
  const dA = a1 - a0, dL = L1 - L0;
  const n1 = [Math.sin(a1), 0, Math.cos(a1)];
  const HC = [B[0] + L1 * n1[0], 0, B[2] + L1 * n1[2]];
  const HR = p.headD / 2, hs = HR / (REF.HR * s);
  const sc = s, tD = Math.max(1.2, (p.shaftD - p.canalD) / 2);
  const [huC, huT, th] = boneProfile(p);
  const n = FX * FY * FZ, bone = new Uint8Array(n);
  const FIT = p.fit || null, SE = FIT ? srcEdges() : null;
  for (let i = 0; i < FX; i++) { const x = BOX.x[0] + i + 0.5;
    for (let j = 0; j < FY; j++) { const y = BOX.y[0] + j + 0.5;
      for (let k = 0; k < FZ; k++) { const z = BOX.z[0] + k + 0.5;
        let qx = x, qy = y, qz = z;
        // 5) ajustement aux contours mesurés sur les radios (face : largeur médio-latérale ; profil : antéro-postérieure)
        if (FIT) {
          const w = 1 - smooth01(148, 166, z);
          if (w > 0) {
            const zs = O[2] + (z - O[2]) / s;
            const tl = atZ(FIT.lat, z), tm = atZ(FIT.med, z);
            if (tl === tl && tm === tm && tm - tl > 8) {
              const pl = atZ(SE.lat, zs) * s, pm = atZ(SE.med, zs) * s;
              if (pl === pl && pm === pm) { const xp = (pl + pm) / 2 + (x - (tl + tm) / 2) * (pm - pl) / (tm - tl); qx = x + w * (xp - x); }
            }
            if (FIT.yl) { const tlo = atZ(FIT.yl, z), thi = atZ(FIT.yh, z);   // y < 0 : antérieur, y > 0 : postérieur
              if (tlo === tlo && thi === thi && thi - tlo > 8) {
                const plo = atZ(SE.yl, zs) * s, phi = atZ(SE.yh, zs) * s;
                if (plo === plo && phi === phi) { const yp = (plo + phi) / 2 + (y - (tlo + thi) / 2) * (phi - plo) / (thi - tlo); qy = y + w * (yp - y); } } }
          }
        }
        // 4) taille de la tête
        const dh = Math.hypot(qx - HC[0], qy - HC[1], qz - HC[2]);
        const wh = 1 - smooth01(HR, HR + 8, dh);
        if (wh > 0) { const f = 1 + (1 / hs - 1) * wh; qx = HC[0] + (qx - HC[0]) * f; qy = HC[1] + (qy - HC[1]) * f; qz = HC[2] + (qz - HC[2]) * f; }
        // 3) longueur du col, 2) angle du col (autour de B, plan frontal)
        let px = qx - B[0], pz = qz - B[2];
        const t1 = px * n1[0] + pz * n1[2];
        const w = smooth01(8, 28, t1) * smooth01(-2, 10, x);
        if (w > 0) {
          px -= dL * w * n1[0]; pz -= dL * w * n1[2];
          const c = Math.cos(-dA * w), sn = Math.sin(-dA * w);
          // rotation inverse de l'angle (sens : ouvrir l'angle relève la tête)
          const rx = px * c + pz * sn, rz = -px * sn + pz * c; px = rx; pz = rz;
        }
        qx = B[0] + px; qz = B[2] + pz;
        // 1) échelle globale autour de O
        qx = O[0] + (qx - O[0]) / s; qy = O[1] + (qy - O[1]) / s; qz = O[2] + (qz - O[2]) / s;
        const ii = Math.floor(qx - BOX.x[0]), jj = Math.floor(qy - BOX.y[0]), kk = Math.max(0, Math.floor(qz - BOX.z[0]));   // diaphyse prolongée vers le bas
        if (ii < 0 || jj < 0 || kk < 0 || ii >= FX || jj >= FY || kk >= FZ) continue;
        if (REALMASK[(ii * FY + jj) * FZ + kk]) bone[(i * FY + j) * FZ + k] = 1;
      } } }
  // la base du modèle reste un tube fermé : on garde la diaphyse jusqu'à z = 0
  const d = chamfer(bone);
  const hu = new Float32Array(n), canal = new Uint8Array(n), cort = new Uint8Array(n), inner = new Uint8Array(n);
  for (let i = 0; i < FX; i++) { const x = BOX.x[0] + i + 0.5;
    for (let j = 0; j < FY; j++) { const y = BOX.y[0] + j + 0.5;
      for (let k = 0; k < FZ; k++) { const z = BOX.z[0] + k + 0.5, q = (i * FY + j) * FZ + k;
        if (!bone[q]) { hu[q] = -900; continue; }
        const dh = Math.sqrt((x - HC[0]) ** 2 + y * y + (z - HC[2]) ** 2), tM = Math.max(1.2, tD / 3);
        let t = z < 110 ? tD : z < 140 ? tD + (tM - tD) * (z - 110) / 30 : tM;
        if (dh < HR + 2) t = Math.max(1.0, tD / 5);
        t *= th;
        if (FIT && FIT.tL && z < 145) {               // épaisseur corticale mesurée sur la radio, selon la direction
          const tl = atZ(FIT.tL, z), tm = atZ(FIT.tM, z);
          if (tl === tl && tm === tm) {
            const r2 = x * x + y * y || 1, cML = x * x / r2;
            let tAP = (tl + tm) / 2;
            if (FIT.tA) { const ta = atZ(FIT.tA, z), tp = atZ(FIT.tP, z); if (ta === ta && tp === tp) tAP = y < 0 ? ta : tp; }   // y < 0 : antérieur
            const tm2 = cML * (x < 0 ? tl : tm) + (1 - cML) * tAP, wz = 1 - smooth01(130, 145, z);
            t = wz * tm2 + (1 - wz) * t;
          }
        }
        if (d[q] - 0.5 <= t) { cort[q] = 1; hu[q] = huC; }
        else { inner[q] = 1; if (z < 112) { canal[q] = 1; hu[q] = 20; } else hu[q] = huT * (1 + 0.6 * Math.exp(-((dh / 30) ** 2))); }
      } } }
  const dIn = chamfer(inner);            // distance à la corticale interne (mm), dans le canal et le spongieux
  return { bone, canal, cort, inner, dIn, hu, HC, HR, sc, huC, huT, th, fitted: !!FIT };
}

// ------------------------------------------------------------------ forme de la tige
function stemShape(S, sc) {
  const top = 172, tip = S.tip, zm = 115;
  return function inside(x, y, z, grow) {   // grow > 0 : enveloppe agrandie (cavité cimentée)
    if (z < tip - grow || z > top + Math.max(0, grow)) return false;
    let a, b, xc = 0, yc = 0;
    if (S.diaph) {                                   // Wagner : cône diaphysaire remplissant, métaphyse étroite
      if (z < zm) { a = b = 99; } else { a = 9 + (z - zm) / 57 * 3; b = 9 + (z - zm) / 57 * 2; }
    } else if (z >= zm) {
      const s = (z - zm) / (top - zm);
      a = (S.fpf ? 8 + 16 * s : 6 + 8 * s) * sc;
      b = S.spf ? 7 + 5 * s : 5 + 2.5 * s;
      xc = 4 * s;
    } else {
      const s = Math.max(0, (z - tip) / (zm - tip));
      a = (S.fpf ? 3.5 + 4.5 * s : 3 + 3 * s) * sc;
      b = S.spf ? 3.5 + 3.5 * s : 3 + 2 * s;
    }
    if (S.curve) yc = -6 * Math.max(0, (z - 120) / 52) ** 2;   // courbure sagittale (anatomique)
    const n = S.sec === "rect" ? 4 : 2;              // rectangulaire à angles arrondis (superellipse) ou ovale
    const ins0 = (aa, bb) => Math.abs((x - xc) / aa) ** n + Math.abs((y - yc) / bb) ** n <= 1;
    const A = a + grow, Bb = b + grow;
    let ins = ins0(A, Bb);
    if (grow <= 0) {
      // reliefs de surface de la tige
      if (!ins && S.fins && z > tip + 8 && z < zm + 20) {          // ailettes longitudinales (type Wagner)
        const th = Math.atan2(y - yc, x - xc); if (Math.cos(8 * th) > 0.88 && ins0(A + 1.4, Bb + 1.4)) ins = true;
      }
      if (!ins && S.ribs && ((z % 8) + 8) % 8 < 2.5 && Math.abs(y - yc) > 0.45 * Bb && ins0(A, Bb + 1.2)) ins = true;   // nervures antéro-postérieures (type Müller)
      if (ins && S.grooves && z > 100 && z < top - 6 && ((z % 4) + 4) % 4 < 1.3 && !ins0(A - 0.9, Bb - 0.9)) ins = false;   // rainures horizontales (type Corail)
    }
    // épaulement latéral arrondi
    if (ins && z > top - 9 && x < xc) { const t = (z - (top - 9)) / (9 + Math.max(0, grow)); if ((x - xc) / A < -Math.sqrt(Math.max(0, 1 - t * t))) ins = false; }
    // pointe arrondie
    const zt = tip - grow;
    if (ins && z < zt + 10 && !S.diaph) { const r = (2.5 + grow) + (z - zt) * 0.45; if ((x - xc) ** 2 + (y - yc) ** 2 > r * r) ins = false; }
    if (ins && z < zt + 6 && S.diaph) { const r = (4 + grow) + (z - zt) * 0.8; if (x * x + y * y > r * r) ins = false; }
    return ins;
  };
}

// ------------------------------------------------------------------ modèle éléments (homogénéisation 4×4×4)
function makeClassifier(p, G, implant) {
  const S = implant ? STEMS[p.stem] : null, cem = implant && S.cem, tc = cem ? p.cement : 0;
  const inside = implant ? stemShape(S, G.sc) : null;
  // tête prothétique au centre de la tête anatomique (centre de rotation restauré), col depuis l'épaulement de la tige
  const A0 = [4, 0, 168], HCp = G.HC;
  const bd = [HCp[0] - A0[0], 0, HCp[2] - A0[2]], BL = Math.hypot(...bd); bd[0] /= BL; bd[2] /= BL;
  const cup = implant ? CUPS[p.cup] : null;
  const cupR = [], cupE = [], cupM = [];
  const headR = cup && cup.headR ? cup.headR : HEAD_R;
  if (cup) { let r = headR; for (const [m, t] of cup.layers) { r += t; cupR.push(r); cupM.push(m);
    cupE.push(m === "PE" ? MAT.E_PE : m === "TI" ? MAT.E_TI : m === "CER" ? MAT.E_CER : MAT.E_CEM); } }
  const n40 = [Math.sin(40 * Math.PI / 180), Math.cos(40 * Math.PI / 180)];
  const fi = (S && !S.cem && p.iface === "faible");
  const out = { E: 0, sub: 0 };   // sub : 0 os, 1 tige, 2 tête, 3 ciment, 4 interface, 5 PE, 6 métal cotyle, 7 céramique, 8 ciment cotyle
  function classify(x, y, z) {
    const q = (Math.floor(x - BOX.x[0]) * FY + Math.floor(y - BOX.y[0])) * FZ + Math.floor(z - BOX.z[0]);
    if (!implant) { if (G.bone[q] && !G.canal[q]) { out.E = morgan(G.hu[q]); out.sub = 0; return 1; } return 0; }
    const px = x - A0[0], py = y, pz = z - A0[2];
    const t = Math.min(BL, Math.max(0, px * bd[0] + pz * bd[2]));
    const rx = px - t * bd[0], rz = pz - t * bd[2];
    const dH = Math.hypot(x - HCp[0], y - HCp[1], z - HCp[2]);
    const rn = 7.2 - 1.8 * t / BL;   // col conique jusqu'au cône morse
    if (rx * rx + py * py + rz * rz <= rn * rn && t < BL - 2) { out.E = MAT.E_STEM; out.sub = 11; return 2; }
    if (dH <= headR) { out.E = MAT.E_HEAD; out.sub = 2; return 2; }
    if (cup) {
      const ux = (x - HCp[0]) / (dH || 1), uy = (y - HCp[1]) / (dH || 1), uz = (z - HCp[2]) / (dH || 1);
      const cosP = ux * CUP_AXIS[0] + uz * CUP_AXIS[2];          // cosinus de l'angle au pôle
      let rOut = cupR[cupR.length - 1], minCos = 0;
      if (cup.flare && cosP < 0.25) rOut += 1.5 * (1 - cosP / 0.25);   // débord équatorial
      if (cup.thread) { const ang = Math.acos(Math.min(1, Math.max(-1, cosP))); if (Math.sin(ang * 22) > 0.2) rOut += 1.4; }   // filetage
      if (dH <= rOut && cosP >= minCos) {
        let li = 0; while (li < cupR.length - 1 && dH > cupR[li]) li++;
        if (dH > cupR[cupR.length - 1]) li = cupR.length - 1;
        if (cup.slits && cupM[li] === "TI") {                      // fentes de la cupule élastique
          const ex = [-CUP_AXIS[2], 0, CUP_AXIS[0]], ph = Math.atan2(uy, ux * ex[0] + uz * ex[2]);
          if (cosP < 0.55 && Math.abs(Math.sin(ph * 3)) < 0.09) return 0;
        }
        out.E = cupE[li]; out.sub = { PE: 5, TI: 6, CER: 7, CEM: 8 }[cupM[li]];
        if (cup.dm && cupM[li] === "PE") out.sub = 12;             // insert mobile de double mobilité
        return 5;
      }
      if (cup.screws) {                                            // deux vis dans le toit du cotyle
        for (const sd of SCREWS) {
          const px2 = x - HCp[0], py2 = y - HCp[1], pz2 = z - HCp[2], t = px2 * sd[0] + py2 * sd[1] + pz2 * sd[2];
          if (t > rOut - 2 && t < rOut + 14) { const qx2 = px2 - t * sd[0], qy2 = py2 - t * sd[1], qz2 = pz2 - t * sd[2];
            const rr = (t < rOut + 2 ? 3.6 : 2.3 + 0.5 * (Math.sin(t * 2.4) > 0)); if (qx2 * qx2 + qy2 * qy2 + qz2 * qz2 <= rr * rr) { out.E = MAT.E_TI; out.sub = 13; return 5; } }
        }
      }
    }
    const inOk = G.inner[q] === 1, dIn = G.dIn[q] - 0.5;
    const shrink = fi ? 1.0 : 0;            // non intégrée : couche fibreuse de 1 mm dans la cavité
    const isStem = inside(x, y, z, -shrink) && (inOk ? dIn >= tc + shrink : false);
    const isCav = cem ? inside(x, y, z, tc) && inOk : inside(x, y, z, 0) && inOk;
    if (isStem) { out.E = MAT.E_STEM; out.sub = 1; return 2; }
    if (isCav && cem) { out.E = MAT.E_CEM; out.sub = 3; return 3; }
    if (isCav && fi) { out.E = MAT.E_INTF; out.sub = 4; return 4; }
    const cut = (x - 6) * n40[0] + (z - 160) * n40[1], keep = !(cut > 0 && x > -4);
    if (S.collar && !keep && cut <= 2.5 && x > 2 && x < 20 && Math.abs(y) < 11) { out.E = MAT.E_STEM; out.sub = 1; return 2; }
    if (G.bone[q] && !G.canal[q] && keep) { out.E = morgan(G.hu[q]); out.sub = 0; return 1; }
    return 0;
  }
  return { classify, out, HCp, cupR, S };
}
// volume d'étiquettes à 1 mm pour l'affichage réaliste :
// 0 vide, 1 os spongieux, 9 os cortical, 2 tige, 10 tête, 3 ciment, 4 interface, 5 PE, 6 métal cotyle, 7 céramique, 8 ciment cotyle
function labels1mm(p, G, implant) {
  const C = makeClassifier(p, G, implant), L = new Uint8Array(FX * FY * FZ);
  for (let i = 0; i < FX; i++) for (let j = 0; j < FY; j++) for (let k = 0; k < FZ; k++) {
    const kind = C.classify(BOX.x[0] + i + 0.5, BOX.y[0] + j + 0.5, BOX.z[0] + k + 0.5);
    if (!kind) continue;
    const q = (i * FY + j) * FZ + k, sub = C.out.sub;
    L[q] = kind === 1 ? (G.cort[q] ? 9 : 1) : sub === 2 ? 10 : sub === 1 ? 2 : sub;
  }
  return L;
}
// volume fin (0,5 mm) des implants et du ciment, pour un rendu net ; même classification que le calcul
function implantFine(p, G, L1) {
  const C = makeClassifier(p, G, true), IMP = new Uint8Array(256); [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13].forEach(v => IMP[v] = 1);
  let i0 = FX, i1 = -1, j0 = FY, j1 = -1, k0 = FZ, k1 = -1;
  for (let i = 0; i < FX; i++) for (let j = 0; j < FY; j++) for (let k = 0; k < FZ; k++) if (IMP[L1[(i * FY + j) * FZ + k]]) {
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k; }
  if (i1 < 0) return null;
  i0 = Math.max(0, i0 - 2); j0 = Math.max(0, j0 - 2); k0 = Math.max(0, k0 - 2); i1 = Math.min(FX - 1, i1 + 2); j1 = Math.min(FY - 1, j1 + 2); k1 = Math.min(FZ - 1, k1 + 2);
  const nx = (i1 - i0 + 1) * 2, ny = (j1 - j0 + 1) * 2, nz = (k1 - k0 + 1) * 2, vol = new Uint8Array(nx * ny * nz);
  const near = (i, j, k) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const ii = i + a, jj = j + b, kk = k + c; if (ii < 0 || jj < 0 || kk < 0 || ii >= FX || jj >= FY || kk >= FZ) continue;
    if (IMP[L1[(ii * FY + jj) * FZ + kk]]) return true; } return false; };
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
    if (!near(i, j, k)) continue;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
      const x = BOX.x[0] + i + 0.25 + 0.5 * a, y = BOX.y[0] + j + 0.25 + 0.5 * b, z = BOX.z[0] + k + 0.25 + 0.5 * c;
      const kind = C.classify(x, y, z); if (kind < 2) continue;
      const sub = C.out.sub, code = sub === 2 ? 10 : sub === 1 ? 2 : sub;
      vol[(((i - i0) * 2 + a) * ny + (j - j0) * 2 + b) * nz + (k - k0) * 2 + c] = code;
    }
  }
  return { vol, dims: [nx, ny, nz], origin: [BOX.x[0] + i0, BOX.y[0] + j0, BOX.z[0] + k0], h: 0.5 };
}
function buildModel(p, G, implant) {
  const ne = NX * NY * NZ, Eel = new Float32Array(ne), lab = new Uint8Array(ne);
  const fCem = new Float32Array(ne), fBone = new Float32Array(ne), Ebone = new Float32Array(ne), fImp = new Float32Array(ne);
  const CL = makeClassifier(p, G, implant), S = CL.S, HCp = CL.HCp, cupR = CL.cupR, out = CL.out;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) {
    const e = (i * NY + j) * NZ + k;
    let sV = 0, sR = 0, nC = 0, nB = 0, nI = 0, nSt = 0, nCup = 0, sEb = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
      const kind = CL.classify(BOX.x[0] + i * H + (a + 0.5) * 0.5, BOX.y[0] + j * H + (b + 0.5) * 0.5, BOX.z[0] + k * H + (c + 0.5) * 0.5);
      if (!kind) continue;
      const E = out.E; sV += E; sR += 1 / E;
      if (kind === 1) { nB++; sEb += E; } else if (kind === 2) nSt++; else if (kind === 3) nC++; else if (kind === 4) nI++; else if (kind === 5) nCup++;
    }
    const nSol = nB + nSt + nC + nI + nCup;
    if (nSol < 32) continue;
    Eel[e] = 0.5 * (sV / nSol + nSol / sR);
    fCem[e] = nC / 64; fBone[e] = nB / 64; Ebone[e] = nB ? sEb / nB : 0; fImp[e] = (nSt + nC + nI) / 64;
    lab[e] = nSt >= 32 ? L_STEM : nCup >= 32 ? L_CUP : nC >= 13 ? L_CEM : nI >= 13 ? L_INTF : nB >= nSt + nCup ? L_BONE : (nCup > nSt ? L_CUP : L_STEM);
  }
  // plus grande composante connexe
  const comp = new Int32Array(ne).fill(-1); let best = -1, bestN = 0, cur = 0; const st = [];
  const nb6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (let s = 0; s < ne; s++) if (lab[s] && comp[s] < 0) {
    let cnt = 0; st.push(s); comp[s] = cur;
    while (st.length) { const e = st.pop(); cnt++;
      const k = e % NZ, j = ((e - k) / NZ) % NY, i = Math.floor(e / (NY * NZ));
      for (const D of nb6) { const a = i + D[0], b = j + D[1], c = k + D[2];
        if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ) continue;
        const q = (a * NY + b) * NZ + c; if (lab[q] && comp[q] < 0) { comp[q] = cur; st.push(q); } } }
    if (cnt > bestN) { bestN = cnt; best = cur; } cur++;
  }
  for (let e = 0; e < ne; e++) if (lab[e] && comp[e] !== best) { lab[e] = 0; Eel[e] = 0; }
  const cupOut = cupR.length ? cupR[cupR.length - 1] : 0;
  return { lab, E: Eel, fCem, fBone, Ebone, fImp, HC: HCp, cupOut, tip: S ? S.tip : 0 };
}

// ------------------------------------------------------------------ élément hexaédrique et solveur
const NAT = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
function Bat(xi) {
  const B = Array.from({ length: 6 }, () => new Float64Array(24));
  for (let a = 0; a < 8; a++) { const s = NAT[a], f = [0, 1, 2].map(k => 1 + s[k] * xi[k]);
    const dx = 0.125 * s[0] * f[1] * f[2] * 2 / H, dy = 0.125 * s[1] * f[0] * f[2] * 2 / H, dz = 0.125 * s[2] * f[0] * f[1] * 2 / H;
    B[0][3*a] = dx; B[1][3*a+1] = dy; B[2][3*a+2] = dz; B[3][3*a] = dy; B[3][3*a+1] = dx;
    B[4][3*a+1] = dz; B[4][3*a+2] = dy; B[5][3*a] = dz; B[5][3*a+2] = dx; }
  return B;
}
const lam = NU / ((1 + NU) * (1 - 2 * NU)), mu = 1 / (2 * (1 + NU));
const D1 = [[lam+2*mu,lam,lam,0,0,0],[lam,lam+2*mu,lam,0,0,0],[lam,lam,lam+2*mu,0,0,0],[0,0,0,mu,0,0],[0,0,0,0,mu,0],[0,0,0,0,0,mu]];
const KE = new Float64Array(576);
{ const g = 1 / Math.sqrt(3);
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    const B = Bat([a * g, b * g, c * g]), w = (H / 2) ** 3;
    const DB = D1.map(row => { const r = new Float64Array(24); for (let q = 0; q < 24; q++) { let s = 0; for (let m = 0; m < 6; m++) s += row[m] * B[m][q]; r[q] = s; } return r; });
    for (let r = 0; r < 24; r++) for (let q = 0; q < 24; q++) { let s = 0; for (let m = 0; m < 6; m++) s += B[m][r] * DB[m][q]; KE[r * 24 + q] += s * w; }
  } }
const B0 = Bat([0, 0, 0]);

function solve(M, F3, capFn, progress) {
  const ne = NX * NY * NZ, MY = NY + 1, MZ = NZ + 1;
  const act = []; for (let e = 0; e < ne; e++) if (M.lab[e]) act.push(e);
  const nE = act.length, nodeId = new Int32Array((NX + 1) * MY * MZ).fill(-1), conn = new Int32Array(nE * 8); let nn = 0;
  for (let t = 0; t < nE; t++) { const e = act[t], k = e % NZ, j = ((e - k) / NZ) % NY, i = Math.floor(e / (NY * NZ));
    const g = [[i,j,k],[i+1,j,k],[i+1,j+1,k],[i,j+1,k],[i,j,k+1],[i+1,j,k+1],[i+1,j+1,k+1],[i,j+1,k+1]];
    for (let a = 0; a < 8; a++) { const gid = (g[a][0] * MY + g[a][1]) * MZ + g[a][2]; if (nodeId[gid] < 0) nodeId[gid] = nn++; conn[t*8+a] = nodeId[gid]; } }
  const nd = 3 * nn, coord = new Float32Array(nn * 3);
  for (let gid = 0; gid < nodeId.length; gid++) if (nodeId[gid] >= 0) {
    const c = gid % MZ, b = ((gid - c) / MZ) % MY, a = Math.floor(gid / (MY * MZ)), id = nodeId[gid];
    coord[3*id] = BOX.x[0] + a * H; coord[3*id+1] = BOX.y[0] + b * H; coord[3*id+2] = BOX.z[0] + c * H; }
  const Ea = new Float64Array(nE); for (let t = 0; t < nE; t++) Ea[t] = M.E[act[t]];
  const fixed = new Uint8Array(nd), F = new Float64Array(nd); let cap = [];
  for (let id = 0; id < nn; id++) { const x = coord[3*id], y = coord[3*id+1], z = coord[3*id+2];
    if (z < BOX.z[0] + 1e-6) fixed[3*id] = fixed[3*id+1] = fixed[3*id+2] = 1;
    if (capFn(x, y, z)) cap.push(id); }
  for (const id of cap) for (let d = 0; d < 3; d++) F[3*id+d] = F3[d] / cap.length;
  const DOF = new Int32Array(nE * 24), diag = new Float64Array(nd);
  for (let t = 0; t < nE; t++) for (let a = 0; a < 8; a++) for (let d = 0; d < 3; d++) {
    const r = 3*a+d; DOF[t*24+r] = 3*conn[t*8+a]+d; diag[DOF[t*24+r]] += Ea[t] * KE[r*24+r]; }
  const ue = new Float64Array(24);
  function Kx(x, y) { y.fill(0);
    for (let t = 0; t < nE; t++) { const b = t * 24, s = Ea[t];
      for (let r = 0; r < 24; r++) ue[r] = x[DOF[b + r]];
      for (let r = 0; r < 24; r++) { let acc = 0; const o = r * 24; for (let q = 0; q < 24; q++) acc += KE[o+q] * ue[q]; y[DOF[b + r]] += s * acc; } }
    for (let i = 0; i < nd; i++) if (fixed[i]) y[i] = x[i]; }
  for (let i = 0; i < nd; i++) if (fixed[i]) { F[i] = 0; diag[i] = 1; }
  const x = new Float64Array(nd), r = Float64Array.from(F), z = new Float64Array(nd), pv = new Float64Array(nd), Ap = new Float64Array(nd);
  for (let i = 0; i < nd; i++) { z[i] = r[i] / diag[i]; pv[i] = z[i]; }
  let rz = 0, bn = 0; for (let i = 0; i < nd; i++) { rz += r[i] * z[i]; bn += F[i] * F[i]; } bn = Math.sqrt(bn);
  let it = 0;
  for (; it < 8000; it++) {
    Kx(pv, Ap); let pAp = 0; for (let i = 0; i < nd; i++) pAp += pv[i] * Ap[i];
    const al = rz / pAp; let rn = 0;
    for (let i = 0; i < nd; i++) { x[i] += al * pv[i]; r[i] -= al * Ap[i]; rn += r[i] * r[i]; }
    if (Math.sqrt(rn) / bn < 1e-4) break;
    let rz2 = 0; for (let i = 0; i < nd; i++) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
    const be = rz2 / rz; rz = rz2; for (let i = 0; i < nd; i++) pv[i] = z[i] + be * pv[i];
    if (it % 50 === 0) progress(it);
  }
  const vm = new Float32Array(ne), eps = new Float64Array(6), sg = new Float64Array(6);
  for (let t = 0; t < nE; t++) {
    for (let r = 0; r < 24; r++) ue[r] = x[DOF[t*24+r]];
    for (let m = 0; m < 6; m++) { let s = 0; for (let q = 0; q < 24; q++) s += B0[m][q] * ue[q]; eps[m] = s; }
    for (let m = 0; m < 6; m++) { let s = 0; for (let q = 0; q < 6; q++) s += D1[m][q] * eps[q]; sg[m] = s * Ea[t]; }
    vm[act[t]] = Math.sqrt(0.5 * ((sg[0]-sg[1])**2 + (sg[1]-sg[2])**2 + (sg[2]-sg[0])**2) + 3 * (sg[3]**2 + sg[4]**2 + sg[5]**2));
  }
  return { vm, iters: it, nE, nCap: cap.length };
}

const pct = (arr, q) => { if (!arr.length) return NaN; const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

const CACHE = { gkey: null, G: null, ikey: null, I: null };
function loadVec(load) { return load === "combinee" ? [0, 1, 2].map(d => LOADS.compression[d] + LOADS.flexion[d] + LOADS.torsion[d]) : LOADS[load]; }

function images(G, MI) {
  const ct = Uint8Array.from(G.hu, h => Math.max(0, Math.min(255, Math.round((h + 1000) / 3200 * 255))));
  const seg = Uint8Array.from(G.bone, (b, i) => b && !G.canal[i] ? 1 : 0);
  const Eq = Uint8Array.from(MI.E, e => e > 0 ? Math.round(255 * Math.log10(Math.max(1, e)) / 5) : 0);
  return { ct, seg, Eq };
}
function run(p, post) {
  const t0 = Date.now();
  if (p.mode === "init") { REALMASK = p.mask; return; }
  if (p.mode === "labels") {
    const gk = JSON.stringify([p.alpha, p.offset, p.headD, p.shaftD, p.canalD, p.cti, p.profile, p.fitKey || "", p.dxa ? p.dxa.f : 0]);
    if (CACHE.gkey !== gk) { CACHE.G = geometry(p); CACHE.gkey = gk; }
    const L1P = labels1mm(p, CACHE.G, true);
    post({ type: "labels", L1I: labels1mm(p, CACHE.G, false), L1P, FINE: implantFine(p, CACHE.G, L1P), HC: CACHE.G.HC });
    return;
  }
  if (p.mode === "geom") {
    const gk = JSON.stringify([p.alpha, p.offset, p.headD, p.shaftD, p.canalD, p.cti, p.profile, p.fitKey || "", p.dxa ? p.dxa.f : 0]);
    if (CACHE.gkey !== gk) { CACHE.G = geometry(p); CACHE.gkey = gk; }
    const im = images(CACHE.G, buildModel(p, CACHE.G, false));
    post({ type: "geom", ...im, info: { huC: CACHE.G.huC, huT: CACHE.G.huT } });
    return;
  }
  const gkey = JSON.stringify([p.alpha, p.offset, p.headD, p.shaftD, p.canalD, p.cti, p.profile, p.fitKey || "", p.dxa ? p.dxa.f : 0]);
  let G = CACHE.gkey === gkey ? CACHE.G : null;
  if (!G) { post({ type: "progress", step: "Géométrie du fémur (voxels 1 mm)", frac: 0.02 }); G = geometry(p); CACHE.gkey = gkey; CACHE.G = G; }
  const F3 = loadVec(p.load);
  const ikey = gkey + p.load;
  let I = CACHE.ikey === ikey ? CACHE.I : null;
  if (!I) {
    post({ type: "progress", step: "Maillage du fémur intact", frac: 0.05 });
    const MI = buildModel(p, G, false);
    const hc = G.HC, hr = G.HR;
    const sI = solve(MI, F3, (x, y, z) => Math.hypot(x - hc[0], y - hc[1], z - hc[2]) <= hr + 2 && z >= hc[2] + 0.45 * hr,
      it => post({ type: "progress", step: `Calcul du fémur intact (itération ${it})`, frac: 0.08 + 0.42 * Math.min(1, it / 2200) }));
    I = { M: MI, s: sI }; CACHE.ikey = ikey; CACHE.I = I;
  }
  post({ type: "progress", step: "Maillage du fémur implanté (tige, ciment, cotyle)", frac: 0.5 });
  const MP = buildModel(p, G, true);
  const hp = MP.HC, ro = MP.cupOut;
  const capFn = (x, y, z) => { const dx = x - hp[0], dy = y, dz = z - hp[2], d = Math.hypot(dx, dy, dz);
    return d >= ro - 2.5 && d <= ro + 1.5 && (dx * CUP_AXIS[0] + dz * CUP_AXIS[2]) >= 0.75 * d; };
  const sP = solve(MP, F3, capFn, it => post({ type: "progress", step: `Calcul du fémur implanté (itération ${it})`, frac: 0.52 + 0.46 * Math.min(1, it / 2400) }));
  const metrics = computeMetrics(I.M, I.s.vm, MP, sP.vm, p);
  const im = p.images ? images(G, I.M) : {};
  if (p.images) { im.L1I = labels1mm(p, G, false); im.L1P = labels1mm(p, G, true); im.FINE = implantFine(p, G, im.L1P); }
  post({ type: "done", ...im, labI: I.M.lab, vmI: I.s.vm, labP: MP.lab, vmP: sP.vm, metrics, HCi: G.HC, HCp: MP.HC, F3,
         info: { huC: G.huC, huT: G.huT, th: G.th, iters: [I.s.iters, sP.iters], nE: [I.s.nE, sP.nE], nCap: sP.nCap, secs: (Date.now() - t0) / 1000 } });
}

function computeMetrics(MI, vmI, MP, vmP, p) {
  const ne = NX * NY * NZ, prox = [], proxI = [], dist = [], distI = [], band = [], cem = [];
  const tip = MP.tip;
  for (let e = 0; e < ne; e++) {
    const k = e % NZ, z = BOX.z[0] + (k + 0.5) * H, j = ((e - k) / NZ) % NY, i = Math.floor(e / (NY * NZ));
    const both = MI.lab[e] === L_BONE && MP.lab[e] === L_BONE && MP.fBone[e] > 0.95;
    if (both && z >= 120 && z <= 165) { prox.push(vmP[e]); proxI.push(vmI[e]); }
    if (both && z >= tip - 16 && z <= tip + 20) { dist.push(vmP[e]); distI.push(vmI[e]); }
    if (!MP.lab[e] || MP.lab[e] === L_CUP) continue;
    const Eel = MP.E[e];
    if (MP.fCem[e] >= 0.1 && z < 175) cem.push(vmP[e] * 2400 / Eel);          // contrainte dans le ciment (iso-déformation)
    if (MP.fBone[e] >= 0.25 && z < 175) {
      let touch = MP.fImp[e] > 0;
      if (!touch) for (const D of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const a = i + D[0], b = j + D[1], c = k + D[2];
        if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ) continue;
        const q = (a * NY + b) * NZ + c; if (MP.lab[q] >= L_STEM && MP.lab[q] <= L_INTF) { touch = true; break; } }
      if (touch) band.push(vmP[e] * MP.Ebone[e] / Eel);
    }
  }
  return { ss: 100 * (1 - mean(prox) / mean(proxI)), dist: pct(dist, 0.99) / pct(distI, 0.99), dist_abs: pct(dist, 0.99),
           itf: pct(band, 0.99), cem: cem.length ? pct(cem, 0.99) : null };
}

if (typeof module === "undefined" && typeof self !== "undefined") {
  self.onmessage = ev => { try { run(ev.data, m => self.postMessage(m)); } catch (err) { self.postMessage({ type: "error", message: String(err && err.stack || err) }); } };
}
if (typeof module !== "undefined") module.exports = { srcEdges, run, geometry, buildModel, labels1mm, implantFine, setMask: m => { REALMASK = m; }, STEMS, CUPS, NX, NY, NZ, FX, FY, FZ, morgan, boneProfile };
