const PIECES = {
  w: {
    p: '♙',
    r: '♖',
    n: '♘',
    b: '♗',
    q: '♕',
    k: '♔'
  },
  b: {
    p: '♟',
    r: '♜',
    n: '♞',
    b: '♝',
    q: '♛',
    k: '♚'
  }
};

const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const newGameButton = document.getElementById('new-game');

let board = [];
let currentTurn = 'w';
let selectedSquare = null;
let legalMoves = [];

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
  board = createInitialBoard();
  currentTurn = 'w';
  selectedSquare = null;
  legalMoves = [];
  updateStatus();
  renderBoard();
}

function inBounds(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function getPiece(x, y) {
  if (!inBounds(x, y)) return null;
  return board[y][x];
}

function isEnemyPiece(piece, color) {
  return !!piece && piece.color !== color;
}

function getKingPosition(color) {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = board[y][x];
      if (piece && piece.type === 'k' && piece.color === color) {
        return { x, y };
      }
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

      switch (piece.type) {
        case 'p': {
          const direction = piece.color === 'w' ? -1 : 1;
          if (dx === 1 || dx === -1) {
            if (dy === direction) return true;
          }
          break;
        }

        case 'n': {
          const offsets = [
            [1, 2],
            [2, 1],
            [2, -1],
            [1, -2],
            [-1, -2],
            [-2, -1],
            [-2, 1],
            [-1, 2]
          ];
          if (offsets.some(([ox, oy]) => ox === dx && oy === dy)) return true;
          break;
        }

        case 'b':
        case 'r':
        case 'q': {
          const directions = [];
          if (piece.type === 'b' || piece.type === 'q') {
            directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
          }
          if (piece.type === 'r' || piece.type === 'q') {
            directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
          }

          for (const [stepX, stepY] of directions) {
            let curX = col + stepX;
            let curY = row + stepY;
            while (inBounds(curX, curY)) {
              if (curX === x && curY === y) return true;
              if (board[curY][curX]) break;
              curX += stepX;
              curY += stepY;
            }
          }
          break;
        }

        case 'k': {
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0)) return true;
          break;
        }

        default:
          break;
      }
    }
  }

  return false;
}

function isKingInCheck(color) {
  const king = getKingPosition(color);
  if (!king) return false;
  return isSquareAttacked(king.x, king.y, color === 'w' ? 'b' : 'w');
}

function generateSlidingMoves(x, y, piece, directions) {
  const moves = [];

  for (const [dx, dy] of directions) {
    let currentX = x + dx;
    let currentY = y + dy;

    while (inBounds(currentX, currentY)) {
      const target = getPiece(currentX, currentY);
      if (!target) {
        moves.push({ x: currentX, y: currentY });
      } else {
        if (target.color !== piece.color) {
          moves.push({ x: currentX, y: currentY });
        }
        break;
      }

      currentX += dx;
      currentY += dy;
    }
  }

  return moves;
}

function generatePseudoLegalMoves(x, y) {
  const piece = board[y][x];
  if (!piece) return [];

  const moves = [];

  switch (piece.type) {
    case 'p': {
      const direction = piece.color === 'w' ? -1 : 1;
      const startRow = piece.color === 'w' ? 6 : 1;

      const oneStepY = y + direction;
      if (inBounds(x, oneStepY) && !getPiece(x, oneStepY)) {
        moves.push({ x, y: oneStepY });

        const twoStepY = y + direction * 2;
        if (y === startRow && !getPiece(x, twoStepY)) {
          moves.push({ x, y: twoStepY });
        }
      }

      for (const offset of [-1, 1]) {
        const targetX = x + offset;
        const targetY = y + direction;
        const target = getPiece(targetX, targetY);
        if (target && target.color !== piece.color) {
          moves.push({ x: targetX, y: targetY });
        }
      }
      break;
    }

    case 'n': {
      const offsets = [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2]
      ];

      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;

        const target = getPiece(nx, ny);
        if (!target || target.color !== piece.color) {
          moves.push({ x: nx, y: ny });
        }
      }
      break;
    }

    case 'b':
      moves.push(...generateSlidingMoves(x, y, piece, [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]));
      break;

    case 'r':
      moves.push(...generateSlidingMoves(x, y, piece, [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]));
      break;

    case 'q':
      moves.push(...generateSlidingMoves(x, y, piece, [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]));
      break;

    case 'k': {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;

          const target = getPiece(nx, ny);
          if (!target || target.color !== piece.color) {
            moves.push({ x: nx, y: ny });
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return moves.filter((move) => {
    const originalTarget = getPiece(move.x, move.y);
    const originalPiece = board[y][x];

    board[y][x] = null;
    board[move.y][move.x] = originalPiece;
    const king = getKingPosition(piece.color);
    const inCheck = king ? isSquareAttacked(king.x, king.y, piece.color === 'w' ? 'b' : 'w') : false;

    board[y][x] = originalPiece;
    board[move.y][move.x] = originalTarget;

    return !inCheck;
  });
}

function updateStatus() {
  const label = currentTurn === 'w' ? 'White' : 'Black';
  statusElement.textContent = `${label} to move`;
}

function handleSquareClick(x, y) {
  const clickedPiece = getPiece(x, y);

  if (selectedSquare) {
    const legal = legalMoves.some((move) => move.x === x && move.y === y);

    if (legal) {
      movePiece(selectedSquare.x, selectedSquare.y, x, y);
      return;
    }
  }

  if (clickedPiece && clickedPiece.color === currentTurn) {
    selectedSquare = { x, y };
    legalMoves = generatePseudoLegalMoves(x, y);
    renderBoard();
    return;
  }

  selectedSquare = null;
  legalMoves = [];
  renderBoard();
}

function movePiece(fromX, fromY, toX, toY) {
  const movingPiece = board[fromY][fromX];
  board[toY][toX] = movingPiece;
  board[fromY][fromX] = null;

  if (movingPiece.type === 'p' && (toY === 0 || toY === 7)) {
    board[toY][toX] = { type: 'q', color: movingPiece.color };
  }

  currentTurn = currentTurn === 'w' ? 'b' : 'w';
  selectedSquare = null;
  legalMoves = [];
  updateStatus();
  renderBoard();
}

function renderBoard() {
  boardElement.innerHTML = '';

  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${(x + y) % 2 === 0 ? 'light' : 'dark'}`;
      square.setAttribute('aria-label', `Row ${y + 1}, Column ${x + 1}`);
      square.dataset.x = String(x);
      square.dataset.y = String(y);

      const piece = getPiece(x, y);
      const isSelected = selectedSquare && selectedSquare.x === x && selectedSquare.y === y;
      const isLegalMove = legalMoves.some((move) => move.x === x && move.y === y);

      if (isSelected) {
        square.classList.add('selected');
      }

      if (isLegalMove) {
        const target = getPiece(x, y);
        square.classList.add(target ? 'capture' : 'legal');
      }

      if (piece) {
        const pieceSymbol = document.createElement('span');
        pieceSymbol.className = 'piece';
        pieceSymbol.textContent = PIECES[piece.color][piece.type];
        square.appendChild(pieceSymbol);
      }

      square.addEventListener('click', () => handleSquareClick(x, y));
      boardElement.appendChild(square);
    }
  }
}

newGameButton.addEventListener('click', resetGame);
resetGame();
