const user=JSON.parse(localStorage.getItem('gizmoUser')||'null');
if (!user?.id) {
  try { sessionStorage.setItem('questerAuthReturn', 'dashboard.html'); } catch (e) {}
  location.replace('index.html?auth=required');
}
let currentUserId=user?.id||'';

async function authApi(action,body={}){const r=await fetch('auth.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Request failed');return d}
async function profileApi(action,body={}){const r=await fetch('profiles.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Request failed');return d}

function photoUrl(photo){
  if(!photo)return'';
  if(photo.startsWith('data:')||photo.startsWith('http'))return photo;
  return photo;
}

function showPhotoToast(message){
  let t=document.querySelector('.photo-toast');
  if(!t){t=document.createElement('p');t.className='photo-toast';document.body.append(t)}
  t.textContent=message;
  clearTimeout(showPhotoToast.timer);
  showPhotoToast.timer=setTimeout(()=>t.remove(),3200);
}

function setAvatar(photo,name){
  const avatar=document.querySelector('#avatar');
  const url=photoUrl(photo);
  if(url){
    avatar.textContent='';
    avatar.style.backgroundImage=`url('${url}')`;
    avatar.style.backgroundColor='transparent';
    avatar.style.backgroundSize='100% 100%';
    avatar.style.backgroundPosition='center';
  }else{
    avatar.style.backgroundImage='';
    avatar.style.backgroundColor='';
    avatar.style.backgroundSize='';
    avatar.textContent=(name||'G').charAt(0).toUpperCase();
  }
}

function broadcastPhotoUpdate(user){
  localStorage.setItem('gizmoUser',JSON.stringify(user));
  localStorage.setItem('gizmoPhotoVersion',String(Date.now()));
}

function resizeImage(file,maxSize=512,quality=0.85){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const blobUrl=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(blobUrl);
      let{width,height}=img;
      const scale=Math.min(maxSize/width,maxSize/height,1);
      width=Math.max(1,Math.round(width*scale));
      height=Math.max(1,Math.round(height*scale));
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      canvas.getContext('2d').drawImage(img,0,0,width,height);
      canvas.toBlob(blob=>{
        if(blob)resolve(blob);
        else reject(new Error('Could not process this image.'));
      },'image/jpeg',quality);
    };
    img.onerror=()=>{URL.revokeObjectURL(blobUrl);reject(new Error('Invalid image file.'))};
    img.src=blobUrl;
  });
}

async function uploadPhoto(file){
  if(!currentUserId)throw new Error('Please log in again.');
  const blob=await resizeImage(file);
  const form=new FormData();
  form.append('id',currentUserId);
  form.append('photo',blob,'avatar.jpg');
  const r=await fetch('upload_photo.php',{method:'POST',body:form});
  const d=await r.json();
  if(!r.ok||d.error)throw new Error(d.error||'Upload failed.');
  return d.user;
}

function list(id,people,empty){
  const target=document.querySelector(id);
  target.innerHTML='';
  if(!people.length){const item=document.createElement('li');item.className='empty';item.textContent=empty;target.append(item);return}
  people.forEach(person=>{
    const item=document.createElement('li');
    item.className='person-row';
    const av=document.createElement('span');
    av.className='person-avatar';
    if(person.photo){av.style.backgroundImage=`url('${person.photo}')`;av.textContent=''}else{av.textContent=person.name.charAt(0).toUpperCase()}
    const link=document.createElement('a');
    link.href=`player.html?id=${person.id}`;
    link.textContent=person.name;
    item.append(av,link);
    target.append(item);
  });
}

function render(data,social){
  const stats=data.stats||{};
  const name=data.name||'Player';
  currentUserId=data.id||currentUserId;
  setAvatar(data.photo,name);
  document.querySelector('#welcomeName').textContent=`Hey, ${name}!`;
  document.querySelector('#totalScore').textContent=stats.totalScore||0;
  document.querySelector('#totalGames').textContent=stats.totalGames||0;
  document.querySelector('#accuracy').textContent=stats.answers?`${Math.round(stats.correct/stats.answers*100)}%`:'0%';
  document.querySelector('#streak').textContent=stats.streak||0;
  document.querySelector('#followingCount').textContent=social.following.length;
  document.querySelector('#followersCount').textContent=social.followers.length;
  list('#followingList',social.following,'Follow players from a game leaderboard.');
  list('#followersList',social.followers,'No followers yet — invite friends to play.');
}

async function refreshSocial(){
  if(!currentUserId)return;
  try{
    const social=await authApi('social',{id:currentUserId});
    list('#followingList',social.following,'Follow players from a game leaderboard.');
    list('#followersList',social.followers,'No followers yet — invite friends to play.');
  }catch{}
}

async function init(){
  if(!user?.id){location.replace('index.html');return}
  currentUserId=user.id;
  document.querySelector('#welcomeName').textContent='Loading your profile…';
  try{
    const me=await authApi('me',{id:user.id});
    const social=await authApi('social',{id:user.id});
    localStorage.setItem('gizmoUser',JSON.stringify(me.user));
    render(me.user,social);
  }catch(e){
    document.querySelector('#welcomeName').textContent='Could not load profile';
    document.querySelector('.dashboard').insertAdjacentHTML('beforeend',`<p class="form-note center">${e.message}. <a href="index.html">Go home and log in again</a></p>`);
  }
}

init();
setInterval(refreshSocial,8000);

const photoBtn=document.querySelector('#changePhoto');
const photoInput=document.querySelector('#photoInput');

