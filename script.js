const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const comboEl = document.getElementById("combo");
const powerEl = document.getElementById("power");
const overlay = document.getElementById("overlay");
const stateLabel = document.getElementById("stateLabel");
const stateTitle = document.getElementById("stateTitle");
const stateText = document.getElementById("stateText");
const startButton = document.getElementById("startButton");
const touchButtons = [...document.querySelectorAll(".touch-btn")];

const WORLD = {
  width: 840,
  height: 920,
};

const STORAGE_KEY = "mini-galaga-best-score-v2";

const keys = new Set();
const bullets = [];
const enemyBullets = [];
const enemies = [];
const particles = [];
const powerups = [];
const stars = [];
const activeTouches = {
  left: false,
  right: false,
  shoot: false,
};

const player = {
  x: WORLD.width / 2,
  y: WORLD.height - 96,
  width: 54,
  height: 62,
  speed: 510,
  lives: 3,
  invincible: 0,
  shotCooldown: 0,
};

const enemyDefs = {
  scout: {
    hp: 1,
    width: 36,
    height: 30,
    speed: 72,
    score: 30,
    fireChance: 0.000,
    color: "#28d7ff",
  },
  fighter: {
    hp: 2,
    width: 42,
    height: 36,
    speed: 58,
    score: 60,
    fireChance: 0.002,
    color: "#5ee6a8",
  },
  tank: {
    hp: 4,
    width: 50,
    height: 42,
    speed: 38,
    score: 110,
    fireChance: 0.004,
    color: "#f7c948",
  },
  sniper: {
    hp: 2,
    width: 40,
    height: 34,
    speed: 50,
    score: 90,
    fireChance: 0.006,
    color: "#fb7185",
  },
  splitter: {
    hp: 2,
    width: 44,
    height: 34,
    speed: 64,
    score: 75,
    fireChance: 0.003,
    color: "#c084fc",
  },
  boss: {
    hp: 90,
    width: 134,
    height: 92,
    speed: 34,
    score: 1000,
    fireChance: 0.015,
    color: "#ffffff",
  },
};

const powerupDefs = {
  shield: { label: "Shield", duration: 7.5, color: "#28d7ff" },
  rapid: { label: "Rapid", duration: 9.0, color: "#5ee6a8" },
  spread: { label: "Spread", duration: 8.5, color: "#f7c948" },
  score: { label: "Score x2", duration: 10.0, color: "#fb7185" },
  bomb: { label: "Bomb", duration: 0, color: "#c084fc" },
};

let state = "ready";
let score = 0;
let bestScore = readBestScore();
let wave = 1;
let lastTime = 0;
let formationDirection = 1;
let formationDrop = 0;
let waveClearTimer = 0;
let bannerText = "";
let bannerTimer = 0;
let bannerColor = "#f8fafc";
let screenShake = 0;
let hitFlash = 0;
let comboChain = 0;
let comboTimer = 0;
let comboMultiplier = 1;
let scoreBoostTimer = 0;
let rapidTimer = 0;
let spreadTimer = 0;
let shieldTimer = 0;
let powerName = "None";
let musicStepTimer = 0;
let musicStep = 0;

const audio = {
  ctx: null,
  master: null,
  unlocked: false,
};

function readBestScore() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? Number(value) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(bestScore));
  } catch {
    // No-op.
  }
}

function ensureAudio() {
  if (audio.ctx) {
    return audio.ctx;
  }

  const context = new (window.AudioContext || window.webkitAudioContext)();
  const master = context.createGain();
  master.gain.value = 0.12;
  master.connect(context.destination);

  audio.ctx = context;
  audio.master = master;
  audio.unlocked = true;
  return context;
}

