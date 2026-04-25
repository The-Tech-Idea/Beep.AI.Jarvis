/**
 * Base Avatar Class - Foundation for all Jarvis avatars
 * Provides common functionality for audio reactivity, state management, and rendering
 */
class BaseAvatar {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;

    // State
    this.audioLevel = 0;
    this.targetAudioLevel = 0;
    this.isListening = false;
    this.isSpeaking = false;
    this.isThinking = false;
    this.mood = "neutral"; // neutral, happy, curious, alert
    this.blinkTimer = 0;
    this.isBlinking = false;

    // Animation timing
    this.time = 0;
    this.lastTime = performance.now();
    this.deltaTime = 0;

    // Colors (can be customized)
    this.colors = {
      primary: options.primaryColor || "#5ad1b3",
      secondary: options.secondaryColor || "#9ff9e6",
      background: options.backgroundColor || "#0b1626",
      glow: options.glowColor || "rgba(90, 209, 179, 0.3)",
      accent: options.accentColor || "#0ee1b8",
      ...options.colors,
    };

    // Bind methods
    this.update = this.update.bind(this);
    this.render = this.render.bind(this);
    this.animate = this.animate.bind(this);
  }

  /**
   * Update audio level with smoothing
   */
  setAudioLevel(level) {
    this.targetAudioLevel = Math.max(0, Math.min(1, level));
  }

  /**
   * Set the current state
   */
  setState(state) {
    this.isListening = state.isListening ?? this.isListening;
    this.isSpeaking = state.isSpeaking ?? this.isSpeaking;
    this.isThinking = state.isThinking ?? this.isThinking;
    this.mood = state.mood ?? this.mood;
  }

  /**
   * Update animation state
   */
  update(currentTime) {
    this.deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    this.time += this.deltaTime;

    // Smooth audio level
    const smoothing = 0.15;
    this.audioLevel += (this.targetAudioLevel - this.audioLevel) * smoothing;

    // Handle blinking
    this.blinkTimer -= this.deltaTime;
    if (this.blinkTimer <= 0) {
      this.isBlinking = true;
      this.blinkTimer = 2 + Math.random() * 4; // Blink every 2-6 seconds
      setTimeout(() => (this.isBlinking = false), 150);
    }
  }

  /**
   * Clear canvas with background
   */
  clear() {
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw glow effect
   */
  drawGlow(x, y, radius, color, intensity = 1) {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    this.ctx.fillStyle = gradient;
    this.ctx.globalAlpha = intensity;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  /**
   * Override in subclass
   */
  render() {
    throw new Error("render() must be implemented by subclass");
  }

  /**
   * Animation loop
   */
  animate(currentTime) {
    this.update(currentTime);
    this.clear();
    this.render();
    requestAnimationFrame(this.animate);
  }

  /**
   * Start the animation
   */
  start() {
    this.animate(performance.now());
  }

  /**
   * Resize canvas
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.centerX = width / 2;
    this.centerY = height / 2;
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = BaseAvatar;
}
