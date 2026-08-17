import Input from './input.js';
import Player from './player.js';
import { TargetDove } from './target.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const speedMeter = document.getElementById('speed-meter');
const speedReadout = document.getElementById('speed-readout');
const miniMapDistance = document.getElementById('mini-map-distance');
const miniMapAltitude = document.getElementById('mini-map-altitude');
const miniMapPlayer = document.getElementById('mini-map-player');
const miniMapTarget = document.getElementById('mini-map-target');
const miniMapNest = document.getElementById('mini-map-nest');

const targetTracker = document.getElementById('target-tracker');
const targetReticle = document.getElementById('target-reticle');
const targetPointer = document.getElementById('target-pointer');
const targetBadgeLabel = document.getElementById('target-badge-label');
const targetDistance = document.getElementById('target-distance');
const targetEdgeLeft = document.getElementById('target-edge-left');
const targetEdgeRight = document.getElementById('target-edge-right');
const targetEdgeDistLeft = document.getElementById('target-edge-dist-left');
const targetEdgeDistRight = document.getElementById('target-edge-dist-right');

const hudObjective = document.getElementById('hud-objective');
const interceptBanner = document.getElementById('intercept-banner');
const bannerTitle = document.getElementById('banner-title');
const bannerSubtitle = document.getElementById('banner-subtitle');

const world = {
  width: 2200,
  height: 80000,
  ground: { x: 0, y: 79650, w: 2200, h: 350 },
  perch: { x: 0, y: 120, w: 2200, h: 24, isPerch: true },
  // Cliff nest at 50% depth on the left world edge
  nest: { x: 0, y: 39885, w: 240, h: 36, isNest: true },
  platforms: []
};

world.platforms = [world.ground, world.perch, world.nest];

const input = new Input();
const player = new Player(window.innerWidth * 0.5 - 15, world.perch.y - 22);
player.onPerch = true;
player.perchX = world.perch.x;
player.perchW = world.perch.w;

// Target Dove positioned at 90% altitude down the drop
const targetY = world.perch.y + 0.90 * (world.ground.y - world.perch.y);
const target = new TargetDove(targetY);

const feathers = [];
const heartParticles = [];
const shockwaves = [];
let warningHideTimeout = null;

// Slow-motion bullet-time state
let timeScale = 1.0;
let slowMoTimer = 0;

const gameState = {
  phase: 'HUNT', // 'HUNT' | 'ASCEND' | 'DELIVERED' | 'SHARK_CHASE' | 'DEVOURED'
  strikeSpeed: 0,
  ascentStartTime: 0,
  priorPhase: 'HUNT'
};

// Shark — live world-space state
const shark = {
  x: 200,
  y: world.ground.y + 28,
  vx: 80,
  vy: 0,
  chasing: false,
  frenzySpeed: 380,
  patrolSpeed: 180,
  patrolDir: 1,
  patrolTimer: 8
};

function spawnFeatherBurst(x, y, count = 85, playerVx = 0, playerVy = 0) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const isPrimaryFeather = Math.random() > 0.4;
    const speed = isPrimaryFeather ? (Math.random() * 450 + 150) : (Math.random() * 220 + 80);

    // Inherit partial falcon momentum for an explosive directional scatter
    const vx = Math.cos(angle) * speed + playerVx * 0.18;
    const vy = Math.sin(angle) * speed + playerVy * 0.15 - 30;

    feathers.push({
      x: x + (Math.random() - 0.5) * 24,
      y: y + (Math.random() - 0.5) * 24,
      vx,
      vy,
      w: isPrimaryFeather ? (Math.random() * 10 + 6) : (Math.random() * 4 + 3),
      h: isPrimaryFeather ? (Math.random() * 4.5 + 2.5) : (Math.random() * 4 + 3),
      isDown: !isPrimaryFeather,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 14,
      alpha: 1,
      life: Math.random() * 2.5 + 1.8,
      maxLife: 3.8
    });
  }
}

