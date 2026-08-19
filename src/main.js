import Input from './input.js';
import Player from './player.js';
import { TargetDove } from './target.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
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
const targetSpeedBadge = document.getElementById('target-speed-badge');

const hudObjective = document.getElementById('hud-objective');
const interceptBanner = document.getElementById('intercept-banner');
const bannerTitle = document.getElementById('banner-title');
const bannerSubtitle = document.getElementById('banner-subtitle');
const runTimerEl = document.getElementById('run-timer');
const runTimerReadout = document.getElementById('run-timer-readout');

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
const waterSplashParticles = [];
const underwaterBubbles = [];
let warningHideTimeout = null;
let screenShake = { power: 0, timer: 0 };

// Run timer — starts on perch departure, stops on death or successful delivery
const runTimer = {
  active: false,
  elapsed: 0,      // seconds
  stopped: false,  // true once the run has ended (keeps final value visible)
  outcome: null,   // 'success' | 'fail' | null
};

function spawnUnderwaterBubbles(x, y, count = 4) {
  for (let i = 0; i < count; i++) {
    underwaterBubbles.push({
      x: x + (Math.random() - 0.5) * 28,
      y: y + (Math.random() - 0.5) * 16,
      vx: (Math.random() - 0.5) * 40,
      vy: -Math.random() * 90 - 45,
      radius: Math.random() * 3.8 + 1.6,
      alpha: 0.9,
      life: Math.random() * 1.6 + 0.9,
      maxLife: 2.3
    });
  }
}

// Slow-motion bullet-time state
let timeScale = 1.0;
let slowMoTimer = 0;

const gameState = {
  phase: 'HUNT', // 'HUNT' | 'ASCEND' | 'DELIVERED' | 'SHARK_CHASE' | 'CRASH_FLOATING' | 'DEVOURED'
  strikeSpeed: 0,
  ascentStartTime: 0,
  priorPhase: 'HUNT',
  crashSpeed: 0
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
  patrolTimer: 8,
  renderFacing: 1, // 1 for facing right, -1 for facing left
  renderPitch: 0,  // radians
  mouthGape: 0,    // 0 to 1
  spinePhase: 0
};