function playTone(frequency, duration, type = "square", gain = 0.1, detune = 0) {
  if (!audio.ctx || audio.ctx.state === "suspended") {
    return;
  }

  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const amp = audio.ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(amp);
  amp.connect(audio.master);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playEffect(kind) {
  ensureAudio();
  if (!audio.ctx || audio.ctx.state === "suspended") {
    return;
  }

  switch (kind) {
    case "shoot":
      playTone(740, 0.08, "square", 0.05);
      break;
    case "hit":
      playTone(180, 0.14, "sawtooth", 0.08);
      break;
    case "explosion":
      playTone(110, 0.2, "triangle", 0.1);
      break;
    case "powerup":
      playTone(520, 0.14, "sine", 0.08);
      playTone(780, 0.1, "sine", 0.06, 12);
      break;
    case "bomb":
      playTone(90, 0.28, "sawtooth", 0.12);
      playTone(45, 0.4, "triangle", 0.08);
      break;
    case "boss":
      playTone(95, 0.22, "square", 0.1);
      playTone(150, 0.18, "square", 0.06);
      break;
    default:
      break;
  }
}

function updateMusic(dt) {
  if (!audio.ctx || audio.ctx.state === "suspended" || state !== "running") {
    return;
  }

  musicStepTimer -= dt;
  if (musicStepTimer > 0) {
    return;
  }

  const melody = [392, 440, 523, 494, 440, 392, 330, 349];
  const bass = [98, 110, 131, 123, 110, 98, 82, 92];
  const note = melody[musicStep % melody.length];
  const root = bass[musicStep % bass.length];

  playTone(note, 0.11, "square", 0.032);
  playTone(root, 0.18, "triangle", 0.02);

  musicStep = (musicStep + 1) % melody.length;
  musicStepTimer = 0.34;
}

function createStars() {
  stars.length = 0;
  for (let i = 0; i < 120; i += 1) {
    stars.push({
      x: Math.random() * WORLD.width,
      y: Math.random() * WORLD.height,
      size: Math.random() * 2.2 + 0.4,
      speed: Math.random() * 40 + 18,
      alpha: Math.random() * 0.55 + 0.25,
    });
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return (
    a.x - a.width / 2 < b.x + b.width / 2 &&
    a.x + a.width / 2 > b.x - b.width / 2 &&
    a.y - a.height / 2 < b.y + b.height / 2 &&
    a.y + a.height / 2 > b.y - b.height / 2
  );
}

function updateHud() {
  scoreEl.textContent = score.toString();
  bestScoreEl.textContent = bestScore.toString();
  livesEl.textContent = player.lives.toString();
  waveEl.textContent = wave.toString();
  comboEl.textContent = `x${comboMultiplier}`;
  powerEl.textContent = powerName;
}

function setBestScore(value) {
  if (value <= bestScore) {
    return;
  }

  bestScore = value;
  saveBestScore();
}

function setBanner(text, color = "#f8fafc", duration = 1.2) {
  bannerText = text;
  bannerColor = color;
  bannerTimer = duration;
}

function resetPlayer() {
  player.x = WORLD.width / 2;
  player.y = WORLD.height - 96;
  player.lives = 3;
  player.invincible = 1.4;
  player.shotCooldown = 0;
}

function resetTimers() {
  comboChain = 0;
  comboTimer = 0;
  comboMultiplier = 1;
  scoreBoostTimer = 0;
  rapidTimer = 0;
  spreadTimer = 0;
  shieldTimer = 0;
  powerName = "None";
}

function clearEntities() {
  bullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
  powerups.length = 0;
}

function resetGame() {
  score = 0;
  wave = 1;
  waveClearTimer = 0;
  formationDirection = 1;
  formationDrop = 0;
  bannerTimer = 0;
  screenShake = 0;
  hitFlash = 0;
  musicStep = 0;
  musicStepTimer = 0;
  clearEntities();
  resetTimers();
  resetPlayer();
  activeTouches.left = false;
  activeTouches.right = false;
  activeTouches.shoot = false;
  spawnWave();
  updateHud();
}

function startGame() {
  ensureAudio().resume();
  resetGame();
  state = "running";
  hideOverlay();
  lastTime = performance.now();
  setBanner("Mission start", "#5ee6a8", 1.0);
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function setOverlay(label, title, text, buttonText = "Start") {
  stateLabel.textContent = label;
  stateTitle.textContent = title;
  stateText.textContent = text;
  startButton.textContent = buttonText;
  overlay.classList.remove("is-hidden");
}

function spawnExplosion(x, y, color, count = 18, spread = 170) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * spread + 50;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 4 + 2,
      life: Math.random() * 0.5 + 0.35,
      maxLife: 0.9,
      color,
    });
  }
}

