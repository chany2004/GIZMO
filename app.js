const quizzes={world:{label:'WORLD TRIVIA',questions:[['What is the largest ocean on Earth?',['Atlantic Ocean','Pacific Ocean','Indian Ocean','Arctic Ocean'],1],['Which country is home to the pyramids of Giza?',['Mexico','Greece','Egypt','Italy'],2],['What is the capital city of Japan?',['Kyoto','Tokyo','Osaka','Seoul'],1],['The Sahara Desert is on which continent?',['Asia','Africa','Australia','South America'],1],['Which planet is known as the Red Planet?',['Venus','Jupiter','Mars','Mercury'],2]]},science:{label:'SCIENCE TRIVIA',questions:[['What gas do plants absorb from the air?',['Oxygen','Carbon dioxide','Nitrogen','Helium'],1],['How many bones are in an adult human body?',['106','206','306','406'],1],['What force pulls objects toward Earth?',['Magnetism','Friction','Gravity','Electricity'],2],['Which organ pumps blood around the body?',['Lungs','Brain','Heart','Liver'],2],['Water freezes at what temperature in Celsius?',['0°','10°','32°','100°'],0]]},fun:{label:'FUN TRIVIA',questions:[['How many colors are traditionally in a rainbow?',['5','6','7','8'],2],['Which instrument usually has 88 keys?',['Guitar','Piano','Violin','Drums'],1],['What is the name of the cowboy in Toy Story?',['Buzz','Woody','Rex','Andy'],1],['Which sport uses a shuttlecock?',['Tennis','Baseball','Badminton','Golf'],2],['What is the fastest land animal?',['Lion','Cheetah','Horse','Falcon'],1]]}};
const state={mode:'login',user:JSON.parse(localStorage.getItem('gizmoUser')||'null'),score:0,quiz:null,index:0,answered:false};const $=s=>document.querySelector(s);const authModal=$('#authModal');

