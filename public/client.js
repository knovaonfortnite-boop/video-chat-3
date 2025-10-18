let localStream;
let pcs = {};
let myId;
let myName = prompt("Enter your name") || "You";
let socket;
let reconnectInterval;

function connectWS() {
  socket = new WebSocket(`ws://${window.location.hostname}:10000`);

  socket.onopen = () => {
    console.log("WS connected");
    clearInterval(reconnectInterval); // stop reconnect attempts
    if (myId) socket.send(JSON.stringify({ type: "join", name: myName }));
  };

  socket.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === "welcome") {
      myId = msg.id;
      socket.send(JSON.stringify({ type: "join", name: myName }));
      renderUsers(msg.users || []);
    }

    if (msg.type === "user-list") renderUsers(msg.users || []);

    if (msg.type === "offer") {
      const pc = createPeerConnection(msg.from, false, msg.fromName);
      pcs[msg.from] = pc;
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", to: msg.from, sdp: pc.localDescription }));
    }

    if (msg.type === "answer") {
      const pc = pcs[msg.from];
      if (pc) await pc.setRemoteDescription(msg.sdp);
    }

    if (msg.type === "ice-candidate") {
      const pc = pcs[msg.from];
      if (pc) await pc.addIceCandidate(msg.candidate);
    }
  };

  socket.onclose = () => {
    console.log("WS disconnected");
    alert("⚠️ You got disconnected from the server. Reconnecting...");
    reconnectInterval = setInterval(connectWS, 3000); // try reconnect every 3 sec
  };

  socket.onerror = (err) => {
    console.log("WS error", err);
    socket.close();
  };
}

// --- Camera functions ---
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;
    document.getElementById("toggleCamBtn").disabled = false;
    document.getElementById("hangupBtn").disabled = false;
  } catch (err) {
    alert("Camera failed. Serve via LAN IP and reload.");
  }
}

function toggleCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.getElementById("toggleCamBtn").innerText = track.enabled ? "Turn Camera Off" : "Turn Camera On";
}

// --- Peer connection ---
function createPeerConnection(remoteId, isOffer, remoteName = "Someone") {
  const pc = new RTCPeerConnection();

  pc.onicecandidate = e => {
    if (e.candidate) socket.send(JSON.stringify({ type: "ice-candidate", to: remoteId, candidate: e.candidate }));
  };

  pc.ontrack = e => {
    const container = document.getElementById("videoContainer");
    let box = document.getElementById(`remote_${remoteId}`);
    if (!box) {
      box = document.createElement("div");
      box.className = "videoBox";
      box.id = `remote_${remoteId}`;
      container.appendChild(box);

      const vid = document.createElement("video");
      vid.autoplay = true;
      vid.playsInline = true;
      vid.srcObject = e.streams[0];
      box.appendChild(vid);

      const nameBox = document.createElement("div");
      nameBox.className = "nameBox";
      nameBox.innerText = remoteName;
      box.appendChild(nameBox);
    }
  };

  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  return pc;
}

// --- Render online users ---
function renderUsers(users) {
  const ul = document.getElementById("userList");
  ul.innerHTML = "";

  // Sort: You first
  users.sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : 0));

  users.forEach(u => {
    const li = document.createElement("li");
    li.innerText = u.id === myId ? "You" : u.name;
    li.style.fontWeight = u.id === myId ? "700" : "400";
    if (u.id !== myId) li.onclick = () => startCall(u.id, u.name);
    ul.appendChild(li);
  });
}

// --- Call functions ---
async function startCall(remoteId, remoteName) {
  if (!localStream) return alert("Start camera first");
  const pc = createPeerConnection(remoteId, true, remoteName);
  pcs[remoteId] = pc;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: "offer", to: remoteId, from: myId, fromName: myName, sdp: pc.localDescription }));
}

// --- Hang up ---
function hangUp() {
  Object.values(pcs).forEach(pc => pc.close());
  pcs = {};
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  document.getElementById("toggleCamBtn").disabled = true;
  document.getElementById("hangupBtn").disabled = true;
}

// --- Button events ---
document.getElementById("startBtn").onclick = startCamera;
document.getElementById("toggleCamBtn").onclick = toggleCamera;
document.getElementById("hangupBtn").onclick = hangUp;

// --- Start WebSocket connection ---
connectWS();
