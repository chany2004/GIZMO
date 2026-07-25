const $=s=>document.querySelector(s);
let category='world',roomCode='',playerId='',room=null,currentRound=0,answered=false,answerTransitioning=false,pendingAnswerState=null,questionStartedAt=0,poll,clock,phase='setup',usingLocalQuestions=false,gameStarting=false;
let categories={},questions=[],questionCache={};
const categoryIcons={world:'🌍',science:'🧠',fun:'🎬',history:'📜',geography:'🗺️',sports:'⚽',music:'🎵',movies:'🎥',food:'🍕',animals:'🐾',technology:'💻',math:'🔢',literature:'📚',art:'🎨',philippines:'🇵🇭'};
const user=JSON.parse(localStorage.getItem('gizmoUser')||'null');
$('#playerName').value=user?.name||'';
const offlineWorldQuestions=[
  {text:'Largest ocean?',options:['Atlantic','Pacific','Indian','Arctic'],correct:1},
  {text:'Pyramids of Giza are in?',options:['Mexico','Greece','Egypt','Italy'],correct:2},
  {text:'Capital of Japan?',options:['Kyoto','Tokyo','Osaka','Seoul'],correct:1},
  {text:'Sahara is in?',options:['Asia','Africa','Australia','Europe'],correct:1},
  {text:'Red Planet?',options:['Venus','Jupiter','Mars','Mercury'],correct:2},
  {text:'Paris is in?',options:['Spain','France','Italy','Germany'],correct:1},
  {text:'Everest range?',options:['Andes','Alps','Himalayas','Rockies'],correct:2},
  {text:'Capital of Australia?',options:['Sydney','Melbourne','Canberra','Perth'],correct:2},
  {text:'Brazil is in?',options:['Africa','South America','Europe','Asia'],correct:1},
  {text:'Longest river?',options:['Amazon','Nile','Yangtze','Mississippi'],correct:1},
  {text:'Boot-shaped country?',options:['Greece','Italy','Portugal','Chile'],correct:1},
  {text:'Ocean east of Africa?',options:['Pacific','Arctic','Indian','Atlantic'],correct:2},
  {text:'Great Barrier Reef?',options:['Australia','Indonesia','Philippines','India'],correct:0},
  {text:'Smallest continent?',options:['Europe','Antarctica','Australia','South America'],correct:2},
  {text:'Big Apple city?',options:['Los Angeles','New York','Chicago','Boston'],correct:1}
];

const screens=['startScreen','lobbyScreen','quizScreen'];
function showScreen(id){screens.forEach(s=>$(`#${s}`)?.classList.toggle('hidden',s!==id))}
function isHost(){return room?.hostId===playerId}
function playerName(){return $('#playerName').value.trim()||'Player'}
function pause(ms){return new Promise(function(resolve){setTimeout(resolve,ms)})}
function withTimeout(task,ms,message){
  return Promise.race([
    task,
    new Promise(function(_,reject){setTimeout(function(){reject(new Error(message||'Request timed out.'))},ms)})
  ]);
}
function generateNumericRoomCode(){
  var value;
  if(window.crypto?.getRandomValues){var values=new Uint32Array(1);window.crypto.getRandomValues(values);value=values[0]}
  else value=Math.floor(Math.random()*900000);
  return String(100000+(value%900000));
}
function showStartError(msg){$('#inviteNote').textContent=msg}
function showLobbyNote(msg){$('#lobbyNote').textContent=msg}
function setRoomCreating(active,message){
  var btn=$('#startGame'),status=$('#roomCreationStatus');
  if(!btn||!status)return;
  btn.disabled=active;
  btn.classList.toggle('is-creating',active);
  $('.create-room-label').textContent=active?'Creating room':'Create room';
  status.classList.toggle('is-visible',active);
  status.setAttribute('aria-hidden',String(!active));
  if(message)$('#roomCreationMessage').textContent=message;
}
function cleanCategoryIcon(slug,icon){return !icon||/[ÃÂïð]/.test(icon)?(categoryIcons[slug]||'🎯'):icon}
function catInfo(){return categories[category]||{title:category,icon:'❓'}}

// Safe fetch helper — reads text first to avoid "Unexpected end of JSON input" on empty responses
async function safeFetch(url, data) {
  const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const text = await r.text();
  if (!text || !text.trim()) throw new Error('Backend unavailable');
  const d = JSON.parse(text);
  if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
  return d;
}

