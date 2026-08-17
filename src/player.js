export default class Player {
  constructor(x = 180, y = 300) {
    this.reset(x, y);
  }

  reset(x = 180, y = 300) {
    this.pos = { x, y };
    this.prevPos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.size = { w: 28, h: 22 };
    this.grounded = false;
    this.onPerch = false;
    this.inWater = false;
    this.hasPrey = false;
    this.currentPlatform = null;
    this.landingAttempt = null;
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
    this.perchMoving = false;
    this.stoopProfile = 0;
    this.perchDropTimer = 0;
    this.straightLaunchTimer = 0;
  }

  update(dt, input, platforms = []) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;

    const moveX = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    const flapPressed = input.consumeFlap();
    const holdingSpace = input.flap();
    const justPressedSpace = holdingSpace && !this.wasHoldingSpace;
    const holdingW = input.up() && !holdingSpace;
    const justPressedW = holdingW && !this.wasHoldingW;
    const holdS = input.down() && !input.flap();
    const justPressedDown = holdS && !this.wasHoldingDown;

    const gravity = 340;
    const maxFlightSpeed = 6562.5; // Strictly capped at 210 MPH (210 / 0.032)
    const maxRiseSpeed = 1650;     // Responsive climb speed
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
        this.currentPlatform = null;
        this.vel.y = 30;
        this.vel.x = moveX * 60;
        this.takeoffEase = 1;
        this.perchDropTimer = 0.46;
        this.straightLaunchTimer = moveX === 0 ? 0.34 : 0;
        this.angle = -0.18;
      }

      this.wasHoldingDown = holdS;
      this.wasHoldingW = holdingW;
      this.wasHoldingSpace = holdingSpace;
      this.perchMoving = moveX !== 0;
      return;
    }

    if (this.takeoffEase > 0) {
      const takeoffLift = Math.sin((1 - this.takeoffEase) * Math.PI) * 28;
      this.pos.y += (28 + takeoffLift) * dt;
      this.vel.y += 54 * dt;
      this.takeoffEase = Math.max(0, this.takeoffEase - dt * 2.1);
    }

    if (this.perchDropTimer > 0) {
      this.perchDropTimer = Math.max(0, this.perchDropTimer - dt);
    }
    if (this.straightLaunchTimer > 0) {
      this.straightLaunchTimer = Math.max(0, this.straightLaunchTimer - dt);
    }

    if (moveX !== 0) {
      const acceleration = 340 + Math.abs(this.vel.x) * 1.15;
      this.vel.x += moveX * acceleration * dt;
    } else {
      this.vel.x *= Math.pow(0.89, dt * 60);
    }

    // Gliding lift
    if (holdingW) {
      if (justPressedW) {
        this.vel.y -= 75;
        this.vel.x += directionBias * 85;
        this.glideCharge = 1;
      }

      this.glideCharge = Math.max(0, this.glideCharge - dt * 1.8);
      this.vel.y -= 42 * dt;
      this.vel.x += directionBias * (130 + Math.abs(this.vel.x) * 0.25) * dt;
      if (this.vel.y < -maxRiseSpeed) this.vel.y = -maxRiseSpeed;
    } else {
      this.glideCharge = Math.max(0, this.glideCharge - dt * 2.8);
    }

    // Diving acceleration (reaches 200–210 MPH swiftly on sustained stoop)
    if (holdS) {
      this.diveCharge = Math.min(5.8, this.diveCharge + dt * 0.85);
      const diveForce = 52 + this.diveCharge * 68 + Math.abs(this.vel.y) * 0.022;
      this.vel.y += diveForce * dt;
      this.vel.x += directionBias * (12 + this.diveCharge * 20 + Math.abs(this.vel.y) * 0.008) * dt;
    } else {
      this.diveCharge = Math.max(0, this.diveCharge - dt * 1.5);
    }

    this.vel.y += gravity * (holdingW ? 0.65 : 1) * dt;

    if (this.spaceFlapCooldown > 0) {
      this.spaceFlapCooldown = Math.max(0, this.spaceFlapCooldown - dt);
    }

    // Holding Space is an active airbrake and stoop arrest
    if (holdingSpace) {
      const downwardSpeed = Math.max(0, this.vel.y);
      const arrestForce = 240 + downwardSpeed * 0.32;
      this.vel.y -= arrestForce * dt;
      this.vel.x *= Math.pow(0.99, dt * 60);
    }

    // Flapping / climbing impulse
    const shouldFlap = flapPressed || (holdingSpace && this.spaceFlapCooldown <= 0);
    if (shouldFlap) {
      const currentRise = Math.max(0, -this.vel.y);
      const downwardSpeed = Math.max(0, this.vel.y);
      const riseRamp = Math.min(1, currentRise / 320);
      const liftCurve = 140 + riseRamp * 210;
      const diveLift = Math.min(220, downwardSpeed * 0.09);
      const strokeMultiplier = flapPressed
        ? (justPressedSpace ? 1.05 : 1.35)
        : 0.65;
      const effectiveLift = liftCurve + diveLift;
      this.vel.y -= effectiveLift * 0.85 * strokeMultiplier;

      if (Math.abs(moveX) < 0.5) {
        this.vel.y -= Math.min(24, currentRise * 0.04);
      }

      const lateralBoost = moveX !== 0 ? directionBias * (28 + Math.abs(this.vel.x) * 0.07) : 0;
      this.vel.x += lateralBoost;
      this.glideCharge = 0;
      this.diveCharge = Math.max(0, this.diveCharge - 0.4);
      this.flapBoost = 1.15;
      this.grounded = false;
      this.spaceFlapCooldown = 0.14;
    } else {
      this.flapBoost *= 0.7;
    }

    if (this.vel.y < -maxRiseSpeed) this.vel.y = -maxRiseSpeed;

    // Uncapped downward dive speed: player must actively manage speed (with Space/W) to stay in 200–210 MPH window and arrest before water
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    this.grounded = false;

    // 1. Water collision
    const ground = platforms[0] || null;
    if (ground) {
      const overlapsWater = this.pos.y + this.size.h > ground.y && this.pos.y < ground.y + ground.h;
      this.inWater = overlapsWater;
      if (overlapsWater) {
        const depth = Math.min(1, Math.max(0, (this.pos.y + this.size.h - ground.y) / this.size.h));
        this.vel.x *= Math.pow(0.91, dt * 60);

        if (shouldFlap) {
          const activeEscapeStroke = flapPressed && !justPressedSpace;
          const waterLift = activeEscapeStroke ? 155 + depth * 50 : 42 + depth * 18;
          this.vel.y -= waterLift;
          this.flapBoost = 1.3;
          if (!activeEscapeStroke && this.vel.y < 0) this.vel.y *= 0.42;
        }
        if (!flapPressed && this.vel.y < 0) this.vel.y *= Math.pow(0.48, dt * 60);
        if (this.vel.y > 0) this.vel.y *= Math.pow(0.58, dt * 60);
        this.vel.y += (64 + depth * 82) * dt;
        this.diveCharge = 0;
      }
    } else {
      this.inWater = false;
    }

    // 2. Perch and Cliff Nest platforms
    this.landingAttempt = null;
    for (let i = 1; i < platforms.length; i++) {
      const plat = platforms[i];
      if (!plat) continue;

      if (this.perchDropTimer <= 0 && this.vel.y >= 0) {
        const overlaps = this.pos.x + this.size.w > plat.x &&
                         this.pos.x < plat.x + plat.w &&
                         this.pos.y + this.size.h > plat.y &&
                         this.pos.y < plat.y + plat.h;
        if (overlaps) {
          const landingSpeed = Math.hypot(this.vel.x, this.vel.y);
          const isGentle = landingSpeed <= 240;

          if (plat.isNest) {
            this.landingAttempt = {
              platform: plat,
              speed: landingSpeed,
              speedMph: Math.round(landingSpeed * 0.032),
              isGentle: isGentle
            };

            if (!isGentle) {
              // Too harsh: bounce falcon slightly and prevent perching
              this.vel.y = -90;
              this.vel.x *= 0.4;
              this.perchDropTimer = 0.4;
              continue;
            }
          }

          this.pos.y = plat.y - this.size.h;
          this.vel.y = 0;
          this.vel.x = 0;
          this.onPerch = true;
          this.currentPlatform = plat;
          this.grounded = true;
          this.diveCharge = 0;
          this.perchX = plat.x;
          this.perchW = plat.w;
          this.perchDropTimer = 0;
          this.pos.x = Math.min(Math.max(this.pos.x, plat.x), plat.x + plat.w - this.size.w);
          break;
        }
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
    this.perchMoving = false;

    this.wingPhase += dt * (this.flapBoost > 0.1 ? 34 : 6);
    const visualDiveTuck = Math.min(1, Math.max(0, (Math.max(0, this.vel.y) - 260) / 850));
    const profileTarget = visualDiveTuck * Math.max(0, 1 - Math.abs(this.vel.x) / 180);
    this.stoopProfile += (profileTarget - this.stoopProfile) * Math.min(1, dt * 8);
    const climbBank = Math.max(0, -this.vel.y);
    const lateralBankScale = climbBank > 90 ? 0.72 : 1;
    const targetAngle = Math.max(-1.5, Math.min(1.5, this.vel.y / 270 + (this.vel.x / 520) * lateralBankScale));
    this.angle += (targetAngle - this.angle) * 0.22;
  }

  draw(ctx) {
    ctx.save();
    const diveSpeed = Math.max(0, this.vel.y);
    const diveTuck = Math.min(0.78, Math.max(0, (diveSpeed - 180) / 1300));
    const tuckAmount = diveTuck / 0.78;
    const divePose = diveTuck > 0;
    const frontBlend = this.stoopProfile;
    const frontProfile = frontBlend >= 0.96;
    const transitioningProfile = frontBlend > 0.04 && frontBlend < 0.96;
    const wingSpan = 1 - diveTuck * 0.3;
    const wingSweep = Math.sin(this.wingPhase) * (this.flapBoost > 0.1 ? 16 : 4) * (1 - diveTuck * 0.52);
    const tailSweep = Math.sin(this.wingPhase * 0.8 + 1.1) * 5 * (1 - diveTuck * 0.5);

    ctx.translate(this.pos.x + this.size.w / 2, this.pos.y + this.size.h / 2);

    if (this.onPerch) {
      ctx.scale(this.facing, 1);
      if (!this.perchMoving) {
        ctx.strokeStyle = '#d5a84a';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-5, 9);
        ctx.lineTo(-6, 12);
        ctx.lineTo(-1, 12);
        ctx.moveTo(5, 9);
        ctx.lineTo(6, 12);
        ctx.lineTo(1, 12);
        ctx.stroke();

        // Captured prey beside perched falcon
        if (this.hasPrey) {
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(8, 10, 10, 6, 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.ellipse(6, 11, 7, 3.5, 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(17, 9);
          ctx.lineTo(21, 10);
          ctx.lineTo(17, 12);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        ctx.fillStyle = '#354557';
        ctx.beginPath();
        ctx.ellipse(0, -6, 9, 17, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#536577';
        ctx.beginPath();
        ctx.moveTo(-5, -16);
        ctx.quadraticCurveTo(-16, -2, -8, 9);
        ctx.lineTo(-1, 8);
        ctx.lineTo(-1, -14);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(5, -16);
        ctx.quadraticCurveTo(16, -2, 8, 9);
        ctx.lineTo(1, 8);
        ctx.lineTo(1, -14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#202a37';
        ctx.beginPath();
        ctx.ellipse(0, -24, 8, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eee7d8';
        ctx.beginPath();
        ctx.ellipse(0, -22.5, 5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#171922';
        ctx.beginPath();
        ctx.arc(-3, -24, 1.35, 0, Math.PI * 2);
        ctx.arc(3, -24, 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d5a84a';
        ctx.beginPath();
        ctx.moveTo(-2.5, -20);
        ctx.lineTo(2.5, -20);
        ctx.lineTo(0, -16.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        return;
      }

      ctx.strokeStyle = '#d5a84a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-3, 9);
      ctx.lineTo(-4, 12);
      ctx.lineTo(2, 12);
      ctx.moveTo(4, 9);
      ctx.lineTo(5, 12);
      ctx.lineTo(10, 12);
      ctx.stroke();

      ctx.fillStyle = '#354557';
      ctx.beginPath();
      ctx.ellipse(-2, -6, 7.5, 17, -0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#536577';
      ctx.beginPath();
      ctx.moveTo(-5, -16);
      ctx.quadraticCurveTo(-14, -2, -8, 10);
      ctx.lineTo(1, 9);
      ctx.quadraticCurveTo(-1, -5, -5, -16);
      ctx.fill();

      ctx.fillStyle = '#202a37';
      ctx.beginPath();
      ctx.ellipse(5, -24, 7, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#eee7d8';
      ctx.beginPath();
      ctx.ellipse(8, -23, 4, 5.2, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#171922';
      ctx.beginPath();
      ctx.arc(10, -25, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Short hooked beak (perched moving)
      ctx.fillStyle = '#d5a84a';
      ctx.beginPath();
      ctx.moveTo(11, -22.5);
      ctx.lineTo(15.5, -21.5);
      ctx.lineTo(16, -19.5);
      ctx.lineTo(11, -19);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    if (this.straightLaunchTimer > 0) {
      const launchProgress = 1 - this.straightLaunchTimer / 0.34;
      ctx.scale(1 - launchProgress * 0.08, 1 + launchProgress * 0.08);
      ctx.rotate(launchProgress * 0.34);
      ctx.fillStyle = '#354557';
      ctx.beginPath();
      ctx.ellipse(0, -5, 9, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#536577';
      ctx.beginPath();
      ctx.moveTo(-4, -14);
      ctx.quadraticCurveTo(-18, -2 + launchProgress * 7, -9, 9);
      ctx.lineTo(-1, 7);
      ctx.lineTo(-1, -12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -14);
      ctx.quadraticCurveTo(18, -2 + launchProgress * 7, 9, 9);
      ctx.lineTo(1, 7);
      ctx.lineTo(1, -12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#32495a';
      ctx.beginPath();
      ctx.ellipse(0, -22, 8, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d5a84a';
      ctx.beginPath();
      ctx.moveTo(-2.5, -18);
      ctx.lineTo(2.5, -18);
      ctx.lineTo(0, -15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    const idleStraight = Math.abs(this.vel.x) < 28 && Math.abs(this.vel.y) < 40;
    const sideStretchX = divePose ? 1 - tuckAmount * 0.1 : (idleStraight ? 1.12 : 1);
    const sideStretchY = divePose ? 1.04 + tuckAmount * 0.32 : (idleStraight ? 0.92 : 1);
    const frontStretchX = 1 - tuckAmount * 0.2;
    const frontStretchY = 1 + tuckAmount * 0.35;
    const stretchX = sideStretchX + (frontStretchX - sideStretchX) * frontBlend;
    const stretchY = sideStretchY + (frontStretchY - sideStretchY) * frontBlend;
    ctx.scale(this.facing * stretchX, stretchY);
    ctx.rotate(this.angle * 0.85 + frontBlend * 0.12);

    if (transitioningProfile) {
      const wingReach = 28 - frontBlend * 7;
      ctx.fillStyle = '#9bacb4';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18 - frontBlend * 3, 9.5, 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#354b5d';
      ctx.beginPath();
      ctx.moveTo(-7, -3);
      ctx.quadraticCurveTo(-wingReach, -13 - wingSweep * 0.35, -wingReach + 3, -4);
      ctx.quadraticCurveTo(-12, 1, 7, -3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4d6375';
      ctx.beginPath();
      ctx.moveTo(-7, 3);
      ctx.quadraticCurveTo(-wingReach, 13 + wingSweep * 0.2, -wingReach + 3, 4);
      ctx.quadraticCurveTo(-12, -1, 7, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2a3b4b';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-25 + frontBlend * 5, -5);
      ctx.lineTo(-29 + frontBlend * 4, 0);
      ctx.lineTo(-25 + frontBlend * 5, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#32495a';
      ctx.beginPath();
      ctx.ellipse(13, 0, 7, 7.4, 0.18, 0, Math.PI * 2);
      ctx.fill();

      // Short hooked beak (transitioning)
      ctx.fillStyle = '#d5a84a';
      ctx.beginPath();
      ctx.moveTo(17, -1);
      ctx.lineTo(23.5, 0.5);
      ctx.lineTo(24, 3);
      ctx.lineTo(17, 4.5);
      ctx.closePath();
      ctx.fill();
    } else if (frontProfile) {
      ctx.fillStyle = '#718896';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2b3a4b';
      ctx.beginPath();
      ctx.moveTo(-7, -5);
      ctx.quadraticCurveTo(-18 * wingSpan, -11 - wingSweep * 0.18, -22 * wingSpan, -6);
      ctx.quadraticCurveTo(-13 * wingSpan, -1, 6, -4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#40556a';
      ctx.beginPath();
      ctx.moveTo(-7, 5);
      ctx.quadraticCurveTo(-18 * wingSpan, 11 + wingSweep * 0.18, -22 * wingSpan, 6);
      ctx.quadraticCurveTo(-13 * wingSpan, 1, 6, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#263849';
      ctx.beginPath();
      ctx.moveTo(-10, -4);
      ctx.lineTo(-25, -6);
      ctx.lineTo(-30, 0);
      ctx.lineTo(-25, 6);
      ctx.lineTo(-10, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#60798a';
      ctx.beginPath();
      ctx.ellipse(1, 0, 9, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#32495a';
      ctx.beginPath();
      ctx.ellipse(15, 0, 7.5, 7.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#627a89';
      ctx.beginPath();
      ctx.ellipse(14, -1, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Short hooked beak (front stoop)
      ctx.fillStyle = '#d5a84a';
      ctx.beginPath();
      ctx.moveTo(19, -1);
      ctx.lineTo(24.5, 1);
      ctx.lineTo(25, 3.5);
      ctx.lineTo(19, 4.5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(223, 237, 240, 0.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
    } else {
      // Side profile glide / flare
      ctx.fillStyle = '#e6ded0';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 9, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#354557';
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.lineTo(-28 * wingSpan, -12 - wingSweep);
      ctx.lineTo(-20 * wingSpan, 0);
      ctx.lineTo(-28 * wingSpan, 10 + wingSweep * 0.35);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#536577';
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.quadraticCurveTo(20 * wingSpan, -16 - wingSweep * 0.7, 28 * wingSpan, -2);
      ctx.lineTo(16, 8);
      ctx.quadraticCurveTo(10, 12, 8, -4);
      ctx.fill();

      ctx.fillStyle = '#303e4e';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-26, -8 - tailSweep);
      ctx.lineTo(-18, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#202a37';
      ctx.beginPath();
      ctx.ellipse(12, 0, 6.5, 7, 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#eee7d8';
      ctx.beginPath();
      ctx.ellipse(13, 2.5, 4.2, 5.6, 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#171922';
      ctx.beginPath();
      ctx.arc(14, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();

      // Short hooked raptor beak (side glide)
      ctx.fillStyle = '#d5a84a';
      ctx.beginPath();
      ctx.moveTo(16.5, 1);
      ctx.lineTo(23, 2.5);
      ctx.lineTo(23.5, 5.5);
      ctx.lineTo(16.5, 6.5);
      ctx.closePath();
      ctx.fill();
    }

    // ==========================================
    // Render Captured Prey clutched in Talons
    // ==========================================
    if (this.hasPrey) {
      ctx.save();
      // Draw clutched white dove beneath the falcon's torso
      ctx.translate(4, 9);
      ctx.rotate(0.2);

      // Dove body
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dove wing & shadow
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.ellipse(-2, -1, 8, 4, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // Dove tail
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-17, -4);
      ctx.lineTo(-18, 2);
      ctx.closePath();
      ctx.fill();

      // Dove head & beak
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9, 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(12, 1);
      ctx.lineTo(16, 3);
      ctx.lineTo(12, 4);
      ctx.closePath();
      ctx.fill();

      // Falcon's golden talons tightly gripping around prey
      ctx.strokeStyle = '#d5a84a';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(-2, 3);
      ctx.lineTo(3, 4);

      ctx.moveTo(2, -6);
      ctx.lineTo(5, 3);
      ctx.lineTo(9, 3);
      ctx.stroke();

      ctx.restore();
    } else if (divePose) {
      // Standard empty talons during dive
      const talonAlpha = Math.min(0.9, diveTuck * 1.45);
      ctx.save();
      ctx.globalAlpha = talonAlpha;
      ctx.strokeStyle = '#d5a84a';
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(1, 6);
      ctx.lineTo(7, 10);
      ctx.lineTo(13, 9);
      ctx.moveTo(7, 10);
      ctx.lineTo(11, 14);
      ctx.moveTo(6, 5);
      ctx.lineTo(11, 9);
      ctx.lineTo(16, 8);
      ctx.moveTo(11, 9);
      ctx.lineTo(15, 13);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