// Vercel-compatible API functions with graceful error handling for empty JSON responses
async function safeFetch(url, data) {
  try {
    const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const text = await r.text();
    if (!text || !text.trim()) throw new Error('Empty response — backend unavailable');
    const d = JSON.parse(text);
    if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
    return d;
  } catch(e) {
    if (e.message.includes('Empty response')) throw e;
    throw new Error(e.message || 'Connection error');
  }
}
const authApi = (action, body = {}) => {
  const request=window.GIZMO?.authApi?window.GIZMO.authApi(action,body):safeFetch('auth.php',{action,...body});
  return request.catch(async error=>{
    if(window.GIZMO?.isVercel&&['register','login','me'].includes(action))return offlineAuth(action,body);
    throw error;
  });
};
async function offlineHash(value){
  const data=new TextEncoder().encode(value);
  if(window.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
  return btoa(unescape(encodeURIComponent(value)));
}
function offlineAccounts(){try{return JSON.parse(localStorage.getItem('gizmoOfflineAccounts')||'[]')}catch{return []}}
async function offlineAuth(action,body){
  const accounts=offlineAccounts();
  if(action==='me'){const account=accounts.find(a=>a.id===body.id);if(!account)throw new Error('Local account not found.');return {user:{id:account.id,name:account.name,email:account.email,offline:true}}}
  const email=(body.email||'').trim().toLowerCase(),password=body.password||'';
  if(!email||password.length<6)throw new Error('Enter a valid email and password of at least 6 characters.');
  const passwordHash=await offlineHash(password);
  let account=accounts.find(a=>a.email===email);
  if(action==='register'){
    if(account)throw new Error('An account with this email already exists on this device.');
    account={id:'local-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:(body.name||email.split('@')[0]).slice(0,24),email,passwordHash};
    accounts.push(account);localStorage.setItem('gizmoOfflineAccounts',JSON.stringify(accounts));
  }else if(!account||account.passwordHash!==passwordHash)throw new Error('Incorrect local email or password.');
  return {user:{id:account.id,name:account.name,email:account.email,offline:true}};
}
const profileApi = (action, body = {}) => {
  if (window.GIZMO?.profileApi) return window.GIZMO.profileApi(action, body);
  return safeFetch('profiles.php', {action,...body});
};
function toast(message){const t=$('#toast');t.textContent=message;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3200)}function closeModal(id){if(id==='authModal'&&document.body.classList.contains('auth-required'))return;$(`#${id}`).classList.add('hidden')}
function openAuth(mode='login'){state.mode=mode;$('#authTitle').textContent=mode==='login'?'Play with your brain on.':'Your next streak starts now.';$('#authSubtitle').textContent=mode==='login'?'Log in to save your scores and keep your streak.':'Create a free account and make every game count.';$('#authSubmit').innerHTML=`${mode==='login'?'Log in':'Create account'} <span>→</span>`;$('#switchCopy').innerHTML=mode==='login'?'New to Quester? <button type="button" data-switch-auth="signup">Create an account</button>':'Already playing? <button type="button" data-switch-auth="login">Log in</button>';$('#formNote').textContent='';authModal.classList.remove('hidden')}
function saveUser(user){state.user=user;localStorage.setItem('gizmoUser',JSON.stringify(user));renderUser();if(document.body.classList.contains('auth-required')){let next='';try{next=sessionStorage.getItem('questerAuthReturn')||'';sessionStorage.removeItem('questerAuthReturn')}catch(e){}document.body.classList.remove('auth-required');if(next&&!/^index\.html(?:[?#]|$)/i.test(next)){location.href=next}}}
function renderUser(){const guest=$('#guestActions'),profile=$('#profileButton');if(!state.user?.id&&!state.user?.guest){guest?.classList.remove('hidden');profile?.classList.add('hidden');return}guest?.classList.add('hidden');const photo=state.user.photo;if(photo){profile.classList.add('has-photo');profile.textContent='';profile.style.backgroundImage=`url('${photo}')`;profile.style.backgroundSize='cover';profile.style.backgroundPosition='center'}else{profile.classList.remove('has-photo');profile.style.backgroundImage='';profile.textContent=state.user.guest?'G':state.user.name?.charAt(0).toUpperCase()||'G'}profile.title=state.user.guest?'Guest mode — create an account to save online':`${state.user.name}'s player dashboard`;profile.classList.remove('hidden')}
function avatarThumb(photo,name){return photo?`<span class="player-photo" style="background-image:url('${photo}')"></span>`:`<b>${name.charAt(0).toUpperCase()}</b>`}
async function login(user){saveUser(user);closeModal('authModal');toast(`Welcome${user.name?`, ${user.name}`:''}! Your streak starts today. ✨`)}
function goToProfile(event){event?.preventDefault();if(!state.user?.id){openAuth('login');toast('Log in to view your profile.');return}window.location.href='dashboard.html'}
async function hydrateUser(){if(!state.user)return renderUser();if(state.user.guest)return renderUser();if(!state.user.id){localStorage.removeItem('gizmoUser');state.user=null;renderUser();requireLogin();return}try{const d=await authApi('me',{id:state.user.id});saveUser(d.user)}catch{localStorage.removeItem('gizmoUser');state.user=null;renderUser();requireLogin()}}
function requireLogin(){if(state.user?.id||state.user?.guest)return;document.body.classList.add('auth-required');openAuth('login')}
document.addEventListener('click',event=>{const auth=event.target.closest('[data-open-auth]');if(auth){event.preventDefault();openAuth(auth.dataset.openAuth)}const sw=event.target.closest('[data-switch-auth]');if(sw){event.preventDefault();openAuth(sw.dataset.switchAuth)}const close=event.target.closest('[data-close]');if(close)closeModal(close.dataset.close);const game=event.target.closest('[data-game]');if(game)startGame(game.dataset.game)});const howButton=$('#showHow');if(howButton)howButton.addEventListener('click',()=>toast('Create a room, invite friends, then climb the leaderboard.'));$('#profileButton')?.addEventListener('click',goToProfile);$('#viewProfileLink')?.addEventListener('click',goToProfile);
$('#authForm').addEventListener('submit',async event=>{event.preventDefault();const email=$('#email').value.trim(),password=$('#password').value;if(password.length<6){$('#formNote').textContent='Please use at least 6 characters for your password.';return}try{const d=await authApi(state.mode==='login'?'login':'register',{email,password,name:email.split('@')[0]});await login(d.user)}catch(e){$('#formNote').textContent=e.message}});
$('#guestSignIn').addEventListener('click',()=>{saveUser({id:null,name:'Guest',guest:true,offline:true});closeModal('authModal');toast('Guest mode is on. Create an account anytime to save online.')});
async function waitForGoogleIdentity(){
  for(let attempt=0;attempt<40;attempt++){
    if(window.google?.accounts?.id)return window.google.accounts.id;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Google Sign-In could not load. Check your internet connection and refresh.');
}
async function setupGoogleSignIn(){
  const container=$('#googleSignIn');
  try{
    const [identity,config]=await Promise.all([waitForGoogleIdentity(),authApi('googleConfig')]);
    if(!config.configured||!config.clientId)throw new Error('Google Sign-In is not configured on the server.');
    identity.initialize({
      client_id:config.clientId,
      ux_mode:'popup',
      auto_select:false,
      use_fedcm_for_prompt:true,
      callback:async response=>{
        $('#formNote').textContent='';
        try{
          const result=await authApi('google',{credential:response.credential});
          await login(result.user);
        }catch(error){
          $('#formNote').textContent=error.message;
        }
      }
    });
    const width=Math.max(240,Math.min(400,Math.floor(container.getBoundingClientRect().width||400)));
    identity.renderButton(container,{type:'standard',theme:'outline',size:'medium',text:'signin_with',shape:'rectangular',logo_alignment:'left',width:width,locale:'en'});
  }catch(error){
    container.classList.add('google-setup-error');
    container.textContent=error.message;
  }
}
setupGoogleSignIn();
function startGame(type){window.location.href=`game.html?category=${encodeURIComponent(type)}`}
renderUser();if(!state.user?.id||new URLSearchParams(location.search).get('auth')==='required')requireLogin();hydrateUser();
const joinTrigger=$('#openJoinRoom'),joinModal=$('#joinRoomModal'),joinForm=$('#joinRoomForm');if(joinTrigger){joinTrigger.addEventListener('click',()=>{joinModal.classList.remove('hidden');$('#joinRoomNote').textContent='';setTimeout(()=>$('#homeRoomCode').focus(),0)});$('#closeJoinRoom').addEventListener('click',()=>joinModal.classList.add('hidden'));$('#homeRoomCode').addEventListener('input',event=>{event.target.value=event.target.value.replace(/\D/g,'').slice(0,6);$('#joinRoomNote').textContent=''});joinForm.addEventListener('submit',async event=>{event.preventDefault();const code=$('#homeRoomCode').value.trim(),note=$('#joinRoomNote'),button=$('#joinRoomSubmit');if(!/^\d{6}$/.test(code)){note.textContent='Enter a valid 6-digit Room ID.';return}button.disabled=true;button.textContent='Checking room…';note.textContent='';try{const result=window.GIZMO?.multiplayerApi?await window.GIZMO.multiplayerApi('checkRoom',{roomCode:code}):await safeFetch('multiplayer.php',{action:'checkRoom',roomCode:code});if(result.available)window.location.href=`game.html?room=${encodeURIComponent(code)}`}catch(error){note.textContent=error.message||'Room not found.';button.disabled=false;button.innerHTML='Join game <span>→</span>'}})}
const peopleHome=$('#peopleHomeGrid');
async function loadPeopleHome(){
  if(!peopleHome)return;
  try{
    const d=await profileApi('list');
    const me=state.user?.id;
    const people=(d.profiles||[]).filter(p=>p.id!==me).slice(0,6);
    if(!people.length){peopleHome.innerHTML='<p>No players yet — be the first to sign up!</p>';return}
    peopleHome.innerHTML='';
    for(const p of people){
      let isFollowing=false;
      if(me){try{const f=await profileApi('isFollowing',{id:me,target:p.id});isFollowing=f.following}catch{}}
      const card=document.createElement('article');
      card.className='people-home-card';
      card.dataset.userId=p.id;
      card.innerHTML=`${avatarThumb(p.photo,p.name)}<h3>${p.name}</h3><p>Quester trivia player</p><button type="button" class="${isFollowing?'following':''}">${isFollowing?'Following':'Follow'}</button>`;
      if(me){card.querySelector('button').onclick=async()=>{try{await profileApi('follow',{id:me,target:p.id});loadPeopleHome()}catch(e){toast(e.message)}}}
      else card.querySelector('button').onclick=()=>openAuth('login');
      peopleHome.append(card);
    }
  }catch{peopleHome.innerHTML='<p>Sign in to meet Quester players.</p>'}
}
if(peopleHome){loadPeopleHome();setInterval(loadPeopleHome,8000)}
if(state.user?.id)setInterval(()=>authApi('me',{id:state.user.id}).then(d=>saveUser(d.user)).catch(()=>{}),8000)
window.addEventListener('storage',e=>{if(e.key==='gizmoUser'||e.key==='gizmoPhotoVersion'){state.user=JSON.parse(localStorage.getItem('gizmoUser')||'null');renderUser();if(peopleHome)loadPeopleHome()}});
