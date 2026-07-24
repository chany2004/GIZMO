const $=s=>document.querySelector(s);
let category='world',roomCode='',playerId='',room=null,currentRound=0,answered=false,poll,clock,phase='setup';
let categories={},questions=[],questionCache={};
const user=JSON.parse(localStorage.getItem('gizmoUser')||'null');
$('#playerName').value=user?.name||'';

const screens=['startScreen','lobbyScreen','quizScreen'];
function showScreen(id){screens.forEach(s=>$(`#${s}`)?.classList.toggle('hidden',s!==id))}
function isHost(){return room?.hostId===playerId}
function playerName(){return $('#playerName').value.trim()||'Player'}
function showStartError(msg){$('#inviteNote').textContent=msg}
function showLobbyNote(msg){$('#lobbyNote').textContent=msg}
function catInfo(){return categories[category]||{title:category,icon:'❓'}}

// Vercel-compatible API — tries unified endpoint first, falls back to direct PHP
const gApi = (endpoint, action, extra = {}) => {
  if (window.GIZMO?.api) {
    return window.GIZMO.api(endpoint, { action, roomCode, playerId, userId: user?.id||null, ...extra });
  }
  return fetch(`${endpoint}.php`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,roomCode,playerId,userId:user?.id||null,...extra})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Something went wrong.');return d});
};
function api(action,extra={}){return gApi('multiplayer', action, extra)}
function profileApi(action,body={}){return fetch('profiles.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})}).then(async r=>{const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Request failed');return d})}
function authApi(action,body={}){return fetch('auth.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})}).then(async r=>{const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Request failed');return d})}
function quizApi(action,body={}){return fetch('quiz.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})}).then(async r=>{const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Request failed');return d})}

function updateCategoryUI(){
  const info=catInfo();
  $('#startTitle').textContent=`Ready for ${info.title}?`;
  $('#startIcon').textContent=info.icon;
}

function selectCategory(slug){
  category=slug;
  const sel=$('#categorySelect');
  if(sel&&sel.value!==slug)sel.value=slug;
  updateCategoryUI();
}

function renderCategorySelect(list){
  const sel=$('#categorySelect');
  sel.innerHTML='';
  list.forEach(c=>{
    categories[c.slug]={title:c.title,icon:c.icon};
    const opt=document.createElement('option');
    opt.value=c.slug;
    opt.textContent=`${c.icon}  ${c.title}`;
    sel.append(opt);
  });
  if(!category||!list.some(c=>c.slug===category))category=list[0]?.slug||'world';
  sel.value=category;
  updateCategoryUI();
}

async function loadCategories(){
  const fallback=[
    {slug:'world',title:'World Trivia',icon:'🌍'},{slug:'science',title:'Science Trivia',icon:'🧠'},{slug:'fun',title:'Fun Trivia',icon:'🎬'},
    {slug:'history',title:'History',icon:'📜'},{slug:'geography',title:'Geography',icon:'🗺️'},{slug:'sports',title:'Sports',icon:'⚽'},
    {slug:'music',title:'Music',icon:'🎵'},{slug:'movies',title:'Movies',icon:'🎬'},{slug:'food',title:'Food',icon:'🍕'},
    {slug:'animals',title:'Animals',icon:'🐾'},{slug:'technology',title:'Technology',icon:'💻'},{slug:'math',title:'Math',icon:'🔢'},
    {slug:'literature',title:'Literature',icon:'📚'},{slug:'art',title:'Art',icon:'🎨'},{slug:'philippines',title:'Philippines',icon:'🇵🇭'}
  ];
  try{
    const d=await quizApi('categories');
    const list=d.categories?.length?d.categories:fallback;
    if(!category||!list.some(c=>c.slug===category))category=list[0]?.slug||'world';
    renderCategorySelect(list);
  }catch{
    category='world';
    renderCategorySelect(fallback);
  }
}

async function ensureQuestions(slug){
  if(questionCache[slug]){questions=questionCache[slug];category=slug;return}
  const d=await quizApi('questions',{slug});
  questionCache[slug]=d.questions;
  questions=d.questions;
  category=slug;
}

function roomInviteUrl(){const url=new URL(location.href);url.searchParams.set('room',roomCode);url.searchParams.delete('category');return url.href}

async function copyText(text,noteEl,successMsg){
  try{await navigator.clipboard.writeText(text);if(noteEl)noteEl.textContent=successMsg}
  catch{if(noteEl)noteEl.textContent=text}
}

/* ── Step 1: Create room ── */
async function createRoom(){
  const btn=$('#startGame');
  if(!category){showStartError('Please choose a category.');return}
  btn.disabled=true;
  showStartError('');
  try{
    const d=await api('create',{name:playerName(),category});
    roomCode=d.roomCode;
    playerId=d.playerId;
    localStorage.setItem('gizmoRoomPlayer',JSON.stringify({roomCode,playerId}));
    enterLobby(d.state);
  }catch(e){showStartError(e.message)}
  finally{btn.disabled=false}
}

