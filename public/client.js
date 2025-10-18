// -------------------- GLOBALS --------------------
let localStream = null;
let pcs = {};
let myId = null;
let myName = "You"; // default, will be overwritten
let socket = new WebSocket(`ws://${window.location.hostname}:${window.location.port}`);

// -------------------- SOCKET HANDLING --------------------
socket.addEventListener("open", () => console.log("WebSocket connected"));

socket.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "welcome") {
    myId = msg.id;
    renderUsers(msg.users || []);
    // Send our name to server
    socket.send(JSON.stringify({ type: "join", name: myName }));
  }

  if (msg.type === "user-list") {
    renderUsers(msg.users || []);
  }

  if (msg.type === "offer") {
    const from = msg.from;
    const pc = createPeerConnection(from, false);
    pcs[from] = pc;
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.send(JSON.stringify({ type: "answer", to: from, sdp: pc.localDescription }));
  }

  if (msg.type === "answer") {
    const pc = pcs[msg.from];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  }

  if (msg.type === "ice-candidate") {
    const pc = pcs[msg.from];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }
});

// -------------------- CAMERA --------------------
async function startCamera() {
  const videoEl = document.getElementById("localVideo");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoEl.srcObject = localStream;
    await videoEl.play();

    document.getElementById("toggleCamBtn").disabled = false;
    document.getElementById("hangupBtn").disabled = false;

    showNameOverlay("localBox", myName);
    console.log("Camera started!");
  } catch (err) {
    console.error("Camera error:", err);
    alert("Camera failed! Check permissions and reload the page.");
  }
}

// -------------------- TOGGLE CAMERA --------------------
function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;

  document.getElementById("toggleCamBtn").innerText = videoTrack.enabled ? "Turn Camera Off" : "Turn Camera On";

  const overlay = document.getElementById("localBox_name");
  if (overlay) overlay.style.display = videoTrack.enabled ? "none" : "flex";
}

// -------------------- HANG UP --------------------
function hangUp() {
  for (let id in pcs) {
    pcs[id].close();
    delete pcs[id];
    const el = document.getElementById(`remote_${id}`);
    if (el) el.remove();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  document.getElementById("toggleCamBtn").disabled = true;
  document.getElementById("hangupBtn").disabled = true;
}

// -------------------- PEER CONNECTION --------------------
function createPeerConnection(remoteId, isOffer) {
  const pc = new RTCPeerConnection();

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "ice-candidate", to: remoteId, candidate: e.candidate }));
    }
  };

  pc.ontrack = e => {
    let box = document.getElementById(`remote_${remoteId}`);
    if (!box) {
      const container = document.getElementById("videoContainer");
      box = document.createElement("div");
      box.className = "videoBox";
      box.id = `remote_${remoteId}`;

      const videoEl = document.createElement("video");
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.srcObject = e.streams[0];

      const label = document.createElement("div");
      label.className = "labelOverlay";
      label.innerText = "Remote";

      const nameOverlay = document.createElement("div");
      nameOverlay.id = `remote_${remoteId}_name`;
      nameOverlay.className = "nameBox";
      nameOverlay.innerText = "Remote";
      nameOverlay.style.display = "none";

      box.appendChild(videoEl);
      box.appendChild(label);
      box.appendChild(nameOverlay);
      container.appendChild(box);

      const videoTrack = e.streams[0].getVideoTracks()[0];
      if (!videoTrack.enabled) nameOverlay.style.display = "flex";
      videoTrack.onmute = () => nameOverlay.style.display = "flex";
      videoTrack.onunmute = () => nameOverlay.style.display = "none";
    }
  };

  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  return pc;
}

// -------------------- NAME OVERLAY --------------------
function showNameOverlay(boxId, name) {
  const box = document.getElementById(boxId);
  if (!box) return;
  let overlay = document.getElementById(`${boxId}_name`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = `${boxId}_name`;
    overlay.className = "nameBox";
    overlay.innerText = name;
    box.appendChild(overlay);
  }
  overlay.style.display = "flex";
}

// -------------------- BUTTON EVENTS --------------------
window.addEventListener("load", () => {
  myName = prompt("Enter your name:") || "You";
  document.getElementById("startBtn").addEventListener("click", startCamera);
  document.getElementById("toggleCamBtn").addEventListener("click", toggleCamera);
  document.getElementById("hangupBtn").addEventListener("click", hangUp);
});

// -------------------- USER LIST --------------------
function renderUsers(users) {
  const ul = document.getElementById("userList");
  ul.innerHTML = "";
  users.forEach(u => {
    if (u.id === myId) return;
    const li = document.createElement("li");
    li.innerText = u.name;
    li.onclick = () => startCall(u.id, u.name);
    ul.appendChild(li);
  });
}

// -------------------- START CALL --------------------
async function startCall(remoteId, remoteName) {
  if (!localStream) return alert("Start your camera first.");
  const pc = createPeerConnection(remoteId, true);
  pcs[remoteId] = pc;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.send(JSON.stringify({
    type: "offer",
    to: remoteId,
    from: myId,
    fromName: myName,
    sdp: pc.localDescription
  }));

  alert(`Calling ${remoteName}...`);
}
