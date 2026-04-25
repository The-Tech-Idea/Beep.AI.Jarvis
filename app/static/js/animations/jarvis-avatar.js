/**
 * Jarvis Avatar - Single enhanced avatar with gestures, expressions, and animations
 * Features:
 * - Multiple expressions (neutral, happy, thinking, curious, alert, speaking)
 * - Gestures (nod, shake, tilt, wave)
 * - Smooth transitions between states
 * - Audio-reactive mouth and glow
 * - Eye tracking and blinking
 * - Particle effects
 * - Breathing animation
 */

class JarvisAvatar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;

    // Animation timing
    this.time = 0;
    this.lastTime = performance.now();
    this.deltaTime = 0;

    // Audio
    this.audioLevel = 0;
    this.targetAudioLevel = 0;
    this.audioHistory = new Array(20).fill(0);

    // States
    this.isListening = false;
    this.isSpeaking = false;
    this.isThinking = false;

    // Expression system
    this.expression = "neutral"; // neutral, happy, thinking, curious, alert
    this.targetExpression = "neutral";
    this.expressionBlend = 0;

    // Head position and rotation
    this.headX = 0;
    this.headY = 0;
    this.headRotation = 0;
    this.targetHeadX = 0;
    this.targetHeadY = 0;
    this.targetHeadRotation = 0;

    // Eye tracking
    this.eyeX = 0;
    this.eyeY = 0;
    this.targetEyeX = 0;
    this.targetEyeY = 0;
    this.pupilDilation = 1;

    // Blinking
    this.blinkProgress = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.isBlinking = false;

    // Gestures
    this.currentGesture = null;
    this.gestureProgress = 0;
    this.gestureQueue = [];

    // Particles
    this.particles = [];
    this.maxParticles = 30;

    // Breathing
    this.breathPhase = 0;

    // Colors
    this.colors = {
      face: "#14263c",
      faceBorder: "rgba(90, 209, 179, 0.6)",
      eye: "#9ff9e6",
      eyeHighlight: "#ffffff",
      pupil: "#0b1626",
      mouth: "#5ad1b3",
      glow: "rgba(90, 209, 179, 0.3)",
      particle: "rgba(159, 249, 230, 0.8)",
      background: "#0b1626",
    };

    // Expression parameters
    this.expressions = {
      neutral: { eyebrowY: 0, eyeScale: 1, mouthCurve: 0, eyeSquint: 0 },
      happy: { eyebrowY: -3, eyeScale: 0.9, mouthCurve: 15, eyeSquint: 0.2 },
      thinking: { eyebrowY: -8, eyeScale: 1, mouthCurve: -5, eyeSquint: 0 },
      curious: { eyebrowY: -10, eyeScale: 1.15, mouthCurve: 0, eyeSquint: 0 },
      alert: { eyebrowY: -12, eyeScale: 1.2, mouthCurve: 0, eyeSquint: 0 },
      speaking: { eyebrowY: 0, eyeScale: 1, mouthCurve: 0, eyeSquint: 0 },
    };

    // Current interpolated expression values
    this.currentExpr = { ...this.expressions.neutral };

    // Bind methods
    this.update = this.update.bind(this);
    this.render = this.render.bind(this);
    this.animate = this.animate.bind(this);
  }

  // ========== Public API ==========

  setAudioLevel(level) {
    this.targetAudioLevel = Math.max(0, Math.min(1, level));
  }

  setState(state) {
    this.isListening = state.isListening ?? this.isListening;
    this.isSpeaking = state.isSpeaking ?? this.isSpeaking;
    this.isThinking = state.isThinking ?? this.isThinking;

    // Auto-set expression based on state
    if (this.isThinking) {
      this.setExpression("thinking");
    } else if (this.isSpeaking) {
      this.setExpression("speaking");
    } else if (this.isListening) {
      this.setExpression("curious");
    } else {
      this.setExpression("neutral");
    }
  }

  setExpression(expr) {
    if (this.expressions[expr] && this.targetExpression !== expr) {
      this.targetExpression = expr;
    }
  }

  lookAt(x, y) {
    // Convert canvas coordinates to eye offset (-1 to 1)
    this.targetEyeX = Math.max(-1, Math.min(1, (x - this.centerX) / 150));
    this.targetEyeY = Math.max(-1, Math.min(1, (y - this.centerY) / 150));
  }

  triggerGesture(gesture) {
    // Add gesture to queue
    if (!this.currentGesture) {
      this.currentGesture = gesture;
      this.gestureProgress = 0;
    } else {
      this.gestureQueue.push(gesture);
    }
  }

  // Gesture shortcuts
  nod() { this.triggerGesture("nod"); }
  shake() { this.triggerGesture("shake"); }
  tilt() { this.triggerGesture("tilt"); }
  wave() { this.triggerGesture("wave"); }
  blink() { this.isBlinking = true; this.blinkProgress = 0; }
  wink() { this.triggerGesture("wink"); }
  surprise() { 
    this.setExpression("alert"); 
    this.triggerGesture("surprise");
  }
  
  // Speaking animation control
  startSpeaking() {
    this.isSpeaking = true;
    this.setExpression("speaking");
    // Start simulated audio levels for mouth animation
    this._simulateSpeakingAudio();
  }
  
  stopSpeaking() {
    this.isSpeaking = false;
    this.setExpression("neutral");
    // Stop simulated audio
    if (this._speakingInterval) {
      clearInterval(this._speakingInterval);
      this._speakingInterval = null;
    }
    this.targetAudioLevel = 0;
  }
  
  // Simulate audio levels for mouth animation when actual audio data isn't available
  _simulateSpeakingAudio() {
    if (this._speakingInterval) {
      clearInterval(this._speakingInterval);
    }
    this._speakingInterval = setInterval(() => {
      if (this.isSpeaking) {
        // Generate natural-looking mouth movement
        const base = 0.3 + Math.random() * 0.4;
        const variation = Math.sin(Date.now() / 100) * 0.2;
        this.targetAudioLevel = Math.max(0, Math.min(1, base + variation));
      } else {
        this.targetAudioLevel = 0;
      }
    }, 50);
  }

  // ========== Update Methods ==========

  update(currentTime) {
    this.deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    this.time += this.deltaTime;

    this.updateAudio();
    this.updateBlinking();
    this.updateExpression();
    this.updateGesture();
    this.updateHead();
    this.updateEyes();
    this.updateBreathing();
    this.updateParticles();
  }

  updateAudio() {
    // Smooth audio level
    this.audioLevel += (this.targetAudioLevel - this.audioLevel) * 0.2;

    // Update audio history
    this.audioHistory.shift();
    this.audioHistory.push(this.audioLevel);
  }

  updateBlinking() {
    if (this.isBlinking) {
      this.blinkProgress += this.deltaTime * 12;
      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkTimer = 2 + Math.random() * 4;
      }
    } else {
      this.blinkTimer -= this.deltaTime;
      if (this.blinkTimer <= 0) {
        this.isBlinking = true;
        this.blinkProgress = 0;
      }
    }
  }

  updateExpression() {
    const target = this.expressions[this.targetExpression];
    const speed = 0.08;

    for (const key in target) {
      this.currentExpr[key] += (target[key] - this.currentExpr[key]) * speed;
    }
  }

  updateGesture() {
    if (!this.currentGesture) {
      // Check queue
      if (this.gestureQueue.length > 0) {
        this.currentGesture = this.gestureQueue.shift();
        this.gestureProgress = 0;
      }
      return;
    }

    this.gestureProgress += this.deltaTime;
    const g = this.currentGesture;
    const p = this.gestureProgress;

    switch (g) {
      case "nod":
        // Nod: head moves down then up
        if (p < 0.15) {
          this.targetHeadY = 8 * (p / 0.15);
        } else if (p < 0.3) {
          this.targetHeadY = 8 - 16 * ((p - 0.15) / 0.15);
        } else if (p < 0.45) {
          this.targetHeadY = -8 + 8 * ((p - 0.3) / 0.15);
        } else {
          this.targetHeadY = 0;
          this.currentGesture = null;
        }
        break;

      case "shake":
        // Shake: head rotates left-right-left
        if (p < 0.5) {
          this.targetHeadRotation = Math.sin(p * Math.PI * 6) * 0.1;
        } else {
          this.targetHeadRotation = 0;
          this.currentGesture = null;
        }
        break;

      case "tilt":
        // Tilt: head tilts to side and back
        if (p < 0.3) {
          this.targetHeadRotation = 0.15 * (p / 0.3);
        } else if (p < 0.8) {
          this.targetHeadRotation = 0.15;
        } else if (p < 1.1) {
          this.targetHeadRotation = 0.15 * (1 - (p - 0.8) / 0.3);
        } else {
          this.targetHeadRotation = 0;
          this.currentGesture = null;
        }
        break;

      case "wave":
        // Wave spawns special particles
        if (p < 0.8) {
          if (Math.random() < 0.3) {
            this.spawnParticle(this.centerX + 80, this.centerY - 20);
          }
          this.targetHeadX = Math.sin(p * Math.PI * 4) * 5;
        } else {
          this.targetHeadX = 0;
          this.currentGesture = null;
        }
        break;

      case "wink":
        // Wink is handled separately
        if (p > 0.3) {
          this.currentGesture = null;
        }
        break;

      case "surprise":
        // Quick scale pulse
        if (p < 0.1) {
          this.pupilDilation = 1.5;
        } else if (p < 0.5) {
          this.pupilDilation = 1.5 - 0.5 * ((p - 0.1) / 0.4);
        } else {
          this.pupilDilation = 1;
          this.currentGesture = null;
        }
        break;

      default:
        this.currentGesture = null;
    }
  }

  updateHead() {
    const speed = 0.1;
    this.headX += (this.targetHeadX - this.headX) * speed;
    this.headY += (this.targetHeadY - this.headY) * speed;
    this.headRotation += (this.targetHeadRotation - this.headRotation) * speed;

    // Subtle idle movement
    this.targetHeadX += Math.sin(this.time * 0.5) * 0.1;
    this.targetHeadY += Math.cos(this.time * 0.3) * 0.1;
  }

  updateEyes() {
    const speed = 0.12;
    this.eyeX += (this.targetEyeX - this.eyeX) * speed;
    this.eyeY += (this.targetEyeY - this.eyeY) * speed;

    // Random eye movements when idle
    if (Math.random() < 0.005) {
      this.targetEyeX = (Math.random() - 0.5) * 0.6;
      this.targetEyeY = (Math.random() - 0.5) * 0.4;
    }

    // Return to center occasionally
    if (Math.random() < 0.002) {
      this.targetEyeX = 0;
      this.targetEyeY = 0;
    }
  }

  updateBreathing() {
    this.breathPhase = Math.sin(this.time * 1.5) * 0.02;
  }

  updateParticles() {
    // Spawn particles based on state
    if (this.isSpeaking && Math.random() < this.audioLevel * 0.3) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 30;
      this.spawnParticle(
        this.centerX + Math.cos(angle) * dist,
        this.centerY + Math.sin(angle) * dist
      );
    }

    if (this.isThinking && Math.random() < 0.1) {
      // Thinking particles float upward
      this.spawnParticle(
        this.centerX + (Math.random() - 0.5) * 100,
        this.centerY - 50,
        { vy: -1.5, type: "thinking" }
      );
    }

    // Update existing particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      p.size *= 0.98;
      return p.life > 0 && p.size > 0.5;
    });
  }

  spawnParticle(x, y, opts = {}) {
    if (this.particles.length >= this.maxParticles) return;

    this.particles.push({
      x,
      y,
      vx: opts.vx ?? (Math.random() - 0.5) * 2,
      vy: opts.vy ?? (Math.random() - 0.5) * 2 - 0.5,
      life: 1,
      decay: opts.decay ?? 0.015 + Math.random() * 0.01,
      size: opts.size ?? 3 + Math.random() * 4,
      type: opts.type ?? "normal",
    });
  }

  // ========== Render Methods ==========

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.centerX + this.headX, this.centerY + this.headY);
    ctx.rotate(this.headRotation);
    ctx.scale(1 + this.breathPhase, 1 + this.breathPhase);

    this.drawGlow();
    this.drawParticles();
    this.drawFace();
    this.drawEyebrows();
    this.drawEyes();
    this.drawMouth();
    this.drawStatusIndicators();

    ctx.restore();
  }

  drawGlow() {
    const ctx = this.ctx;
    const glowRadius = 140 + this.audioLevel * 50;
    const gradient = ctx.createRadialGradient(0, 0, 80, 0, 0, glowRadius);
    gradient.addColorStop(0, "rgba(90, 209, 179, 0.15)");
    gradient.addColorStop(0.5, "rgba(90, 209, 179, 0.05)");
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing ring when speaking
    if (this.isSpeaking) {
      const ringRadius = 120 + Math.sin(this.time * 10) * 10 + this.audioLevel * 20;
      ctx.strokeStyle = `rgba(90, 209, 179, ${0.2 + this.audioLevel * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Thinking swirl
    if (this.isThinking) {
      ctx.strokeStyle = "rgba(90, 209, 179, 0.2)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 130 + i * 15, this.time + i, this.time + i + Math.PI * 0.5);
        ctx.stroke();
      }
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    this.particles.forEach((p) => {
      const alpha = p.life * 0.8;
      if (p.type === "thinking") {
        ctx.fillStyle = `rgba(159, 249, 230, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(90, 209, 179, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(p.x - this.centerX, p.y - this.centerY, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawFace() {
    const ctx = this.ctx;
    const radius = 100;

    // Face shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.beginPath();
    ctx.ellipse(5, 8, radius, radius * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main face
    const faceGradient = ctx.createRadialGradient(-30, -30, 0, 0, 0, radius);
    faceGradient.addColorStop(0, "#1a3a52");
    faceGradient.addColorStop(1, this.colors.face);

    ctx.fillStyle = faceGradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Face border
    ctx.strokeStyle = this.colors.faceBorder;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = "rgba(159, 249, 230, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawEyebrows() {
    const ctx = this.ctx;
    const eyeSpacing = 35;
    const eyeY = -25 + this.currentExpr.eyebrowY;
    const browY = eyeY - 25;

    ctx.strokeStyle = this.colors.eye;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Left eyebrow
    ctx.beginPath();
    ctx.moveTo(-eyeSpacing - 15, browY + 5);
    ctx.quadraticCurveTo(-eyeSpacing, browY - 5, -eyeSpacing + 15, browY);
    ctx.stroke();

    // Right eyebrow
    ctx.beginPath();
    ctx.moveTo(eyeSpacing - 15, browY);
    ctx.quadraticCurveTo(eyeSpacing, browY - 5, eyeSpacing + 15, browY + 5);
    ctx.stroke();
  }

  drawEyes() {
    const ctx = this.ctx;
    const eyeSpacing = 35;
    const eyeY = -25;
    const eyeScale = this.currentExpr.eyeScale * this.pupilDilation;
    const squint = this.currentExpr.eyeSquint;

    // Calculate blink
    let blinkAmount = 0;
    if (this.isBlinking) {
      // Blink animation: quick close, slower open
      if (this.blinkProgress < 0.4) {
        blinkAmount = this.blinkProgress / 0.4;
      } else {
        blinkAmount = 1 - (this.blinkProgress - 0.4) / 0.6;
      }
    }

    // Wink (only right eye)
    const isWinking = this.currentGesture === "wink" && this.gestureProgress < 0.3;

    this.drawEye(-eyeSpacing, eyeY, eyeScale, blinkAmount + squint, false);
    this.drawEye(eyeSpacing, eyeY, eyeScale, isWinking ? 1 : blinkAmount + squint, false);
  }

  drawEye(x, y, scale, blinkAmount, isLeft) {
    const ctx = this.ctx;
    const baseRadius = 18 * scale;
    const closedHeight = baseRadius * (1 - blinkAmount);

    // Eye white
    ctx.fillStyle = this.colors.eye;
    ctx.beginPath();
    if (blinkAmount > 0.9) {
      // Fully closed - just a line
      ctx.moveTo(x - baseRadius, y);
      ctx.lineTo(x + baseRadius, y);
      ctx.strokeStyle = this.colors.eye;
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    ctx.ellipse(x, y, baseRadius, closedHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    const pupilX = x + this.eyeX * 8;
    const pupilY = y + this.eyeY * 5;
    const pupilRadius = 8 * scale * (1 - blinkAmount * 0.5);

    ctx.fillStyle = this.colors.pupil;
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, pupilRadius, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = this.colors.eyeHighlight;
    ctx.beginPath();
    ctx.arc(pupilX - 3, pupilY - 3, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.beginPath();
    ctx.arc(x + 5, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMouth() {
    const ctx = this.ctx;
    const mouthY = 35;
    const mouthWidth = 50;
    const curve = this.currentExpr.mouthCurve;

    // Calculate mouth opening from audio
    let mouthOpen = 0;
    if (this.isSpeaking) {
      // Use audio history for more natural mouth movement
      const avgAudio = this.audioHistory.slice(-5).reduce((a, b) => a + b, 0) / 5;
      mouthOpen = avgAudio * 25;
    }

    ctx.strokeStyle = this.colors.mouth;
    ctx.fillStyle = "rgba(11, 22, 38, 0.8)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (mouthOpen > 3) {
      // Open mouth - ellipse
      ctx.beginPath();
      ctx.ellipse(0, mouthY, mouthWidth / 2.5, mouthOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Teeth hint
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(-15, mouthY - mouthOpen * 0.6, 30, mouthOpen * 0.4);
    } else {
      // Closed mouth - curved line
      ctx.beginPath();
      ctx.moveTo(-mouthWidth / 2, mouthY);
      ctx.quadraticCurveTo(0, mouthY + curve, mouthWidth / 2, mouthY);
      ctx.stroke();
    }
  }

  drawStatusIndicators() {
    const ctx = this.ctx;

    // Listening indicator - ear glow
    if (this.isListening) {
      const pulse = Math.sin(this.time * 4) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(90, 209, 179, ${0.3 * pulse})`;
      ctx.beginPath();
      ctx.arc(-95, -10, 15, 0, Math.PI * 2);
      ctx.arc(95, -10, 15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Thinking indicator - dots above head
    if (this.isThinking) {
      const dotY = -130;
      for (let i = 0; i < 3; i++) {
        const bounce = Math.sin(this.time * 5 + i * 0.8) * 8;
        const alpha = 0.4 + Math.sin(this.time * 3 + i) * 0.3;
        ctx.fillStyle = `rgba(90, 209, 179, ${alpha})`;
        ctx.beginPath();
        ctx.arc((i - 1) * 20, dotY + bounce, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ========== Animation Loop ==========

  animate(currentTime) {
    this.update(currentTime);
    this.render();
    this._animationId = requestAnimationFrame(this.animate);
  }

  start() {
    this.animate(performance.now());
  }

  stop() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.centerX = width / 2;
    this.centerY = height / 2;
  }
}

// Export
if (typeof module !== "undefined" && module.exports) {
  module.exports = JarvisAvatar;
}
