const socket = io();
let token=null;
let userId=null;
let currentChannelId=null;

const messagesDiv=document.getElementById('messages');
const messageInput=document.getElementById('message');

messageInput.addEventListener('keypress', e=>{
  if(e.key==='Enter') sendMessage();
});

async function register(){
  const first=document.getElementById('first').value;
  const last=document.getElementById('last').value;
  const pw=document.getElementById('pw').value;

  const res=await fetch('/register',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({firstName:first,lastName:last,password:pw})
  });
  if(res.ok) alert('Registered! Now login.');
  else alert('Registration failed');
}

async function login(){
  const first=document.getElementById('first').value;
  const last=document.getElementById('last').value;
  const pw=document.getElementById('pw').value;

  const res=await fetch('/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({firstName:first,lastName:last,password:pw})
  });
  const data=await res.json();
  if(!data.token){alert('Login failed');return;}
  token=data.token;
  userId=data.userId;
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  currentChannelId='global';
  socket.emit('joinChannel', currentChannelId);
  loadServers();
}

function sendMessage(){
  const text=messageInput.value.trim();
  if(!text||!currentChannelId) return;
  socket.emit('sendMessage',{channelId:currentChannelId,userId,text});
  messageInput.value='';
}

socket.on('message', data=>{
  const time=new Date().toLocaleTimeString();
  const div=document.createElement('div');
  div.innerHTML=`<b>${data.user.substring(0,6)}</b> <span style="font-size:10px;color:gray">${time}</span><br>${data.text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop=messagesDiv.scrollHeight;
});

messageInput.addEventListener('input', ()=>{
  if(currentChannelId) socket.emit('typing', currentChannelId);
});
socket.on('showTyping', user=>{
  const typingDiv=document.getElementById('typing');
  if(!typingDiv) return;
  typingDiv.innerText=`${user} is typing...`;
  setTimeout(()=>typingDiv.innerText='',1500);
});

async function loadServers(){
  try{
    const res=await fetch('/servers',{headers:{Authorization:`Bearer ${token}`}});
    const servers=await res.json();
    const container=document.getElementById('servers');
    container.innerHTML='';
    servers.forEach(s=>{
      const div=document.createElement('div');
      div.innerText=s.name;
      div.onclick=()=>{
        currentChannelId=s._id;
        socket.emit('joinChannel', currentChannelId);
        messagesDiv.innerHTML='';
      };
      container.appendChild(div);
    });
  }catch{console.log('Failed to load servers');}
}

// WebRTC
let peerConnection;
async function startVoice(){
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
  document.getElementById('localVideo').srcObject=stream;
  peerConnection=new RTCPeerConnection();
  stream.getTracks().forEach(track=>peerConnection.addTrack(track,stream));
  peerConnection.ontrack=e=>document.getElementById('remoteVideo').srcObject=e.streams[0];
  peerConnection.onicecandidate=e=>{if(e.candidate)socket.emit('ice-candidate',{candidate:e.candidate,channelId:currentChannelId});};
  const offer=await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer',{offer,channelId:currentChannelId});
}
socket.on('offer', async data=>{
  if(!peerConnection) peerConnection=new RTCPeerConnection();
  await peerConnection.setRemoteDescription(data.offer);
  const answer=await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer',{answer,channelId:currentChannelId});
});
socket.on('answer', data=>{if(peerConnection) peerConnection.setRemoteDescription(data.answer);});
socket.on('ice-candidate', data=>{if(peerConnection) peerConnection.addIceCandidate(data.candidate);});