const historyElement = document.getElementById('move-history');
const difficultyElement = document.getElementById('difficulty');
const soundEnabledElement = document.getElementById('sound-enabled');
const downloadPgnButton = document.getElementById('download-pgn');
const baseResetGame = resetGame;
const baseFinishMove = finishMove;
const baseUpdateStatus = updateStatus;

let recordedMoves = [];
let computerMovePending = false;

function renderMoveHistory() {
  historyElement.replaceChildren();
  for (let index = 0; index < recordedMoves.length; index += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = `${Math.floor(index / 2) + 1}.`;
    const white = document.createElement('span');
    white.textContent = recordedMoves[index]?.san ?? '';
    const black = document.createElement('span');
    black.textContent = recordedMoves[index + 1]?.san ?? '';
    row.append(number, white, black);
    historyElement.appendChild(row);
  }
  historyElement.scrollTop = historyElement.scrollHeight;
}

function getSanBeforeMove(fromX, fromY, move) {
  const piece = getPiece(fromX, fromY);
  const destination = getPiece(move.x, move.y);
  if (move.castle) return move.castle === 'kingSide' ? 'O-O' : 'O-O-O';
  const capture = Boolean(destination) || Boolean(move.enPassant);
  let san = piece.type === 'p' ? '' : piece.type.toUpperCase();

  if (piece.type !== 'p') {
    const competitors = getAllLegalMoves(currentTurn).filter((candidate) =>
      candidate.fromX !== fromX && candidate.x === move.x && candidate.y === move.y
      && getPiece(candidate.fromX, candidate.fromY)?.type === piece.type
    );
    if (competitors.length) {
      const sameFile = competitors.some((candidate) => candidate.fromX === fromX);
      const sameRank = competitors.some((candidate) => candidate.fromY === fromY);
      if (!sameFile) san += String.fromCharCode(97 + fromX);
      else if (!sameRank) san += String(8 - fromY);
      else san += `${String.fromCharCode(97 + fromX)}${8 - fromY}`;
    }
  } else if (capture) {
    san += String.fromCharCode(97 + fromX);
  }

  if (capture) san += 'x';
  san += `${String.fromCharCode(97 + move.x)}${8 - move.y}`;
  if (piece.type === 'p' && (move.y === 0 || move.y === 7)) san += '=Q';
  return san;
}

function resetGame() {
  recordedMoves = [];
  computerMovePending = false;
  baseResetGame();
  renderMoveHistory();
}

function updateStatus() {
  baseUpdateStatus();
  renderMoveHistory();
}

function finishMove(fromX, fromY, move, promotionType = 'q') {
  const movingPiece = getPiece(fromX, fromY);
  const capturedPiece = move.enPassant ? getPiece(move.x, fromY) : getPiece(move.x, move.y);
  const san = getSanBeforeMove(fromX, fromY, move).replace(/=Q$/, `=${promotionType.toUpperCase()}`);
  const color = currentTurn;
  baseFinishMove(fromX, fromY, move, promotionType);

  if (isKingInCheck(currentTurn)) sanSuffix(san, '#');
  const suffix = gameOver && statusElement.textContent.includes('Checkmate') ? '#' : (isKingInCheck(currentTurn) ? '+' : '');
  recordedMoves.push({ color, san: `${san}${suffix}` });
  renderMoveHistory();
  playMoveSound(capturedPiece || move.enPassant ? 'capture' : move.castle ? 'castle' : 'move');

  if (!gameOver && currentTurn === 'b') scheduleComputerMove();
}

// Kept as a no-op helper so the SAN construction remains explicit and side-effect free.
function sanSuffix(value, suffix) {
  return `${value}${suffix}`;
}

function playMoveSound(kind) {
  if (!soundEnabledElement.checked) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'capture' ? 240 : kind === 'castle' ? 420 : 330;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.onended = () => context.close();
  } catch (error) {
    // Audio is an optional enhancement; gameplay should work if the browser blocks it.
  }
}

function materialValue(type) {
  return ({ p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 })[type] || 0;
}

function scoreComputerMove(move, level) {
  const piece = getPiece(move.fromX, move.fromY);
  const target = move.enPassant ? getPiece(move.x, move.fromY) : getPiece(move.x, move.y);
  let score = target ? materialValue(target.type) * 1.15 - materialValue(piece.type) * 0.04 : 0;
  if (piece.type === 'p' && (move.y === 0 || move.y === 7)) score += 850;
  if (move.castle) score += 35;
  const centerDistance = Math.abs(3.5 - move.x) + Math.abs(3.5 - move.y);
  score += (7 - centerDistance) * (piece.type === 'p' || piece.type === 'n' ? 4 : 1);

  if (level === 'hard') {
    const from = board[move.fromY][move.fromX];
    const to = board[move.y][move.x];
    const epPiece = move.enPassant ? board[move.fromY][move.x] : null;
    let rook = null;
    let rookFromX;
    let rookToX;
    board[move.fromY][move.fromX] = null;
    if (move.enPassant) board[move.fromY][move.x] = null;
    board[move.y][move.x] = from;
    if (move.castle) {
      rookFromX = move.castle === 'kingSide' ? 7 : 0;
      rookToX = move.castle === 'kingSide' ? 5 : 3;
      rook = board[move.fromY][rookFromX];
      board[move.fromY][rookFromX] = null;
      board[move.fromY][rookToX] = rook;
    }
    if (isKingInCheck('w')) score += 45;
    if (isSquareAttacked(move.x, move.y, 'w')) score -= materialValue(piece.type) * 0.42;
    board[move.fromY][move.fromX] = from;
    board[move.y][move.x] = to;
    if (move.enPassant) board[move.fromY][move.x] = epPiece;
    if (move.castle) {
      board[move.fromY][rookToX] = null;
      board[move.fromY][rookFromX] = rook;
    }
  }

  if (level === 'easy') score *= 0.2;
  return score + Math.random() * (level === 'easy' ? 260 : level === 'medium' ? 90 : 18);
}

function scheduleComputerMove() {
  if (computerMovePending || gameOver || currentTurn !== 'b') return;
  computerMovePending = true;
  statusElement.textContent = 'Computer is thinking…';
  window.setTimeout(() => {
    computerMovePending = false;
    if (gameOver || currentTurn !== 'b') return;
    const moves = getAllLegalMoves('b');
    if (!moves.length) return;
    const level = difficultyElement.value;
    moves.sort((a, b) => scoreComputerMove(b, level) - scoreComputerMove(a, level));
    const move = moves[0];
    finishMove(move.fromX, move.fromY, move, 'q');
  }, 350);
}

function exportPgn() {
  const result = gameOver
    ? (statusElement.textContent.includes('Checkmate') ? (currentTurn === 'w' ? '0-1' : '1-0') : '1/2-1/2')
    : '*';
  const pgnMoves = [];
  for (let index = 0; index < recordedMoves.length; index += 2) {
    const moveNumber = Math.floor(index / 2) + 1;
    const white = recordedMoves[index]?.san || '';
    const black = recordedMoves[index + 1]?.san || '';
    pgnMoves.push(`${moveNumber}. ${white}${black ? ` ${black}` : ''}`);
  }
  const pgn = `[Event "Browser Chess"]\n[Site "Local"]\n[Date "${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}"]\n[White "Player"]\n[Black "Computer"]\n[Result "${result}"]\n\n${pgnMoves.join(' ')}${pgnMoves.length ? ' ' : ''}${result}\n`;
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'chess-game.pgn';
  link.click();
  URL.revokeObjectURL(url);
}

downloadPgnButton.addEventListener('click', exportPgn);
