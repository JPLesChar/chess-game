const PIECES = {
  w: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
  b: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }
};
const PROMOTION_TYPES = ['q', 'r', 'b', 'n'];
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const newGameButton = document.getElementById('new-game');
const promotionDialog = document.getElementById('promotion-dialog');
const promotionChoices = document.getElementById('promotion-choices');

let board = [];
let currentTurn = 'w';
let selectedSquare = null;
let legalMoves = [];
let castlingRights = {};
let enPassantTarget = null;
let gameOver = false;
let pendingPromotion = null;
let suppressNextClick = false;

function createInitialBoard() {
  const initial = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let x = 0; x < 8; x += 1) {
    initial[0][x] = { type: backRank[x], color: 'b' };
    initial[1][x] = { type: 'p', color: 'b' };
    initial[6][x] = { type: 'p', color: 'w' };
    initial[7][x] = { type: backRank[x], color: 'w' };
  }
  return initial;
}

function resetGame() {
  if (promotionDialog.open) promotionDialog.close();
  board = createInitialBoard();
  currentTurn = 'w';
  selectedSquare = null;
  legalMoves = [];
  castlingRights = {
    w: { kingSide: true, queenSide: true },
    b: { kingSide: true, queenSide: true }
  };
  enPassantTarget = null;
  gameOver = false;
  pendingPromotion = null;
  updateStatus();
  renderBoard();
}

function inBounds(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function getPiece(x, y) {
  return inBounds(x, y) ? board[y][x] : null;
}

function opponent(color) {
  return color === 'w' ? 'b' : 'w';
}

function getKingPosition(color) {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = board[y][x];
      if (piece?.type === 'k' && piece.color === color) return { x, y };
    }
  }
  return null;
}

function isSquareAttacked(x, y, byColor) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.color !== byColor) continue;
      const dx = x - col;
      const dy = y - row;

      if (piece.type === 'p') {
        const direction = piece.color === 'w' ? -1 : 1;
        if (Math.abs(dx) === 1 && dy === direction) return true;
      } else if (piece.type === 'n') {
        if ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1)) return true;
      } else if (piece.type === 'k') {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return true;
      } else {
        const diagonal = Math.abs(dx) === Math.abs(dy) && dx !== 0;
        const straight = (dx === 0) !== (dy === 0);
        const attacksLine = piece.type === 'q' || (piece.type === 'b' && diagonal) || (piece.type === 'r' && straight);
        if (!attacksLine) continue;
        const stepX = Math.sign(dx);
        const stepY = Math.sign(dy);
        let checkX = col + stepX;
        let checkY = row + stepY;
        let blocked = false;
        while (checkX !== x || checkY !== y) {
          if (board[checkY][checkX]) {
            blocked = true;
            break;
          }
          checkX += stepX;
          checkY += stepY;
        }
        if (!blocked) return true;
      }
    }
  }
  return false;
}

function isKingInCheck(color) {
  const king = getKingPosition(color);
  return king ? isSquareAttacked(king.x, king.y, opponent(color)) : false;
}

function addSlidingMoves(moves, x, y, piece, directions) {
  for (const [dx, dy] of directions) {
    let nextX = x + dx;
    let nextY = y + dy;
    while (inBounds(nextX, nextY)) {
      const target = getPiece(nextX, nextY);
      if (!target) moves.push({ x: nextX, y: nextY });
      else {
        if (target.color !== piece.color && target.type !== 'k') moves.push({ x: nextX, y: nextY });
        break;
      }
      nextX += dx;
      nextY += dy;
    }
  }
}

