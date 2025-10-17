const socket = io();
let localStream, remoteStream, pc;
let camOn = true;
let username;
let currentCall = null;

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCamBtn = document.getElementById("startCamBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const status = document.getElementById("status");

toggleSidebarBtn.onclick = () => {
  sidebar.style.display = sidebar.style.display === "none" ? "flex" : "none";
};

async function startCamera() {
  username = prompt("Enter your name:") || "User";
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startCamBtn.disabled = true;
    toggleCamBtn.disabled = false;
    status.textContent = "Camera started. Connecting...";
    socket.emit("join", username);
  } catch (err) {
    console.error(err);
    status.textContent = "Camera error";
  }
}

toggleCamBtn.onclick = () => {
  camOn = !camOn;
  localStream.getVideoTracks()[0].enabled = camOn;
  toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";
  localVideo.style.display = camOn ? "block" : "none";
  if (!camOn) {
    localVideo.style.background = "#" + Math.floor(Math.random() * 16777215).toString(16);
  }
};

socket.on("update-users", (users) => {
  sidebar.innerHTML = "<h3>Online Users</h3>";
  for (const [id, name] of Object.entries(users)) {
    if (id === socket.id) continue;
    const div = document.createElement("div");
    div.textContent = name;
    div.style.padding = "8px";
    div.style.cursor = "pointer";
    div.onclick = () => startCall(id);
    sidebar.appendChild(div);
  }
});

async function startCall(targetId) {
  pc = createPeer(targetId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("call-user", { to: targetId, offer });
}

socket.on("incoming-call", async ({ from, offer, username }) => {
  const accept = confirm(`${username} is calling you. Accept?`);
  if (!accept) return;
  pc = createPeer(from);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer-call", { to: from, answer });
});

socket.on("call-answered", async ({ from, answer }) => {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async ({ from, candidate }) => {
  if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
});

function createPeer(targetId) {
  const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  localStream.getTracks().forEach((t) => peer.addTrack(t, localStream));
  peer.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  peer.onicecandidate = (event) => {
    if (event.candidate) socket.emit("ice-candidate", { to: targetId, candidate: event.candidate });
  };
  return peer;
}

startCamBtn.onclick = startCamera;
