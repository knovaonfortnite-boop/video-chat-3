const videoContainer = document.getElementById('videoContainer');
const localVideo = document.getElementById('localVideo');
const localLabel = document.getElementById('localLabel');
const localWrapper = document.getElementById('localWrapper');

const startBtn = document.getElementById('startBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const status = document.getElementById('status');
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const onlineList = document.getElementById('onlineUsers');

let localStream;
let ws;
let myId;
let inCall = false;
let camOn = true;
const peerConnections = new Map();
const remoteVideos = new Map();
const onlineUsers = new Map();

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function updateStatus(msg) { status.textContent = msg; }

async function startCamera() {
    const username = prompt("Enter your name:");
    if (!username) return alert("You must enter a name!");
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localLabel.textContent = username;
        startBtn.disabled = true;
        toggleCamBtn.disabled = false;
        updateStatus("Camera started - Connecting to server...");
        connectWebSocket(username);
    } catch (err) {
        console.error(err);
        updateStatus("Error accessing camera/microphone");
    }
}

// Toggle camera and apply random color when off
toggleCamBtn.addEventListener('click', () => {
    camOn = !camOn;
    localStream.getVideoTracks()[0].enabled = camOn;
    toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";

    if (!camOn) {
        localVideo.style.display = 'none';
        localWrapper.style.background = '#' + Math.floor(Math.random() * 16777215).toString(16);
    } else {
        localVideo.style.display = 'block';
        localWrapper.style.background = '#000';
    }
});

// Toggle sidebar visibility
sidebarToggleBtn.addEventListener('click', () => {
    onlineList.classList.toggle('hidden');
});

// WebSocket connection and messaging
function connectWebSocket(username) {
    ws = new WebSocket('wss://video-chat-3-4.onrender.com'); // replace with your server

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus('Connected to server');
        ws.send(JSON.stringify({ type: 'register', username }));
    };

    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'welcome':
                    myId = message.id;
                    joinBtn.disabled = false;
                    break;
                case 'existing-participants':
                    for (const id of message.participants) await createPeerConnection(id, true);
                    break;
                case 'new-participant':
                    addOnlineUser(message.id, message.username);
                    break;
                case 'participant-left':
                    removeOnlineUser(message.id);
                    handleParticipantLeft(message.id);
                    break;
                case 'offer':
                    await handleOffer(message.offer, message.from);
                    break;
                case 'answer':
                    await handleAnswer(message.answer, message.from);
                    break;
                case 'ice-candidate':
                    await handleIceCandidate(message.candidate, message.from);
                    break;
                case 'private-call':
                    alert(`Incoming private call from ${message.fromName}`);
                    break;
            }
        } catch (err) {
            console.error(err);
        }
    };

    ws.onerror = () => updateStatus("WebSocket error");
    ws.onclose = () => updateStatus("Disconnected from server");
}

// Peer connection handling
async function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(config);
    peerConnections.set(peerId, pc);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => addRemoteVideo(peerId, event.streams[0]);

    pc.onicecandidate = (e) => {
        if (e.candidate) ws.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate, to: peerId }));
    };

    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', offer, to: peerId }));
    }

    return pc;
}

async function handleOffer(offer, fromId) {
    let pc = peerConnections.get(fromId);
    if (!pc) pc = await createPeerConnection(fromId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', answer, to: fromId }));
}

async function handleAnswer(answer, fromId) {
    const pc = peerConnections.get(fromId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate(candidate, fromId) {
    const pc = peerConnections.get(fromId);
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

// Video display
function addRemoteVideo(peerId, stream) {
    if (remoteVideos.has(peerId)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.id = `video-${peerId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `Participant ${peerId.substring(0, 4)}`;

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videoContainer.appendChild(wrapper);
    remoteVideos.set(peerId, wrapper);
}

// Online users list
function addOnlineUser(id, username) {
    if (onlineUsers.has(id)) return;

    const li = document.createElement('li');
    li.textContent = username;
    li.id = `user-${id}`;
    li.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'private-call', to: id }));
        alert(`Calling ${username}...`);
    });

    onlineList.appendChild(li);
    onlineUsers.set(id, li);
}

function removeOnlineUser(id) {
    const li = onlineUsers.get(id);
    if (li) li.remove();
    onlineUsers.delete(id);
}

// Handle participant leaving
function handleParticipantLeft(peerId) {
    const pc = peerConnections.get(peerId);
    if (pc) pc.close();
    peerConnections.delete(peerId);

    const elem = remoteVideos.get(peerId);
    if (elem) elem.remove();
    remoteVideos.delete(peerId);
}

// Join/Leave call
function joinCall() {
    inCall = true;
    joinBtn.disabled = true;
    leaveBtn.disabled = false;
    ws.send(JSON.stringify({ type: 'join' }));
    updateStatus('Joining call...');
}

function leaveCall() {
    inCall = false;
    ws.send(JSON.stringify({ type: 'leave' }));
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    remoteVideos.forEach(e => e.remove());
    remoteVideos.clear();
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    updateStatus('Left call');
}

// Event listeners
startBtn.addEventListener('click', startCamera);
joinBtn.addEventListener('click', joinCall);
leaveBtn.addEventListener('click', leaveCall);
