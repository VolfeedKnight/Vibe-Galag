const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const overlay = document.getElementById("overlay");
const stateLabel = document.getElementById("stateLabel");
const stateTitle = document.getElementById("stateTitle");
const stateText = document.getElementById("stateText");
const startButton = document.getElementById("startButton");

const WORLD = {
  width: 840,
  height: 920,
};

const keys = new Set();
const bullets = [];
const enemyBullets = [];
const enemies = [];
const particles = [];
const stars = [];

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

let state = "ready";
let score = 0;
let wave = 1;
let lastTime = 0;
let enemyDirection = 1;
let enemyDrop = 0;
let enemyShotTimer = 1.1;
let wavePause = 0;
let spawnFlash = 0;

function createStars() {
  stars.length = 0;
  for (let i = 0; i < 110; i += 1) {
    stars.push({
      x: Math.random() * WORLD.width,
      y: Math.random() * WORLD.height,
      size: Math.random() * 2.2 + 0.4,
      speed: Math.random() * 36 + 18,
      alpha: Math.random() * 0.55 + 0.25,
    });
  }
}

function resetPlayer() {
  player.x = WORLD.width / 2;
  player.y = WORLD.height - 96;
  player.lives = 3;
  player.invincible = 1.4;
  player.shotCooldown = 0;
}

function spawnWave() {
  enemies.length = 0;
  enemyDirection = 1;
  enemyDrop = 0;
  enemyShotTimer = Math.max(0.38, 1.2 - wave * 0.06);
  spawnFlash = 0.65;

  const columns = Math.min(10, 6 + wave);
  const rows = Math.min(5, 3 + Math.floor(wave / 2));
  const gapX = 70;
  const gapY = 58;
  const startX = (WORLD.width - (columns - 1) * gapX) / 2;
  const startY = 92;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const type = row === 0 ? "ace" : row < 3 ? "fighter" : "scout";
      enemies.push({
        x: startX + col * gapX,
        y: startY + row * gapY,
        baseY: startY + row * gapY,
        width: type === "ace" ? 44 : 40,
        height: type === "ace" ? 38 : 34,
        row,
        col,
        type,
        phase: Math.random() * Math.PI * 2,
        dive: null,
      });
    }
  }
}

function resetGame() {
  score = 0;
  wave = 1;
  bullets.length = 0;
  enemyBullets.length = 0;
  particles.length = 0;
  resetPlayer();
  spawnWave();
  updateHud();
}

function startGame() {
  resetGame();
  state = "running";
  hideOverlay();
  lastTime = performance.now();
}

function setOverlay(label, title, text, buttonText = "Start") {
  stateLabel.textContent = label;
  stateTitle.textContent = title;
  stateText.textContent = text;
  startButton.textContent = buttonText;
  overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function updateHud() {
  scoreEl.textContent = score.toString();
  livesEl.textContent = player.lives.toString();
  waveEl.textContent = wave.toString();
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

function shoot() {
  if (player.shotCooldown > 0) {
    return;
  }

  bullets.push({
    x: player.x,
    y: player.y - player.height * 0.48,
    width: 6,
    height: 24,
    speed: 720,
  });
  player.shotCooldown = 0.18;
}

function fireEnemyBullet(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = 245 + wave * 16;

  enemyBullets.push({
    x: enemy.x,
    y: enemy.y + enemy.height * 0.4,
    width: 8,
    height: 18,
    vx: (dx / distance) * speed * 0.38,
    vy: (dy / distance) * speed,
  });
}

function burst(x, y, color, count = 16) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 170 + 60;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 4 + 2,
      life: Math.random() * 0.45 + 0.35,
      maxLife: 0.8,
      color,
    });
  }
}

function hitPlayer() {
  if (player.invincible > 0) {
    return;
  }

  player.lives -= 1;
  player.invincible = 1.6;
  burst(player.x, player.y, "#fb7185", 28);
  updateHud();

  if (player.lives <= 0) {
    state = "gameover";
    setOverlay("Game Over", "게임 오버", `최종 점수: ${score}`, "Restart");
  }
}