/* ── Step 2: Lobby — share Room ID ── */
function enterLobby(state){
  phase='lobby';
  room=state.room;
  category=room.category;
  showScreen('lobbyScreen');

  const host=isHost();
  const info=categories[room.category]||catInfo();
  $('#lobbyRoomCode').textContent=roomCode;
  $('#lobbyIcon').textContent=info.icon||'🏆';
  $('#lobbyCategory').textContent=info.title||room.category;
  $('#lobbyTitle').textContent=host?'Room created!':'You joined the room!';
  $('#lobbyHelp').textContent=host
    ?'Share the Room ID below with friends, then start when everyone is ready.'
    :'Wait for the host to start the game.';
  $('#beginGame').classList.toggle('hidden',!host);
  $('#waitForHost').classList.toggle('hidden',host);
  showLobbyNote('');
  renderLobby(state);
  startPolling();
  api('state').then(d=>handleState(d.state)).catch(()=>{});
}

function renderLobby(state){
  room=state.room;
  if(room.status==='started'||room.status==='finished'){enterGame(state);return}

  const players=room.players;
  $('#lobbyPlayerCount').textContent=`${players.length} player${players.length===1?'':'s'} waiting`;
  const list=$('#lobbyPlayerList');
  list.innerHTML='';
  players.forEach(p=>{
    const li=document.createElement('li');
    li.className='lobby-player-row';
    const av=document.createElement('span');
    av.className='lobby-player-avatar';
    if(p.photo){av.style.backgroundImage=`url('${p.photo}')`;av.textContent=''}else{av.textContent=p.name.charAt(0).toUpperCase()}
    const meta=document.createElement('span');
    const tags=[p.name];
    if(p.id===playerId)tags.push('You');
    if(p.id===room.hostId)tags.push('Host');
    meta.textContent=tags.join(' · ');
    li.append(av,meta);
    list.append(li);
  });
}

async function beginGame(){
  const btn=$('#beginGame');
  btn.disabled=true;
  showLobbyNote('Starting game…');
  try{
    const d=await api('start');
    enterGame(d.state);
  }catch(e){showLobbyNote(e.message);btn.disabled=false}
}

/* ── Step 3: Live game ── */
async function enterGame(state){
  phase='playing';
  room=state.room;
  category=room.category;
  showScreen('quizScreen');
  $('#roomLabel').textContent=`ROOM ${roomCode}`;
  $('#resultActions').classList.add('hidden');
  $('#beginGame').disabled=false;
  await renderGame(state);
  startPolling();
}

async function renderGame(state){
  room=state.room;
  if(room.status==='lobby'){enterLobby(state);return}
  await ensureQuestions(room.category);

  const mine=room.players.find(p=>p.id===playerId)||{score:0,streak:0,round:0};
  currentRound=mine.round||0;
  $('#score').textContent=mine.score;
  $('#playerCount').textContent=`${room.players.length} player${room.players.length===1?'':'s'}`;
  $('#streakBadge').textContent=`🔥 ${mine.streak||0} streak`;
  showBoard(room.players);

  if(room.status==='finished'||currentRound>=questions.length){finish();return}
  renderQuestion();
}

function handleState(state){
  const status=state.room.status;
  if(status==='lobby'){
    if(phase!=='lobby')enterLobby(state);
    else renderLobby(state);
    return;
  }
  if(phase!=='playing'){
    if(phase==='lobby')showLobbyNote('Game starting…');
    enterGame(state);
    return;
  }
  renderGame(state);
}

/* ── Join existing room ── */
async function joinRoom(code){
  roomCode=(code||'').trim().toUpperCase();
  if(!roomCode)return showStartError('Room ID is missing.');
  showStartError('');
  try{
    const d=await api('join',{name:playerName()});
    playerId=d.playerId;
    localStorage.setItem('gizmoRoomPlayer',JSON.stringify({roomCode,playerId}));
    if(d.state.room.status==='started')enterGame(d.state);
    else enterLobby(d.state);
  }catch(e){showStartError(e.message)}
}