const cropStyles=document.createElement('link');
cropStyles.rel='stylesheet';
cropStyles.href='photo-crop.css?v=1';
document.head.append(cropStyles);

const cropModal=document.createElement('div');
cropModal.className='photo-crop-modal hidden';
cropModal.innerHTML=`<section class="photo-crop-panel" role="dialog" aria-modal="true" aria-labelledby="cropTitle"><h2 id="cropTitle">Position your photo</h2><p>Drag the photo to choose what appears in your profile.</p><div class="photo-crop-frame"><img alt="Photo crop preview" /></div><input class="photo-crop-zoom" aria-label="Zoom photo" type="range" min="1" max="3" step="0.01" value="1" /><div class="photo-crop-actions"><button class="button cancel-crop" type="button">Cancel</button><button class="button save-crop" type="button">Use photo</button></div></section>`;
document.body.append(cropModal);

const cropFrame=cropModal.querySelector('.photo-crop-frame');
const cropImage=cropModal.querySelector('img');
const cropZoom=cropModal.querySelector('.photo-crop-zoom');
const saveCrop=cropModal.querySelector('.save-crop');
let cropState=null;

function clampCrop(){const s=cropState.size;cropState.x=Math.min(0,Math.max(s-cropState.image.width*cropState.scale,cropState.x));cropState.y=Math.min(0,Math.max(s-cropState.image.height*cropState.scale,cropState.y))}
function drawCropPreview(){cropImage.style.width=`${cropState.image.width*cropState.scale}px`;cropImage.style.height=`${cropState.image.height*cropState.scale}px`;cropImage.style.left=`${cropState.x}px`;cropImage.style.top=`${cropState.y}px`}
function closeCropper(){if(cropState?.url)URL.revokeObjectURL(cropState.url);cropState=null;cropModal.classList.add('hidden')}
function openCropper(file){
  if(cropState)closeCropper();
  const url=URL.createObjectURL(file),image=new Image();
  image.onload=()=>{cropModal.classList.remove('hidden');const size=cropFrame.getBoundingClientRect().width,minScale=Math.max(size/image.width,size/image.height);cropState={url,image,size,minScale,scale:minScale,x:(size-image.width*minScale)/2,y:(size-image.height*minScale)/2};cropImage.src=url;cropZoom.value='1';drawCropPreview()};
  image.onerror=()=>{URL.revokeObjectURL(url);showPhotoToast('Could not open this image.')};
  image.src=url;
}
cropZoom.addEventListener('input',()=>{if(!cropState)return;const oldScale=cropState.scale,centerX=(cropState.size/2-cropState.x)/oldScale,centerY=(cropState.size/2-cropState.y)/oldScale;cropState.scale=cropState.minScale*Number(cropZoom.value);cropState.x=cropState.size/2-centerX*cropState.scale;cropState.y=cropState.size/2-centerY*cropState.scale;clampCrop();drawCropPreview()});
let dragStart=null;
cropFrame.addEventListener('pointerdown',event=>{if(!cropState)return;dragStart={x:event.clientX,y:event.clientY,photoX:cropState.x,photoY:cropState.y};cropFrame.setPointerCapture(event.pointerId)});
cropFrame.addEventListener('pointermove',event=>{if(!dragStart||!cropState)return;cropState.x=dragStart.photoX+event.clientX-dragStart.x;cropState.y=dragStart.photoY+event.clientY-dragStart.y;clampCrop();drawCropPreview()});
cropFrame.addEventListener('pointerup',()=>{dragStart=null});cropFrame.addEventListener('pointercancel',()=>{dragStart=null});
cropModal.querySelector('.cancel-crop').addEventListener('click',closeCropper);
saveCrop.addEventListener('click',async()=>{if(!cropState)return;saveCrop.disabled=true;saveCrop.textContent='Saving…';try{const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),ratio=512/cropState.size;canvas.width=canvas.height=512;context.drawImage(cropState.image,cropState.x*ratio,cropState.y*ratio,cropState.image.width*cropState.scale*ratio,cropState.image.height*cropState.scale*ratio);const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not crop this photo.')),'image/jpeg',.9));const updated=await uploadPhoto(blob);broadcastPhotoUpdate(updated);setAvatar(updated.photo,updated.name);closeCropper();showPhotoToast('Profile photo updated!');refreshSocial()}catch(e){showPhotoToast(e.message)}finally{saveCrop.disabled=false;saveCrop.textContent='Use photo'}});

/* Capture this before the original upload handler so every selected image opens the crop tool. */
photoInput.addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){event.stopImmediatePropagation();showPhotoToast('Please choose an image file.');return}event.stopImmediatePropagation();event.target.value='';openCropper(file)},true);

photoBtn.addEventListener('click',()=>photoInput.click());

photoInput.addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  if(!file.type.startsWith('image/')){showPhotoToast('Please choose an image file.');return}
  photoBtn.disabled=true;
  photoBtn.textContent='Uploading…';
  try{
    const updated=await uploadPhoto(file);
    broadcastPhotoUpdate(updated);
    setAvatar(updated.photo,updated.name);
    showPhotoToast('Profile photo updated! Others will see it too.');
    refreshSocial();
  }catch(e){
    showPhotoToast(e.message);
  }finally{
    photoBtn.disabled=false;
    photoBtn.textContent='Change photo';
  }
});

document.querySelector('#logout').addEventListener('click',()=>{localStorage.removeItem('gizmoUser');location.href='index.html'});