function addScore(points) {
  const multiplier = comboMultiplier * (scoreBoostTimer > 0 ? 2 : 1);
  score += Math.round(points * multiplier);
  if (score > bestScore) {
    setBestScore(score);
  }
  updateHud();
}

function registerKill(baseScore) {
  comboChain += 1;
  comboTimer = 2.2;
  comboMultiplier = Math.min(5, 1 + Math.floor((comboChain - 1) / 4));
  addScore(baseScore);
  updateHud();
}

function resetCombo() {
  comboChain = 0;
  comboTimer = 0;
  comboMultiplier = 1;
}

function activePowerLabel() {
  if (shieldTimer > 0) {
    return `Shield ${shieldTimer.toFixed(1)}s`;
  }
  if (spreadTimer > 0) {
    return `Spread ${spreadTimer.toFixed(1)}s`;
  }
  if (rapidTimer > 0) {
    return `Rapid ${rapidTimer.toFixed(1)}s`;
  }
  if (scoreBoostTimer > 0) {
    return `Score x2 ${scoreBoostTimer.toFixed(1)}s`;
  }
  return "None";
}

function spawnPlayerBullets() {
  const rapidScale = rapidTimer > 0 ? 0.55 : 1;
  if (player.shotCooldown > 0) {
    return;
  }

  const baseSpeed = 760;
  const y = player.y - player.height * 0.48;

  if (spreadTimer > 0) {
    bullets.push(
      { x: player.x - 18, y, width: 6, height: 22, speed: baseSpeed, vx: -160 },
      { x: player.x, y, width: 6, height: 24, speed: baseSpeed, vx: 0 },
      { x: player.x + 18, y, width: 6, height: 22, speed: baseSpeed, vx: 160 },
    );
    playEffect("shoot");
    player.shotCooldown = 0.18 * rapidScale;
    return;
  }

  bullets.push({
    x: player.x,
    y,
    width: 6,
    height: 24,
    speed: baseSpeed,
    vx: 0,
  });
  playEffect("shoot");
  player.shotCooldown = 0.16 * rapidScale;
}

function applyPowerup(type) {
  if (type === "bomb") {
    const count = enemies.length + enemyBullets.length;
    spawnExplosion(player.x, player.y - 60, "#c084fc", 32, 220);
    enemies.length = 0;
    enemyBullets.length = 0;
    bullets.length = 0;
    addScore(100 + count * 10);
    setBanner("Smart bomb", "#c084fc", 1.0);
    playEffect("bomb");
    return;
  }

  const def = powerupDefs[type];
  if (!def) {
    return;
  }

  switch (type) {
    case "shield":
      shieldTimer = def.duration;
      break;
    case "rapid":
      rapidTimer = def.duration;
      break;
    case "spread":
      spreadTimer = def.duration;
      break;
    case "score":
      scoreBoostTimer = def.duration;
      break;
    default:
      break;
  }

  powerName = activePowerLabel();
  setBanner(def.label, def.color, 1.0);
  playEffect("powerup");
  updateHud();
}

function dropPowerup(enemy) {
  const roll = Math.random();
  const choices = enemy.type === "boss"
    ? ["shield", "rapid", "spread", "score", "bomb"]
    : enemy.type === "tank"
      ? ["shield", "score", "spread", "rapid"]
      : enemy.type === "sniper"
        ? ["rapid", "spread", "score"]
        : ["rapid", "spread", "score", "shield", "bomb"];

  let type = choices[Math.floor(Math.random() * choices.length)];
  if (roll > 0.22 && enemy.type !== "boss") {
    return;
  }

  if (enemy.type === "boss" && Math.random() < 0.5) {
    type = "bomb";
  }

  powerups.push({
    x: enemy.x,
    y: enemy.y,
    width: 28,
    height: 28,
    vy: 120 + wave * 8,
    type,
    pulse: Math.random() * Math.PI * 2,
  });
}

