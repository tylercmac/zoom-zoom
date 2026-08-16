import Input from './input.js';
import Player from './player.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const speedReadout = document.getElementById('speed-readout');
const miniMapDistance = document.getElementById('mini-map-distance');
const miniMapAltitude = document.getElementById('mini-map-altitude');
const miniMapPlayer = document.getElementById('mini-map-player');

const world = {
  width: 2200,
  height: 80000,
  ground: { x: 0, y: 79650, w: 2200, h: 350 },
  perch: { x: 0, y: 120, w: 2200, h: 24 },
  platforms: []
};

const input = new Input();
const player = new Player(window.innerWidth * 0.5 - 15, world.perch.y - 22);
player.onPerch = true;
player.perchX = world.perch.x;
player.perchW = world.perch.w;

const stars = Array.from({ length: 2600 }, () => ({
  x: Math.random() * world.width,
  y: Math.random() * world.height,
  r: Math.random() * 1.7 + 0.35,
  a: Math.random() * 0.66 + 0.18,
  depth: Math.random() * 0.64 + 0.08,
  pulse: Math.random() * 1000,
  warm: Math.random() > 0.78
}));

const cloudBanks = Array.from({ length: 420 }, () => ({
  x: Math.random() * (world.width + 700) - 350,
  y: Math.random() * world.height,
  w: Math.random() * 360 + 150,
  h: Math.random() * 56 + 28,
  depth: Math.random() * 0.28 + 0.72,
  alpha: Math.random() * 0.13 + 0.035
}));

const windStreaks = Array.from({ length: 64 }, () => ({
  x: Math.random(),
  phase: Math.random(),
  width: Math.random() * 1.5 + 0.5,
  alpha: Math.random() * 0.22 + 0.05,
  drift: Math.random() * 0.42 + 0.78
}));

const landscapeLayers = [
  { depth: 0.0022, base: 0.69, amplitude: 30, frequency: 0.0048, color: 'rgba(48, 79, 104, 0.34)', seed: 0.8 },
  { depth: 0.0045, base: 0.78, amplitude: 42, frequency: 0.0062, color: 'rgba(35, 68, 91, 0.42)', seed: 2.3 },
  { depth: 0.008, base: 0.9, amplitude: 58, frequency: 0.008, color: 'rgba(23, 52, 74, 0.52)', seed: 4.6 }
];

let camera = { x: 0, y: 0 };
let lastTime = performance.now();

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function updateHud() {
  const speed = Math.min(210, Math.max(0, Math.hypot(player.vel.x, player.vel.y) * 0.032));
  speedReadout.textContent = `${Math.round(speed)}`;

  const distanceToWater = Math.max(0, world.ground.y - (player.pos.y + player.size.h / 2));
  const worldProgress = Math.min(100, Math.max(0, ((player.pos.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)) * 100));
  miniMapPlayer.style.top = `${worldProgress}%`;

  const distanceText = distanceToWater >= 1000 ? `${(distanceToWater / 1000).toFixed(1)}k` : `${Math.round(distanceToWater)}m`;
  miniMapDistance.textContent = `${distanceText}`;
  miniMapAltitude.textContent = `${Math.round(worldProgress)}%`;
}

function updateCamera() {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  camera.x = Math.max(0, Math.min(world.width - screenW, player.pos.x - screenW * 0.45));
  camera.y = Math.max(0, Math.min(world.height - screenH, player.pos.y - screenH * 0.5));
}

function update(dt) {
  if (input.consumeReset()) {
    player.reset(window.innerWidth * 0.5 - 15, world.perch.y - 22);
    player.onPerch = true;
    player.perchX = world.perch.x;
    player.perchW = world.perch.w;
  }

  player.update(dt, input, [world.ground, world.perch]);
  updateCamera();
  updateHud();

  if (player.pos.y > world.height + 100) {
    player.pos.y = 120;
    player.vel.y = 0;
  }

  if (player.pos.x < 0) player.pos.x = 0;
  if (player.pos.x + player.size.w > world.width) player.pos.x = world.width - player.size.w;
}