function generatePseudoLegalMoves(x, y) {
  const piece = getPiece(x, y);
  if (!piece) return [];
  const moves = [];

  if (piece.type === 'p') {
    const direction = piece.color === 'w' ? -1 : 1;
    const startRow = piece.color === 'w' ? 6 : 1;
    const nextY = y + direction;
    if (inBounds(x, nextY) && !getPiece(x, nextY)) {
      moves.push({ x, y: nextY });
      const doubleY = y + direction * 2;
      if (y === startRow && !getPiece(x, doubleY)) moves.push({ x, y: doubleY });
    }
    for (const dx of [-1, 1]) {
      const targetX = x + dx;
      const target = getPiece(targetX, nextY);
      if (target && target.color !== piece.color && target.type !== 'k') moves.push({ x: targetX, y: nextY });
      if (enPassantTarget && targetX === enPassantTarget.x && nextY === enPassantTarget.y) {
        moves.push({ x: targetX, y: nextY, enPassant: true });
      }
    }
  } else if (piece.type === 'n') {
    for (const [dx, dy] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      const nx = x + dx;
      const ny = y + dy;
      const target = getPiece(nx, ny);
      if (inBounds(nx, ny) && (!target || (target.color !== piece.color && target.type !== 'k'))) moves.push({ x: nx, y: ny });
    }
  } else if (piece.type === 'b') {
    addSlidingMoves(moves, x, y, piece, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  } else if (piece.type === 'r') {
    addSlidingMoves(moves, x, y, piece, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
  } else if (piece.type === 'q') {
    addSlidingMoves(moves, x, y, piece, [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);
  } else if (piece.type === 'k') {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        const target = getPiece(nx, ny);
        if (inBounds(nx, ny) && (!target || (target.color !== piece.color && target.type !== 'k'))) moves.push({ x: nx, y: ny });
      }
    }
    const homeY = piece.color === 'w' ? 7 : 0;
    const enemy = opponent(piece.color);
    if (x === 4 && y === homeY && !isSquareAttacked(x, y, enemy)) {
      if (castlingRights[piece.color].kingSide && !getPiece(5, homeY) && !getPiece(6, homeY)
          && getPiece(7, homeY)?.type === 'r' && getPiece(7, homeY)?.color === piece.color
          && !isSquareAttacked(5, homeY, enemy) && !isSquareAttacked(6, homeY, enemy)) {
        moves.push({ x: 6, y: homeY, castle: 'kingSide' });
      }
      if (castlingRights[piece.color].queenSide && !getPiece(1, homeY) && !getPiece(2, homeY) && !getPiece(3, homeY)
          && getPiece(0, homeY)?.type === 'r' && getPiece(0, homeY)?.color === piece.color
          && !isSquareAttacked(3, homeY, enemy) && !isSquareAttacked(2, homeY, enemy)) {
        moves.push({ x: 2, y: homeY, castle: 'queenSide' });
      }
    }
  }

  return moves.filter((move) => isMoveKingSafe(x, y, move, piece));
}

function isMoveKingSafe(fromX, fromY, move, piece) {
  const originalTarget = board[move.y][move.x];
  const capturedX = move.enPassant ? move.x : null;
  const capturedY = move.enPassant ? fromY : null;
  const capturedPiece = move.enPassant ? board[capturedY][capturedX] : null;
  let rookFromX;
  let rookToX;
  let rookPiece;

  board[fromY][fromX] = null;
  if (move.enPassant) board[capturedY][capturedX] = null;
  board[move.y][move.x] = piece;
  if (move.castle) {
    rookFromX = move.castle === 'kingSide' ? 7 : 0;
    rookToX = move.castle === 'kingSide' ? 5 : 3;
    rookPiece = board[fromY][rookFromX];
    board[fromY][rookFromX] = null;
    board[fromY][rookToX] = rookPiece;
  }
  const safe = !isKingInCheck(piece.color);
  board[fromY][fromX] = piece;
  board[move.y][move.x] = originalTarget;
  if (move.enPassant) board[capturedY][capturedX] = capturedPiece;
  if (move.castle) {
    board[fromY][rookToX] = null;
    board[fromY][rookFromX] = rookPiece;
  }
  return safe;
}

function getAllLegalMoves(color) {
  const moves = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = getPiece(x, y);
      if (piece?.color === color) {
        for (const move of generatePseudoLegalMoves(x, y)) moves.push({ fromX: x, fromY: y, ...move });
      }
    }
  }
  return moves;
}

function updateStatus() {
  const checked = isKingInCheck(currentTurn);
  const moves = getAllLegalMoves(currentTurn);
  if (moves.length === 0) {
    gameOver = true;
    statusElement.textContent = checked
      ? `Checkmate — ${currentTurn === 'w' ? 'Black' : 'White'} wins!`
      : 'Draw — stalemate';
    return;
  }
  gameOver = false;
  statusElement.textContent = `${currentTurn === 'w' ? 'White' : 'Black'} to move${checked ? ' — check!' : ''}`;
}

function handleSquareClick(x, y) {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  if (gameOver || promotionDialog.open) return;
  const clickedPiece = getPiece(x, y);
  if (selectedSquare) {
    const move = legalMoves.find((candidate) => candidate.x === x && candidate.y === y);
    if (move) {
      attemptMove(selectedSquare.x, selectedSquare.y, move);
      return;
    }
  }
  if (clickedPiece?.color === currentTurn) {
    selectedSquare = { x, y };
    legalMoves = generatePseudoLegalMoves(x, y);
  } else {
    selectedSquare = null;
    legalMoves = [];
  }
  renderBoard();
}

function attemptMove(fromX, fromY, move) {
  const piece = getPiece(fromX, fromY);
  if (piece?.type === 'p' && (move.y === 0 || move.y === 7)) {
    showPromotionPicker(piece.color, (type) => finishMove(fromX, fromY, move, type));
  } else {
    finishMove(fromX, fromY, move);
  }
}