// Vercel-compatible API — tries unified endpoint first, falls back to direct PHP
const gApi = (endpoint, action, extra = {}) => {
  if (window.GIZMO?.api) {
    return window.GIZMO.api(endpoint, { action, roomCode, playerId, userId: user?.id||null, ...extra });
  }
  return safeFetch(endpoint+'.php', {action,roomCode,playerId,userId:user?.id||null,...extra});
};
function api(action,extra={}){return gApi('multiplayer', action, extra)}
// These must also use /api on Vercel. Calling quiz.php/auth.php directly
// returns Vercel's empty/HTML fallback, which caused the JSON parse error.
function profileApi(action,body={}){return gApi('profile', action, body)}
function authApi(action,body={}){return gApi('auth', action, body)}
function quizApi(action,body={}){return gApi('quiz', action, body)}

function updateCategoryUI(){
  const info=catInfo();
  $('#startTitle').textContent='Ready for '+info.title+'?';
  $('#startIcon').textContent=info.icon;
}

function selectCategory(slug){
  category=slug;
  var sel=$('#categorySelect');
  if(sel&&sel.value!==slug)sel.value=slug;
  updateCategoryUI();
}

function renderCategorySelect(list){
  var sel=$('#categorySelect');
  sel.innerHTML='';
  list.forEach(function(c){
    var icon=cleanCategoryIcon(c.slug,c.icon);
    categories[c.slug]={title:c.title,icon:icon};
    var opt=document.createElement('option');
    opt.value=c.slug;
    opt.textContent=icon+'  '+c.title;
    sel.append(opt);
  });
  if(!category||!list.some(function(c){return c.slug===category}))category=list[0]?.slug||'world';
  sel.value=category;
  updateCategoryUI();
}

async function loadCategories(){
  var fallback=[
    {slug:'world',title:'World Trivia',icon:'🌍'},{slug:'science',title:'Science Trivia',icon:'🧠'},{slug:'fun',title:'Fun Trivia',icon:'🎬'},
    {slug:'history',title:'History',icon:'📜'},{slug:'geography',title:'Geography',icon:'🗺️'},{slug:'sports',title:'Sports',icon:'⚽'},
    {slug:'music',title:'Music',icon:'🎵'},{slug:'movies',title:'Movies',icon:'🎬'},{slug:'food',title:'Food',icon:'🍕'},
    {slug:'animals',title:'Animals',icon:'🐾'},{slug:'technology',title:'Technology',icon:'💻'},{slug:'math',title:'Math',icon:'🔢'},
    {slug:'literature',title:'Literature',icon:'📚'},{slug:'art',title:'Art',icon:'🎨'},{slug:'philippines',title:'Philippines',icon:'🇵🇭'}
  ];
  // Render local choices immediately so mobile users never wait on a blank
  // select while the serverless function wakes up.
  renderCategorySelect(fallback);
  try{
    var d=await Promise.race([
      quizApi('categories'),
      new Promise(function(_,reject){setTimeout(function(){reject(new Error('Category request timed out.'))},2500)})
    ]);
    var list=d.categories?.length?d.categories:fallback;
    renderCategorySelect(list);
  }catch(e){}
}

function fallbackQuestions(){
  return offlineWorldQuestions.map(function(q){
    return {text:q.text,options:q.options.slice(),correct:q.correct};
  });
}

async function ensureQuestions(slug){
  if(questionCache[slug]?.length){questions=questionCache[slug];category=slug;return}
  try{
    var d=await Promise.race([
      quizApi('questions',{slug:slug}),
      new Promise(function(_,reject){setTimeout(function(){reject(new Error('Question request timed out.'))},4000)})
    ]);
    if(!Array.isArray(d.questions)||!d.questions.length)throw new Error('No questions found.');
    questionCache[slug]=d.questions;
    usingLocalQuestions=false;
  }catch(e){
    questionCache[slug]=fallbackQuestions();
    usingLocalQuestions=true;
  }
  questions=questionCache[slug];
  category=slug;
}

function setGameLoading(active,message){
  var loader=$('#gameLoading');
  var shell=$('#quizScreen');
  if(!loader||!shell)return;
  if(message)$('#gameLoadingMessage').textContent=message;
  loader.classList.toggle('hidden',!active);
  shell.classList.toggle('is-game-loading',active);
}

function roomInviteUrl(){var url=new URL(location.href);url.searchParams.set('room',roomCode);url.searchParams.delete('category');return url.href}

async function copyText(text,noteEl,successMsg){
  try{await navigator.clipboard.writeText(text);if(noteEl)noteEl.textContent=successMsg}
  catch(e){if(noteEl)noteEl.textContent=text}
}