function drawBackground() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const now = performance.now() * 0.001;
  const progress = Math.min(1, Math.max(0, (player.pos.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)));
  const speedMph = Math.hypot(player.vel.x, player.vel.y) * 0.032;
  const windStrength = Math.min(1, Math.max(0, (speedMph - 72) / 135));
  const atmosphereRaw = Math.min(1, Math.max(0, (progress - 0.28) / 0.54));
  const atmosphereBlend = atmosphereRaw * atmosphereRaw * (3 - 2 * atmosphereRaw);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#030816');
  sky.addColorStop(0.5, '#0b1930');
  sky.addColorStop(1, '#182944');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const lowerSky = ctx.createLinearGradient(0, 0, 0, height);
  lowerSky.addColorStop(0, '#06152a');
  lowerSky.addColorStop(0.5, '#163450');
  lowerSky.addColorStop(1, '#315c76');
  ctx.save();
  ctx.globalAlpha = atmosphereBlend;
  ctx.fillStyle = lowerSky;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  for (const star of stars) {
    const sx = star.x - camera.x * star.depth;
    const sy = star.y - camera.y * star.depth;
    if (sx < -10 || sy < -10 || sx > width + 10 || sy > height + 10) continue;
    const glow = 0.58 + Math.sin((now * 2) + star.pulse) * 0.2;
    ctx.fillStyle = star.warm
      ? `rgba(255, 225, 177, ${star.a * glow})`
      : `rgba(222, 239, 255, ${star.a * glow})`;
    ctx.beginPath();
    ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  for (const cloud of cloudBanks) {
    const cx = cloud.x - camera.x * cloud.depth;
    const cy = cloud.y - camera.y * cloud.depth;
    if (cx < -cloud.w || cy < -cloud.h * 2 || cx > width + cloud.w || cy > height + cloud.h * 2) continue;
    const cloudAlpha = cloud.alpha * (0.25 + progress * 0.95);
    ctx.fillStyle = `rgba(193, 221, 235, ${cloudAlpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cloud.w * 0.5, cloud.h * 0.46, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - cloud.w * 0.22, cy + cloud.h * 0.1, cloud.w * 0.28, cloud.h * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + cloud.w * 0.2, cy - cloud.h * 0.08, cloud.w * 0.31, cloud.h * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (windStrength > 0.01) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const streak of windStreaks) {
      const length = 16 + windStrength * windStrength * (110 + streak.width * 46);
      const travel = (now * (110 + windStrength * 1450) * streak.drift + streak.phase * (height + length * 2)) % (height + length * 2);
      const x = streak.x * (width + 100) - 50 + Math.sin(now * 0.8 + streak.phase * 18) * windStrength * 16;
      const y = height + length - travel;
      const alpha = streak.alpha * windStrength;
      ctx.strokeStyle = `rgba(192, 229, 255, ${alpha})`;
      ctx.lineWidth = streak.width * (0.7 + windStrength * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - player.vel.x * 0.018 * windStrength, y + length);
      ctx.stroke();
    }
    ctx.restore();
  }

  const landscapeReveal = Math.min(1, Math.max(0, (progress - 0.12) / 0.35));
  if (landscapeReveal > 0.01) {
    ctx.save();
    ctx.globalAlpha = landscapeReveal;
    for (const layer of landscapeLayers) {
      const baseY = height * layer.base - camera.y * layer.depth;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-40, height + 2);
      for (let x = -40; x <= width + 80; x += 42) {
        const ridge = Math.sin(x * layer.frequency + layer.seed + camera.y * 0.000018)
          * layer.amplitude
          + Math.sin(x * layer.frequency * 2.7 + layer.seed * 3) * layer.amplitude * 0.32;
        ctx.lineTo(x, baseY + ridge);
      }
      ctx.lineTo(width + 80, height + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  if (windStrength > 0.25) {
    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.52, height * 0.18, width * 0.5, height * 0.5, height * 0.82);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, `rgba(0, 10, 24, ${windStrength * 0.32})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawGround() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  const g = world.ground;
  const p = world.perch;

  const water = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
  water.addColorStop(0, '#1e4d75');
  water.addColorStop(0.35, '#2b6d8f');
  water.addColorStop(1, '#173d63');
  ctx.fillStyle = water;
  ctx.fillRect(g.x, g.y, g.w, g.h);

  for (let i = 0; i < 24; i++) {
    const x = (i * 120 + (performance.now() * 0.03)) % (g.w + 120) - 120;
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, g.y + 26 + (i % 4) * 10);
    ctx.quadraticCurveTo(x + 22, g.y + 18 + (i % 4) * 10, x + 46, g.y + 26 + (i % 4) * 10);
    ctx.stroke();
  }

  ctx.fillStyle = '#8d1d1d';
  ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = '#b93a2d';
  ctx.fillRect(p.x, p.y + 6, p.w, 5);

  ctx.fillStyle = '#d9c7b5';
  for (let x = p.x + 18; x < p.x + p.w; x += 48) {
    ctx.fillRect(x, p.y + 10, 18, 7);
  }

  ctx.fillStyle = '#7f1c1c';
  for (let x = p.x + 30; x < p.x + p.w; x += 120) {
    ctx.fillRect(x, p.y - 32, 6, 32);
    ctx.fillRect(x + 24, p.y - 32, 6, 32);
  }

  ctx.strokeStyle = 'rgba(255, 220, 200, 0.38)';
  ctx.lineWidth = 1.5;
  for (let x = p.x + 12; x < p.x + p.w; x += 52) {
    ctx.beginPath();
    ctx.moveTo(x, p.y + 2);
    ctx.lineTo(x + 12, p.y - 20);
    ctx.stroke();
  }

  ctx.fillStyle = '#5d1111';
  ctx.fillRect(p.x, p.y, p.w, 3);
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  player.draw(ctx);
  ctx.restore();
}

function draw() {
  drawBackground();
  drawGround();
  drawPlayer();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);

window.__game = { player, world, input };
