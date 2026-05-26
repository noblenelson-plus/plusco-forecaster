"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../../lib/firebase";
import {
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";

/* Minimal Tetris implementation inside the page for a playable demo */
const COLS = 10;
const ROWS = 20;

type Cell = string | null;

const SHAPES: Record<string, number[][][]> = {
  I: [[[1,1,1,1]]],
  O: [[[1,1],[1,1]]],
  T: [[[0,1,0],[1,1,1]]],
  S: [[[0,1,1],[1,1,0]]],
  Z: [[[1,1,0],[0,1,1]]],
  J: [[[1,0,0],[1,1,1]]],
  L: [[[0,0,1],[1,1,1]]],
};
const SHAPE_KEYS = Object.keys(SHAPES);

const SIGNATURE = [
  { letter: "P", pattern: [
      [1,1,1,0,0],
      [1,0,1,0,0],
      [1,1,1,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
    ]
  },
  { letter: "L", pattern: [
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,1,1,1,0],
    ]
  },
  { letter: "U", pattern: [
      [1,0,0,0,1],
      [1,0,0,0,1],
      [1,0,0,0,1],
      [1,0,0,0,1],
      [1,1,1,1,1],
    ]
  },
  { letter: "S", pattern: [
      [0,1,1,1,0],
      [1,0,0,0,0],
      [0,1,1,1,0],
      [0,0,0,0,1],
      [1,1,1,1,0],
    ]
  },
  { letter: "C", pattern: [
      [0,1,1,1,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [0,1,1,1,0],
    ]
  },
  { letter: "O", pattern: [
      [0,1,1,1,0],
      [1,0,0,0,1],
      [1,0,0,0,1],
      [1,0,0,0,1],
      [0,1,1,1,0],
    ]
  },
];

function rotate(matrix: number[][]) {
  const N = matrix.length;
  const M = matrix[0].length;
  const res = Array.from({length: M}, () => Array(N).fill(0));
  for (let r=0;r<N;r++) for (let c=0;c<M;c++) res[c][N-1-r]=matrix[r][c];
  return res;
}

function randomShape() {
  const k = SHAPE_KEYS[Math.floor(Math.random()*SHAPE_KEYS.length)];
  return { key: k, matrix: SHAPES[k][0].map(row=>[...row]) };
}

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en"|"fr">("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Tetris state
  const [grid, setGrid] = useState<Cell[][]>(Array.from({length: ROWS}, ()=>Array(COLS).fill(null)));
  const [piece, setPiece] = useState<{key:string,matrix:number[][],r:number,c:number}|null>(null);
  const [score, setScore] = useState(0);
  const [rowsCleared, setRowsCleared] = useState(0);
  const [blocksPlaced, setBlocksPlaced] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const dropRef = useRef<number | null>(null);

  useEffect(()=>{ // anonymous auth preserved
    async function ensureAnon(){
      try{
        const res = await signInAnonymously(auth);
        console.log('anon uid', res.user.uid);
        setIsAuthenticated(true);
      }catch(e:any){ console.warn('anon failed', e); }
    }
    ensureAnon();
  },[]);

  function updateSpeed(nextScore:number) {
    setSpeed(Math.min(6, 1 + Math.floor(nextScore / 400)));
  }

  function spawnPiece() {
    const s = randomShape();
    if (collides(s.matrix, 0, 3, grid)) {
      setGameOver(true);
      setPiece(null);
      return;
    }
    setPiece({key:s.key,matrix:s.matrix,r:0,c:3});
  }

  useEffect(()=>{
    if (!piece && !gameOver) {
      spawnPiece();
    }
  },[piece, gameOver]);

  useEffect(()=>{
    if (gameOver) return;

    const intervalMs = Math.max(200, 700 - speed * 80);
    function tick(){
      if (!piece) return;
      const nr = piece.r + 1;
      if (collides(piece.matrix, nr, piece.c, grid)) {
        const newGrid = grid.map(row=>[...row]);
        let placed = 0;
        for (let r=0;r<piece.matrix.length;r++){
          for (let c=0;c<piece.matrix[r].length;c++){
            if(piece.matrix[r][c]){
              const gr = r + piece.r;
              const gc = c + piece.c;
              if (gr>=0 && gr<ROWS && gc>=0 && gc<COLS) {
                newGrid[gr][gc] = piece.key;
                placed += 1;
              }
            }
          }
        }
        if (placed > 0) setBlocksPlaced(prev => prev + placed);
        const cleared = clearLines(newGrid);
        if (cleared > 0) {
          setRowsCleared(prev => prev + cleared);
          setScore(prev => {
            const nextScore = prev + cleared * 100;
            updateSpeed(nextScore);
            return nextScore;
          });
        }
        setGrid(newGrid);
        setPiece(null);
        return;
      }
      setPiece({...piece, r:nr});
    }

    dropRef.current = window.setInterval(tick, intervalMs);
    return ()=>{ if(dropRef.current) window.clearInterval(dropRef.current); }
  },[grid, piece, gameOver, speed]);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if (gameOver || !piece) return;
      if (!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') {
        move(-1);
      } else if (e.key === 'ArrowRight') {
        move(1);
      } else if (e.key === 'ArrowDown') {
        fastDrop();
      } else if (e.key === 'ArrowUp') {
        rotatePiece();
      }
    }
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [piece, gameOver, grid]);

  function handleRestart() {
    setGrid(Array.from({length: ROWS}, ()=>Array(COLS).fill(null)));
    setPiece(null);
    setScore(0);
    setRowsCleared(0);
    setBlocksPlaced(0);
    setSpeed(1);
    setGameOver(false);
  }

  function collides(matrix:number[][], r:number, c:number, g:Cell[][]){
    for(let i=0;i<matrix.length;i++) for(let j=0;j<matrix[i].length;j++){
      if(!matrix[i][j]) continue;
      const gr = i+r; const gc = j+c;
      if (gc<0 || gc>=COLS || gr>=ROWS) return true;
      if (gr>=0 && g[gr][gc]) return true;
    }
    return false;
  }

  function clearLines(g:Cell[][]){
    let cleared=0;
    for(let r=ROWS-1;r>=0;r--){
      if (g[r].every(cell=>cell)){
        g.splice(r,1);
        g.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    return cleared;
  }

  function move(dir:number){
    setPiece(prev=>{
      if(!prev) return prev;
      const nc = prev.c+dir;
      if (!collides(prev.matrix, prev.r, nc, grid)) return {...prev, c:nc};
      return prev;
    });
  }

  function fastDrop(){
    setPiece(prev=>{
      if(!prev) return prev;
      let nr = prev.r;
      while(!collides(prev.matrix, nr+1, prev.c, grid)) nr++;
      return {...prev, r:nr};
    });
  }

  function rotatePiece(){
    setPiece(prev=>{
      if(!prev) return prev;
      const rot = rotate(prev.matrix);
      if (!collides(rot, prev.r, prev.c, grid)) return {...prev, matrix:rot};
      return prev;
    });
  }

  const displayGrid = grid.map(row => [...row]);
  if (piece) {
    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[r].length; c++) {
        if (piece.matrix[r][c]) {
          const gr = piece.r + r;
          const gc = piece.c + c;
          if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) displayGrid[gr][gc] = piece.key;
        }
      }
    }
  }

  async function handleGoogle(){
    console.log('Google button clicked');
    setError("");
    try{
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      console.log('Google sign-in successful, uid=', res.user.uid, res);
      setIsAuthenticated(true);
      router.push('/');
    }catch(e:any){
      console.error('Google sign-in error:', e);
      setError(e?.message||'Google sign-in failed');
    }
  }

  async function handleEmail(e:React.FormEvent){
    e.preventDefault(); setError("");
    try{
      const res = await signInWithEmailAndPassword(auth, email, password);
      console.log('email login', res.user.uid);
      setIsAuthenticated(true);
      router.push('/');
    }catch(e:any){
      console.error('Email sign-in error:', e);
      setError(e?.message||'Email sign-in failed');
    }
  }

  const t = {
    en: { internal: 'INTERNAL ACCESS', external: 'EXTERNAL PARTNERS', title: 'PlusCo Forecaster', signin:'Sign in', contact:'Connection problem? Contact your admin' },
    fr: { internal: "ACCÈS INTERNE", external: "PARTENAIRES EXTERNES", title: 'PlusCo Forecaster', signin: 'Se connecter', contact:"Problème de connexion? Contactez votre administrateur" }
  } as const;

  return (
    <div className="login-layout">
      <div className="left-tetris">
        <div className="tetris-wrapper">
          <div className="stats-row">
            <div className="stat-item"><span className="stat-label">Score</span><span>{score}</span></div>
            <div className="stat-item"><span className="stat-label">Rows</span><span>{rowsCleared}</span></div>
            <div className="stat-item"><span className="stat-label">Blocks</span><span>{blocksPlaced}</span></div>
            <div className="stat-item"><span className="stat-label">Speed</span><span>{speed}</span></div>
          </div>
          <div className="tetris-grid" role="grid">
            {displayGrid.flat().map((cell, i)=>{
              const cls = cell ? `tetris-cell filled-${cell}` : 'tetris-cell';
              return <div key={i} className={cls} />
            })}
          </div>
          <div className="signature-row" aria-hidden="true">
            {SIGNATURE.map((glyph, idx) => (
              <div key={idx} className="letter-grid">
                {glyph.pattern.flat().map((filled, index) => (
                  <div key={index} className={`letter-cell ${filled ? `filled-signature letter-${glyph.letter}` : ''}`} />
                ))}
              </div>
            ))}
          </div>
          {gameOver && (
            <div className="game-over-overlay">
              <div className="game-over-card">
                <h3>Game Over</h3>
                <div className="game-over-values">
                  <div><strong>Score:</strong> {score}</div>
                  <div><strong>Rows:</strong> {rowsCleared}</div>
                  <div><strong>Blocks:</strong> {blocksPlaced}</div>
                </div>
                <button onClick={handleRestart} className="restart-btn">Restart Game</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="right-panel">
        <div className="glass-card p-8 rounded-lg shadow-lg max-w-md w-full bg-white">
          <div className="flex items-start justify-between">
            <h2 className="text-2xl font-bold text-black">{t[lang].title}</h2>
            <div>
              <button onClick={()=>setLang('en')} className={`px-2 py-1 ${lang==='en'?'bg-black text-white':'text-black/60'}`}>EN</button>
              <button onClick={()=>setLang('fr')} className={`px-2 py-1 ${lang==='fr'?'bg-black text-white':'text-black/60'}`}>FR</button>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-gray-600">{t[lang].internal}</div>
            <button type="button" onClick={handleGoogle} className="google-btn mt-3 w-full bg-white text-black py-2 rounded border flex items-center justify-center gap-3">
              <span>{t[lang].signin} with Google</span>
            </button>
          </div>

          <hr className="my-6" />

          <div>
            <div className="text-sm font-semibold text-gray-600">{t[lang].external}</div>
            <form onSubmit={handleEmail} className="mt-3 flex flex-col gap-3">
              <input type="email" placeholder="email@company.com" value={email} onChange={e=>setEmail(e.target.value)} className="px-3 py-2 border rounded" />
              <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="px-3 py-2 border rounded" />
              <button type="submit" className="signin-btn mt-2 bg-black text-white py-2 rounded">{t[lang].signin}</button>
            </form>
          </div>

          {error && <div className="mt-4 text-sm text-red-700">{error}</div>}

          <div className="mt-6 text-xs text-gray-600">{t[lang].contact}</div>

          <div className="mt-4 flex items-center justify-center">
            <div style={{fontSize:16,fontWeight:700,letterSpacing:'0.04em'}}>plus company</div>
          </div>
        </div>
      </div>
    </div>
  );
}