// Step 1: Create room
async function createRoom(){
  var btn=$('#startGame');
  if(btn.disabled)return;
  if(!category){showStartError('Please choose a category.');return}
  setRoomCreating(true,'Connecting to the game server');
  var progressTimer=setTimeout(function(){setRoomCreating(true,'Almost there — preparing your lobby')},1400);
  showStartError('');
  try{
    var d=await withTimeout(
      api('create',{name:playerName(),category:category}),
      3000,
      'Online room took too long to start.'
    );
    roomCode=d.roomCode;
    playerId=d.playerId;
    localStorage.setItem('gizmoRoomPlayer',JSON.stringify({roomCode:roomCode,playerId:playerId}));
    setRoomCreating(true,'Room ready — opening the lobby');
    await pause(220);
    // Every device sees the Room Created lobby before the host starts.
    enterLobby(d.state);
  }catch(e){
    if(window.GIZMO?.isVercel){
      startOfflineRoom('Quick-play room created because the online room is taking too long.');
      return;
    }
    showStartError(e.message)
  }
  finally{
    clearTimeout(progressTimer);
    setRoomCreating(false);
  }
}

function startOfflineRoom(note){
  roomCode=generateNumericRoomCode();
  playerId='local-player';
  questions=offlineWorldQuestions.map(q=>({...q}));
  questionCache[category]=questions;
  room={status:'lobby',offline:true,category:category,hostId:playerId,players:[{id:playerId,userId:user?.id||null,name:playerName(),score:0,streak:0,correct:0,round:0}]};
  localStorage.setItem('gizmoRoomPlayer',JSON.stringify({roomCode:roomCode,playerId:playerId}));
  enterLobby({room:room});
  if(note)showLobbyNote(note);
}

// Step 2: Lobby — share Room ID
function enterLobby(state){
  phase='lobby';
  room=state.room;
  category=room.category;
  showScreen('lobbyScreen');

  var host=isHost();
  var info=categories[room.category]||catInfo();
  $('#lobbyRoomCode').textContent=roomCode;
  $('#lobbyIcon').textContent=info.icon||'🏆';
  $('#lobbyCategory').textContent=info.title||room.category;
  $('#lobbyTitle').textContent=host?'Room created!':'You joined the room!';
  $('#lobbyHelp').textContent=host?'Share the Room ID below with friends, then start when everyone is ready.':'Wait for the host to start the game.';
  $('#beginGame').classList.toggle('hidden',!host);
  $('#waitForHost').classList.toggle('hidden',host);
  showLobbyNote('');
  renderLobby(state);
  if(!room.offline){
    startPolling();
    api('state').then(function(d){handleState(d.state)}).catch(function(){});
  }
}

function renderLobby(state){
  room=state.room;
  if(room.status==='started'||room.status==='finished'){enterGame(state);return}

  var players=room.players;
  $('#lobbyPlayerCount').textContent=players.length+' player'+(players.length===1?'':'s')+' waiting';
  var list=$('#lobbyPlayerList');
  list.innerHTML='';
  players.forEach(function(p){
    var li=document.createElement('li');
    li.className='lobby-player-row';
    var av=document.createElement('span');
    av.className='lobby-player-avatar';
    if(p.photo){av.style.backgroundImage="url('"+p.photo+"')";av.textContent=''}else{av.textContent=p.name.charAt(0).toUpperCase()}
    var meta=document.createElement('span');
    var tags=[p.name];
    if(p.id===playerId)tags.push('You');
    if(p.id===room.hostId)tags.push('Host');
    meta.textContent=tags.join(' · ');
    li.append(av,meta);
    list.append(li);
  });
}

async function beginGame(){
  if(room?.offline){
    room.status='started';
    enterGame({room:room});
    return;
  }
  var btn=$('#beginGame');
  btn.disabled=true;
  showLobbyNote('Starting game…');
  try{
    var d=await api('start');
    enterGame(d.state);
  }catch(e){showLobbyNote(e.message);btn.disabled=false}
}

// Step 3: Live game
async function enterGame(state){
  if(gameStarting){
    room=state.room;
    return;
  }
  gameStarting=true;
  phase='playing';
  room=state.room;
  category=room.category;
  clearInterval(poll);
  clearInterval(clock);
  poll=null;
  clock=null;
  showScreen('quizScreen');
  $('#roomLabel').textContent='ROOM '+roomCode;
  $('#resultActions').classList.add('hidden');
  $('#beginGame').disabled=false;
  setGameLoading(true,'Loading your challenge…');
  try{
    await Promise.all([renderGame(state),pause(1800)]);
  }finally{
    gameStarting=false;
    setGameLoading(false);
  }
  if(!room.offline&&!usingLocalQuestions)startPolling();
  else startClock();
}

