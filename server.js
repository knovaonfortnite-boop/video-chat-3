const videoContainer = document.getElementById('videoContainer');
const localVideo = document.getElementById('localVideo');
const localLabel = document.getElementById('localLabel');
const localWrapper = document.getElementById('localWrapper');

const startBtn = document.getElementById('startBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const status = document.getElementById('status');

let localStream;
let ws;
let myId;
let camOn = true;

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
    updateStatus("Camera started - ready to join call");

    // Setup WebSocket
    ws = new WebSocket('wss://video-chat-3-4.onrender.com'); // your Render URL

    ws.onopen = () => updateStatus("Connected to server");
    ws.onclose = () => updateStatus("Disconnected from server");
    ws.onerror = () => updateStatus("WebSocket error");
  } catch(err) {
    console.error(err);
    updateStatus("Error accessing camera/microphone");
  }
}

toggleCamBtn.addEventListener('click', () => {
  camOn = !camOn;
  if (localStream && localStream.getVideoTracks().length) {
    localStream.getVideoTracks()[0].enabled = camOn;
  }

  toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";

  if (!camOn) {
    localVideo.style.display = 'none';
    localWrapper.style.background = '#'+Math.floor(Math.random()*16777215).toString(16);
  } else {
    localVideo.style.display = 'block';
    localWrapper.style.background = '#000';
  }
});

startBtn.addEventListener('click', startCamera);
