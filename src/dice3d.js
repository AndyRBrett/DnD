// 3D dice drawn on a <canvas>: real polyhedra (d4 tetrahedron, d6 cube, d8
// octahedron, d10 pentagonal trapezohedron, d12 dodecahedron, d20
// icosahedron), lit per face, numbered on every face. A roll tumbles the die
// and settles it with the rolled number facing the viewer. No libraries.

const PHI = (1 + Math.sqrt(5)) / 2;

// ── Small 3×3 matrix helpers (row-major) ──
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => scale(a, 1 / Math.hypot(...a));
const apply = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const multiply = (a, b) => a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
function axisAngle([x, y, z], angle) {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c]
  ];
}

// ── Geometry ──
function vertices(kind) {
  if (kind === 4) return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  if (kind === 8) return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  if (kind === 10) {
    const a = 0.105, h = a * (5 + 2 * Math.sqrt(5)); // keeps each kite flat
    const ring = (offset, z) => Array.from({ length: 5 }, (_, k) => {
      const angle = (k * 72 + offset) * Math.PI / 180;
      return [Math.cos(angle), Math.sin(angle), z];
    });
    return [[0, 0, h], [0, 0, -h], ...ring(0, a), ...ring(36, -a)];
  }
  if (kind === 12) {
    const list = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) list.push([x, y, z]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      list.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
    }
    return list;
  }
  if (kind === 20) {
    const list = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) list.push([0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b]);
    return list;
  }
  const list = []; // cube
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) list.push([x, y, z]);
  return list;
}

// Faces of the convex hull: every plane through three vertices that has all
// the others on one side, with its vertices in order around the face.
function hull(points) {
  const faces = new Map();
  const n = points.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let normal = cross(sub(points[j], points[i]), sub(points[k], points[i]));
    if (Math.hypot(...normal) < 1e-9) continue;
    normal = norm(normal);
    const d = dot(normal, points[i]);
    let above = false, below = false;
    const on = [];
    points.forEach((point, index) => {
      const side = dot(normal, point) - d;
      if (side > 1e-6) above = true;
      else if (side < -1e-6) below = true;
      else on.push(index);
    });
    if (above && below) continue;
    if (above) normal = scale(normal, -1);
    const key = on.join(",");
    if (faces.has(key)) continue;
    const center = scale(on.reduce((sum, index) => add(sum, points[index]), [0, 0, 0]), 1 / on.length);
    const u = norm(sub(points[on[0]], center));
    const w = cross(normal, u);
    const ordered = [...on].sort((a, b) => {
      const pa = sub(points[a], center), pb = sub(points[b], center);
      return Math.atan2(dot(w, pa), dot(u, pa)) - Math.atan2(dot(w, pb), dot(u, pb));
    });
    faces.set(key, { indices: ordered, normal, center });
  }
  return [...faces.values()];
}

const SOLIDS = new Map();
function solid(kind) {
  if (SOLIDS.has(kind)) return SOLIDS.get(kind);
  const raw = vertices(kind);
  const radius = Math.max(...raw.map(point => Math.hypot(...point)));
  const points = raw.map(point => scale(point, 1 / radius));
  const faces = hull(points);
  for (const face of faces) {
    // Text "up" points at the corner farthest from the centre (the tip of a
    // d10 kite), and its size fits the face.
    let far = face.indices[0], best = -1;
    for (const index of face.indices) {
      const distance = Math.hypot(...sub(points[index], face.center));
      if (distance > best + 1e-6) { best = distance; far = index; }
    }
    const towards = sub(points[far], face.center);
    face.up = norm(sub(towards, scale(face.normal, dot(towards, face.normal))));
    const edges = face.indices.map((index, at) => scale(add(points[index], points[face.indices[(at + 1) % face.indices.length]]), 0.5));
    face.size = Math.min(...edges.map(mid => Math.hypot(...sub(mid, face.center))));
  }
  // Number opposite faces so they add up to n + 1, like real dice.
  const order = new Array(faces.length).fill(null);
  let next = 0;
  for (let i = 0; i < faces.length; i++) {
    if (order[i] !== null) continue;
    order[i] = next;
    const opposite = faces.findIndex((face, j) => order[j] === null && dot(face.normal, faces[i].normal) < -0.999);
    if (opposite >= 0) order[opposite] = faces.length - 1 - next;
    next += 1;
  }
  faces.forEach((face, i) => { face.slot = order[i]; });
  const built = { points, faces };
  SOLIDS.set(kind, built);
  return built;
}

