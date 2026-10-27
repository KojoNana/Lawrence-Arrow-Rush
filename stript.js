"use strict";

(() => {
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const arena = document.querySelector("#arena");
  const overlay = document.querySelector("#game-overlay");
  const overlayIcon = document.querySelector("#overlay-icon");
  const overlayEyebrow = document.querySelector("#overlay-eyebrow");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const playButton = document.querySelector("#play-button");
  const playLabel = document.querySelector("#play-label");
  const pauseButton = document.querySelector("#pause-button");
  const scoreDisplay = document.querySelector("#score");
  const bestDisplay = document.querySelector("#best");

  const STORAGE_KEY = "arrow-rush-best";
  const PLAYER_SPEED = 235;
  const PLAYER_RADIUS = 12;
  const TARGET_RADIUS = 8;
  const HAZARD_RADIUS = 11;
  const keysDown = new Set();
  const pointerDirections = new Set();
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let state = "ready";
  let score = 0;
  let best = readBestScore();
  let player = { x: 0, y: 0, angle: 0 };
  let target = { x: 0, y: 0 };
  let hazards = [];
  let particles = [];
  let lastFrame = 0;
  let targetPulse = 0;

  bestDisplay.textContent = formatScore(best);
  resizeCanvas();
  resetGame();
  requestAnimationFrame(frame);

  function readBestScore() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (error) {
      console.warn("Could not read the saved best score.", error);
      return 0;
    }
  }

  function saveBestScore() {
    try {
      localStorage.setItem(STORAGE_KEY, String(best));
    } catch (error) {
      console.warn("Could not save the best score.", error);
    }
  }

  function formatScore(value) {
    return String(value).padStart(4, "0");
  }

  function resizeCanvas() {
    const bounds = arena.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (player.x === 0 && player.y === 0) {
      player.x = width / 2;
      player.y = height / 2;
      placeTarget();
    } else {
      player.x = clamp(player.x, PLAYER_RADIUS, width - PLAYER_RADIUS);
      player.y = clamp(player.y, PLAYER_RADIUS, height - PLAYER_RADIUS);
      target.x = clamp(target.x, TARGET_RADIUS, width - TARGET_RADIUS);
      target.y = clamp(target.y, TARGET_RADIUS, height - TARGET_RADIUS);
    }
  }

  function resetGame() {
    score = 0;
    hazards = [];
    particles = [];
    player = { x: width / 2, y: height / 2, angle: 0 };
    scoreDisplay.textContent = formatScore(score);
    placeTarget();
    addHazard();
    addHazard();
    draw();
  }

  function startGame() {
    if (state === "ready" || state === "gameover") {
      resetGame();
    }
    state = "running";
    overlay.classList.add("is-hidden");
    pauseButton.setAttribute("aria-label", "Pause game");
    pauseButton.title = "Pause (P)";
    lastFrame = performance.now();
  }

  function pauseGame() {
    if (state === "running") {
      state = "paused";
      showOverlay("paused");
    } else if (state === "paused") {
      startGame();
    }
  }

  function endGame() {
    state = "gameover";
    keysDown.clear();
    pointerDirections.clear();
    if (score > best) {
      best = score;
      bestDisplay.textContent = formatScore(best);
      saveBestScore();
    }
    showOverlay("gameover");
  }

  function showOverlay(mode) {
    overlay.classList.remove("is-hidden");
    if (mode === "paused") {
      overlayIcon.textContent = "Ⅱ";
      overlayEyebrow.textContent = "TAKE YOUR TIME";
      overlayTitle.textContent = "Paused";
      overlayCopy.textContent = `Your score is ${score}. Pick up where you left off when you're ready.`;
      playLabel.textContent = "Keep playing";
      pauseButton.setAttribute("aria-label", "Resume game");
      pauseButton.title = "Resume (P)";
    } else if (mode === "gameover") {
      overlayIcon.textContent = "↻";
      overlayEyebrow.textContent = "NICE RUN";
      overlayTitle.textContent = "One more go?";
      overlayCopy.textContent = `You scored ${score}. Collect the stars and try to beat your best.`;
      playLabel.textContent = "Play again";
      pauseButton.setAttribute("aria-label", "Pause game");
      pauseButton.title = "Pause (P)";
    } else {
      overlayIcon.textContent = "➤";
      overlayEyebrow.textContent = "YOUR NEXT HIGH SCORE";
      overlayTitle.textContent = "Ready to roll?";
      overlayCopy.textContent = "Collect the glowing stars. Keep clear of the red hazards.";
      playLabel.textContent = "Start game";
    }
  }

  function placeTarget() {
    const margin = 30;
    let attempts = 0;
    do {
      target.x = margin + Math.random() * Math.max(0, width - margin * 2);
      target.y = margin + Math.random() * Math.max(0, height - margin * 2);
      attempts += 1;
    } while (attempts < 30 && distance(target, player) < 70);
  }

  function addHazard() {
    const edge = Math.floor(Math.random() * 4);
    const speed = 75 + Math.random() * 50 + Math.min(score * 1.2, 90);
    const hazard = {
      x: edge === 0 ? 0 : edge === 1 ? width : Math.random() * width,
      y: edge === 2 ? 0 : edge === 3 ? height : Math.random() * height,
      vx: 0,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
    };
    const angle = Math.random() * Math.PI * 2;
    hazard.vx = Math.cos(angle) * speed;
    hazard.vy = Math.sin(angle) * speed;
    hazards.push(hazard);
  }

  function frame(now) {
    const delta = Math.min((now - (lastFrame || now)) / 1000, 0.04);
    lastFrame = now;
    if (state === "running") {
      update(delta);
    }
    draw();
    requestAnimationFrame(frame);
  }

  function update(delta) {
    targetPulse += delta * 4;
    movePlayer(delta);

    for (const hazard of hazards) {
      hazard.x += hazard.vx * delta;
      hazard.y += hazard.vy * delta;
      hazard.phase += delta * 4;

      if (hazard.x < -HAZARD_RADIUS) hazard.x = width + HAZARD_RADIUS;
      if (hazard.x > width + HAZARD_RADIUS) hazard.x = -HAZARD_RADIUS;
      if (hazard.y < -HAZARD_RADIUS) hazard.y = height + HAZARD_RADIUS;
      if (hazard.y > height + HAZARD_RADIUS) hazard.y = -HAZARD_RADIUS;

      if (distance(hazard, player) < PLAYER_RADIUS + HAZARD_RADIUS - 2) {
        endGame();
        return;
      }
    }

    if (distance(target, player) < PLAYER_RADIUS + TARGET_RADIUS + 3) {
      collectTarget();
    }

    updateParticles(delta);
  }

  function movePlayer(delta) {
    let dx = 0;
    let dy = 0;
    if (keysDown.has("ArrowLeft") || keysDown.has("a") || pointerDirections.has("left")) dx -= 1;
    if (keysDown.has("ArrowRight") || keysDown.has("d") || pointerDirections.has("right")) dx += 1;
    if (keysDown.has("ArrowUp") || keysDown.has("w") || pointerDirections.has("up")) dy -= 1;
    if (keysDown.has("ArrowDown") || keysDown.has("s") || pointerDirections.has("down")) dy += 1;
    if (dx === 0 && dy === 0) return;

    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    player.x = clamp(player.x + dx * PLAYER_SPEED * delta, PLAYER_RADIUS, width - PLAYER_RADIUS);
    player.y = clamp(player.y + dy * PLAYER_SPEED * delta, PLAYER_RADIUS, height - PLAYER_RADIUS);
    player.angle = Math.atan2(dy, dx);
  }

  function collectTarget() {
    score += 10;
    scoreDisplay.textContent = formatScore(score);
    spawnParticles(target.x, target.y, 12);
    placeTarget();

    if (score % 30 === 0) {
      addHazard();
    }
    for (const hazard of hazards) {
      const speed = Math.hypot(hazard.vx, hazard.vy) + 4;
      const angle = Math.atan2(hazard.vy, hazard.vx);
      hazard.vx = Math.cos(angle) * speed;
      hazard.vy = Math.sin(angle) * speed;
    }
  }

  function spawnParticles(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 35 + Math.random() * 75;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.55,
      });
    }
  }

  function updateParticles(delta) {
    particles = particles.filter((particle) => particle.life > 0);
    for (const particle of particles) {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.life -= delta;
    }
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    drawTarget();
    for (const hazard of hazards) drawHazard(hazard);
    drawParticles();
    drawPlayer();
  }

  function drawTarget() {
    const pulse = 1 + Math.sin(targetPulse) * 0.16;
    context.save();
    context.shadowColor = "#c9ff64";
    context.shadowBlur = 20;
    context.fillStyle = "rgba(201, 255, 100, 0.12)";
    context.beginPath();
    context.arc(target.x, target.y, 14 * pulse, 0, Math.PI * 2);
    context.fill();
    context.translate(target.x, target.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = "#d8ff8a";
    context.fillRect(-5.5 * pulse, -5.5 * pulse, 11 * pulse, 11 * pulse);
    context.restore();
  }

  function drawHazard(hazard) {
    const pulse = Math.sin(hazard.phase) * 1.3;
    context.save();
    context.shadowColor = "#ff5572";
    context.shadowBlur = 16;
    context.fillStyle = "#ff657d";
    context.beginPath();
    context.arc(hazard.x, hazard.y, HAZARD_RADIUS + pulse, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(255, 235, 239, 0.85)";
    context.beginPath();
    context.arc(hazard.x - 3, hazard.y - 3, 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      context.globalAlpha = Math.max(0, particle.life / 0.55);
      context.fillStyle = "#c9ff64";
      context.beginPath();
      context.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPlayer() {
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    context.shadowColor = "#d7ff8b";
    context.shadowBlur = 18;
    context.fillStyle = "#efffc9";
    context.beginPath();
    context.moveTo(PLAYER_RADIUS + 5, 0);
    context.lineTo(-PLAYER_RADIUS, -PLAYER_RADIUS + 2);
    context.lineTo(-PLAYER_RADIUS + 4, 0);
    context.lineTo(-PLAYER_RADIUS, PLAYER_RADIUS - 2);
    context.closePath();
    context.fill();
    context.restore();
  }

  function distance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  playButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", pauseGame);
  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)) {
      event.preventDefault();
    }
    if (key === "p" || key === "Escape") {
      if (state === "running" || state === "paused") pauseGame();
      return;
    }
    keysDown.add(key);
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keysDown.delete(key);
  });

  window.addEventListener("blur", () => keysDown.clear());

  document.querySelectorAll(".direction-button").forEach((button) => {
    const direction = button.dataset.direction;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pointerDirections.add(direction);
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointerup", () => pointerDirections.delete(direction));
    button.addEventListener("pointercancel", () => pointerDirections.delete(direction));
    button.addEventListener("lostpointercapture", () => pointerDirections.delete(direction));
  });
})();