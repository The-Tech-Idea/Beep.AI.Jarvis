/**
 * Jarvis Avatar Animations Index
 * 
 * Available avatars:
 * - orb: Floating energy orb with particles
 * - waveform: Circular audio waveform visualization
 * - hologram: 3D wireframe holographic head
 * - neural: Neural network with connected nodes
 * - simple: Basic audio-reactive circle (default)
 */

// Avatar registry
const AvatarRegistry = {
  avatars: {},
  currentAvatar: null,
  canvas: null,
  analyser: null,

  /**
   * Register an avatar class
   */
  register(name, AvatarClass) {
    this.avatars[name] = AvatarClass;
  },

  /**
   * Get list of available avatars
   */
  list() {
    return Object.keys(this.avatars);
  },

  /**
   * Initialize with a canvas element
   */
  init(canvas) {
    this.canvas = canvas;
    return this;
  },

  /**
   * Set audio analyser for audio reactivity
   */
  setAnalyser(analyser) {
    this.analyser = analyser;
  },

  /**
   * Switch to a different avatar
   */
  switchTo(name, options = {}) {
    if (!this.avatars[name]) {
      console.warn(`Avatar '${name}' not found. Available: ${this.list().join(", ")}`);
      return null;
    }

    const AvatarClass = this.avatars[name];
    this.currentAvatar = new AvatarClass(this.canvas, options);
    this.currentAvatar.start();
    return this.currentAvatar;
  },

  /**
   * Get current avatar instance
   */
  getCurrent() {
    return this.currentAvatar;
  },

  /**
   * Update audio level from analyser
   */
  updateAudio() {
    if (!this.currentAvatar || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average level
    const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    this.currentAvatar.setAudioLevel(avg / 255);

    // If avatar supports frequency data
    if (typeof this.currentAvatar.setFrequencies === "function") {
      this.currentAvatar.setFrequencies(dataArray);
    }
  },

  /**
   * Set avatar state
   */
  setState(state) {
    if (this.currentAvatar) {
      this.currentAvatar.setState(state);
    }
  },
};

// Simple Avatar - fallback/default
class SimpleAvatar extends BaseAvatar {
  constructor(canvas, options = {}) {
    super(canvas, options);
    this.ripples = [];
  }

  render() {
    const radius = 80 + this.audioLevel * 40;

    // Ripple effect
    if (this.audioLevel > 0.1 && Math.random() < 0.1) {
      this.ripples.push({ radius: radius, alpha: 0.5 });
    }

    // Draw and update ripples
    this.ripples = this.ripples.filter((r) => {
      r.radius += 2;
      r.alpha -= 0.01;

      if (r.alpha > 0) {
        this.ctx.strokeStyle = `rgba(90, 209, 179, ${r.alpha})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, r.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        return true;
      }
      return false;
    });

    // Main circle glow
    this.drawGlow(this.centerX, this.centerY, radius + 30, this.colors.glow, 0.4);

    // Main circle
    const gradient = this.ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      0,
      this.centerX,
      this.centerY,
      radius
    );
    gradient.addColorStop(0, this.colors.secondary);
    gradient.addColorStop(0.7, this.colors.primary);
    gradient.addColorStop(1, "rgba(90, 209, 179, 0.3)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Eyes
    if (!this.isBlinking) {
      const eyeY = this.centerY - 15;
      this.ctx.fillStyle = "#ffffff";
      this.ctx.beginPath();
      this.ctx.arc(this.centerX - 20, eyeY, 8, 0, Math.PI * 2);
      this.ctx.arc(this.centerX + 20, eyeY, 8, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Mouth
    const mouthOpen = this.isSpeaking ? 8 + this.audioLevel * 12 : 0;
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    if (mouthOpen > 2) {
      this.ctx.ellipse(this.centerX, this.centerY + 20, 15, mouthOpen, 0, 0, Math.PI * 2);
    } else {
      this.ctx.moveTo(this.centerX - 15, this.centerY + 20);
      this.ctx.quadraticCurveTo(this.centerX, this.centerY + 25, this.centerX + 15, this.centerY + 20);
    }
    this.ctx.stroke();
  }
}

// Register all avatars
AvatarRegistry.register("simple", SimpleAvatar);

// Register other avatars when loaded
if (typeof OrbAvatar !== "undefined") AvatarRegistry.register("orb", OrbAvatar);
if (typeof WaveformAvatar !== "undefined") AvatarRegistry.register("waveform", WaveformAvatar);
if (typeof HologramAvatar !== "undefined") AvatarRegistry.register("hologram", HologramAvatar);
if (typeof NeuralAvatar !== "undefined") AvatarRegistry.register("neural", NeuralAvatar);

// Export
if (typeof module !== "undefined" && module.exports) {
  module.exports = { AvatarRegistry, SimpleAvatar };
}