function spawnShockwave(x, y, maxR = 220) {
  shockwaves.push({
    x,
    y,
    radius: 12,
    maxRadius: maxR,
    alpha: 0.95,
    growthSpeed: 480
  });
}

function spawnHearts(x, y, count = 15) {
  for (let i = 0; i < count; i++) {
    heartParticles.push({
      x: x + (Math.random() - 0.5) * 60,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 40,
      vy: -Math.random() * 60 - 30,
      size: Math.random() * 8 + 10,
      alpha: 1,
      life: Math.random() * 1.5 + 1.0,
      maxLife: 2.5
    });
  }
}

function updateParticles(dt) {
  for (let i = feathers.length - 1; i >= 0; i--) {
    const f = feathers[i];
    f.life -= dt;
    if (f.life <= 0) {
      feathers.splice(i, 1);
      continue;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vx *= Math.pow(f.isDown ? 0.88 : 0.93, dt * 60);
    f.vy += (f.isDown ? 25 : 45) * dt;
    f.rotation += f.rotSpeed * dt;
    f.alpha = Math.max(0, f.life / f.maxLife);
  }

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.radius += sw.growthSpeed * dt;
    sw.alpha = Math.max(0, 1 - (sw.radius / sw.maxRadius));
    if (sw.radius >= sw.maxRadius) {
      shockwaves.splice(i, 1);
    }
  }

  for (let i = heartParticles.length - 1; i >= 0; i--) {
    const h = heartParticles[i];
    h.life -= dt;
    if (h.life <= 0) {
      heartParticles.splice(i, 1);
      continue;
    }
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.alpha = Math.max(0, h.life / h.maxLife);
  }
}

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

function formatDistance(distPx) {
  if (distPx >= 1000) {
    return `${(distPx / 1000).toFixed(1)}k m`;
  }
  return `${Math.round(distPx)}m`;
}

function updateHud() {
  const speed = Math.round(Math.hypot(player.vel.x, player.vel.y) * 0.032);
  speedReadout.textContent = `${speed}`;

  if (speed >= 200) {
    speedMeter.className = 'lethal-speed';
  } else {
    speedMeter.className = '';
  }

  const distanceToWater = Math.max(0, world.ground.y - (player.pos.y + player.size.h / 2));
  const worldProgress = Math.min(100, Math.max(0, ((player.pos.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)) * 100));
  miniMapPlayer.style.top = `${worldProgress}%`;

  const distanceText = distanceToWater >= 1000 ? `${(distanceToWater / 1000).toFixed(1)}k` : `${Math.round(distanceToWater)}m`;
  miniMapDistance.textContent = `${distanceText}`;
  miniMapAltitude.textContent = `${Math.round(worldProgress)}%`;

  if (miniMapTarget) {
    if (gameState.phase === 'HUNT') {
      const targetProgress = Math.min(100, Math.max(0, ((target.pos.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)) * 100));
      miniMapTarget.style.top = `${targetProgress}%`;
      miniMapTarget.style.display = 'block';
    } else {
      miniMapTarget.style.display = 'none';
    }
  }

  if (miniMapNest) {
    const nestProgress = Math.min(100, Math.max(0, ((world.nest.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)) * 100));
    miniMapNest.style.top = `${nestProgress}%`;
  }

  // Determine which target to track on the bottom trajectory tracker
  let activeTargetX, activeTargetY, targetLabel, isNestMode;

  if (gameState.phase === 'ASCEND' || gameState.phase === 'DELIVERED') {
    activeTargetX = world.nest.x + world.nest.w * 0.5;
    activeTargetY = world.nest.y;
    targetLabel = 'CLIFF NEST (50%)';
    isNestMode = true;
  } else {
    activeTargetX = target.pos.x + target.size.w * 0.5;
    activeTargetY = target.pos.y + target.size.h * 0.5;
    targetLabel = 'TARGET DOVE';
    isNestMode = false;
  }

  const screenW = window.innerWidth;
  const playerCenterX = player.pos.x + player.size.w * 0.5;
  const playerCenterY = player.pos.y + player.size.h * 0.5;

  const targetScreenX = activeTargetX - camera.x;
  const deltaX = activeTargetX - playerCenterX;
  const deltaY = activeTargetY - playerCenterY;
  const totalDist = Math.hypot(deltaX, deltaY);
  const formattedDist = formatDistance(totalDist);

  targetBadgeLabel.textContent = targetLabel;
  if (isNestMode) {
    targetReticle.classList.add('nest-mode');
    targetEdgeLeft.classList.add('nest-mode');
    targetEdgeRight.classList.add('nest-mode');
  } else {
    targetReticle.classList.remove('nest-mode');
    targetEdgeLeft.classList.remove('nest-mode');
    targetEdgeRight.classList.remove('nest-mode');
  }

  const leftMargin = 140; // Avoid overlapping minimap
  const rightMargin = screenW - 32;

  if (targetScreenX >= leftMargin && targetScreenX <= rightMargin) {
    targetReticle.classList.remove('hidden');
    targetReticle.style.left = `${targetScreenX}px`;
    targetDistance.textContent = formattedDist;
    targetEdgeLeft.classList.add('hidden');
    targetEdgeRight.classList.add('hidden');
  } else if (targetScreenX < leftMargin) {
    targetReticle.classList.add('hidden');
    targetEdgeLeft.classList.remove('hidden');
    targetEdgeRight.classList.add('hidden');
    targetEdgeDistLeft.textContent = formattedDist;
  } else {
    targetReticle.classList.add('hidden');
    targetEdgeLeft.classList.add('hidden');
    targetEdgeRight.classList.remove('hidden');
    targetEdgeDistRight.textContent = formattedDist;
  }
}

