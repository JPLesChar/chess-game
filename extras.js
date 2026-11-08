const historyElement = document.getElementById('move-history');
const soundEnabledElement = document.getElementById('sound-enabled');
const downloadPgnButton = document.getElementById('download-pgn');
const baseResetGame = resetGame;
const baseFinishMove = finishMove;
const baseUpdateStatus = updateStatus;

let recordedMoves = [];

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
      (candidate.fromX !== fromX || candidate.fromY !== fromY)
      && candidate.x === move.x && candidate.y === move.y
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
  baseResetGame();
  renderMoveHistory();
}

function updateStatus() {
  baseUpdateStatus();
  renderMoveHistory();
}

function finishMove(fromX, fromY, move, promotionType = 'q') {
  const capturedPiece = move.enPassant ? getPiece(move.x, fromY) : getPiece(move.x, move.y);
  const san = getSanBeforeMove(fromX, fromY, move).replace(/=Q$/, `=${promotionType.toUpperCase()}`);
  const color = currentTurn;
  baseFinishMove(fromX, fromY, move, promotionType);

  const suffix = gameOver && statusElement.textContent.includes('Checkmate')
    ? '#'
    : (isKingInCheck(currentTurn) ? '+' : '');
  recordedMoves.push({ color, san: `${san}${suffix}` });
  renderMoveHistory();
  playMoveSound(capturedPiece || move.enPassant ? 'capture' : move.castle ? 'castle' : 'move');
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
    // Audio is optional; gameplay should work if the browser blocks it.
  }
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
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
  const pgn = `[Event "Browser Chess"]\n[Site "Local"]\n[Date "${date}"]\n[White "Player 1"]\n[Black "Player 2"]\n[Result "${result}"]\n\n${pgnMoves.join(' ')} ${result}`;
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'chess-game.pgn';
  link.click();
  URL.revokeObjectURL(url);
}

downloadPgnButton.addEventListener('click', exportPgn);