function makeEnemy(type, x, y, column = 0, row = 0) {
  const def = enemyDefs[type];
  return {
    type,
    x,
    y,
    baseX: x,
    baseY: y,
    width: def.width,
    height: def.height,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    score: def.score,
    fireChance: def.fireChance,
    color: def.color,
    column,
    row,
    phase: Math.random() * Math.PI * 2,
    dive: null,
    fireCooldown: Math.random() * 1.5 + 0.4,
    specialTimer: Math.random() * 1.4,
  };
}

function spawnFormationWave() {
  const columns = Math.min(10, 6 + Math.floor(wave * 0.6));
  const rows = Math.min(5, 3 + Math.floor(wave / 2));
  const gapX = 70;
  const gapY = 60;
  const startX = (WORLD.width - (columns - 1) * gapX) / 2;
  const startY = 92;
  const rowTypes = ["sniper", "fighter", "splitter", "tank", "scout"];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const type = rowTypes[(row + Math.floor(wave / 2)) % rowTypes.length];
      const enemy = makeEnemy(type, startX + col * gapX, startY + row * gapY, col, row);
      enemy.speed += wave * 3;
      enemies.push(enemy);
    }
  }
}

function spawnBossWave() {
  enemies.push(makeEnemy("boss", WORLD.width / 2, 120, 0, 0));
  const escorts = 4 + Math.floor(wave / 4);
  for (let i = 0; i < escorts; i += 1) {
    enemies.push(makeEnemy("fighter", 180 + i * 120, 230 + (i % 2) * 40, i, 1));
  }
}

function spawnWave() {
  enemies.length = 0;
  enemyBullets.length = 0;
  powerups.length = 0;
  waveClearTimer = 0;
  formationDirection = 1;
  formationDrop = 0;

  if (wave % 4 === 0) {
    spawnBossWave();
    setBanner(`Boss wave ${wave}`, "#fb7185", 1.4);
    playEffect("boss");
    return;
  }

  spawnFormationWave();
  setBanner(`Wave ${wave}`, "#28d7ff", 1.1);
}

function destroyEnemy(enemy, hitX, hitY, grantPoints = true) {
  const bonus = enemy.type === "boss" ? 260 : enemy.type === "tank" ? 40 : 24;
  spawnExplosion(hitX, hitY, enemy.color, enemy.type === "boss" ? 40 : 18, enemy.type === "boss" ? 240 : 160);
  if (grantPoints) {
    registerKill(enemy.score);
    addScore(bonus);
    dropPowerup(enemy);
  }
  screenShake = Math.max(screenShake, enemy.type === "boss" ? 14 : 5);
  hitFlash = Math.max(hitFlash, enemy.type === "boss" ? 0.28 : 0.14);
  playEffect("explosion");

  if (grantPoints && enemy.type === "splitter" && enemy.type !== "boss") {
    enemies.push(makeEnemy("scout", enemy.x - 18, enemy.y + 10, enemy.column, enemy.row));
    enemies.push(makeEnemy("scout", enemy.x + 18, enemy.y + 10, enemy.column, enemy.row));
  }
}

function damagePlayer() {
  if (shieldTimer > 0 || player.invincible > 0) {
    spawnExplosion(player.x, player.y, "#28d7ff", 12, 120);
    playEffect("hit");
    return;
  }

  player.lives -= 1;
  resetCombo();
  screenShake = Math.max(screenShake, 10);
  hitFlash = Math.max(hitFlash, 0.22);
  player.invincible = 1.5;
  spawnExplosion(player.x, player.y, "#fb7185", 28, 180);
  playEffect("hit");
  updateHud();

  if (player.lives <= 0) {
    gameOver();
  }
}

function gameOver() {
  state = "gameover";
  setBestScore(score);
  updateHud();
  setOverlay(
    "Game Over",
    "Run ended",
    `Final score: ${score}. Best score: ${bestScore}. Press Enter or Restart to try again.`,
    "Restart",
  );
}