function updatePlayer(dt) {
  let movement = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    movement -= 1;
  }
  if (keys.has("ArrowRight") || keys.has("KeyD")) {
    movement += 1;
  }

  player.x += movement * player.speed * dt;
  player.x = clamp(player.x, 38, WORLD.width - 38);
  player.shotCooldown = Math.max(0, player.shotCooldown - dt);
  player.invincible = Math.max(0, player.invincible - dt);

  if (keys.has("Space")) {
    shoot();
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    bullets[i].y -= bullets[i].speed * dt;
    if (bullets[i].y < -40) {
      bullets.splice(i, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.y > WORLD.height + 40 || bullet.x < -40 || bullet.x > WORLD.width + 40) {
      enemyBullets.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  if (enemies.length === 0) {
    wavePause += dt;
    if (wavePause > 1.2) {
      wave += 1;
      wavePause = 0;
      spawnWave();
      updateHud();
    }
    return;
  }

  spawnFlash = Math.max(0, spawnFlash - dt);
  const formationSpeed = 38 + wave * 8;
  const diveChance = Math.min(0.22, 0.04 + wave * 0.018) * dt;
  let leftEdge = Infinity;
  let rightEdge = -Infinity;

  for (const enemy of enemies) {
    leftEdge = Math.min(leftEdge, enemy.x - enemy.width / 2);
    rightEdge = Math.max(rightEdge, enemy.x + enemy.width / 2);
  }

  if (leftEdge < 28 && enemyDirection < 0) {
    enemyDirection = 1;
    enemyDrop = 22;
  } else if (rightEdge > WORLD.width - 28 && enemyDirection > 0) {
    enemyDirection = -1;
    enemyDrop = 22;
  }

  for (const enemy of enemies) {
    enemy.phase += dt * 2.4;

    if (!enemy.dive && Math.random() < diveChance && enemy.row <= 2) {
      enemy.dive = {
        angle: Math.random() * Math.PI * 2,
        turn: Math.random() > 0.5 ? 1 : -1,
      };
    }

    if (enemy.dive) {
      enemy.dive.angle += dt * enemy.dive.turn * 2.8;
      enemy.x += Math.sin(enemy.dive.angle) * (125 + wave * 7) * dt;
      enemy.y += (142 + wave * 18) * dt;

      if (enemy.y > WORLD.height + 50) {
        enemy.y = 82;
        enemy.x = clamp(enemy.x, 72, WORLD.width - 72);
        enemy.dive = null;
      }
    } else {
      enemy.x += enemyDirection * formationSpeed * dt;
      enemy.y = enemy.baseY + enemyDrop + Math.sin(enemy.phase) * 7;
      enemy.baseY += wave * 1.1 * dt;
    }

    if (enemy.y > player.y - 36) {
      hitPlayer();
    }
  }

  enemyDrop = Math.max(0, enemyDrop - 45 * dt);

  enemyShotTimer -= dt;
  if (enemyShotTimer <= 0 && enemies.length > 0) {
    const shooter = enemies[Math.floor(Math.random() * enemies.length)];
    fireEnemyBullet(shooter);
    enemyShotTimer = Math.max(0.26, 1.15 - wave * 0.07 + Math.random() * 0.45);
  }
}

function updateCollisions() {
  for (let b = bullets.length - 1; b >= 0; b -= 1) {
    const bullet = bullets[b];
    for (let e = enemies.length - 1; e >= 0; e -= 1) {
      const enemy = enemies[e];
      if (rectsOverlap(bullet, enemy)) {
        bullets.splice(b, 1);
        enemies.splice(e, 1);
        score += enemy.type === "ace" ? 80 : enemy.type === "fighter" ? 50 : 30;
        burst(enemy.x, enemy.y, enemy.type === "ace" ? "#f7c948" : "#28d7ff");
        updateHud();
        break;
      }
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    if (rectsOverlap(enemyBullets[i], player)) {
      enemyBullets.splice(i, 1);
      hitPlayer();
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (rectsOverlap(enemy, player)) {
      burst(enemy.x, enemy.y, "#fb7185", 18);
      enemies.splice(i, 1);
      hitPlayer();
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 40 * dt;

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

  if (state !== "running") {
    updateParticles(dt);
    return;
  }

  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateCollisions();
  updateParticles(dt);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, "#070b18");
  gradient.addColorStop(0.55, "#08111f");
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
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);

  if (spawnFlash > 0) {
    ctx.globalAlpha = 0.45 + Math.sin(spawnFlash * 30) * 0.25;
  }

  const main = enemy.type === "ace" ? "#f7c948" : enemy.type === "fighter" ? "#fb7185" : "#28d7ff";
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.moveTo(0, -enemy.height / 2);
  ctx.lineTo(enemy.width / 2, 0);
  ctx.lineTo(enemy.width / 3, enemy.height / 2);
  ctx.lineTo(0, enemy.height / 3);
  ctx.lineTo(-enemy.width / 3, enemy.height / 2);
  ctx.lineTo(-enemy.width / 2, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillRect(-5, -3, 10, 8);
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

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();
}

function draw() {
  drawBackground();
  drawBullets();
  for (const enemy of enemies) {
    drawEnemy(enemy);
  }
  drawPlayer();
  drawParticles();

  if (state === "paused") {
    ctx.fillStyle = "rgba(5, 8, 16, 0.55)";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Paused", WORLD.width / 2, WORLD.height / 2);
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function handleKeyDown(event) {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyP" && event.repeat) {
    return;
  }

  keys.add(event.code);

  if (event.code === "Enter" && state !== "running") {
    startGame();
  }

  if (event.code === "KeyP" && (state === "running" || state === "paused")) {
    state = state === "running" ? "paused" : "running";
    if (state === "running") {
      hideOverlay();
      lastTime = performance.now();
    } else {
      setOverlay("Paused", "일시 정지", "P 키를 다시 누르면 계속 진행됩니다.", "Resume");
    }
  }
}

function handleKeyUp(event) {
  keys.delete(event.code);
}

function handleButtonClick() {
  if (state === "paused") {
    state = "running";
    hideOverlay();
    lastTime = performance.now();
    return;
  }

  startGame();
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
startButton.addEventListener("click", handleButtonClick);

createStars();
resetGame();
setOverlay("Ready", "갤러그 게임 시작", "방향키 또는 A/D로 이동하고 Space로 발사하세요.", "Start");
requestAnimationFrame(loop);
