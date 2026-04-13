import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from './firebase.js';
import { ref, set, onValue, get, update, remove } from 'firebase/database';

const genId = () => Math.random().toString(36).slice(2, 8);
const roomPath = (roomId) => `rooms/${roomId}`;

const styles = {
  app: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #0d0d1a 0%, #1a1024 40%, #0d1a2e 100%)',
    color: '#f0ede8',
    position: 'relative',
    overflow: 'hidden',
  },
  container: {
    position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto',
    padding: '24px 16px', minHeight: '100vh',
  },
  btnPrimary: {
    padding: '16px 32px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
    background: 'linear-gradient(135deg, #ff6b4a, #ff8a65)', color: '#fff',
    boxShadow: '0 4px 20px rgba(255,107,74,0.35)', width: '100%',
  },
  btnGhost: {
    padding: '14px 28px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 15,
    fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
    width: '100%',
  },
  input: {
    padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)', color: '#f0ede8', fontSize: 15, outline: 'none',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  },
  glass: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, backdropFilter: 'blur(12px)', padding: 20,
  },
  label: {
    fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, fontWeight: 500,
    letterSpacing: 1, textTransform: 'uppercase',
  },
};

const css = `
  @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes popIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
  @keyframes slideCard { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
  @keyframes confetti { 0%{transform:translateY(0) rotate(0)} 100%{transform:translateY(100vh) rotate(720deg)} }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  .btn-hover:hover { transform: translateY(-2px); filter: brightness(1.1); }
  .btn-hover:active { transform: translateY(0); }
  .swipe-btn { transition: all 0.2s; cursor: pointer; border: none; }
  .swipe-btn:hover { transform: scale(1.15); }
  .swipe-btn:active { transform: scale(0.95); }
  .item-hover { transition: all 0.15s; }
  .item-hover:hover { background: rgba(255,255,255,0.06) !important; }
`;