function updateCamera() {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  camera.x = Math.max(0, Math.min(world.width - screenW, player.pos.x - screenW * 0.45));
  camera.y = Math.max(0, Math.min(world.height - screenH, player.pos.y - screenH * 0.5));
}

function updateShark(dt) {
  const playerCX = player.pos.x + player.size.w * 0.5;
  const playerCY = player.pos.y + player.size.h * 0.5;
  const inWater = player.pos.y + player.size.h >= world.ground.y;

  if (shark.chasing) {
    // Aggressively home toward player
    const dx = playerCX - shark.x;
    const dy = playerCY - shark.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      shark.vx += (dx / dist) * shark.frenzySpeed * 4 * dt;
      shark.vy += (dy / dist) * shark.frenzySpeed * 4 * dt;
      const spd = Math.hypot(shark.vx, shark.vy);
      if (spd > shark.frenzySpeed) {
        shark.vx = (shark.vx / spd) * shark.frenzySpeed;
        shark.vy = (shark.vy / spd) * shark.frenzySpeed;
      }
    }
    shark.x += shark.vx * dt;
    shark.y += shark.vy * dt;
    shark.x = Math.max(80, Math.min(world.width - 80, shark.x));

    // DEVOURED — shark caught player still in water
    if (dist < 55 && inWater && gameState.phase === 'SHARK_CHASE') {
      gameState.phase = 'DEVOURED';
      shark.chasing = false;
      if (warningHideTimeout) clearTimeout(warningHideTimeout);
      bannerTitle.textContent = '🦈 DEVOURED BY SHARK!';
      bannerSubtitle.innerHTML = `You went too deep! Rapidly flap <kbd>Space</kbd> &amp; <kbd>W</kbd> to escape next time! · Press <kbd>R</kbd> to restart`;
      interceptBanner.className = 'intercept-banner warning';
      hudObjective.textContent = '💀 You were eaten. Press R to try again.';
    }

    // Player escaped water — shark breaks off
    if (!inWater && gameState.phase === 'SHARK_CHASE') {
      shark.chasing = false;
      gameState.phase = gameState.priorPhase;
      shark.vy = 500;
      shark.vx *= 0.3;
      if (warningHideTimeout) clearTimeout(warningHideTimeout);
      bannerTitle.textContent = '💨 BARELY ESCAPED THE SHARK!';
      bannerSubtitle.innerHTML = `You got out of the water just in time! Keep flying!`;
      interceptBanner.className = 'intercept-banner';
      warningHideTimeout = setTimeout(() => interceptBanner.classList.add('hidden'), 3500);
      hudObjective.textContent = gameState.phase === 'ASCEND'
        ? 'Objective: Ascend to the cliff nest at 50% altitude and flare wings to land gently.'
        : 'Objective: Manage dive speed to hit the 200–210 MPH window and arrest before water.';
    }
  } else {
    // Patrol slowly
    shark.patrolTimer -= dt;
    if (shark.patrolTimer <= 0) {
      shark.patrolDir *= -1;
      shark.patrolTimer = 6 + Math.random() * 8;
    }
    const targetVx = shark.patrolDir * shark.patrolSpeed;
    shark.vx += (targetVx - shark.vx) * Math.min(1, dt * 1.2);
    // Spring back to water surface
    shark.vy += (world.ground.y + 28 - shark.y) * 3 * dt;
    shark.vy *= Math.pow(0.85, dt * 60);
    shark.x += shark.vx * dt;
    shark.y += shark.vy * dt;
    shark.x = Math.max(80, Math.min(world.width - 80, shark.x));

    // Player hit the water — check impact speed first
    if (inWater && gameState.phase !== 'DEVOURED' && gameState.phase !== 'SHARK_CHASE') {
      const impactMph = Math.hypot(player.vel.x, player.vel.y) * 0.032;

      if (impactMph > 50) {
        // Hit water too fast — instant death
        gameState.phase = 'DEVOURED';
        shark.chasing = false;
        if (warningHideTimeout) clearTimeout(warningHideTimeout);
        bannerTitle.textContent = '💦 CRASHED INTO THE WATER!';
        bannerSubtitle.innerHTML = `You hit the water at <strong>${Math.round(impactMph)} MPH</strong>! Flare wings before the surface to slow down. · Press <kbd>R</kbd> to restart`;
        interceptBanner.className = 'intercept-banner warning';
        hudObjective.textContent = '💀 You hit the water too fast. Press R to try again.';
        return;
      }

      // Safe entry speed — shark attack!
      shark.chasing = true;
      gameState.priorPhase = gameState.phase;
      gameState.phase = 'SHARK_CHASE';

      // Guarantee shark spawns at least 800px away from player
      const minDist = 800;
      const dx = playerCX - shark.x;
      const currentDist = Math.abs(dx);
      if (currentDist < minDist) {
        // Push shark to the opposite side at minimum distance
        shark.x = playerCX + (dx >= 0 ? -minDist : minDist);
        shark.x = Math.max(80, Math.min(world.width - 80, shark.x));
        shark.vx = 0;
        shark.vy = 0;
      }
      shark.vx = (playerCX > shark.x ? 1 : -1) * shark.patrolSpeed * 4;

      if (warningHideTimeout) clearTimeout(warningHideTimeout);
      bannerTitle.textContent = '🦈 SHARK ATTACK! GET OUT NOW!';
      bannerSubtitle.innerHTML = `Rapidly flap <kbd>Space</kbd> and <kbd>W</kbd> to escape before you're eaten!`;
      interceptBanner.className = 'intercept-banner warning';
      hudObjective.textContent = '⚠️ SHARK INCOMING! Flap like mad — escape the water!';
    }
  }
}