// Kinds: 4, 6, 8, 10, 12, 20, "tens" (00–90) and "units" (0–9) for a d100;
// anything else is drawn as a cube showing the rolled number.
function setup(sides) {
  if (sides === "tens") return { kind: 10, labels: Array.from({ length: 10 }, (_, i) => String(i * 10).padStart(2, "0")) };
  if (sides === "units") return { kind: 10, labels: Array.from({ length: 10 }, (_, i) => String(i)) };
  const kind = [4, 6, 8, 10, 12, 20].includes(sides) ? sides : 6;
  const count = kind === 6 && sides !== 6 ? 6 : kind;
  return { kind, labels: Array.from({ length: count }, (_, i) => String(i + 1)), custom: kind !== sides };
}

// How a d100 roll splits into its two dice.
export function percentileLabels(value) {
  const rest = value % 100;
  return { tens: String(Math.floor(rest / 10) * 10).padStart(2, "0"), units: String(rest % 10) };
}

const PALETTES = {
  red: { body: [196, 36, 44], text: [255, 255, 255] },
  gold: { body: [214, 176, 72], text: [40, 26, 0] },
  dark: { body: [58, 18, 22], text: [255, 96, 96] },
  grey: { body: [86, 90, 100], text: [225, 228, 235] },
  idle: { body: [70, 30, 36], text: [255, 255, 255] }
};
const LIGHT = norm([-0.3, 0.42, 1]);
const HALF = norm(add(LIGHT, [0, 0, 1]));
const CAMERA = 5;

// The resting orientation that shows `faceIndex` to the viewer, tipped a
// little so the die reads as a solid rather than a flat shape.
function restingRotation(face, tilt, lean = 1) {
  const right = cross(face.up, face.normal);
  const toView = [right, face.up, face.normal];
  const tip = multiply(axisAngle([1, 0, 0], -0.3 * lean), multiply(axisAngle([0, 1, 0], 0.2 * lean), axisAngle([0, 0, 1], tilt)));
  return multiply(tip, toView);
}

