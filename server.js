const videoContainer = document.getElementById('videoContainer');
const localVideo = document.getElementById('localVideo');
const localLabel = document.getElementById('localLabel');
const localWrapper = document.getElementById('localWrapper');

const startBtn = document.getElementById('startBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const status = document.getElementById('status');

// Sidebar for online users
const sidebar = document.createElement('div');
sidebar.id = 'onlineSidebar';
sidebar.style.cssText = `
  position: absolute;
  top: 20px;
  right: 20px;
  width: 180px;
  background: rgba(0,0,0,0.7);
  padding: 10px;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  max-height: 80vh;
  overflow-y: auto;
`;
document.body.appendChild(sidebar);

let localStream;
let ws;
let myId;
let username;
let inCall = false;
let camOn = true;
const peerConnections = new Map();
const remoteVideos = new Map();
const onlineUsers = new Map();

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function updateStatus(msg) { status.textContent = msg; }
function updateSidebar() {
  sidebar.innerHTML = '<strong>Online Users:</strong><br>';
  onlineUsers.forEach((name, id) => {
    const userDiv = document.createElement('div');
    userDiv.textContent = name + (id === myId ? ' (You)' : '');
    userDiv.style.cursor = 'pointer';
    userDiv.onclick = () => {
      if(id !== myId) startPrivateCall(id);
    };
    sidebar.appendChild(userDiv);
  });
}

async function startCamera() {
  username = prompt("Enter your name:");
  if (!username) return alert("You must enter a name!");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localLabel.textContent = username;
    startBtn.disabled = true;
    toggleCamBtn.disabled = false;
    updateStatus("Camera started - Connecting to server...");
    connectWebSocket();
  } catch (err) {
    console.error(err);
    updateStatus("Error accessing camera/microphone");
  }
}

toggleCamBtn.addEventListener('click', () => {
  camOn = !camOn;
  localStream.getVideoTracks()[0].enabled = camOn;
  toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";
  if (!camOn) {
    localVideo.style.display = 'none';
    localWrapper.style.background = '#'+Math.floor(Math.random()*16777215).toString(16);
  } else {
    localVideo.style.display = 'block';
    localWrapper.style.background = '#000';
  }
});

function connectWebSocket() {
  ws = new WebSocket('wss://video-chat-3-4.onrender.com');

  ws.onopen = () => { updateStatus('Connected to server'); };
  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      switch(msg.type){
        case 'welcome':
          myId = msg.id;
          joinBtn.disabled = false;
          break;
        case 'existing-participants':
          msg.participants.forEach(async p => {
            onlineUsers.set(p.id, p.name);
            updateSidebar();
            await createPeerConnection(p.id, true);
          });
          break;
        case 'new-participant':
          onlineUsers.set(msg.id, msg.name);
          updateSidebar();
          break;
        case 'participant-left':
          handleParticipantLeft(msg.id);
          onlineUsers.delete(msg.id);
          updateSidebar();
          break;
        case 'offer': await handleOffer(msg.offer, msg.from); break;
        case 'answer': await handleAnswer(msg.answer, msg.from); break;
        case 'ice-candidate': await handleIceCandidate(msg.candidate, msg.from); break;
      }
    } catch(e){ console.error(e); }
  };
  ws.onerror = () => updateStatus("WebSocket error");
  ws.onclose = () => updateStatus("Disconnected from server");
}

async function createPeerConnection(peerId, isInitiator) {
  const pc = new RTCPeerConnection(config);
  peerConnections.set(peerId, pc);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = e => addRemoteVideo(peerId, e.streams[0]);
  pc.onicecandidate = e => { if(e.candidate) ws.send(JSON.stringify({ type:'ice-candidate', candidate:e.candidate, to:peerId })); };

  if(isInitiator){
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type:'offer', offer, to:peerId }));
  }
  return pc;
}

async function handleOffer(offer, fromId){
  let pc = peerConnections.get(fromId);
  if(!pc) pc = await createPeerConnection(fromId,false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type:'answer', answer, to:fromId }));
}

async function handleAnswer(answer, fromId){
  const pc = peerConnections.get(fromId);
  if(pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate(candidate, fromId){
  const pc = peerConnections.get(fromId);
  if(pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

function addRemoteVideo(peerId, stream){
  if(remoteVideos.has(peerId)) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';
  wrapper.id = `video-${peerId}`;
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = onlineUsers.get(peerId) || `Participant ${peerId.substring(0,4)}`;
  wrapper.appendChild(video);
  wrapper.appendChild(label);
  videoContainer.appendChild(wrapper);
  remoteVideos.set(peerId, wrapper);
}

function handleParticipantLeft(peerId){
  const pc = peerConnections.get(peerId); if(pc) pc.close(); peerConnections.delete(peerId);
  const elem = remoteVideos.get(peerId); if(elem) elem.remove(); remoteVideos.delete(peerId);
}

function joinCall(){
  inCall = true;
  joinBtn.disabled = true; leaveBtn.disabled = false;
  ws.send(JSON.stringify({ type:'join', name:username }));
  updateStatus('Joined call');
}

function leaveCall(){
  inCall = false;
  ws.send(JSON.stringify({ type:'leave' }));
  peerConnections.forEach(pc => pc.close()); peerConnections.clear();
  remoteVideos.forEach(e => e.remove()); remoteVideos.clear();
  joinBtn.disabled = false; leaveBtn.disabled = true;
  updateStatus('Left call');
}

// Simple private call (initiates direct call)
function startPrivateCall(peerId){
  if(!peerConnections.has(peerId)) createPeerConnection(peerId,true);
  alert(`Starting private call with ${onlineUsers.get(peerId)}`);
}

startBtn.addEventListener('click', startCamera);
joinBtn.addEventListener('click', joinCall);
leaveBtn.addEventListener('click', leaveCall);