/* ── Social & leaderboard ── */
let followingIds=new Set(),knownSaved=new Set();
async function loadFollowing(){if(!user?.id)return;try{const d=await authApi('social',{id:user.id});followingIds=new Set((d.following||[]).map(p=>p.id))}catch{}}
loadFollowing();
function rememberKnown(p){if(p.id===playerId||!user?.id)return;const key=p.userId||p.name;if(knownSaved.has(key))return;knownSaved.add(key);authApi('addKnown',{userId:user.id,knownUserId:p.userId||null,knownName:p.userId?null:p.name}).catch(()=>{})}
async function toggleFollow(player){if(!user?.id||!player.userId){$('#answerNote').textContent='Log in to follow players.';return}try{const d=await profileApi('follow',{id:user.id,target:player.userId});d.following?followingIds.add(player.userId):followingIds.delete(player.userId);showBoard(room.players)}catch(e){$('#answerNote').textContent=e.message}}
function showBoard(players){const list=$('#leaderboardList');list.innerHTML='';players.forEach(p=>{rememberKnown(p);const li=document.createElement('li');const av=document.createElement('span');av.className='player-avatar';if(p.photo){av.style.backgroundImage=`url('${p.photo}')`;av.textContent=''}else{av.textContent=p.name.charAt(0).toUpperCase()}const name=document.createElement('strong'),points=document.createElement('span');name.textContent=p.name+(p.id===playerId?' (You)':'');points.textContent=`${p.score} pts`;li.append(av,name,points);if(p.id!==playerId&&p.userId&&user?.id){const follow=document.createElement('button');follow.type='button';follow.className='follow-player';follow.textContent=followingIds.has(p.userId)?'Following':'Follow';follow.onclick=()=>toggleFollow(p);li.append(follow)}list.append(li)});$('#leaderboard').classList.remove('hidden')}

/* ── Questions & answers ── */
function renderQuestion(){
  const item=questions[currentRound];
  if(!item)return;
  answered=false;
  const info=catInfo();
  $('#gameKind').textContent=info.title.toUpperCase();
  $('#questionCount').textContent=`QUESTION ${currentRound+1} OF ${questions.length}`;
  $('#progressBar').style.width=`${(currentRound+1)/questions.length*100}%`;
  $('#gameTitle').textContent=item.text;
  $('#gameInstruction').textContent='Choose an answer — you will continue right away.';
  $('#answerNote').textContent='';
  const board=$('#gameBoard');
  board.innerHTML='';
  item.options.forEach((text,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='answer';
    b.innerHTML=`<span class="answer-letter">${'ABCD'[i]}</span>${text}`;
    b.onclick=()=>submitAnswer(i,b);
    board.append(b);
  });
}

async function submitAnswer(answer,button){
  if(answered)return;
  answered=true;
  document.querySelectorAll('.answer').forEach(b=>b.disabled=true);
  try{
    const d=await api('answer',{round:currentRound,answer});
    button.classList.add(d.correct?'correct':'wrong');
    $('#answerNote').textContent=d.correct?'Correct! Nice!':'Wrong answer — try the next one!';
    setTimeout(()=>handleState(d.state),650);
  }catch(e){
    $('#answerNote').textContent=e.message;
    answered=false;
    document.querySelectorAll('.answer').forEach(b=>b.disabled=false);
  }
}

function finish(){
  clearInterval(poll);clearInterval(clock);poll=null;
  $('#questionCount').textContent='GAME COMPLETE';
  $('#progressBar').style.width='100%';
  $('#timer').textContent='0';
  $('#gameBoard').innerHTML='';
  const winner=room.players[0];
  $('#gameTitle').textContent=winner?.id===playerId?'You are the winner!':'Game finished!';
  $('#gameInstruction').textContent=`${winner?.name||'Player'} has the highest score: ${winner?.score||0} points.`;
  $('#answerNote').textContent='Final scoreboard is shown below.';
  $('#resultActions').classList.remove('hidden');
}

/* ── Polling ── */
function startPolling(){
  clearInterval(poll);clearInterval(clock);
  const ms=phase==='lobby'?1000:2500;
  poll=setInterval(()=>api('state').then(d=>handleState(d.state)).catch(()=>{}),ms);
  clock=setInterval(()=>{
    if(phase!=='playing'||room?.status!=='started')return;
    const remaining=20-((Date.now()/1000-room.startedAt)%20);
    $('#timer').textContent=Math.max(0,Math.ceil(remaining));
  },500);
}

/* ── Events ── */
$('#startGame').onclick=createRoom;
$('#beginGame').onclick=beginGame;
$('#restartGame').onclick=()=>location.href='game.html';
$('#copyRoomCode').onclick=()=>copyText(roomCode,$('#lobbyNote'),'Room ID copied!');
$('#copyRoomLink').onclick=()=>copyText(roomInviteUrl(),$('#lobbyNote'),'Invite link copied!');
$('#copyRoom').onclick=()=>copyText(roomInviteUrl(),$('#answerNote'),'Invite link copied!');
$('#categorySelect').addEventListener('change',e=>selectCategory(e.target.value));

(async()=>{
  await loadCategories();
  const invite=new URLSearchParams(location.search).get('room');
  if(invite)joinRoom(invite);
})();