function pauseGame() {
  if (state !== "running") {
    return;
  }

  state = "paused";
  setOverlay("Paused", "Paused", "Press P, Enter, or Resume to continue.", "Resume");
}

function resumeGame() {
  if (state !== "paused") {
    return;
  }

  state = "running";
  hideOverlay();
  lastTime = performance.now();
}

function togglePause() {
  if (state === "running") {
    pauseGame();
  } else if (state === "paused") {
    resumeGame();
  }
}

function useControlState() {
  return {
    left: keys.has("ArrowLeft") || keys.has("KeyA") || activeTouches.left,
    right: keys.has("ArrowRight") || keys.has("KeyD") || activeTouches.right,
    shoot: keys.has("Space") || activeTouches.shoot,
  };
}

function updatePlayer(dt) {
  const controls = useControlState();
  let movement = 0;

  if (controls.left) {
    movement -= 1;
  }
  if (controls.right) {
    movement += 1;
  }

  player.x += movement * player.speed * dt;
  player.x = clamp(player.x, 36, WORLD.width - 36);
  player.shotCooldown = Math.max(0, player.shotCooldown - dt);
  player.invincible = Math.max(0, player.invincible - dt);

  if (controls.shoot) {
    spawnPlayerBullets();
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.y -= bullet.speed * dt;
    bullet.x += (bullet.vx || 0) * dt;
    bullet.x = clamp(bullet.x, -40, WORLD.width + 40);
    if (bullet.y < -60) {
      bullets.splice(i, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.y > WORLD.height + 60 || bullet.x < -60 || bullet.x > WORLD.width + 60) {
      enemyBullets.splice(i, 1);
    }
  }
}

function fireEnemyBullet(enemy, mode = "aimed") {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = enemy.type === "boss" ? 360 : 240 + wave * 12;
  const spread = mode === "spread" ? 120 : 0;

  const shootBullet = (offsetX, offsetY, vx, vy) => {
    enemyBullets.push({
      x: enemy.x + offsetX,
      y: enemy.y + offsetY,
      width: 8,
      height: 18,
      vx,
      vy,
    });
  };

  if (mode === "spread") {
    shootBullet(0, enemy.height * 0.4, -spread * 0.25, speed);
    shootBullet(0, enemy.height * 0.4, 0, speed + 20);
    shootBullet(0, enemy.height * 0.4, spread * 0.25, speed);
    return;
  }

  shootBullet(
    0,
    enemy.height * 0.4,
    (dx / distance) * speed * 0.36,
    (dy / distance) * speed,
  );
}

function updateEnemy(enemy, dt) {
  enemy.phase += dt * (enemy.type === "sniper" ? 3.2 : 2.2);
  enemy.fireCooldown -= dt;
  enemy.specialTimer -= dt;

  if (enemy.type === "boss") {
    enemy.x += Math.sin(enemy.phase * 0.7) * 78 * dt;
    enemy.x = clamp(enemy.x, 140, WORLD.width - 140);
    enemy.y = 126 + Math.sin(enemy.phase * 0.45) * 12;

    if (enemy.fireCooldown <= 0) {
      fireEnemyBullet(enemy, "spread");
      fireEnemyBullet(enemy, "aimed");
      playEffect("boss");
      enemy.fireCooldown = Math.max(0.5, 1.4 - wave * 0.05);
    }
    return;
  }

  if (!enemy.dive && enemy.type !== "tank" && enemy.type !== "sniper" && Math.random() < 0.0018 * wave * dt) {
    enemy.dive = {
      angle: Math.random() * Math.PI * 2,
      turn: Math.random() > 0.5 ? 1 : -1,
    };
  }

  if (enemy.dive) {
    enemy.dive.angle += dt * enemy.dive.turn * 2.6;
    enemy.x += Math.sin(enemy.dive.angle) * (118 + wave * 6) * dt;
    enemy.y += (146 + wave * 16) * dt;
    if (enemy.y > WORLD.height + 60) {
      enemy.y = 82;
      enemy.x = clamp(enemy.x, 72, WORLD.width - 72);
      enemy.dive = null;
    }
  } else {
    const drift = enemy.type === "sniper" ? 0.55 : enemy.type === "tank" ? 0.4 : 1;
    const waveSpeed = enemy.speed + wave * 4;
    enemy.x += formationDirection * waveSpeed * drift * dt;
    enemy.y = enemy.baseY + formationDrop + Math.sin(enemy.phase) * (enemy.type === "sniper" ? 5 : 7);
    enemy.baseY += (enemy.type === "scout" ? 0.5 : 0.8) * wave * dt;
  }

  if (enemy.fireCooldown <= 0) {
    if (enemy.type === "sniper") {
      fireEnemyBullet(enemy, "aimed");
      enemy.fireCooldown = Math.max(1.0, 2.0 - wave * 0.04);
    } else if (enemy.type === "tank") {
      fireEnemyBullet(enemy, "spread");
      enemy.fireCooldown = Math.max(1.6, 2.6 - wave * 0.05);
    } else if (enemy.type === "splitter") {
      fireEnemyBullet(enemy, "aimed");
      enemy.fireCooldown = Math.max(1.0, 1.9 - wave * 0.04);
    } else {
      fireEnemyBullet(enemy, "aimed");
      enemy.fireCooldown = Math.max(1.0, 2.2 - wave * 0.06);
    }
  }
}

function updateEnemies(dt) {
  if (enemies.length === 0) {
    waveClearTimer += dt;
    if (waveClearTimer >= 1.25) {
      wave += 1;
      spawnWave();
      updateHud();
      waveClearTimer = 0;
    }
    return;
  }

  const leftEdge = Math.min(...enemies.map((enemy) => enemy.x - enemy.width / 2));
  const rightEdge = Math.max(...enemies.map((enemy) => enemy.x + enemy.width / 2));

  if (leftEdge < 26 && formationDirection < 0) {
    formationDirection = 1;
    formationDrop = 20;
  } else if (rightEdge > WORLD.width - 26 && formationDirection > 0) {
    formationDirection = -1;
    formationDrop = 20;
  }

  formationDrop = Math.max(0, formationDrop - 42 * dt);

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    updateEnemy(enemy, dt);

    if (enemy.y > player.y - 32) {
      damagePlayer();
      enemies.splice(i, 1);
      continue;
    }

    if (enemy.x < -80 || enemy.x > WORLD.width + 80) {
      enemy.x = clamp(enemy.x, 80, WORLD.width - 80);
      enemy.dive = null;
    }
  }
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i -= 1) {
    const item = powerups[i];
    item.pulse += dt * 6;
    item.y += item.vy * dt;
    if (rectsOverlap(item, player)) {
      applyPowerup(item.type);
      powerups.splice(i, 1);
      continue;
    }
    if (item.y > WORLD.height + 40) {
      powerups.splice(i, 1);
    }
  }
}