export default function App() {
  const [view, setView] = useState('loading');
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState('');
  const [restaurants, setRestaurants] = useState([]);
  const [addName, setAddName] = useState('');
  const [addEmoji, setAddEmoji] = useState('🍽️');
  const [addDesc, setAddDesc] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [myVotes, setMyVotes] = useState({});
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDir, setSwipeDir] = useState(null);
  const [animatingOut, setAnimatingOut] = useState(false);
  const startXRef = useRef(0);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setRoomId(hash);
      const r = ref(db, roomPath(hash));
      get(r).then(snap => {
        if (snap.exists()) { setView('join'); }
        else { setView('create'); }
      }).catch(() => setView('create'));
    } else { setView('create'); }
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const r = ref(db, roomPath(roomId));
    const unsub = onValue(r, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setRoom(data);
        if (data.status === 'closed' && view !== 'result' && view !== 'create') { setView('result'); }
      }
    });
    return () => unsub();
  }, [roomId, view]);

  const addRestaurant = () => {
    if (!addName.trim()) return;
    setRestaurants(prev => [...prev, { id: genId(), name: addName.trim(), emoji: addEmoji, desc: addDesc.trim() }]);
    setAddName(''); setAddEmoji('🍽️'); setAddDesc('');
  };
  const removeRestaurant = (id) => setRestaurants(prev => prev.filter(r => r.id !== id));

  const createRoom = async () => {
    if (restaurants.length < 2) return;
    const id = genId();
    const roomData = {
      restaurants: restaurants.reduce((acc, r) => { acc[r.id] = r; return acc; }, {}),
      status: 'open', voters: {}, votes: {}, createdAt: Date.now(),
    };
    await set(ref(db, roomPath(id)), roomData);
    setRoomId(id); setRoom(roomData); setIsHost(true); setMyName('방장');
    window.location.hash = id; setView('lobby');
  };

  const joinRoom = async () => {
    if (!nameInput.trim() || !roomId) return;
    const name = nameInput.trim();
    const snap = await get(ref(db, `${roomPath(roomId)}/votes/${name}`));
    if (snap.exists()) {
      const prev = snap.val();
      const doneCount = Object.keys(prev).length;
      const totalRest = room ? Object.keys(room.restaurants).length : 0;
      setMyName(name); setMyVotes(prev);
      if (doneCount >= totalRest) { setView('waiting'); }
      else { setCurrentIdx(doneCount); setView('swipe'); }
      return;
    }
    await update(ref(db, `${roomPath(roomId)}/voters`), { [name]: { joinedAt: Date.now(), done: false } });
    setMyName(name); setView('swipe');
  };

  const restList = room ? Object.values(room.restaurants) : [];
  const currentCard = restList[currentIdx];
  const nextCard = restList[currentIdx + 1];
  const progress = restList.length > 0 ? ((currentIdx + 1) / restList.length) * 100 : 0;

  const handleSwipe = useCallback(async (direction) => {
    if (animatingOut || !currentCard) return;
    setAnimatingOut(true); setSwipeDir(direction);
    const vote = direction === 'right' ? 'like' : 'nope';
    const updated = { ...myVotes, [currentCard.id]: vote };
    setMyVotes(updated);
    await set(ref(db, `${roomPath(roomId)}/votes/${myName}/${currentCard.id}`), vote);
    setTimeout(async () => {
      setSwipeDir(null); setDragX(0); setAnimatingOut(false);
      if (currentIdx + 1 >= restList.length) {
        await update(ref(db, `${roomPath(roomId)}/voters/${myName}`), { done: true });
        setView('waiting');
      } else { setCurrentIdx(currentIdx + 1); }
    }, 350);
  }, [animatingOut, currentCard, currentIdx, restList.length, myVotes, roomId, myName]);

  const onPointerDown = (e) => {
    if (animatingOut) return;
    setIsDragging(true);
    startXRef.current = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  };
  const onPointerMove = useCallback((e) => {
    if (!isDragging || animatingOut) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    setDragX(x - startXRef.current);
  }, [isDragging, animatingOut]);
  const onPointerUp = useCallback(() => {
    if (!isDragging || animatingOut) return;
    setIsDragging(false);
    if (dragX > 80) handleSwipe('right');
    else if (dragX < -80) handleSwipe('left');
    else setDragX(0);
  }, [isDragging, dragX, animatingOut, handleSwipe]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      return () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); };
    }
  }, [isDragging, onPointerMove, onPointerUp]);

  const rotation = dragX * 0.1;
  const opacity = Math.min(Math.abs(dragX) / 80, 1);
  const swipeTransform = swipeDir === 'right' ? 'translateX(120vw) rotate(25deg)'
    : swipeDir === 'left' ? 'translateX(-120vw) rotate(-25deg)'
    : `translateX(${dragX}px) rotate(${rotation}deg)`;

  const closeVoting = async () => { await update(ref(db, roomPath(roomId)), { status: 'closed' }); };

  const getResults = () => {
    if (!room?.restaurants || !room?.votes) return [];
    const rests = Object.values(room.restaurants);
    const votes = room.votes || {};
    return rests.map(r => {
      let likes = 0, nopes = 0;
      Object.values(votes).forEach(pv => { if (pv[r.id] === 'like') likes++; if (pv[r.id] === 'nope') nopes++; });
      return { ...r, likes, nopes };
    }).sort((a, b) => b.likes - a.likes || a.nopes - b.nopes);
  };

  const votersList = room?.voters ? Object.entries(room.voters) : [];
  const doneCount = votersList.filter(([, v]) => v.done).length;
  const totalVoters = votersList.length;
  const copyLink = () => {
    const url = window.location.origin + window.location.pathname + '#' + roomId;
    navigator.clipboard?.writeText(url).then(() => { alert('링크가 복사되었습니다!'); });
  };
  const resetRoom = async () => {
    await remove(ref(db, roomPath(roomId)));
    window.location.hash = ''; window.location.reload();
  };

  return (
    <div style={styles.app}>
      <style>{css}</style>
      <div style={{ position: 'fixed', inset: 0, opacity: 0.03, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />
      <div style={styles.container}>

        {view === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
            <div style={{ fontSize: 40, animation: 'bounce 1.5s infinite' }}>🍽️</div>
          </div>
        )}

        {view === 'create' && (
          <div style={{ animation: 'fadeUp 0.5s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🍽️</div>
              <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>오늘 뭐 먹지?</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 300 }}>식당을 등록하고 조원들과 투표하세요</p>
            </div>
            <div style={{ ...styles.glass, marginBottom: 20 }}>
              <div style={styles.label}>식당 추가</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={{ ...styles.input, width: 52, textAlign: 'center', fontSize: 22, padding: '10px 6px', flex: 'none' }}
                  value={addEmoji} onChange={e => setAddEmoji(e.target.value)} />
                <input style={styles.input} value={addName} onChange={e => setAddName(e.target.value)}
                  placeholder="식당 이름" onKeyDown={e => e.key === 'Enter' && addRestaurant()} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={styles.input} value={addDesc} onChange={e => setAddDesc(e.target.value)}
                  placeholder="간단 설명 (선택)" onKeyDown={e => e.key === 'Enter' && addRestaurant()} />
                <button className="btn-hover" style={{ ...styles.btnPrimary, width: 'auto', padding: '12px 20px', fontSize: 14, flex: 'none' }}
                  onClick={addRestaurant}>추가</button>
              </div>
            </div>
            {restaurants.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ ...styles.label, marginBottom: 10 }}>등록된 식당 ({restaurants.length})</div>
                {restaurants.map((r, i) => (
                  <div key={r.id} className="item-hover" style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 14, background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)', marginBottom: 6,
                    animation: `fadeUp 0.3s ease-out ${i * 0.05}s both`,
                  }}>
                    <span style={{ fontSize: 28 }}>{r.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
                      {r.desc && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{r.desc}</div>}
                    </div>
                    <button onClick={() => removeRestaurant(r.id)} style={{
                      background: 'none', border: 'none', color: 'rgba(255,107,74,0.5)', fontSize: 18, cursor: 'pointer', padding: '4px 8px',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-hover" style={{ ...styles.btnPrimary, opacity: restaurants.length < 2 ? 0.4 : 1 }}
              onClick={createRoom} disabled={restaurants.length < 2}>
              🚀 투표방 만들기 ({restaurants.length}개 식당)
            </button>
            {restaurants.length < 2 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 10 }}>최소 2개 이상 식당을 등록해주세요</div>
            )}
          </div>
        )}

        {view === 'join' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', animation: 'fadeUp 0.5s ease-out' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>점심 투표에 참여하세요!</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 36 }}>
              {room ? `${Object.keys(room.restaurants).length}개 식당 중 마음에 드는 곳을 골라주세요` : '로딩중...'}
            </p>
            <div style={{ width: '100%', maxWidth: 320 }}>
              <input style={{ ...styles.input, textAlign: 'center', fontSize: 16, padding: 16, marginBottom: 14 }}
                value={nameInput} onChange={e => setNameInput(e.target.value)}
                placeholder="닉네임 입력" onKeyDown={e => e.key === 'Enter' && joinRoom()} />
              <button className="btn-hover" style={{ ...styles.btnPrimary, opacity: !nameInput.trim() ? 0.4 : 1 }}
                onClick={joinRoom} disabled={!nameInput.trim()}>참여하기 →</button>
            </div>
          </div>
        )}

        {view === 'lobby' && (
          <div style={{ animation: 'fadeUp 0.5s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>투표 대기실</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>조원들에게 링크를 공유하세요</p>
            </div>
            <div style={{ ...styles.glass, marginBottom: 20, textAlign: 'center' }}>
              <div style={styles.label}>초대 링크</div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', fontSize: 12, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all', marginBottom: 12, fontFamily: 'monospace', lineHeight: 1.5 }}>
                {window.location.origin + window.location.pathname + '#' + roomId}
              </div>
              <button className="btn-hover" style={{ ...styles.btnGhost, padding: '10px 24px', fontSize: 13 }} onClick={copyLink}>📋 링크 복사</button>
            </div>
            <div style={{ ...styles.glass, marginBottom: 20 }}>
              <div style={styles.label}>참여자 ({totalVoters}명)</div>
              {votersList.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14, textAlign: 'center', padding: 12 }}>아직 참여자가 없어요</div>
              )}
              {votersList.map(([name, v], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                  borderBottom: i < votersList.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `hsl(${(i * 47 + 120) % 360}, 45%, 35%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{name[0]}</div>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{name}</span>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20,
                    background: v.done ? 'rgba(56,161,105,0.15)' : 'rgba(255,255,255,0.06)',
                    color: v.done ? '#68D391' : 'rgba(255,255,255,0.3)', fontWeight: 500 }}>{v.done ? '완료 ✓' : '대기중'}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-hover" style={{ ...styles.btnPrimary, flex: 1, fontSize: 15 }} onClick={() => setView('swipe')}>🔥 나도 투표</button>
              <button className="btn-hover" style={{ ...styles.btnPrimary, flex: 1, fontSize: 15,
                background: 'linear-gradient(135deg, #805AD5, #9F7AEA)', boxShadow: '0 4px 20px rgba(128,90,213,0.35)' }} onClick={closeVoting}>🏁 투표 종료</button>
            </div>
          </div>
        )}

        {view === 'swipe' && currentCard && (
          <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              {isHost && (<button onClick={() => setView('lobby')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: 4 }}>←</button>)}
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s', background: 'linear-gradient(90deg, #ff6b4a, #f6ad55)' }} />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 500, minWidth: 50, textAlign: 'right' }}>{currentIdx + 1}/{restList.length}</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 8, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>{myName}님, 스와이프로 골라주세요!</div>
            <div style={{ position: 'relative', height: 380, perspective: 1000, marginBottom: 32 }}>
              {nextCard && (<div style={{ position: 'absolute', inset: '0 8px', borderRadius: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', transform: 'scale(0.95) translateY(14px)', opacity: 0.4 }} />)}
              <div onPointerDown={onPointerDown} style={{
                position: 'absolute', inset: 0, borderRadius: 24,
                background: 'linear-gradient(160deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)',
                transform: swipeTransform,
                transition: swipeDir || !isDragging ? 'transform 0.35s cubic-bezier(.4,0,.2,1)' : 'none',
                cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: !swipeDir ? 'slideCard 0.3s ease-out' : 'none', overflow: 'hidden',
              }}>
                {dragX > 20 && (<div style={{ position: 'absolute', top: 28, left: 20, padding: '8px 18px', border: '3px solid #68D391', borderRadius: 12, color: '#68D391', fontSize: 24, fontWeight: 900, transform: 'rotate(-12deg)', opacity }}>가자! 😋</div>)}
                {dragX < -20 && (<div style={{ position: 'absolute', top: 28, right: 20, padding: '8px 18px', border: '3px solid #FC8181', borderRadius: 12, color: '#FC8181', fontSize: 24, fontWeight: 900, transform: 'rotate(12deg)', opacity }}>별로 🙅</div>)}
                <div style={{ fontSize: 88, marginBottom: 20, lineHeight: 1 }}>{currentCard.emoji}</div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>{currentCard.name}</div>
                {currentCard.desc && (<div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>{currentCard.desc}</div>)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 28 }}>
              <button className="swipe-btn" onClick={() => handleSwipe('left')} style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(252,129,129,0.12)', color: '#FC8181', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              <button className="swipe-btn" onClick={() => handleSwipe('right')} style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(104,211,145,0.12)', color: '#68D391', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>♥</button>
            </div>
          </div>
        )}

        {view === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', animation: 'fadeUp 0.5s ease-out' }}>
            <div style={{ fontSize: 52, marginBottom: 16, animation: 'bounce 2s infinite' }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>투표 완료!</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 32, textAlign: 'center', lineHeight: 1.6 }}>방장이 투표를 종료하면<br/>결과를 볼 수 있어요</p>
            <div style={{ ...styles.glass, width: '100%', maxWidth: 320 }}>
              <div style={{ ...styles.label, textAlign: 'center' }}>투표 현황</div>
              {votersList.map(([name, v], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < votersList.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${(i * 47 + 120) % 360}, 45%, 35%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{name[0]}</div>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 16 }}>{v.done ? '✅' : '⏳'}</span>
                </div>
              ))}
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{doneCount}/{totalVoters}명 완료</div>
            </div>
            {isHost && (
              <button className="btn-hover" style={{ ...styles.btnPrimary, marginTop: 24, maxWidth: 320,
                background: 'linear-gradient(135deg, #805AD5, #9F7AEA)', boxShadow: '0 4px 20px rgba(128,90,213,0.35)' }} onClick={closeVoting}>🏁 투표 종료</button>
            )}
          </div>
        )}

        {view === 'result' && room && (
          <div style={{ animation: 'fadeUp 0.5s ease-out', paddingBottom: 40 }}>
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
              {[...Array(18)].map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${Math.random() * 100}%`, top: -20,
                  width: 8 + Math.random() * 8, height: 8 + Math.random() * 8,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  background: ['#ff6b4a','#f6ad55','#68D391','#805AD5','#FC8181','#63B3ED'][i % 6],
                  animation: `confetti ${3 + Math.random() * 4}s linear ${Math.random() * 3}s infinite`, opacity: 0.7 }} />
              ))}
            </div>
            {(() => {
              const sorted = getResults();
              const winner = sorted[0];
              if (!winner) return null;
              return (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>투표 결과</div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5 }}>오늘의 점심은? 🎉</h1>
                  </div>
                  <div style={{ padding: 28, borderRadius: 24, textAlign: 'center', marginBottom: 28,
                    background: 'linear-gradient(160deg, rgba(255,107,74,0.15), rgba(255,138,101,0.05))',
                    border: '1px solid rgba(255,107,74,0.2)', animation: 'popIn 0.6s cubic-bezier(.4,0,.2,1)' }}>
                    <div style={{ fontSize: 14, marginBottom: 6 }}>👑</div>
                    <div style={{ fontSize: 64, marginBottom: 12 }}>{winner.emoji}</div>
                    <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 6 }}>{winner.name}</div>
                    {winner.desc && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{winner.desc}</div>}
                    <div style={{ display: 'inline-flex', gap: 16, padding: '8px 20px', borderRadius: 12, background: 'rgba(0,0,0,0.2)' }}>
                      <span style={{ color: '#68D391', fontWeight: 700 }}>👍 {winner.likes}</span>
                      <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
                      <span style={{ color: '#FC8181', fontWeight: 700 }}>👎 {winner.nopes}</span>
                    </div>
                  </div>
                  {sorted.length > 1 && (
                    <div>
                      <div style={styles.label}>전체 순위</div>
                      {sorted.slice(1).map((r, i) => {
                        const rank = i + 2;
                        const total = r.likes + r.nopes;
                        const pct = total > 0 ? (r.likes / total) * 100 : 0;
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                            borderRadius: 14, marginBottom: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                            animation: `fadeUp 0.4s ease-out ${(i + 1) * 0.08}s both` }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10,
                              background: rank === 2 ? 'rgba(246,173,85,0.15)' : rank === 3 ? 'rgba(160,174,192,0.15)' : 'rgba(255,255,255,0.05)',
                              color: rank === 2 ? '#F6AD55' : rank === 3 ? '#A0AEC0' : 'rgba(255,255,255,0.3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{rank}</div>
                            <span style={{ fontSize: 22 }}>{r.emoji}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</div>
                              <div style={{ height: 4, borderRadius: 2, marginTop: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'rgba(104,211,145,0.5)', transition: 'width 0.5s' }} />
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 13 }}>
                              <span style={{ color: '#68D391' }}>👍{r.likes}</span>
                              <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4px' }}>·</span>
                              <span style={{ color: '#FC8181' }}>👎{r.nopes}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: 24, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>총 {totalVoters}명 참여</div>
                  {isHost && (<button className="btn-hover" style={{ ...styles.btnGhost, marginTop: 20 }} onClick={resetRoom}>🗑️ 투표방 삭제</button>)}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
