export default class Player {
  constructor(x = 180, y = 300) {
    this.reset(x, y);
  }

  reset(x = 180, y = 300) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.size = { w: 28, h: 22 };
    this.grounded = false;
    this.onPerch = false;
    this.angle = 0;
    this.wingPhase = 0;
    this.flapBoost = 0;
    this.glideCharge = 0;
    this.diveCharge = 0;
    this.facing = 1;
    this.wasHoldingW = false;
    this.wasHoldingDown = false;
    this.perchX = 0;
    this.perchW = 0;
    this.takeoffEase = 0;
    this.spaceFlapCooldown = 0;
    this.wasHoldingSpace = false;
  }

  update(dt, input, platforms) {
    const moveX = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    const flapPressed = input.consumeFlap();
    const holdingSpace = input.flap();
    const justPressedSpace = holdingSpace && !this.wasHoldingSpace;
    const holdingW = input.up() && !holdingSpace;
    const justPressedW = holdingW && !this.wasHoldingW;
    const holdS = input.down() && !input.flap();
    const justPressedDown = holdS && !this.wasHoldingDown;

    const gravity = 340;
    const flapAirImpulse = 260;
    const maxFlightSpeed = 6600;
    const maxRiseSpeed = 1100;
    const directionBias = moveX !== 0 ? moveX : (this.vel.x >= 0 ? 1 : -1);

    if (this.onPerch) {
      this.vel.x = 0;
      this.vel.y = 0;
      this.grounded = true;
      this.pos.x = Math.min(Math.max(this.perchX, this.pos.x + moveX * 180 * dt), this.perchX + this.perchW - this.size.w);
      this.facing = moveX === 0 ? this.facing : (moveX > 0 ? 1 : -1);
      this.wingPhase += dt * 18;
      this.angle += (0 - this.angle) * 0.18;

      if (justPressedDown || (holdS && !this.wasHoldingDown)) {
        this.onPerch = false;
        this.grounded = false;
        this.vel.y = 26;
        this.vel.x = (moveX === 0 ? this.facing : moveX) * 58;
        this.pos.y = platforms[1].y + platforms[1].h + 4;
        this.takeoffEase = 1;
        this.angle = -0.18;
      }

      this.wasHoldingDown = holdS;
      this.wasHoldingW = holdingW;
      this.wasHoldingSpace = holdingSpace;
      return;
    }

    if (this.takeoffEase > 0) {
      const takeoffLift = Math.sin((1 - this.takeoffEase) * Math.PI) * 28;
      this.pos.y += (28 + takeoffLift) * dt;
      this.vel.y += 54 * dt;
      this.takeoffEase = Math.max(0, this.takeoffEase - dt * 2.1);
    }

    if (moveX !== 0) {
      const acceleration = 320 + Math.abs(this.vel.x) * 1.1;
      this.vel.x += moveX * acceleration * dt;
    } else {
      this.vel.x *= Math.pow(0.89, dt * 60);
    }

    if (holdingW) {
      if (justPressedW) {
        this.vel.y -= 52;
        this.vel.x += directionBias * 68;
        this.glideCharge = 1;
      }

      this.glideCharge = Math.max(0, this.glideCharge - dt * 2.1);
      this.vel.y -= 18 * dt;
      this.vel.x += directionBias * (110 + Math.abs(this.vel.x) * 0.2) * dt;
      if (this.vel.y < -maxRiseSpeed) this.vel.y = -maxRiseSpeed;
    } else {
      this.glideCharge = Math.max(0, this.glideCharge - dt * 2.8);
    }

    if (holdS) {
      this.diveCharge = Math.min(4.8, this.diveCharge + dt * 0.58);
      const diveForce = 28 + this.diveCharge * 42 + Math.abs(this.vel.y) * 0.011;
      this.vel.y += diveForce * dt;
      this.vel.x += directionBias * (8 + this.diveCharge * 16 + Math.abs(this.vel.y) * 0.006) * dt;
    } else {
      this.diveCharge = Math.max(0, this.diveCharge - dt * 1.5);
    }

    this.vel.y += gravity * (holdingW ? 0.72 : 1) * dt;

    if (this.spaceFlapCooldown > 0) {
      this.spaceFlapCooldown = Math.max(0, this.spaceFlapCooldown - dt);
    }

    // Holding Space is a reliable pull-out: it continuously bleeds vertical dive
    // speed, while still producing regular flap strokes. Fresh taps get a stronger
    // stroke, so skilled players can arrest later without making holding useless.
    if (holdingSpace) {
      const downwardSpeed = Math.max(0, this.vel.y);
      const arrestForce = 250 + downwardSpeed * 0.32;
      this.vel.y -= arrestForce * dt;
      this.vel.x *= Math.pow(0.992, dt * 60);
    }

    const shouldFlap = flapPressed || (holdingSpace && this.spaceFlapCooldown <= 0);
    if (shouldFlap) {
      const currentRise = Math.max(0, -this.vel.y);
      const downwardSpeed = Math.max(0, this.vel.y);
      const riseRamp = Math.min(1, currentRise / 220);
      const liftCurve = 110 + riseRamp * 160;
      const diveLift = Math.min(180, downwardSpeed * 0.075);
      const strokeMultiplier = flapPressed
        ? (justPressedSpace ? 1 : 1.65)
        : 0.68;
      const effectiveLift = liftCurve + diveLift;
      this.vel.y -= effectiveLift * 0.72 * strokeMultiplier;

      if (Math.abs(moveX) < 0.5) {
        this.vel.y -= Math.min(14, currentRise * 0.03);
      }

      const lateralBoost = moveX !== 0 ? directionBias * (24 + Math.abs(this.vel.x) * 0.06) : 0;
      this.vel.x += lateralBoost;
      this.glideCharge = 0;
      this.diveCharge = Math.max(0, this.diveCharge - 0.4);
      this.flapBoost = 1.1;
      this.grounded = false;
      this.spaceFlapCooldown = 0.14;
    } else {
      this.flapBoost *= 0.7;
    }

    if (this.vel.y < -maxRiseSpeed) this.vel.y = -maxRiseSpeed;

    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > maxFlightSpeed) {
      const scale = maxFlightSpeed / speed;
      this.vel.x *= scale;
      this.vel.y *= scale;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    this.grounded = false;
    const ground = platforms[0] || null;
    if (ground) {
      const enteringWater = this.pos.y + this.size.h > ground.y && this.pos.y < ground.y + ground.h;
      if (enteringWater) {
        const speed = Math.hypot(this.vel.x, this.vel.y);
        const drag = Math.min(0.76, 0.28 + speed / 1300);
        this.vel.x *= 1 - drag;
        this.vel.y *= 0.28;
        this.vel.y += 70 * dt;
        this.pos.y += 18 * dt;
        this.diveCharge = 0;
      }
    }

    const perch = platforms[1] || null;
    if (perch && this.vel.y >= 0) {
      const overlapsPerch = this.pos.x + this.size.w > perch.x && this.pos.x < perch.x + perch.w && this.pos.y + this.size.h > perch.y && this.pos.y < perch.y + perch.h;
      if (overlapsPerch) {
        this.pos.y = perch.y - this.size.h;
        this.vel.y = 0;
        this.vel.x = 0;
        this.onPerch = true;
        this.grounded = true;
        this.diveCharge = 0;
        this.perchX = perch.x;
        this.perchW = perch.w;
        this.pos.x = Math.min(Math.max(this.pos.x, perch.x), perch.x + perch.w - this.size.w);
      }
    }

    if (this.grounded) {
      this.vel.y = 0;
    }

    const targetFacing = Math.abs(this.vel.x) < 8 ? this.facing : (this.vel.x >= 0 ? 1 : -1);
    this.facing += (targetFacing - this.facing) * 0.22;
    this.wasHoldingW = holdingW;
    this.wasHoldingDown = holdS;
    this.wasHoldingSpace = holdingSpace;

    this.wingPhase += dt * (this.flapBoost > 0.1 ? 34 : 6);
    const climbBank = Math.max(0, -this.vel.y);
    const lateralBankScale = climbBank > 90 ? 0.72 : 1;
    const targetAngle = Math.max(-1.5, Math.min(1.5, this.vel.y / 270 + (this.vel.x / 520) * lateralBankScale));
    this.angle += (targetAngle - this.angle) * 0.22;
  }

  draw(ctx) {
    ctx.save();
    const diveSpeed = Math.max(0, this.vel.y);
    const divePose = diveSpeed > 110;
    const frontProfile = divePose && Math.abs(this.vel.x) < 30;
    const wingSweep = this.flapBoost > 0.1 ? Math.sin(this.wingPhase) * 16 : Math.sin(this.wingPhase) * 5;
    const tailSweep = Math.sin(this.wingPhase * 0.8 + 1.1) * 5;

    ctx.translate(this.pos.x + this.size.w / 2, this.pos.y + this.size.h / 2);
    const idleStraight = Math.abs(this.vel.x) < 28 && Math.abs(this.vel.y) < 40;
    const stretchX = this.onPerch ? 1 : (frontProfile ? 1.25 : (divePose ? 0.92 : (idleStraight ? 1.12 : 1)));
    const stretchY = this.onPerch ? 0.9 : (frontProfile ? 1.9 + Math.min(0.8, diveSpeed / 900) : (divePose ? 1.45 + Math.min(0.6, diveSpeed / 800) : (idleStraight ? 0.92 : 1)));
    ctx.scale(this.facing * stretchX, stretchY);
    ctx.rotate(this.angle * 0.85 + (frontProfile ? 0.12 : 0));

    if (frontProfile) {
      ctx.fillStyle = '#efb86c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f2c373';
      ctx.beginPath();
      ctx.moveTo(-16, -1);
      ctx.lineTo(-28, -12 - wingSweep * 0.4);
      ctx.lineTo(-22, 0);
      ctx.lineTo(-28, 10 + wingSweep * 0.2);
      ctx.lineTo(-16, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f2c373';
      ctx.beginPath();
      ctx.moveTo(16, -1);
      ctx.lineTo(28, -12 - wingSweep * 0.4);
      ctx.lineTo(22, 0);
      ctx.lineTo(28, 10 + wingSweep * 0.2);
      ctx.lineTo(16, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath();
      ctx.ellipse(12, 1, 4.5, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#171922';
      ctx.beginPath();
      ctx.arc(14.5, 0.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff8a4d';
      ctx.beginPath();
      ctx.moveTo(18, 1.5);
      ctx.lineTo(30, 3.5);
      ctx.lineTo(18, 8);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#efb86c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 9, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ee9a52';
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.lineTo(-28, -12 - wingSweep);
      ctx.lineTo(-20, 0);
      ctx.lineTo(-28, 10 + wingSweep * 0.35);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f2c373';
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.quadraticCurveTo(20, -16 - wingSweep * 0.7, 28, -2);
      ctx.lineTo(16, 8);
      ctx.quadraticCurveTo(10, 12, 8, -4);
      ctx.fill();

      ctx.fillStyle = '#f3d189';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-26, -8 - tailSweep);
      ctx.lineTo(-18, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath();
      ctx.ellipse(12, 2, 5, 6, 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#171922';
      ctx.beginPath();
      ctx.arc(14, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff8a4d';
      ctx.beginPath();
      ctx.moveTo(18, 2);
      ctx.lineTo(31, 5);
      ctx.lineTo(18, 9);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