function updateTimers(dt) {
  comboTimer = Math.max(0, comboTimer - dt);
  if (comboTimer === 0 && comboChain > 0) {
    resetCombo();
  }

  scoreBoostTimer = Math.max(0, scoreBoostTimer - dt);
  rapidTimer = Math.max(0, rapidTimer - dt);
  spreadTimer = Math.max(0, spreadTimer - dt);
  shieldTimer = Math.max(0, shieldTimer - dt);
  bannerTimer = Math.max(0, bannerTimer - dt);
  hitFlash = Math.max(0, hitFlash - dt);
  screenShake = Math.max(0, screenShake - dt * 16);
  powerName = activePowerLabel();
}

function updateCollisions() {
  for (let b = bullets.length - 1; b >= 0; b -= 1) {
    const bullet = bullets[b];

    for (let e = enemies.length - 1; e >= 0; e -= 1) {
      const enemy = enemies[e];
      if (!rectsOverlap(bullet, enemy)) {
        continue;
      }

      bullet.dead = true;
      enemy.hp -= 1;
      spawnExplosion(bullet.x, bullet.y, "#f8fafc", 5, 50);
      if (enemy.hp <= 0) {
        destroyEnemy(enemy, bullet.x, bullet.y);
        enemies.splice(e, 1);
      } else {
        spawnExplosion(bullet.x, bullet.y, enemy.color, 10, 80);
        playEffect("hit");
      }
      break;
    }

    if (bullet.dead) {
      bullets.splice(b, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    if (rectsOverlap(enemyBullets[i], player)) {
      enemyBullets.splice(i, 1);
      damagePlayer();
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (rectsOverlap(enemy, player)) {
      destroyEnemy(enemy, enemy.x, enemy.y, false);
      enemies.splice(i, 1);
      damagePlayer();
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 35 * dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updateStars(dt) {
  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > WORLD.height) {
      star.x = Math.random() * WORLD.width;
      star.y = -8;
    }
  }
}

function update(dt) {
  updateStars(dt);
  updateMusic(dt);

  if (state !== "running") {
    updateParticles(dt);
    return;
  }

  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updatePowerups(dt);
  updateCollisions();
  updateTimers(dt);
  updateParticles(dt);
  updateHud();

  if (score > bestScore) {
    setBestScore(score);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, "#070b18");
  gradient.addColorStop(0.5, "#08111f");
  gradient.addColorStop(1, "#03050b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.save();
  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(40, 215, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let y = 90; y < WORLD.height; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
  }

  if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) {
    ctx.globalAlpha = 0.38;
  }

  ctx.fillStyle = "#5ee6a8";
  ctx.beginPath();
  ctx.moveTo(0, -player.height / 2);
  ctx.lineTo(player.width / 2, player.height / 2);
  ctx.lineTo(12, player.height / 2 - 8);
  ctx.lineTo(0, player.height / 2 - 22);
  ctx.lineTo(-12, player.height / 2 - 8);
  ctx.lineTo(-player.width / 2, player.height / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#28d7ff";
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(11, 11);
  ctx.lineTo(-11, 11);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f7c948";
  ctx.fillRect(-16, 24, 8, 16);
  ctx.fillRect(8, 24, 8, 16);

  if (shieldTimer > 0) {
    ctx.strokeStyle = "rgba(40, 215, 255, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 42 + Math.sin(performance.now() / 180) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);

  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake * 0.25, (Math.random() - 0.5) * screenShake * 0.25);
  }

  const pulse = 0.55 + Math.sin(enemy.phase * 2.0) * 0.12;
  ctx.globalAlpha = pulse;

  if (enemy.type === "boss") {
    const grad = ctx.createLinearGradient(-enemy.width / 2, 0, enemy.width / 2, 0);
    grad.addColorStop(0, "#fb7185");
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(1, "#28d7ff");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -enemy.height / 2);
    ctx.lineTo(enemy.width / 2, -12);
    ctx.lineTo(enemy.width / 2 - 20, enemy.height / 4);
    ctx.lineTo(26, enemy.height / 2);
    ctx.lineTo(-26, enemy.height / 2);
    ctx.lineTo(-enemy.width / 2 + 20, enemy.height / 4);
    ctx.lineTo(-enemy.width / 2, -12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(17, 24, 39, 0.92)";
    ctx.fillRect(-36, -6, 72, 16);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(-28, -2, 56 * (enemy.hp / enemy.maxHp), 8);
  } else {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -enemy.height / 2);
    ctx.lineTo(enemy.width / 2, 0);
    ctx.lineTo(enemy.width / 3, enemy.height / 2);
    ctx.lineTo(0, enemy.height / 3);
    ctx.lineTo(-enemy.width / 3, enemy.height / 2);
    ctx.lineTo(-enemy.width / 2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(-5, -3, 10, 8);

    if (enemy.hp > 1) {
      ctx.fillStyle = "rgba(17, 24, 39, 0.9)";
      ctx.fillRect(-enemy.width / 2, enemy.height / 2 + 6, enemy.width, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        -enemy.width / 2,
        enemy.height / 2 + 6,
        enemy.width * (enemy.hp / enemy.maxHp),
        5,
      );
    }
  }

  ctx.restore();
}

function drawBullets() {
  ctx.save();
  for (const bullet of bullets) {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
    ctx.fillStyle = "#28d7ff";
    ctx.fillRect(bullet.x - 2, bullet.y - bullet.height / 2, 4, bullet.height);
  }

  for (const bullet of enemyBullets) {
    ctx.fillStyle = "#fb7185";
    ctx.beginPath();
    ctx.ellipse(bullet.x, bullet.y, bullet.width / 2, bullet.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPowerups() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const item of powerups) {
    const def = powerupDefs[item.type];
    const glow = 0.6 + Math.sin(item.pulse) * 0.18;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.globalAlpha = glow;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.fillStyle = "#050914";
    ctx.font = "700 10px system-ui, sans-serif";
    ctx.fillText(def.label[0], 0, 1);
    ctx.restore();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();
}

function drawBanner() {
  if (bannerTimer <= 0 || !bannerText) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = clamp(bannerTimer / 1.2, 0, 1);
  ctx.fillStyle = bannerColor;
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(bannerText, WORLD.width / 2, 88);
  ctx.restore();
}

function drawOverlayMask() {
  if (state !== "paused") {
    return;
  }

  ctx.fillStyle = "rgba(5, 8, 16, 0.55)";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Paused", WORLD.width / 2, WORLD.height / 2);
}

function draw() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
  }

  drawBackground();
  drawPowerups();
  drawBullets();
  for (const enemy of enemies) {
    drawEnemy(enemy);
  }
  drawPlayer();
  drawParticles();
  drawBanner();
  drawOverlayMask();

  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${hitFlash * 0.35})`;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  ctx.restore();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function handleKeyDown(event) {
  if (["ArrowLeft", "ArrowRight", "Space", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyP" && event.repeat) {
    return;
  }

  keys.add(event.code);

  if (event.code === "Enter" && state !== "running") {
    if (state === "paused") {
      resumeGame();
    } else {
      startGame();
    }
  }

  if (event.code === "KeyP") {
    togglePause();
  }

  if (event.code === "KeyR" && state !== "running") {
    startGame();
  }
}

function handleKeyUp(event) {
  keys.delete(event.code);
}

function handleButtonClick(event) {
  const action = event.currentTarget.dataset.action;
  ensureAudio().resume();

  if (action === "left" || action === "right" || action === "shoot") {
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    activeTouches[action] = true;
    updateTouchButtons();
    if (action === "shoot") {
      spawnPlayerBullets();
    }
    return;
  }

  if (action === "pause") {
    togglePause();
    return;
  }

  if (action === "restart") {
    startGame();
  }
}

function handleButtonRelease(event) {
  const action = event.currentTarget.dataset.action;
  if (action === "left" || action === "right" || action === "shoot") {
    activeTouches[action] = false;
    updateTouchButtons();
  }
}

function updateTouchButtons() {
  for (const button of touchButtons) {
    const action = button.dataset.action;
    if (action === "left" || action === "right" || action === "shoot") {
      button.classList.toggle("active", activeTouches[action]);
    }
  }
}

function bindTouchControls() {
  for (const button of touchButtons) {
    button.addEventListener("pointerdown", handleButtonClick);
    button.addEventListener("pointerup", handleButtonRelease);
    button.addEventListener("pointercancel", handleButtonRelease);
    button.addEventListener("pointerleave", handleButtonRelease);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
}

function updateEnemyDeathsNearPlayer() {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (enemy.y > WORLD.height + 80) {
      enemies.splice(i, 1);
      continue;
    }
  }
}

function initializeState() {
  createStars();
  bestScoreEl.textContent = bestScore.toString();
  clearEntities();
  resetTimers();
  resetPlayer();
  activeTouches.left = false;
  activeTouches.right = false;
  activeTouches.shoot = false;
  updateHud();
  setOverlay(
    "Ready",
    "Mini Galaga",
    "Move with arrows or A/D. Shoot with Space. Mobile controls are below.",
    "Start",
  );
  updateTouchButtons();
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("pointerdown", () => ensureAudio().resume(), { passive: true });
startButton.addEventListener("click", () => {
  if (state === "paused") {
    resumeGame();
    return;
  }
  startGame();
});

bindTouchControls();
initializeState();
requestAnimationFrame(loop);
