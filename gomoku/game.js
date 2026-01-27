// --- 常量配置 ---
const BOARD_SIZE = 15;

// --- 状态变量 ---
let board = [];
let myColor = 0; // 1=黑, 2=白
let isMyTurn = false;
let conn = null;
let gameActive = false;
let peer = null;

// --- DOM 元素缓存 ---
const els = {
    setupLayer: document.getElementById('setup-layer'),
    gameLayer: document.getElementById('game-layer'),
    board: document.getElementById('board'),
    myIdInput: document.getElementById('my-id'),
    targetIdInput: document.getElementById('target-id'),
    statusText: document.getElementById('status-text'),
    turnInd: document.getElementById('turn-indicator'),
    resultModal: document.getElementById('result-modal'),
    resultTitle: document.getElementById('result-title'),
    resultDesc: document.getElementById('result-desc')
};

// --- 初始化 ---
function init() {
    initBoardGrid();
    initPeer();
}

// 1. 生成网格 DOM (现在是纯 CSS 控制大小，这里只负责数量)
function initBoardGrid() {
    els.board.innerHTML = '';
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.x = x;
            cell.dataset.y = y;

            // 绘制星位 (3, 11, 7)
            if ((x === 3 || x === 11) && (y === 3 || y === 11) || (x === 7 && y === 7)) {
                const star = document.createElement('div');
                star.classList.add('star-point');
                cell.appendChild(star);
            }

            cell.addEventListener('click', () => handleCellClick(x, y));
            els.board.appendChild(cell);
        }
    }
}

// 2. PeerJS 网络初始化
function initPeer() {
    peer = new Peer();

    peer.on('open', id => {
        els.myIdInput.value = id;
    });

    peer.on('connection', c => {
        conn = c;
        setupConnEvents(true); // 被动连接 => 黑棋
    });
}

function connect() {
    const id = els.targetIdInput.value.trim();
    if (!id) return alert("请输入好友 ID");
    conn = peer.connect(id);
    setupConnEvents(false); // 主动连接 => 白棋
}

function setupConnEvents(isHost) {
    conn.on('open', () => {
        // UI 切换
        els.setupLayer.style.opacity = 0;
        setTimeout(() => els.setupLayer.style.display = 'none', 400);
        els.gameLayer.style.opacity = 1;

        // 游戏初始化
        myColor = isHost ? 1 : 2;
        startNewGame();
    });

    conn.on('data', data => {
        if (data.type === 'MOVE') {
            placePiece(data.x, data.y, data.color);
            checkWin(data.x, data.y, data.color);
            if (gameActive) {
                isMyTurn = true;
                updateStatus();
            }
        } else if (data.type === 'RESTART') {
            startNewGame();
        }
    });

    conn.on('close', () => alert("连接已断开"));
}

// --- 游戏流程 ---

function startNewGame() {
    gameActive = true;
    board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));

    // 清理棋子 DOM
    document.querySelectorAll('.piece').forEach(el => el.remove());
    // 隐藏结算框
    els.resultModal.style.transform = "translate(-50%, -50%) scale(0)";

    // 设定先手（黑棋先）
    isMyTurn = (myColor === 1);
    updateStatus();
}

function handleCellClick(x, y) {
    if (!gameActive || !isMyTurn) return;
    if (board[y][x] !== 0) return; // 格子非空

    // 1. 本地落子
    placePiece(x, y, myColor);

    // 2. 发送网络数据
    if (conn && conn.open) {
        conn.send({ type: 'MOVE', x: x, y: y, color: myColor });
    }

    // 3. 判定胜负
    const win = checkWin(x, y, myColor);
    if (!win) {
        isMyTurn = false;
        updateStatus();
    }
}

function placePiece(x, y, color) {
    board[y][x] = color;
    const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);

    const piece = document.createElement('div');
    piece.classList.add('piece');
    piece.classList.add(color === 1 ? 'black' : 'white');

    cell.appendChild(piece);
}

function updateStatus() {
    if (isMyTurn) {
        els.statusText.innerText = `轮到你了 (${myColor === 1 ? '黑' : '白'})`;
        els.statusText.style.color = "var(--btn-blue)";
        els.turnInd.style.background = "var(--btn-blue)";
    } else {
        els.statusText.innerText = "对方思考中...";
        els.statusText.style.color = "#aaa";
        els.turnInd.style.background = "#ccc";
    }
}

// --- 算法 ---

function checkWin(x, y, color) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];

    for (let [dx, dy] of dirs) {
        let count = 1;
        let winPieces = [{ x, y }];

        // 正向搜
        let i = 1;
        while (true) {
            let nx = x + dx * i, ny = y + dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE || board[ny][nx] !== color) break;
            winPieces.push({ x: nx, y: ny });
            count++; i++;
        }
        // 反向搜
        i = 1;
        while (true) {
            let nx = x - dx * i, ny = y - dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE || board[ny][nx] !== color) break;
            winPieces.push({ x: nx, y: ny });
            count++; i++;
        }

        if (count >= 5) {
            handleWin(color, winPieces);
            return true;
        }
    }
    return false;
}

function handleWin(color, coords) {
    gameActive = false;

    // 1. 高亮棋子
    coords.forEach(c => {
        const cell = document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`);
        const p = cell.querySelector('.piece');
        if (p) p.classList.add('winner');
    });

    // 2. 弹窗
    setTimeout(() => {
        const isWin = (color === myColor);
        els.resultTitle.innerText = isWin ? "VICTORY!" : "DEFEAT";
        els.resultTitle.style.color = isWin ? "var(--btn-green)" : "#e74c3c";
        els.resultDesc.innerText = isWin ? "太棒了，你赢了！🎉" : "再接再厉，下次必胜！💪";
        els.resultModal.style.transform = "translate(-50%, -50%) scale(1)";
    }, 600);
}

// --- 辅助功能 ---

function requestRestart() {
    if (conn && conn.open) conn.send({ type: 'RESTART' });
    startNewGame();
}

function copyId() {
    els.myIdInput.select();
    document.execCommand('copy');
    const btn = els.setupLayer.querySelector('.btn-blue');
    const old = btn.innerText;
    btn.innerText = "已复制！";
    setTimeout(() => btn.innerText = old, 1500);
}

// 启动
init();