function update(dt) {
  if (input.consumeReset()) {
    player.reset(window.innerWidth * 0.5 - 15, world.perch.y - 22);
    player.onPerch = true;
    player.perchX = world.perch.x;
    player.perchW = world.perch.w;
    target.reset();
    feathers.length = 0;
    heartParticles.length = 0;
    shockwaves.length = 0;
    timeScale = 1.0;
    slowMoTimer = 0;
    gameState.phase = 'HUNT';
    gameState.priorPhase = 'HUNT';
    gameState.strikeSpeed = 0;
    shark.chasing = false;
    shark.x = 200;
    shark.y = world.ground.y + 28;
    shark.vx = 80;
    shark.vy = 0;
    hudObjective.textContent = 'Objective: Manage dive speed to hit the 200–210 MPH window and arrest before water.';
    if (warningHideTimeout) clearTimeout(warningHideTimeout);
    interceptBanner.className = 'intercept-banner hidden';
  }

  // DEBUG: T key — teleport just above water surface for shark testing
  if (input.consumeTestWater()) {
    const spawnX = world.width * 0.5;
    player.pos.x = spawnX - player.size.w * 0.5;
    player.pos.y = world.ground.y - player.size.h - 80;
    player.vel.x = 0;
    player.vel.y = 120; // gentle fall toward water
    player.onPerch = false;
    player.grounded = false;
    player.currentPlatform = null;
    feathers.length = 0;
    shockwaves.length = 0;
    if (warningHideTimeout) clearTimeout(warningHideTimeout);
    interceptBanner.className = 'intercept-banner hidden';
    hudObjective.textContent = '[DEBUG] Teleported near water — T to repeat, R to full reset';
  }

  if (gameState.phase !== 'DEVOURED') {
    player.update(dt, input, world.platforms);
  }
  target.update(dt);
  updateShark(dt);

  updateParticles(dt);

  // Check strike collision when hunting
  if (gameState.phase === 'HUNT') {
    const col = target.checkCollision(player);
    if (col) {
      const doveCenterX = target.pos.x + target.size.w * 0.5;
      const doveCenterY = target.pos.y + target.size.h * 0.5;

      if (warningHideTimeout) clearTimeout(warningHideTimeout);

      if (col.status === 'caught') {
        player.hasPrey = true;
        target.isCarried = true;
        gameState.phase = 'ASCEND';
        gameState.strikeSpeed = col.speed;
        gameState.ascentStartTime = performance.now();

        // Trigger super slow-motion bullet time and explosive feather shockwave!
        timeScale = 0.07;
        slowMoTimer = 0.65;

        spawnFeatherBurst(doveCenterX, doveCenterY, 85, player.vel.x, player.vel.y);
        spawnShockwave(doveCenterX, doveCenterY, 220);

        bannerTitle.textContent = '🎯 DOVE CAPTURED IN TALONS!';
        bannerSubtitle.innerHTML = `Strike: <strong>${col.speed} MPH (Sweet Spot)</strong> · Arrest dive & fly up to the <strong>Cliff Nest (50%)</strong> to feed your chicks!`;
        interceptBanner.className = 'intercept-banner';

        hudObjective.textContent = 'Objective: Ascend to the cliff nest at 50% altitude and flare wings to land gently.';

        warningHideTimeout = setTimeout(() => {
          if (gameState.phase === 'ASCEND') {
            interceptBanner.classList.add('hidden');
          }
        }, 5000);
      } else if (col.status === 'too_fast') {
        spawnFeatherBurst(doveCenterX, doveCenterY, 30, player.vel.x, player.vel.y);
        spawnShockwave(doveCenterX, doveCenterY, 140);

        bannerTitle.textContent = '⚠️ TOO FAST — OVERSHOT!';
        bannerSubtitle.innerHTML = `Speed: <strong>${col.speed} MPH</strong> (Must stay in <strong>200–210 MPH</strong> window to catch without crashing!)`;
        interceptBanner.className = 'intercept-banner warning';

        warningHideTimeout = setTimeout(() => {
          if (gameState.phase === 'HUNT') {
            interceptBanner.classList.add('hidden');
          }
        }, 3500);
      } else if (col.status === 'too_slow') {
        spawnFeatherBurst(doveCenterX, doveCenterY, 20, player.vel.x, player.vel.y);
        spawnShockwave(doveCenterX, doveCenterY, 90);

        bannerTitle.textContent = '⚠️ TOO SLOW — GLANCED OFF!';
        bannerSubtitle.innerHTML = `Speed: <strong>${col.speed} MPH</strong> (Need <strong>200–210 MPH</strong> stoop dive to strike!)`;
        interceptBanner.className = 'intercept-banner warning';

        warningHideTimeout = setTimeout(() => {
          if (gameState.phase === 'HUNT') {
            interceptBanner.classList.add('hidden');
          }
        }, 3000);
      }
    }
  }

  // Check landing on Cliff Nest
  if (player.landingAttempt) {
    const attempt = player.landingAttempt;
    if (attempt.platform && attempt.platform.isNest) {
      if (warningHideTimeout) clearTimeout(warningHideTimeout);

      if (attempt.isGentle) {
        if (player.hasPrey && gameState.phase === 'ASCEND') {
          player.hasPrey = false;
          gameState.phase = 'DELIVERED';
          spawnHearts(world.nest.x + 110, world.nest.y, 25);

          bannerTitle.textContent = '🏆 MISSION ACCOMPLISHED!';
          bannerSubtitle.innerHTML = `Prey delivered gently to your hungry chicks! · Strike: <strong>${gameState.strikeSpeed} MPH</strong> · Landing: <strong>${attempt.speedMph} MPH (SOFT FLARE)</strong> · Press <kbd>R</kbd> to Play Again`;
          interceptBanner.className = 'intercept-banner';

          hudObjective.textContent = 'Chicks fed! Press R to hunt again.';
        }
      } else {
        bannerTitle.textContent = '⚠️ HARD TOUCHDOWN!';
        bannerSubtitle.innerHTML = `Impact: <strong>${attempt.speedMph} MPH</strong>. Flare with <kbd>Space</kbd> or <kbd>W</kbd> to land softly on the nest!`;
        interceptBanner.className = 'intercept-banner warning';

        warningHideTimeout = setTimeout(() => {
          if (gameState.phase !== 'DELIVERED') {
            interceptBanner.classList.add('hidden');
          }
        }, 3000);
      }
    }
  }

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

function drawStructures() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  const g = world.ground;
  const p = world.perch;
  const nest = world.nest;
  const now = performance.now() * 0.001;

  // 1. Water at bottom
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

  // Shark — driven by live shark state object
  {
    const sharkX = shark.x;
    const sharkY = shark.y;
    const sharkFacing = shark.vx >= 0 ? 1 : -1;
    const bodyLen = shark.chasing ? 160 : 140;
    const bodyH = shark.chasing ? 32 : 28;
    // Tail wag speed ramps up when chasing
    const tailWagSpeed = shark.chasing ? 14 : 5;
    const tailWag = Math.sin(now * tailWagSpeed) * 0.18;

    ctx.save();
    ctx.translate(sharkX, sharkY);
    ctx.scale(sharkFacing, 1);

    // --- Body ---
    ctx.fillStyle = '#4a6d7c';
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.5, 0);                        // front nose tip
    ctx.bezierCurveTo(
      -bodyLen * 0.5 + 18, -bodyH * 0.5,                 // upper front curve
      bodyLen * 0.28, -bodyH * 0.62,                     // upper peak
      bodyLen * 0.46, -bodyH * 0.18                       // upper tail base
    );
    // Tail fork — upper lobe
    ctx.lineTo(bodyLen * 0.5 + Math.sin(tailWag + 0.3) * 22, -bodyH * 0.62);
    ctx.lineTo(bodyLen * 0.46, 0);                        // tail notch
    // Tail fork — lower lobe
    ctx.lineTo(bodyLen * 0.5 + Math.sin(tailWag) * 16, bodyH * 0.55);
    ctx.bezierCurveTo(
      bodyLen * 0.28, bodyH * 0.72,                      // lower rear
      -bodyLen * 0.5 + 18, bodyH * 0.58,                 // lower front
      -bodyLen * 0.5, 0                                   // nose tip
    );
    ctx.closePath();
    ctx.fill();

    // Belly (lighter underside)
    ctx.fillStyle = '#c8dde5';
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.38, 0);
    ctx.bezierCurveTo(
      -bodyLen * 0.2, bodyH * 0.55,
      bodyLen * 0.14, bodyH * 0.65,
      bodyLen * 0.42, bodyH * 0.22
    );
    ctx.bezierCurveTo(
      bodyLen * 0.22, bodyH * 0.72,
      -bodyLen * 0.1, bodyH * 0.62,
      -bodyLen * 0.38, 0
    );
    ctx.fill();

    // Dorsal fin (iconic top fin, slightly animated)
    const dorsalWag = Math.sin(now * 5 + 0.5) * 3;
    ctx.fillStyle = '#3d5a68';
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.04, -bodyH * 0.55);           // fin base front
    ctx.lineTo(-bodyLen * 0.04 - 8 + dorsalWag, -bodyH * 1.55); // fin tip
    ctx.lineTo(bodyLen * 0.14, -bodyH * 0.58);            // fin base rear
    ctx.closePath();
    ctx.fill();

    // Pectoral fin (side fin)
    ctx.fillStyle = '#3d5a68';
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.1, bodyH * 0.1);
    ctx.lineTo(-bodyLen * 0.06, bodyH * 0.75);
    ctx.lineTo(bodyLen * 0.06, bodyH * 0.35);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-bodyLen * 0.36, -bodyH * 0.04, 5, 0, Math.PI * 2);
    ctx.fill();
    // Eye glint
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(-bodyLen * 0.36 + 1.5, -bodyH * 0.04 - 1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Gill slits
    ctx.strokeStyle = 'rgba(30, 55, 72, 0.65)';
    ctx.lineWidth = 1.5;
    for (let g2 = 0; g2 < 4; g2++) {
      const gx = -bodyLen * 0.26 + g2 * 8;
      ctx.beginPath();
      ctx.moveTo(gx, -bodyH * 0.3);
      ctx.quadraticCurveTo(gx - 2, bodyH * 0.08, gx, bodyH * 0.3);
      ctx.stroke();
    }

    // Teeth (visible lower jaw, slightly open snout)
    ctx.fillStyle = '#f1f5f9';
    for (let t = 0; t < 5; t++) {
      const tx = -bodyLen * 0.48 + t * 6;
      ctx.beginPath();
      ctx.moveTo(tx, bodyH * 0.08);
      ctx.lineTo(tx + 2.5, bodyH * 0.26);
      ctx.lineTo(tx + 5, bodyH * 0.08);
      ctx.closePath();
      ctx.fill();
    }

    // Dorsal fin water cut — small white wake at the fin base
    ctx.strokeStyle = 'rgba(200,235,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.14, -bodyH * 0.55);
    ctx.quadraticCurveTo(-bodyLen * 0.08 * sharkFacing, -bodyH * 0.38, bodyLen * 0.0, -bodyH * 0.55);
    ctx.stroke();

    ctx.restore(); // end translate+scale
  }



  // 2. Starting Perch at Top (Golden Gate red bridge architecture)
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

  // 3. Cliff Nest at 50% Altitude (Left Edge Outcrop)
  // Vertical rock face extending above and below nest
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, nest.y - 600, 60, 1200);

  // Rock face cracks and shading
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(0, nest.y - 300);
  ctx.lineTo(80, nest.y - 120);
  ctx.lineTo(40, nest.y + 180);
  ctx.lineTo(0, nest.y + 400);
  ctx.closePath();
  ctx.fill();

  // Outcrop ledge platform
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.moveTo(0, nest.y);
  ctx.lineTo(nest.w, nest.y);
  ctx.lineTo(nest.w + 20, nest.y + 12);
  ctx.lineTo(nest.w - 30, nest.y + nest.h);
  ctx.lineTo(0, nest.y + nest.h + 20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, nest.y, nest.w, 5);

  // Woven twig nest basket
  const nestCenterX = 110;
  const nestCenterY = nest.y - 2;

  ctx.fillStyle = '#5c3a21';
  ctx.beginPath();
  ctx.ellipse(nestCenterX, nestCenterY, 54, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3d2514';
  ctx.beginPath();
  ctx.ellipse(nestCenterX, nestCenterY - 2, 44, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft moss & twigs lining
  ctx.strokeStyle = '#85522e';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const tx = nestCenterX + Math.cos(angle) * 48;
    const ty = nestCenterY + Math.sin(angle) * 14;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(angle + 0.8) * 14, ty + Math.sin(angle + 0.8) * 6);
    ctx.stroke();
  }

  // 3 Animated Hungry Chicks inside nest
  const chickOffsets = [-22, 0, 22];
  for (let i = 0; i < chickOffsets.length; i++) {
    const cx = nestCenterX + chickOffsets[i];
    const chickBob = Math.sin(now * 4 + i * 1.8) * 3;
    const cy = nestCenterY - 8 + chickBob;

    // Chick body (fluffy down)
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chick head
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy - 7, 6, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Open Beak (chirping)
    const mouthGap = Math.abs(Math.sin(now * 6 + i)) * 4 + 2;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 9);
    ctx.lineTo(cx + 11, cy - 10 - mouthGap * 0.5);
    ctx.lineTo(cx + 5, cy - 7);
    ctx.lineTo(cx + 11, cy - 4 + mouthGap * 0.5);
    ctx.lineTo(cx + 4, cy - 5);
    ctx.closePath();
    ctx.fill();

    // Tiny wing flaps
    const wingFlap = Math.sin(now * 8 + i * 2) * 4;
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy + wingFlap * 0.2, 4, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // If prey delivered: draw delivered dove resting in nest with chicks
  if (gameState.phase === 'DELIVERED') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(nestCenterX - 35, nestCenterY - 4, 12, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(nestCenterX - 22, nestCenterY - 5);
    ctx.lineTo(nestCenterX - 17, nestCenterY - 4);
    ctx.lineTo(nestCenterX - 22, nestCenterY - 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawTarget() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  target.draw(ctx);
  ctx.restore();
}

function drawParticles() {
  if (feathers.length === 0 && heartParticles.length === 0 && shockwaves.length === 0) return;
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Shockwaves
  for (const sw of shockwaves) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${sw.alpha * 0.75})`;
    ctx.lineWidth = 3.5 * sw.alpha;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Feathers
  for (const f of feathers) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);
    ctx.globalAlpha = f.alpha;
    ctx.fillStyle = f.isDown ? '#ffffff' : '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, f.w, f.h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Hearts
  for (const h of heartParticles) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = h.alpha;
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    const d = h.size * 0.5;
    ctx.moveTo(0, d * 0.6);
    ctx.bezierCurveTo(-d, -d * 0.2, -d * 0.8, -d, 0, -d * 0.4);
    ctx.bezierCurveTo(d * 0.8, -d, d, -d * 0.2, 0, d * 0.6);
    ctx.fill();
    ctx.restore();
  }

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
  drawStructures();
  drawTarget();
  drawParticles();
  drawPlayer();
}

function loop(now) {
  const realDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Bullet-time slow-motion logic on high-speed impact
  if (slowMoTimer > 0) {
    slowMoTimer -= realDt;
  } else if (timeScale < 1.0) {
    // Smoothly speed back up to 1.0!
    timeScale = Math.min(1.0, timeScale + realDt * 1.6);
  }

  const dt = realDt * timeScale;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);

window.__game = { player, world, input, target, gameState };