export function createDie(sides, size = 78) {
  const { kind, labels, custom } = setup(sides);
  const { points, faces } = solid(kind);
  const canvas = document.createElement("canvas");
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  const tall = Math.round(size * 1.3); // headroom for the bounce
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(tall * ratio);
  canvas.style.width = size + "px";
  canvas.style.height = tall + "px";
  const context = canvas.getContext("2d");
  let palette = PALETTES.idle;
  let faceLabels = labels;

  function draw(rotation, lift = 0, slide = 0) {
    const ctx = context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size, tall);
    const unit = size * 0.34;
    const cx = size / 2 + slide, cy = tall - size * 0.53;
    // Shadow on the "table".
    const height = Math.min(1, lift / (size * 0.4));
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - height * 0.7);
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(size / 2 + slide * 0.6, cy + unit * 1.02, unit * (0.95 - height * 0.35), unit * 0.2, 0, 0, Math.PI * 2);
    ctx.filter = "blur(3px)";
    ctx.fill();
    ctx.restore();

    const view = points.map(point => apply(rotation, point));
    const project = ([x, y, z]) => {
      const f = CAMERA / (CAMERA - z);
      return [cx + x * unit * f, cy - y * unit * f - lift];
    };
    const screen = view.map(project);
    const visible = faces.map((face, index) => {
      const normal = apply(rotation, face.normal);
      const center = apply(rotation, face.center);
      return { face, index, normal, center };
    }).filter(({ normal, center }) => dot(normal, sub([0, 0, CAMERA], center)) > 0)
      .sort((a, b) => a.center[2] - b.center[2]);

    for (const { face, normal, center } of visible) {
      const diffuse = Math.max(0, dot(normal, LIGHT));
      const shine = Math.pow(Math.max(0, dot(normal, HALF)), 28);
      const shade = palette.body.map(channel => Math.min(255, Math.round(channel * (0.3 + 0.85 * diffuse) + 255 * 0.42 * shine)));
      ctx.beginPath();
      face.indices.forEach((index, at) => at ? ctx.lineTo(...screen[index]) : ctx.moveTo(...screen[index]));
      ctx.closePath();
      ctx.fillStyle = "rgb(" + shade.join(",") + ")";
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = "rgba(0,0,0,.38)";
      ctx.stroke();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(255,255,255," + (0.08 + 0.25 * diffuse).toFixed(2) + ")";
      ctx.stroke();

      // The number, painted onto the face plane.
      const label = faceLabels[face.slot % faceLabels.length];
      const facing = Math.max(0, Math.min(1, (normal[2] - 0.08) * 1.7));
      if (!label || facing <= 0) continue;
      const step = 0.01;
      const origin = project(center);
      const right = apply(rotation, cross(face.up, face.normal));
      const down = scale(apply(rotation, face.up), -1);
      const across = project(add(center, scale(right, step)));
      const below = project(add(center, scale(down, step)));
      ctx.save();
      ctx.setTransform(
        ratio * (across[0] - origin[0]), ratio * (across[1] - origin[1]),
        ratio * (below[0] - origin[0]), ratio * (below[1] - origin[1]),
        ratio * origin[0], ratio * origin[1]
      );
      const fontSize = face.size * 100 * (label.length > 1 ? 0.78 : 1) * (kind === 4 ? 0.85 : kind === 20 ? 1.25 : 1.05);
      ctx.font = "700 " + fontSize.toFixed(1) + "px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = facing;
      ctx.fillStyle = "rgb(" + palette.text.join(",") + ")";
      const offset = kind === 10 ? fontSize * 0.12 : 0;
      ctx.fillText(label, 0, offset);
      if ((label === "6" || label === "9") && kind > 6) {
        ctx.fillRect(-fontSize * 0.22, offset + fontSize * 0.42, fontSize * 0.44, fontSize * 0.07);
      }
      ctx.restore();
    }
  }

  function faceFor(label) {
    let index = custom ? -1 : faces.findIndex(face => faceLabels[face.slot % faceLabels.length] === label);
    if (custom) {
      // Odd dice (d3, d7…) are cubes: put the rolled number on the top face.
      faceLabels = labels.map((_, i) => String(i + 1));
      const top = faces.findIndex(face => face.slot === 0);
      faceLabels[0] = label;
      index = top;
    }
    return faces[Math.max(0, index)];
  }

  return {
    canvas,
    // A still die, its highest number showing.
    idle() {
      palette = PALETTES.idle;
      draw(restingRotation(faceFor(custom ? String(sides) : labels.at(-1)), 0.12, kind === 4 ? 2 : 1));
    },
    // Tumble, then land on `label`. Resolves when it has settled.
    roll(label, { color = "red", duration = 1150, delay = 0, reduced = false } = {}) {
      palette = PALETTES.red;
      const target = restingRotation(faceFor(String(label)), (Math.random() - 0.5) * 0.5, kind === 4 ? 2 : 1);
      const finish = () => { palette = PALETTES[color] ?? PALETTES.red; draw(target); };
      if (reduced) { finish(); return Promise.resolve(); }
      const axis = norm([Math.random() - 0.5, Math.random() - 0.5 + 0.8, (Math.random() - 0.5) * 0.6]);
      const turns = Math.PI * 2 * (1.6 + Math.random());
      const drift = (Math.random() < 0.5 ? -1 : 1) * size * 0.18;
      const drop = size * 0.4;
      return new Promise(resolve => {
        let start;
        const frame = now => {
          start ??= now + delay;
          const t = Math.max(0, Math.min(1, (now - start) / duration));
          const ease = 1 - Math.pow(1 - t, 3);
          const rotation = multiply(axisAngle(axis, turns * (1 - ease)), target);
          let lift;
          if (t < 0.38) lift = drop * (1 - Math.pow(t / 0.38, 2));
          else if (t < 0.68) lift = drop * 0.3 * Math.sin(Math.PI * (t - 0.38) / 0.3);
          else if (t < 0.86) lift = drop * 0.08 * Math.sin(Math.PI * (t - 0.68) / 0.18);
          else lift = 0;
          draw(rotation, lift, drift * (1 - ease));
          if (t < 1) requestAnimationFrame(frame);
          else { finish(); resolve(); }
        };
        requestAnimationFrame(frame);
      });
    }
  };
}

// For tests: each solid's face count, and whether opposite faces add to n + 1.
export function describeSolid(kind) {
  const { faces } = solid(kind);
  const slots = faces.map(face => face.slot).sort((a, b) => a - b);
  const opposite = faces.every(face => {
    const other = faces.find(candidate => dot(candidate.normal, face.normal) < -0.999);
    return !other || other.slot + face.slot === faces.length - 1;
  });
  return { faces: faces.length, sides: faces.map(face => face.indices.length), slots, opposite };
}
