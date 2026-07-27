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
function openAuth(mode='login'){
  state.mode='login';
  $('#authTitle').textContent='Play with your brain on.';
  $('#authSubtitle').textContent='Sign in with Google to save your progress, or play as a guest.';
  $('#formNote').textContent='';
  authModal.classList.remove('hidden');
  setupGoogleSignIn();
}
function safeAuthReturn(value){
  const next=(value||'').trim();
  return /^[a-z0-9][a-z0-9_-]*\.html(?:[?#].*)?$/i.test(next)?next:'';
}
function getAuthReturn(){
  let next='';
  try{next=safeAuthReturn(sessionStorage.getItem('questerAuthReturn'))}catch(e){}
  return next||safeAuthReturn(new URLSearchParams(location.search).get('return'));
}
function saveUser(user){
  state.user=user;
  localStorage.setItem('gizmoUser',JSON.stringify(user));
  renderUser();
  if(document.body.classList.contains('auth-required')){
    const next=getAuthReturn();
    try{sessionStorage.removeItem('questerAuthReturn')}catch(e){}
    document.body.classList.remove('auth-required');
    if(next&&!/^index\.html(?:[?#]|$)/i.test(next))location.href=next;
  }
}
function renderUser(){const guest=$('#guestActions'),profile=$('#profileButton');if(!state.user?.id&&!state.user?.guest){guest?.classList.remove('hidden');profile?.classList.add('hidden');return}guest?.classList.add('hidden');const photo=state.user.photo;if(photo){profile.classList.add('has-photo');profile.textContent='';profile.style.backgroundImage=`url('${photo}')`;profile.style.backgroundSize='cover';profile.style.backgroundPosition='center'}else{profile.classList.remove('has-photo');profile.style.backgroundImage='';profile.textContent=state.user.guest?'G':state.user.name?.charAt(0).toUpperCase()||'G'}profile.title=state.user.guest?'Guest mode — sign in with Google to save online':`${state.user.name}'s player dashboard`;profile.classList.remove('hidden')}
function avatarThumb(photo,name){return photo?`<span class="player-photo" style="background-image:url('${photo}')"></span>`:`<b>${name.charAt(0).toUpperCase()}</b>`}
async function login(user){saveUser(user);closeModal('authModal');toast(`Welcome${user.name?`, ${user.name}`:''}! Your streak starts today. ✨`)}
function goToProfile(event){event?.preventDefault();if(!state.user?.id){openAuth('login');toast('Log in to view your profile.');return}window.location.href='dashboard.html'}
async function hydrateUser(){if(!state.user)return renderUser();if(state.user.guest)return renderUser();if(!state.user.id){localStorage.removeItem('gizmoUser');state.user=null;renderUser();requireLogin();return}try{const d=await authApi('me',{id:state.user.id});saveUser(d.user)}catch{localStorage.removeItem('gizmoUser');state.user=null;renderUser();requireLogin()}}
function requireLogin(){if(state.user?.id||state.user?.guest)return;document.body.classList.add('auth-required');openAuth('login')}
document.addEventListener('click',event=>{const auth=event.target.closest('[data-open-auth]');if(auth){event.preventDefault();openAuth(auth.dataset.openAuth)}const sw=event.target.closest('[data-switch-auth]');if(sw){event.preventDefault();openAuth(sw.dataset.switchAuth)}const close=event.target.closest('[data-close]');if(close)closeModal(close.dataset.close);const game=event.target.closest('[data-game]');if(game)startGame(game.dataset.game)});const howButton=$('#showHow');if(howButton)howButton.addEventListener('click',()=>toast('Create a room, invite friends, then climb the leaderboard.'));$('#profileButton')?.addEventListener('click',goToProfile);$('#viewProfileLink')?.addEventListener('click',goToProfile);
$('#guestSignIn').addEventListener('click',()=>{saveUser({id:null,name:'Guest',guest:true,offline:true});closeModal('authModal');toast('Guest mode is on. Sign in with Google anytime to save online.')});
async function waitForGoogleIdentity(){
  for(let attempt=0;attempt<120;attempt++){
    if(window.google?.accounts?.id)return window.google.accounts.id;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Google Sign-In could not load. Check your internet connection and refresh.');
}
let googleIdentity=null;
let googleSetupPromise=null;
let googleRenderFrame=0;
let googleRenderedWidth=0;
let googleResizeTimer=0;
function isEmbeddedBrowser(){
  const ua=navigator.userAgent||'';
  const knownApp=/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|MicroMessenger/i.test(ua);
  const androidWebView=/Android/i.test(ua)&&(/;\s*wv\)/i.test(ua)||/\bVersion\/[\d.]+\s+Chrome\//i.test(ua));
  const iosWebView=/iPhone|iPad|iPod/i.test(ua)&&/AppleWebKit/i.test(ua)&&!/Safari/i.test(ua);
  return knownApp||androidWebView||iosWebView;
}
function externalBrowserTarget(){
  const ua=navigator.userAgent||'';
  const url=new URL(location.href);
  url.searchParams.set('auth','required');
  url.searchParams.set('external','1');
  const returnPath=getAuthReturn();
  if(returnPath)url.searchParams.set('return',returnPath);
  url.hash='';
  if(/Android/i.test(ua)){
    const scheme=url.protocol.replace(':','')||'https';
    const fallback=encodeURIComponent(url.href);
    return {
      href:`intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`,
      label:'Continue with Google',
      newWindow:false
    };
  }
  return {
    href:url.href,
    label:'Continue with Google',
    newWindow:true
  };
}
function renderExternalGoogleSignIn(){
  const container=$('#googleSignIn');
  if(!container)return;
  const target=externalBrowserTarget();
  const link=document.createElement('a');
  link.className='google-external-link';
  link.href=target.href;
  if(target.newWindow)link.target='_blank';
  link.rel='noopener noreferrer external';

  const logo=document.createElement('span');
  logo.className='google-external-g';
  logo.setAttribute('aria-hidden','true');
  logo.innerHTML='<svg viewBox="0 0 18 18" focusable="false"><path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z"/><path fill="#4285F4" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.681 9c0-.592.102-1.167.282-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z"/><path fill="#34A853" d="M9 3.58c1.321 0 2.507.454 3.44 1.345l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"/></svg>';
  const copy=document.createElement('span');
  copy.className='google-external-copy';
  const title=document.createElement('strong');
  title.textContent=target.label;
  const subtitle=document.createElement('small');
  subtitle.textContent='Secure Google sign-in';
  copy.append(title,subtitle);
  const arrow=document.createElement('span');
  arrow.className='google-external-arrow';
  arrow.textContent='\u2197';
  link.append(logo,copy,arrow);

  const help=document.createElement('p');
  help.className='google-external-help';
  help.textContent='Google sign-in will continue securely in your browser.';
  container.classList.remove('google-setup-error');
  container.classList.add('google-external-panel');
  container.replaceChildren(link,help);
}
function renderGoogleButton(){
  const container=$('#googleSignIn');
  if(!container||!googleIdentity||authModal.classList.contains('hidden'))return;
  const shell=container.closest('.google-button-shell');
  const available=Math.floor(shell?.getBoundingClientRect().width||0);
  if(available<200)return;
  const width=Math.max(200,Math.min(400,available));
  if(googleRenderedWidth===width&&container.querySelector('iframe'))return;
  googleRenderedWidth=width;
  container.classList.remove('google-setup-error','google-external-panel');
  container.replaceChildren();
  googleIdentity.renderButton(container,{
    type:'standard',
    theme:'outline',
    size:'large',
    text:'signin_with',
    shape:'rectangular',
    logo_alignment:'left',
    width,
    locale:'en'
  });
}
function scheduleGoogleButtonRender(){
  cancelAnimationFrame(googleRenderFrame);
  googleRenderFrame=requestAnimationFrame(()=>{
    googleRenderFrame=requestAnimationFrame(renderGoogleButton);
  });
}
async function setupGoogleSignIn(){
  const container=$('#googleSignIn');
  if(!container)return;
  if(isEmbeddedBrowser()){
    renderExternalGoogleSignIn();
    return;
  }
  if(googleIdentity){
    scheduleGoogleButtonRender();
    return;
  }
  if(!googleSetupPromise){
    googleSetupPromise=(async()=>{
      const publicClientId=(window.GIZMO?.googleClientId||'').trim();
      const [identity,config]=await Promise.all([
        waitForGoogleIdentity(),
        authApi('googleConfig').catch(error=>({error}))
      ]);
      const clientId=(config?.clientId||publicClientId).trim();
      if(!clientId)throw new Error(config?.error?.message||'Google Sign-In is not configured on the server.');
      identity.initialize({
        client_id:clientId,
        ux_mode:'popup',
        auto_select:false,
        use_fedcm_for_button:true,
        itp_support:true,
        callback:async response=>{
          $('#formNote').textContent='';
          try{
            if(!response?.credential)throw new Error('Google did not return a sign-in credential. Please try again.');
            const result=await authApi('google',{credential:response.credential});
            await login(result.user);
          }catch(error){
            $('#formNote').textContent=error.message;
          }
        }
      });
      googleIdentity=identity;
    })();
  }
  try{
    await googleSetupPromise;
    scheduleGoogleButtonRender();
  }catch(error){
    googleSetupPromise=null;
    googleRenderedWidth=0;
    container.classList.remove('google-external-panel');
    container.classList.add('google-setup-error');
    container.textContent=error.message;
  }
}
function refreshGoogleButton(){
  googleRenderedWidth=0;
  clearTimeout(googleResizeTimer);
  googleResizeTimer=setTimeout(scheduleGoogleButtonRender,120);
}
window.addEventListener('resize',refreshGoogleButton,{passive:true});
window.addEventListener('orientationchange',refreshGoogleButton,{passive:true});
function startGame(type){window.location.href=`game.html?category=${encodeURIComponent(type)}`}
renderUser();if(!state.user?.id||new URLSearchParams(location.search).get('auth')==='required')requireLogin();hydrateUser();
const joinTrigger=$('#openJoinRoom'),joinModal=$('#joinRoomModal'),joinForm=$('#joinRoomForm');if(joinTrigger){let joinCharacter=localStorage.getItem('gizmoBattleCharacter')||'profile';const joinChoices=[...document.querySelectorAll('[data-join-character]')],joinProfile=$('#joinProfileCharacter');if(state.user?.photo){joinProfile.style.backgroundImage=`url('${state.user.photo}')`;joinProfile.textContent=''}else joinProfile.textContent=(state.user?.name||'G').charAt(0).toUpperCase();const renderJoinCharacter=()=>joinChoices.forEach(choice=>choice.classList.toggle('selected',choice.dataset.joinCharacter===joinCharacter));joinChoices.forEach(choice=>choice.addEventListener('click',()=>{joinCharacter=choice.dataset.joinCharacter;localStorage.setItem('gizmoBattleCharacter',joinCharacter);renderJoinCharacter()}));renderJoinCharacter();joinTrigger.addEventListener('click',()=>{joinModal.classList.remove('hidden');$('#joinRoomNote').textContent='';setTimeout(()=>$('#homeRoomCode').focus(),0)});$('#closeJoinRoom').addEventListener('click',()=>joinModal.classList.add('hidden'));$('#homeRoomCode').addEventListener('input',event=>{event.target.value=event.target.value.replace(/\D/g,'').slice(0,6);$('#joinRoomNote').textContent=''});joinForm.addEventListener('submit',event=>{event.preventDefault();const code=$('#homeRoomCode').value.trim(),note=$('#joinRoomNote'),button=$('#joinRoomSubmit');if(!/^\d{6}$/.test(code)){note.textContent='Enter a valid 6-digit Room ID.';return}button.disabled=true;button.textContent='Joining room…';note.textContent='';window.location.href=`game.html?room=${encodeURIComponent(code)}&character=${encodeURIComponent(joinCharacter)}`})}
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
      card.tabIndex=0;
      card.setAttribute('role','link');
      card.setAttribute('aria-label',`View ${p.name}'s profile`);
      card.innerHTML=`${avatarThumb(p.photo,p.name)}<h3>${p.name}</h3><p>Quester trivia player</p><button type="button" class="${isFollowing?'following':''}">${isFollowing?'Following':'Follow'}</button>`;
      const openPlayer=()=>{window.location.href=`player.html?id=${encodeURIComponent(p.id)}`};
      card.addEventListener('click',event=>{if(!event.target.closest('button'))openPlayer()});
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPlayer()}});
      if(me){card.querySelector('button').onclick=async event=>{event.stopPropagation();try{await profileApi('follow',{id:me,target:p.id});loadPeopleHome()}catch(e){toast(e.message)}}}
      else card.querySelector('button').onclick=event=>{event.stopPropagation();openAuth('login')};
      peopleHome.append(card);
    }
  }catch(error){
    console.warn('Could not load community profiles:',error);
    peopleHome.innerHTML='<p>Players are temporarily unavailable. Please try again shortly.</p>';
  }
}
if(peopleHome){loadPeopleHome();setInterval(loadPeopleHome,8000)}
if(state.user?.id)setInterval(()=>authApi('me',{id:state.user.id}).then(d=>saveUser(d.user)).catch(()=>{}),8000)
window.addEventListener('storage',e=>{if(e.key==='gizmoUser'||e.key==='gizmoPhotoVersion'){state.user=JSON.parse(localStorage.getItem('gizmoUser')||'null');renderUser();if(peopleHome)loadPeopleHome()}});