function showPromotionPicker(color, onChoose) {
  pendingPromotion = onChoose;
  promotionChoices.replaceChildren();
  for (const type of PROMOTION_TYPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promotion-piece';
    button.textContent = PIECES[color][type];
    button.setAttribute('aria-label', `Promote to ${type === 'n' ? 'knight' : ({ q: 'queen', r: 'rook', b: 'bishop' })[type]}`);
    button.addEventListener('click', () => {
      const choose = pendingPromotion;
      pendingPromotion = null;
      promotionDialog.close();
      choose?.(type);
    });
    promotionChoices.appendChild(button);
  }
  promotionDialog.showModal();
}

function finishMove(fromX, fromY, move, promotionType = 'q') {
  const movingPiece = board[fromY][fromX];
  const capturedPiece = move.enPassant ? board[fromY][move.x] : board[move.y][move.x];
  if (movingPiece.type === 'k') {
    castlingRights[movingPiece.color].kingSide = false;
    castlingRights[movingPiece.color].queenSide = false;
  }
  if (movingPiece.type === 'r') updateRookRights(movingPiece.color, fromX, fromY);
  if (capturedPiece?.type === 'r') updateRookRights(capturedPiece.color, move.x, move.enPassant ? fromY : move.y);

  board[fromY][fromX] = null;
  if (move.enPassant) board[fromY][move.x] = null;
  board[move.y][move.x] = movingPiece;
  if (move.castle) {
    const rookFromX = move.castle === 'kingSide' ? 7 : 0;
    const rookToX = move.castle === 'kingSide' ? 5 : 3;
    board[fromY][rookToX] = board[fromY][rookFromX];
    board[fromY][rookFromX] = null;
  }
  if (movingPiece.type === 'p' && (move.y === 0 || move.y === 7)) {
    board[move.y][move.x] = { type: promotionType, color: movingPiece.color };
  }
  enPassantTarget = movingPiece.type === 'p' && Math.abs(move.y - fromY) === 2
    ? { x: fromX, y: (fromY + move.y) / 2 }
    : null;

  currentTurn = opponent(currentTurn);
  selectedSquare = null;
  legalMoves = [];
  updateStatus();
  renderBoard();
}

function updateRookRights(color, x, y) {
  const homeY = color === 'w' ? 7 : 0;
  if (y !== homeY) return;
  if (x === 0) castlingRights[color].queenSide = false;
  if (x === 7) castlingRights[color].kingSide = false;
}

function renderBoard() {
  boardElement.replaceChildren();
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${(x + y) % 2 === 0 ? 'light' : 'dark'}`;
      square.setAttribute('role', 'gridcell');
      const piece = getPiece(x, y);
      const file = String.fromCharCode(97 + x);
      const rank = 8 - y;
      square.setAttribute('aria-label', `${file}${rank}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}` : ''}`);
      const selected = selectedSquare?.x === x && selectedSquare?.y === y;
      const isLegalMove = legalMoves.some((move) => move.x === x && move.y === y);
      if (selected) square.classList.add('selected');
      if (isLegalMove) square.classList.add(getPiece(x, y) || legalMoves.find((move) => move.x === x && move.y === y)?.enPassant ? 'capture' : 'legal');
      if (piece) {
        const pieceElement = document.createElement('span');
        pieceElement.className = 'piece';
        pieceElement.textContent = PIECES[piece.color][piece.type];
        pieceElement.draggable = piece.color === currentTurn && !gameOver;
        pieceElement.addEventListener('dragstart', (event) => {
          if (piece.color !== currentTurn || gameOver) {
            event.preventDefault();
            return;
          }
          selectedSquare = { x, y };
          legalMoves = generatePseudoLegalMoves(x, y);
          event.dataTransfer.setData('text/plain', `${x},${y}`);
          event.dataTransfer.effectAllowed = 'move';
          renderBoard();
        });
        square.appendChild(pieceElement);
      }
      square.addEventListener('click', () => handleSquareClick(x, y));
      square.addEventListener('dragover', (event) => {
        if (selectedSquare && legalMoves.some((move) => move.x === x && move.y === y)) event.preventDefault();
      });
      square.addEventListener('drop', (event) => {
        event.preventDefault();
        if (!selectedSquare || gameOver) return;
        const move = legalMoves.find((candidate) => candidate.x === x && candidate.y === y);
        if (move) {
          suppressNextClick = true;
          attemptMove(selectedSquare.x, selectedSquare.y, move);
        }
      });
      boardElement.appendChild(square);
    }
  }
}

newGameButton.addEventListener('click', resetGame);
resetGame();
