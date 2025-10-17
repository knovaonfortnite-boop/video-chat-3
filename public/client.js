const socket = io();
let localStream;
let peerConnection;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const usernameInput = document.getElementById("username");
const joinBtn = document.getElementById("joinBtn");
const usersDiv = document.getElementById("users");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

joinBtn.onclick = async () => {
  const username = usernameInput.value.trim();
  if (!username) return alert("Enter a username!");
  socket.emit("join", username);
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
};

socket.on("users", (users) => {
  usersDiv.innerHTML = "<h3>Online Users:</h3>";
  Object.entries(users).forEach(([id, name]) => {
    if (id === socket.id) return;
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.onclick = () => callUser(id);
    usersDiv.appendChild(btn);
  });
});

socket.on("incoming-call", async (fromId) => {
  await startCall(fromId, false);
});

socket.on("offer", async ({ sdp, from }) => {
  if (!peerConnection) await startCall(from, false);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { sdp: answer, target: from });
});

socket.on("answer", async ({ sdp }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
});

async function callUser(id) {
  await startCall(id, true);
}

async function startCall(targetId, isCaller) {
  peerConnection = new RTCPeerConnection(config);

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) return;
    if (isCaller) {
      socket.emit("offer", { sdp: peerConnection.localDescription, target: targetId });
    }
  };

  if (isCaller) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
  }
}