async function renderGame(state){
  room=state.room;
  if(room.status==='lobby'){enterLobby(state);return}
  await ensureQuestions(room.category);

  var mine=room.players.find(function(p){return p.id===playerId})||{score:0,streak:0,round:0};
  currentRound=mine.round||0;
  $('#score').textContent=mine.score;
  $('#playerCount').textContent=room.players.length+' player'+(room.players.length===1?'':'s');
  $('#streakBadge').textContent='🔥 '+(mine.streak||0)+' streak';
  showBoard(room.players);

  if(room.status==='finished'||currentRound>=questions.length){finish();return}
  renderQuestion();
}

function handleState(state){
  if(phase==='playing'&&answerTransitioning)return;
  var status=state.room.status;
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

// Join existing room
async function joinRoom(code){
  roomCode=(code||'').trim().toUpperCase();
  if(!roomCode)return showStartError('Room ID is missing.');
  showStartError('');
  try{
    var d=await api('join',{name:playerName()});
    playerId=d.playerId;
    localStorage.setItem('gizmoRoomPlayer',JSON.stringify({roomCode:roomCode,playerId:playerId}));
    if(d.state.room.status==='started')enterGame(d.state);
    else enterLobby(d.state);
  }catch(e){showStartError(e.message)}
}

// Social & leaderboard
var followingIds=new Set(),knownSaved=new Set();
async function loadFollowing(){if(!user?.id)return;try{var d=await authApi('social',{id:user.id});followingIds=new Set((d.following||[]).map(function(p){return p.id}))}catch(e){}}
loadFollowing();
function rememberKnown(p){if(p.id===playerId||!user?.id)return;var key=p.userId||p.name;if(knownSaved.has(key))return;knownSaved.add(key);authApi('addKnown',{userId:user.id,knownUserId:p.userId||null,knownName:p.userId?null:p.name}).catch(function(){})}
async function toggleFollow(player){if(!user?.id||!player.userId){$('#answerNote').textContent='Log in to follow players.';return}try{var d=await profileApi('follow',{id:user.id,target:player.userId});d.following?followingIds.add(player.userId):followingIds.delete(player.userId);showBoard(room.players)}catch(e){$('#answerNote').textContent=e.message}}
function showBoard(players){var list=$('#leaderboardList');list.innerHTML='';players.forEach(function(p){rememberKnown(p);var li=document.createElement('li');var av=document.createElement('span');av.className='player-avatar';if(p.photo){av.style.backgroundImage="url('"+p.photo+"')";av.textContent=''}else{av.textContent=p.name.charAt(0).toUpperCase()}var name=document.createElement('strong'),points=document.createElement('span');name.textContent=p.name+(p.id===playerId?' (You)':'');points.textContent=p.score+' pts';li.append(av,name,points);if(p.id!==playerId&&p.userId&&user?.id){var follow=document.createElement('button');follow.type='button';follow.className='follow-player';follow.textContent=followingIds.has(p.userId)?'Following':'Follow';follow.onclick=function(){toggleFollow(p)};li.append(follow)}list.append(li)});$('#leaderboard').classList.remove('hidden')}

// Questions & answers
function renderQuestion(){
  var item=questions[currentRound];
  if(!item)return;
  answered=false;
  answerTransitioning=false;
  questionStartedAt=Date.now();
  $('#timer').textContent='20';
  var info=catInfo();
  $('#gameKind').textContent=info.title.toUpperCase();
  $('#questionCount').textContent='QUESTION '+(currentRound+1)+' OF '+questions.length;
  $('#progressBar').style.width=((currentRound+1)/questions.length*100)+'%';
  $('#gameTitle').textContent=item.text;
  $('#gameInstruction').textContent='Choose an answer — you will continue right away.';
  $('#answerNote').textContent='';
  $('#nextAnswer').classList.add('hidden');
  pendingAnswerState=null;
  var board=$('#gameBoard');
  board.innerHTML='';
  item.options.forEach(function(text,i){
    var b=document.createElement('button');
    b.type='button';
    b.className='answer';
    b.dataset.answerIndex=i;
    b.innerHTML='<span class="answer-letter">'+'ABCD'[i]+'</span>'+text;
    b.onclick=function(){submitAnswer(i,b)};
    board.append(b);
  });
}

async function submitAnswer(answer,button){
  if(answered)return;
  answered=true;
  // Pause live polling immediately so it cannot redraw the board mid-answer.
  answerTransitioning=true;
  document.querySelectorAll('.answer').forEach(function(b){b.disabled=true});
  try{
    var d=(room?.offline||usingLocalQuestions)
      ?offlineAnswer(answer)
      :await api('answer',{round:currentRound,answer:answer});
    var correctButton=document.querySelector('.answer[data-answer-index="'+d.correctAnswer+'"]');
    button.classList.add(d.correct?'correct':'wrong');
    if(correctButton&&!d.correct)correctButton.classList.add('correct');
    $('#answerNote').textContent=d.correct?'Correct! Nice!':'Wrong answer — try the next one!';
    var selectedText=questions[currentRound].options[answer];
    var correctText=questions[currentRound].options[d.correctAnswer];
    $('#gameInstruction').textContent=d.correct?'Correct answer! Great job.':'Review the correct answer before continuing.';
    $('#answerNote').textContent=d.correct
      ? 'Correct - '+correctText
      : 'Your answer: '+selectedText+' | Correct answer: '+correctText;
    pendingAnswerState=d.state;
    $('#nextAnswer').classList.remove('hidden');
  }catch(e){
    $('#answerNote').textContent=e.message;
    answered=false;
    answerTransitioning=false;
    pendingAnswerState=null;
    document.querySelectorAll('.answer').forEach(function(b){b.disabled=false});
  }
}

function offlineAnswer(answer){
  var item=questions[currentRound],correct=item.correct===answer;
  var player=room.players.find(function(p){return p.id===playerId})||room.players[0];
  if(correct){player.streak=(player.streak||0)+1;player.correct=(player.correct||0)+1;player.score+=(100+((player.streak-1)*25))}else player.streak=0;
  player.round=currentRound+1;
  return {correct:correct,correctAnswer:item.correct,state:{room:room}};
}

function finish(){
  clearInterval(poll);clearInterval(clock);poll=null;
  $('#questionCount').textContent='GAME COMPLETE';
  $('#progressBar').style.width='100%';
  $('#timer').textContent='0';
  $('#gameBoard').innerHTML='';
  var winner=room.players.slice().sort(function(a,b){return (b.score||0)-(a.score||0)})[0];
  $('#gameTitle').textContent=winner?.id===playerId?'You are the winner!':'Game finished!';
  $('#gameInstruction').textContent=(winner?.name||'Player')+' has the highest score: '+(winner?.score||0)+' points.';
  $('#answerNote').textContent='Final scoreboard is shown below.';
  $('#resultActions').classList.remove('hidden');
}

// Polling
function startClock(){
  clearInterval(clock);
  clock=setInterval(function(){
    if(phase!=='playing'||room?.status!=='started')return;
    // Each player gets a fresh 20-second timer for every question.
    // It stays frozen once an answer has been submitted.
    if(answered||!questionStartedAt)return;
    var remaining=20-((Date.now()-questionStartedAt)/1000);
    $('#timer').textContent=Math.max(0,Math.ceil(remaining));
  },500);
}

function startPolling(){
  clearInterval(poll);
  var ms=phase==='lobby'?1000:2500;
  poll=setInterval(function(){api('state').then(function(d){handleState(d.state)}).catch(function(){})},ms);
  startClock();
}

// Events
$('#startGame').onclick=createRoom;
$('#beginGame').onclick=beginGame;
$('#restartGame').onclick=function(){location.href='game.html'};
$('#copyRoomCode').onclick=function(){copyText(roomCode,$('#lobbyNote'),'Room ID copied!')};
$('#copyRoomLink').onclick=function(){copyText(roomInviteUrl(),$('#lobbyNote'),'Invite link copied!')};
$('#copyRoom').onclick=function(){copyText(roomInviteUrl(),$('#answerNote'),'Invite link copied!')};
$('#nextAnswer').onclick=function(){
  if(!pendingAnswerState)return;
  var nextState=pendingAnswerState;
  pendingAnswerState=null;
  answerTransitioning=false;
  $('#nextAnswer').classList.add('hidden');
  handleState(nextState);
};
$('#categorySelect').addEventListener('change',function(e){selectCategory(e.target.value)});

(async function(){
  await loadCategories();
  var invite=new URLSearchParams(location.search).get('room');
  if(invite)joinRoom(invite);
})();