function spawnWaterSplash(x, y, count = 50) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.2;
    const speed = Math.random() * 580 + 140;
    waterSplashParticles.push({
      x: x + (Math.random() - 0.5) * 36,
      y: y + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * 4.5 + 2,
      alpha: 1,
      life: Math.random() * 1.3 + 0.7,
      maxLife: 2.0
    });
  }
}

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

  for (let i = waterSplashParticles.length - 1; i >= 0; i--) {
    const p = waterSplashParticles[i];
    p.life -= dt;
    if (p.life <= 0) {
      waterSplashParticles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 680 * dt; // Gravity pulling droplets down
    p.vx *= Math.pow(0.96, dt * 60);
    p.alpha = Math.max(0, p.life / p.maxLife);
  }

  for (let i = underwaterBubbles.length - 1; i >= 0; i--) {
    const b = underwaterBubbles[i];
    b.life -= dt;
    if (b.life <= 0) {
      underwaterBubbles.splice(i, 1);
      continue;
    }
    b.x += (b.vx + Math.sin(performance.now() * 0.005 + b.y * 0.04) * 18) * dt;
    b.y += b.vy * dt;
    b.alpha = Math.max(0, b.life / b.maxLife);
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

let camera = { x: 0, y: 0, zoom: 1.0 };
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
  const isRunFinished = runTimer.stopped || gameState.phase === 'DEVOURED' || gameState.phase === 'DELIVERED' || player.onPerch;
  if (isRunFinished) {
    targetTracker.classList.add('hidden');
  } else {
    targetTracker.classList.remove('hidden');

    // Update bottom tracker speed indicator dynamically
    const speed = Math.round(Math.hypot(player.vel.x, player.vel.y) * 0.032);
    targetSpeedBadge.textContent = `${speed} MPH`;
    if (speed >= 200 && speed <= 210) {
      targetSpeedBadge.style.color = '#22c55e'; // sweet-spot
      targetSpeedBadge.style.textShadow = '0 0 8px rgba(34, 197, 94, 0.6)';
    } else if (speed > 210) {
      targetSpeedBadge.style.color = '#f43f5e'; // overspeed
      targetSpeedBadge.style.textShadow = '0 0 8px rgba(244, 63, 94, 0.6)';
    } else if (speed >= 150) {
      targetSpeedBadge.style.color = '#f59e0b'; // accelerating
      targetSpeedBadge.style.textShadow = 'none';
    } else {
      targetSpeedBadge.style.color = '#38bdf8'; // cruise
      targetSpeedBadge.style.textShadow = 'none';
    }
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

  // --- Run Timer display ---
  if (runTimer.active || runTimer.stopped) {
    runTimerEl.classList.remove('hidden');
    runTimerReadout.textContent = runTimer.elapsed.toFixed(2);
    if (runTimer.stopped) {
      runTimerEl.className = runTimer.outcome === 'success' ? 'stopped-success' : 'stopped-fail';
    } else {
      runTimerEl.className = 'running';
    }
  } else {
    runTimerEl.className = 'hidden';
  }
}

function updateCamera(dt) {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Calculate dynamic FOV speed zoom — subtle pull-back (1.0 at idle, 0.90 at 210+ MPH)
  const speedMph = Math.hypot(player.vel.x, player.vel.y) * 0.032;
  const isFlaring = input.flap(); // Space = wing flare / brake
  // When flaring, snap zoom back toward 1.0 faster (mild G-force sensation)
  const targetZoom = isFlaring
    ? 1.0
    : 1.0 - Math.min(0.10, Math.max(0, (speedMph - 60) / 180) * 0.10);
  const zoomLerpSpeed = isFlaring ? 6.0 : 3.0;
  camera.zoom += (targetZoom - camera.zoom) * Math.min(1, (dt || 0.016) * zoomLerpSpeed);

  const viewW = screenW / camera.zoom;
  const viewH = screenH / camera.zoom;

  camera.x = Math.max(0, Math.min(world.width - viewW, player.pos.x - viewW * 0.48));
  camera.y = Math.max(0, Math.min(world.height - viewH, player.pos.y - viewH * 0.5));
}

function updateShark(dt) {
  const playerCX = player.pos.x + player.size.w * 0.5;
  const playerCY = player.pos.y + player.size.h * 0.5;
  const inWater = player.pos.y + player.size.h >= world.ground.y;

  // Spine flex & swimming frequency
  const spd = Math.hypot(shark.vx, shark.vy);
  const wagFreq = shark.chasing ? 14 : Math.max(4.5, spd * 0.035);
  shark.spinePhase += dt * wagFreq;

  // Smooth facing interpolation (1 = facing right, -1 = facing left)
  const targetFacing = shark.vx >= 0 ? 1 : -1;
  shark.renderFacing += (targetFacing - shark.renderFacing) * Math.min(1, dt * 5.5);

  // Smooth pitch angle interpolation (pitch up/down based on vy)
  const pitchFactor = shark.renderFacing >= 0 ? 1 : -1;
  const targetPitch = Math.max(-0.45, Math.min(0.45, (shark.vy / 280) * pitchFactor));
  shark.renderPitch += (targetPitch - shark.renderPitch) * Math.min(1, dt * 6.5);

  // Mouth gape opening wide during predatory frenzy
  const distToPlayer = Math.hypot(playerCX - shark.x, playerCY - shark.y);
  const targetMouth = (shark.chasing && distToPlayer < 380) ? Math.min(1, (380 - distToPlayer) / 240) : 0;
  shark.mouthGape += (targetMouth - shark.mouthGape) * Math.min(1, dt * 7.5);

  // High-Speed Underwater Plunge & Devour Sequence
  if (gameState.phase === 'CRASH_PLUNGE' || gameState.phase === 'CRASH_FLOATING') {
    player.pos.x += player.vel.x * dt;
    player.pos.y += player.vel.y * dt;
    player.isPlungingDead = true;

    // Water drag & buoyancy slowing down underwater plunge
    player.vel.y *= Math.pow(0.84, dt * 60);
    player.vel.x *= Math.pow(0.86, dt * 60);

    if (player.pos.y > world.ground.y + 20) {
      player.vel.y -= 180 * dt;
    }

    // Spawn underwater bubbles trailing plunge path
    spawnUnderwaterBubbles(playerCX, player.pos.y, 4);

    shark.chasing = true;
    const dx = playerCX - shark.x;
    const dy = playerCY - shark.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 1) {
      shark.vx += (dx / dist) * shark.frenzySpeed * 4.8 * dt;
      shark.vy += (dy / dist) * shark.frenzySpeed * 4.8 * dt;
      const currentSpd = Math.hypot(shark.vx, shark.vy);
      if (currentSpd > shark.frenzySpeed) {
        shark.vx = (shark.vx / currentSpd) * shark.frenzySpeed;
        shark.vy = (shark.vy / currentSpd) * shark.frenzySpeed;
      }
    }
    shark.x += shark.vx * dt;
    shark.y += shark.vy * dt;
    shark.x = Math.max(80, Math.min(world.width - 80, shark.x));

    // When shark reaches the plunging bird body underwater -> UNDERWATER CHOMP!
    if (dist < 55) {
      spawnWaterSplash(playerCX, world.ground.y, 45);
      spawnShockwave(playerCX, player.pos.y, 160);
      spawnFeatherBurst(playerCX, player.pos.y, 35, 0, -100);
      shark.mouthGape = 1.0;
      player.isPlungingDead = false; // Devoured underwater!
      player.isFloatingDead = false;
      gameState.phase = 'DEVOURED';
      shark.chasing = false;
      stopRunTimer('fail');
      // Keep the original water crash death message — don't overwrite it when shark finishes eating
    }
    return;
  }

  if (shark.chasing) {
    // Aggressively home toward player
    const dx = playerCX - shark.x;
    const dy = playerCY - shark.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      shark.vx += (dx / dist) * shark.frenzySpeed * 4 * dt;
      shark.vy += (dy / dist) * shark.frenzySpeed * 4 * dt;
      const currentSpd = Math.hypot(shark.vx, shark.vy);
      if (currentSpd > shark.frenzySpeed) {
        shark.vx = (shark.vx / currentSpd) * shark.frenzySpeed;
        shark.vy = (shark.vy / currentSpd) * shark.frenzySpeed;
      }
    }
    shark.x += shark.vx * dt;
    shark.y += shark.vy * dt;
    shark.x = Math.max(80, Math.min(world.width - 80, shark.x));

    // DEVOURED — shark caught player still in water
    if (dist < 55 && inWater && gameState.phase === 'SHARK_CHASE') {
      gameState.phase = 'DEVOURED';
      shark.chasing = false;
      stopRunTimer('fail');
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

      if (gameState.phase === 'HUNT') {
        // Escaped water but already missed the dove — run is over
        stopRunTimer('fail');
        bannerTitle.textContent = '💨 BARELY ESCAPED — BUT RUN IS OVER';
        bannerSubtitle.innerHTML = `Survived the shark! But the dive window is gone. Press <kbd>R</kbd> to try again.`;
        interceptBanner.className = 'intercept-banner warning';
        hudObjective.textContent = 'Run over — press R to reset and try again.';
        // Banner stays until R is pressed
      } else {
        // Escaped while carrying prey — keep going!
        bannerTitle.textContent = '💨 BARELY ESCAPED THE SHARK!';
        bannerSubtitle.innerHTML = `You got out just in time! Now get that prey to the nest!`;
        interceptBanner.className = 'intercept-banner';
        warningHideTimeout = setTimeout(() => interceptBanner.classList.add('hidden'), 3500);
        hudObjective.textContent = 'Objective: Ascend to the cliff nest at 50% altitude and flare wings to land gently.';
      }
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

    // Player hit the water — check impact speed first (100 MPH threshold)
    if (inWater && gameState.phase !== 'DEVOURED' && gameState.phase !== 'CRASH_PLUNGE' && gameState.phase !== 'CRASH_FLOATING' && gameState.phase !== 'SHARK_CHASE') {
      const impactMph = Math.hypot(player.vel.x, player.vel.y) * 0.032;

      if (impactMph > 100) {
        // Slam into water over 100 MPH — kinetic underwater plunge!
        gameState.phase = 'CRASH_PLUNGE';
        gameState.crashSpeed = Math.round(impactMph);
        player.isPlungingDead = true;
        stopRunTimer('fail');

        // Plunge initial underwater momentum & depth target
        const impactVelY = player.vel.y;
        player.vel.y = Math.min(1600, Math.max(450, impactVelY * 0.45));
        player.vel.x *= 0.35;
        player.pos.y = world.ground.y + 12;

        spawnWaterSplash(playerCX, world.ground.y, 90);
        spawnShockwave(playerCX, world.ground.y, 280);
        spawnFeatherBurst(playerCX, world.ground.y, 45, player.vel.x, player.vel.y);

        if (warningHideTimeout) clearTimeout(warningHideTimeout);
        bannerTitle.textContent = `💦 KINETIC WATER PLUNGE AT ${Math.round(impactMph)} MPH!`;
        bannerSubtitle.innerHTML = `You slammed into the water at <strong>${Math.round(impactMph)} MPH</strong>! Plunging deep underwater... shark incoming!`;
        interceptBanner.className = 'intercept-banner warning';
        hudObjective.textContent = `💀 Kinetic plunge at ${Math.round(impactMph)} MPH! Plunging deep underwater... shark incoming!`;

        shark.chasing = true;
        const minDist = 750;
        const dx = playerCX - shark.x;
        if (Math.abs(dx) < minDist) {
          shark.x = playerCX + (dx >= 0 ? -minDist : minDist);
          shark.x = Math.max(80, Math.min(world.width - 80, shark.x));
          shark.vx = 0;
          shark.vy = world.ground.y + 100;
        }
        shark.vx = (playerCX > shark.x ? 1 : -1) * shark.patrolSpeed * 4;
        return;
      }

      // Safe entry speed (<= 100 MPH) — shark attack!
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

function stopRunTimer(outcome) {
  if (!runTimer.active) return;
  runTimer.active = false;
  runTimer.stopped = true;
  runTimer.outcome = outcome;
  gameState.finalTime = runTimer.elapsed;
}

function update(dt, realDt) {
  if (input.consumeReset()) {
    player.reset(window.innerWidth * 0.5 - 15, world.perch.y - 22);
    player.isFloatingDead = false;
    player.onPerch = true;
    player.perchX = world.perch.x;
    player.perchW = world.perch.w;
    target.reset();
    feathers.length = 0;
    heartParticles.length = 0;
    shockwaves.length = 0;
    waterSplashParticles.length = 0;
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
    screenShake.power = 0;
    screenShake.timer = 0;
    // Reset run timer
    runTimer.active = false;
    runTimer.elapsed = 0;
    runTimer.stopped = false;
    runTimer.outcome = null;
    gameState.finalTime = null;
  }

  // DEBUG: T key — teleport just above water surface for shark testing
  if (input.consumeTestWater()) {
    const spawnX = world.width * 0.5;
    player.pos.x = spawnX - player.size.w * 0.5;
    player.pos.y = world.ground.y - player.size.h - 80;
    player.vel.x = 0;
    player.vel.y = 120; // gentle fall toward water
    player.isFloatingDead = false;
    player.onPerch = false;
    player.grounded = false;
    player.currentPlatform = null;
    feathers.length = 0;
    shockwaves.length = 0;
    waterSplashParticles.length = 0;
    if (warningHideTimeout) clearTimeout(warningHideTimeout);
    interceptBanner.className = 'intercept-banner hidden';
    hudObjective.textContent = '[DEBUG] Teleported near water — T to repeat, R to full reset';
  }

  if (gameState.phase !== 'DEVOURED' && gameState.phase !== 'CRASH_PLUNGE' && gameState.phase !== 'CRASH_FLOATING') {
    const wasOnPerch = player.onPerch;
    player.update(dt, input, world.platforms);
    // Start timer the moment the bird leaves the perch
    if (wasOnPerch && !player.onPerch && !runTimer.active && !runTimer.stopped) {
      runTimer.active = true;
      runTimer.elapsed = 0;
    }
  }

  // Tick timer (use realDt so slow-motion doesn't warp the time)
  if (runTimer.active) {
    runTimer.elapsed += realDt;
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
        stopRunTimer('fail');

        bannerTitle.textContent = '⚠️ TOO FAST — OVERSHOT!';
        bannerSubtitle.innerHTML = `Speed: <strong>${col.speed} MPH</strong> (Need <strong>200–210 MPH</strong>) · Press <kbd>R</kbd> to try again`;
        interceptBanner.className = 'intercept-banner warning';
        hudObjective.textContent = 'Run over — missed the dive window. Press R to reset.';
        if (warningHideTimeout) clearTimeout(warningHideTimeout);
        // Banner stays until R is pressed
      } else if (col.status === 'too_slow') {
        spawnFeatherBurst(doveCenterX, doveCenterY, 20, player.vel.x, player.vel.y);
        spawnShockwave(doveCenterX, doveCenterY, 90);
        stopRunTimer('fail');

        bannerTitle.textContent = '⚠️ TOO SLOW — GLANCED OFF!';
        bannerSubtitle.innerHTML = `Speed: <strong>${col.speed} MPH</strong> (Need <strong>200–210 MPH</strong>) · Press <kbd>R</kbd> to try again`;
        interceptBanner.className = 'intercept-banner warning';
        hudObjective.textContent = 'Run over — missed the dive window. Press R to reset.';
        if (warningHideTimeout) clearTimeout(warningHideTimeout);
        // Banner stays until R is pressed
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
          stopRunTimer('success');
          spawnHearts(world.nest.x + 110, world.nest.y, 25);

          bannerTitle.textContent = '🏆 MISSION ACCOMPLISHED!';
          bannerSubtitle.innerHTML = `Prey delivered gently to your hungry chicks! · Strike: <strong>${gameState.strikeSpeed} MPH</strong> · Landing: <strong>${attempt.speedMph} MPH (SOFT FLARE)</strong> · Time: <strong>${runTimer.elapsed.toFixed(2)}s</strong> · Press <kbd>R</kbd> to Play Again`;
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

  updateCamera(dt);
  updateHud();
  // Wall collision — left cliff & right bridge beam
  const CLIFF_W = 90;  // left cliff thickness (player can't go behind rock)
  const BEAM_W  = 80;  // right bridge beam thickness
  const leftWall  = CLIFF_W;
  const rightWall = world.width - BEAM_W;

  const playerCX2 = player.pos.x + player.size.w * 0.5;
  const activePhase = gameState.phase;
  const canRagdoll = !player.onPerch && !player.isPlungingDead &&
                     activePhase !== 'DEVOURED' && activePhase !== 'CRASH_PLUNGE';

  if (canRagdoll && player.pos.x < leftWall) {
    const impactMph = Math.abs(player.vel.x) * 0.032;
    player.pos.x = leftWall;
    if (impactMph > 20) {
      // Ragdoll bounce off left cliff
      player.vel.x = Math.abs(player.vel.x) * 0.35;
      player.ragdolling = true;
      player.ragdollTimer = 0.9 + impactMph * 0.004;
      player.ragdollSpin = -(3 + impactMph * 0.06); // spin counter-clockwise
      spawnFeatherBurst(leftWall + 20, player.pos.y + player.size.h * 0.5, 30, player.vel.x, player.vel.y * 0.5);
      spawnShockwave(leftWall + 10, player.pos.y + player.size.h * 0.5, 100);
      screenShake.power = Math.min(18, impactMph * 0.12);
      screenShake.timer = 0.32;
      if (warningHideTimeout) clearTimeout(warningHideTimeout);
      bannerTitle.textContent = '💥 SLAMMED THE CLIFF FACE!';
      bannerSubtitle.innerHTML = `Hit the cliff at <strong>${Math.round(impactMph)} MPH</strong> — ragdolling down!`;
      interceptBanner.className = 'intercept-banner warning';
      warningHideTimeout = setTimeout(() => interceptBanner.classList.add('hidden'), 2800);
    } else {
      player.vel.x = 0;
    }
  } else if (canRagdoll && player.pos.x + player.size.w > rightWall) {
    const impactMph = Math.abs(player.vel.x) * 0.032;
    player.pos.x = rightWall - player.size.w;
    if (impactMph > 20) {
      // Ragdoll bounce off right bridge beam
      player.vel.x = -Math.abs(player.vel.x) * 0.35;
      player.ragdolling = true;
      player.ragdollTimer = 0.9 + impactMph * 0.004;
      player.ragdollSpin = (3 + impactMph * 0.06); // spin clockwise
      spawnFeatherBurst(rightWall - 20, player.pos.y + player.size.h * 0.5, 30, player.vel.x, player.vel.y * 0.5);
      spawnShockwave(rightWall - 10, player.pos.y + player.size.h * 0.5, 100);
      screenShake.power = Math.min(18, impactMph * 0.12);
      screenShake.timer = 0.32;
      if (warningHideTimeout) clearTimeout(warningHideTimeout);
      bannerTitle.textContent = '💥 SLAMMED THE BRIDGE BEAM!';
      bannerSubtitle.innerHTML = `Hit the bridge support at <strong>${Math.round(impactMph)} MPH</strong> — ragdolling down!`;
      interceptBanner.className = 'intercept-banner warning';
      warningHideTimeout = setTimeout(() => interceptBanner.classList.add('hidden'), 2800);
    } else {
      player.vel.x = 0;
    }
  } else if (!canRagdoll) {
    // Dead-state players still get hard-clamped but no ragdoll
    if (player.pos.x < 0) player.pos.x = 0;
    if (player.pos.x + player.size.w > world.width) player.pos.x = world.width - player.size.w;
  }

  // Tick screen shake
  if (screenShake.timer > 0) {
    screenShake.timer -= dt;
    screenShake.power *= Math.pow(0.85, dt * 60);
    if (screenShake.timer <= 0) screenShake.power = 0;
  }
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

  if (windStrength > 0.55) {
    // Subtle speed vignette — barely visible darkening at the edges at very high speeds
    const vigAlpha = (windStrength - 0.55) / 0.45 * 0.12;
    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, height * 0.28, width * 0.5, height * 0.5, height * 0.85);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, `rgba(0, 8, 20, ${vigAlpha})`);
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

  // Shark — live world-space state, organic multi-joint spine & Great White aesthetic
  {
    const sharkX = shark.x;
    const sharkY = shark.y;
    const facing = shark.renderFacing;
    const bodyLen = shark.chasing ? 165 : 145;
    const bodyH = shark.chasing ? 38 : 32;

    ctx.save();
    ctx.translate(sharkX, sharkY);
    ctx.scale(facing, 1);
    ctx.rotate(shark.renderPitch);

    // Spine flex helper: calculates transverse y-displacement along body length x
    const flexAmp = shark.chasing ? 14 : 7;
    const getFlex = (xNorm) => {
      // xNorm goes from +0.5 (nose tip) to -0.6 (tail fluke tip)
      const tailBias = Math.pow(Math.max(0, 0.5 - xNorm), 1.25);
      return Math.sin(shark.spinePhase - xNorm * 3.8) * flexAmp * tailBias;
    };

    // --- Main Slate Body Gradient (Upper Torpedo Spine) ---
    const bodyGrad = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
    bodyGrad.addColorStop(0, '#1c3444');
    bodyGrad.addColorStop(0.45, '#355467');
    bodyGrad.addColorStop(1, '#1b3240');
    ctx.fillStyle = bodyGrad;

    ctx.beginPath();
    // Start at Snout Tip (+0.5 * bodyLen, 0)
    ctx.moveTo(bodyLen * 0.5, getFlex(0.5));
    // Dorsal curve down to tail base
    ctx.bezierCurveTo(
      bodyLen * 0.32, -bodyH * 0.55 + getFlex(0.32),
      -bodyLen * 0.05, -bodyH * 0.65 + getFlex(-0.05),
      -bodyLen * 0.38, -bodyH * 0.22 + getFlex(-0.38)
    );

    // Dynamic Caudal Fin (Heterocercal Crescent Tail)
    const tailFlexUpper = getFlex(-0.58);
    const tailFlexNotch = getFlex(-0.46);
    const tailFlexLower = getFlex(-0.55);

    // Upper tail lobe
    ctx.lineTo(-bodyLen * 0.58, -bodyH * 0.7 + tailFlexUpper);
    ctx.lineTo(-bodyLen * 0.46, 0 + tailFlexNotch);
    // Lower tail lobe
    ctx.lineTo(-bodyLen * 0.55, bodyH * 0.55 + tailFlexLower);

    // Ventral curve back toward snout
    ctx.bezierCurveTo(
      -bodyLen * 0.38, bodyH * 0.22 + getFlex(-0.38),
      -bodyLen * 0.05, bodyH * 0.62 + getFlex(-0.05),
      bodyLen * 0.26, bodyH * 0.4 + getFlex(0.26)
    );

    // Lower Jaw & Mouth Notch (opens wide during chase)
    const jawOpen = shark.mouthGape * 12;
    ctx.lineTo(bodyLen * 0.3, bodyH * 0.2 + jawOpen + getFlex(0.3));
    ctx.lineTo(bodyLen * 0.5, getFlex(0.5));
    ctx.closePath();
    ctx.fill();

    // --- Counter-Shading Porcelain Belly ---
    ctx.fillStyle = '#eaf2f8';
    ctx.beginPath();
    ctx.moveTo(bodyLen * 0.5, getFlex(0.5));
    ctx.bezierCurveTo(
      bodyLen * 0.3, bodyH * 0.05 + getFlex(0.3),
      -bodyLen * 0.05, bodyH * 0.42 + getFlex(-0.05),
      -bodyLen * 0.36, bodyH * 0.16 + getFlex(-0.36)
    );
    ctx.bezierCurveTo(
      -bodyLen * 0.18, bodyH * 0.58 + getFlex(-0.18),
      bodyLen * 0.15, bodyH * 0.5 + getFlex(0.15),
      bodyLen * 0.3, bodyH * 0.2 + jawOpen + getFlex(0.3)
    );
    ctx.closePath();
    ctx.fill();

    // --- Predatory Open Mouth Cavity & Serrated White Teeth ---
    if (shark.mouthGape > 0.02 || shark.chasing || gameState.phase === 'DEVOURED') {
      // Dark crimson throat cavity
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.moveTo(bodyLen * 0.48, getFlex(0.48));
      ctx.lineTo(bodyLen * 0.32, bodyH * 0.05 + getFlex(0.32));
      ctx.lineTo(bodyLen * 0.3, bodyH * 0.2 + jawOpen + getFlex(0.3));
      ctx.closePath();
      ctx.fill();

      // Sharp triangular teeth
      ctx.fillStyle = '#ffffff';
      const teethCount = 6;
      for (let t = 0; t < teethCount; t++) {
        const tFrac = t / (teethCount - 1);
        const tx = bodyLen * 0.46 - tFrac * bodyLen * 0.14;
        const ty = getFlex(tx / bodyLen) + (tFrac * jawOpen * 0.5);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 3, ty + 5 + jawOpen * 0.3);
        ctx.lineTo(tx - 6, ty);
        ctx.closePath();
        ctx.fill();
      }
    }

    // --- Devoured Bird clutched in Shark's Jaws ---
    if (gameState.phase === 'DEVOURED') {
      ctx.save();
      const mouthX = bodyLen * 0.36;
      const mouthY = bodyH * 0.12 + getFlex(0.36) + jawOpen * 0.4;
      ctx.translate(mouthX, mouthY);
      ctx.rotate(-0.35);

      // Limp bird torso clutched inside teeth
      ctx.fillStyle = '#e6ded0';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Wet wing hanging out of shark mouth
      ctx.fillStyle = '#354557';
      ctx.beginPath();
      ctx.ellipse(-6, 5, 12, 4.5, 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Feathers protruding from jaw
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(8, -3, 6, 3, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // --- Dorsal Fin (Iconic sharp top fin with dynamic flex) ---
    const dorsalX = -bodyLen * 0.05;
    const dorsalFlex = getFlex(dorsalX / bodyLen);
    ctx.fillStyle = '#1c3444';
    ctx.beginPath();
    ctx.moveTo(dorsalX + 16, -bodyH * 0.55 + dorsalFlex);          // Base front
    ctx.quadraticCurveTo(
      dorsalX - 4, -bodyH * 1.2 + dorsalFlex,
      dorsalX - 18, -bodyH * 1.62 + dorsalFlex                     // Fin Tip
    );
    ctx.quadraticCurveTo(
      dorsalX - 10, -bodyH * 0.9 + dorsalFlex,
      dorsalX - 22, -bodyH * 0.5 + dorsalFlex                      // Base rear notch
    );
    ctx.closePath();
    ctx.fill();

    // --- Pectoral Fin (Side fin) ---
    const pecX = bodyLen * 0.12;
    const pecFlex = getFlex(pecX / bodyLen);
    ctx.fillStyle = '#264253';
    ctx.beginPath();
    ctx.moveTo(pecX + 8, bodyH * 0.15 + pecFlex);
    ctx.lineTo(pecX - 18, bodyH * 0.85 + pecFlex);
    ctx.lineTo(pecX - 6, bodyH * 0.3 + pecFlex);
    ctx.closePath();
    ctx.fill();

    // --- Piercing Dark Eye & Specular Glint ---
    const eyeX = bodyLen * 0.35;
    const eyeY = -bodyH * 0.1 + getFlex(eyeX / bodyLen);
    ctx.fillStyle = '#09101d';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Specular eye glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(eyeX + 1.2, eyeY - 1.2, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Brow shading arc
    ctx.strokeStyle = '#111c26';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY - 1, 5.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // --- Gill Slits ---
    ctx.strokeStyle = 'rgba(18, 32, 43, 0.75)';
    ctx.lineWidth = 1.8;
    for (let g = 0; g < 5; g++) {
      const gx = bodyLen * 0.22 - g * 6;
      const gFlex = getFlex(gx / bodyLen);
      ctx.beginPath();
      ctx.moveTo(gx, -bodyH * 0.2 + gFlex);
      ctx.quadraticCurveTo(gx - 2, gFlex, gx, bodyH * 0.18 + gFlex);
      ctx.stroke();
    }

    // --- Water Foam & Spray behind slicing Dorsal Fin ---
    ctx.strokeStyle = 'rgba(220, 245, 255, 0.75)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(dorsalX + 12, -bodyH * 0.55 + dorsalFlex);
    ctx.quadraticCurveTo(dorsalX - 10, -bodyH * 0.45 + dorsalFlex, dorsalX - 35, -bodyH * 0.55 + dorsalFlex);
    ctx.stroke();

    ctx.restore(); // end translate+scale+rotate
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

  // 3. Full-height Left Cliff Face
  {
    const cw = 90; // cliff width
    const now2 = performance.now() * 0.001;

    // Deep rock base
    const rockGrad = ctx.createLinearGradient(0, 0, cw, 0);
    rockGrad.addColorStop(0, '#111827');
    rockGrad.addColorStop(0.55, '#1e293b');
    rockGrad.addColorStop(1, '#2d3d4f');
    ctx.fillStyle = rockGrad;
    ctx.fillRect(0, 0, cw, world.ground.y);

    // Irregular cliff edge silhouette (jagged right face)
    ctx.fillStyle = '#2d3d4f';
    ctx.beginPath();
    ctx.moveTo(cw, 0);
    for (let yy = 0; yy <= world.ground.y; yy += 320) {
      const jag = Math.sin(yy * 0.0031 + 1.7) * 18 + Math.sin(yy * 0.0071 + 0.4) * 9;
      ctx.lineTo(cw + jag, yy + 160);
      ctx.lineTo(cw + jag - 12, yy + 320);
    }
    ctx.lineTo(cw, world.ground.y);
    ctx.closePath();
    ctx.fill();

    // Rock strata horizontal bands
    ctx.strokeStyle = 'rgba(55, 75, 100, 0.55)';
    ctx.lineWidth = 2.5;
    for (let yy = 400; yy < world.ground.y; yy += 800) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(30, yy - 14, 60, yy + 10, cw, yy + 4);
      ctx.stroke();
    }

    // Crack veins
    ctx.strokeStyle = 'rgba(15, 20, 30, 0.65)';
    ctx.lineWidth = 1.4;
    for (let yy = 200; yy < world.ground.y; yy += 1100) {
      ctx.beginPath();
      ctx.moveTo(20, yy);
      ctx.lineTo(55, yy + 180);
      ctx.lineTo(40, yy + 310);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(50, yy + 60);
      ctx.lineTo(80, yy + 200);
      ctx.stroke();
    }

    // Mossy highlight edge
    ctx.fillStyle = 'rgba(40, 60, 44, 0.45)';
    for (let yy = 600; yy < world.ground.y; yy += 1400) {
      ctx.beginPath();
      ctx.ellipse(cw - 8, yy, 18, 60, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Full-height Right Bridge Support Beam
  {
    const bx = world.width - 80;
    const bw = 80;

    // Concrete base
    const conGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    conGrad.addColorStop(0, '#2c3240');
    conGrad.addColorStop(0.35, '#3b4459');
    conGrad.addColorStop(0.72, '#2e3648');
    conGrad.addColorStop(1, '#1e2535');
    ctx.fillStyle = conGrad;
    ctx.fillRect(bx, 0, bw, world.ground.y);

    // Left face edge shadow
    ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
    ctx.fillRect(bx, 0, 8, world.ground.y);

    // Horizontal construction joints
    ctx.strokeStyle = 'rgba(20, 28, 42, 0.8)';
    ctx.lineWidth = 2.5;
    for (let yy = 0; yy < world.ground.y; yy += 400) {
      ctx.beginPath();
      ctx.moveTo(bx, yy);
      ctx.lineTo(bx + bw, yy);
      ctx.stroke();
    }

    // Vertical panel seam
    ctx.strokeStyle = 'rgba(20, 28, 42, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.5, 0);
    ctx.lineTo(bx + bw * 0.5, world.ground.y);
    ctx.stroke();

    // Rust stain streaks
    ctx.strokeStyle = 'rgba(120, 60, 20, 0.28)';
    ctx.lineWidth = 3;
    for (let yy = 300; yy < world.ground.y; yy += 900) {
      ctx.beginPath();
      ctx.moveTo(bx + 22, yy);
      ctx.lineTo(bx + 18, yy + 280);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 55, yy + 140);
      ctx.lineTo(bx + 50, yy + 400);
      ctx.stroke();
    }

    // Bolt circles at joints
    ctx.fillStyle = 'rgba(18, 22, 32, 0.9)';
    for (let yy = 400; yy < world.ground.y; yy += 400) {
      for (const boltX of [bx + 16, bx + 64]) {
        ctx.beginPath();
        ctx.arc(boltX, yy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 100, 130, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(boltX, yy, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Dangling cable from bridge deck above
    ctx.strokeStyle = 'rgba(50, 60, 80, 0.7)';
    ctx.lineWidth = 2.8;
    for (const cableX of [bx + 20, bx + 58]) {
      ctx.beginPath();
      ctx.moveTo(cableX, 0);
      // Cable sag: quadratic curve down to join beam body
      ctx.quadraticCurveTo(cableX - 8, 600, cableX, 1200);
      ctx.lineTo(cableX, world.ground.y);
      ctx.stroke();
    }

    // Bridge deck cap at top (matches perch era)
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(bx - 10, 0, bw + 10, 28);
    ctx.fillStyle = '#6b4a30';
    ctx.fillRect(bx - 10, 6, bw + 10, 7);
  }


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
  if (feathers.length === 0 && heartParticles.length === 0 && shockwaves.length === 0 && waterSplashParticles.length === 0 && underwaterBubbles.length === 0) return;
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Underwater Bubbles
  for (const b of underwaterBubbles) {
    ctx.fillStyle = `rgba(186, 230, 253, ${b.alpha * 0.75})`;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 255, 255, ${b.alpha * 0.9})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Water Splash Particles
  for (const p of waterSplashParticles) {
    ctx.fillStyle = `rgba(215, 245, 255, ${p.alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

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
  if (gameState.phase === 'DEVOURED') return;
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  player.draw(ctx);

  // Draw MPH minimally just above the bird
  const speed = Math.round(Math.hypot(player.vel.x, player.vel.y) * 0.032);
  
  // Style according to the speed zone
  let color = '#38bdf8'; // cruise (cyan)
  if (speed >= 200 && speed <= 210) {
    color = '#22c55e'; // sweet-spot (neon green)
  } else if (speed > 210) {
    color = '#f43f5e'; // overspeed (red)
  } else if (speed >= 150) {
    color = '#f59e0b'; // accelerating (amber)
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  
  // Text offset above the bird.
  const textX = player.pos.x + player.size.w * 0.5;
  const textY = player.pos.y - 12;
  
  // Draw stroke first for contrast
  ctx.strokeStyle = 'rgba(4, 11, 26, 0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(`${speed} MPH`, textX, textY);
  ctx.fillText(`${speed} MPH`, textX, textY);

  ctx.restore();
}

function draw() {
  ctx.save();
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Apply screen shake offset
  let shakeX = 0, shakeY = 0;
  if (screenShake.power > 0.5) {
    shakeX = (Math.random() - 0.5) * screenShake.power * 2;
    shakeY = (Math.random() - 0.5) * screenShake.power * 2;
  }

  // Center camera zoom around viewport center for dynamic FOV scale
  ctx.translate(screenW * 0.5 + shakeX, screenH * 0.5 + shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-screenW * 0.5, -screenH * 0.5);

  drawBackground();
  drawStructures();
  drawTarget();
  drawParticles();
  drawPlayer();

  ctx.restore();
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

  update(dt, realDt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);

window.__game = { player, world, input, target, gameState };
