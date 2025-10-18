let localStream = null;
let pcs = {};
let myId = null;
let myName = prompt("Enter your name:") || "You";
let socket = null;

function connectSocket() {
  socket = new WebSocket(`ws://${window.location.hostname}:10000`);

  socket.addEventListener("open", () => {
    console.log("WebSocket connected");
    if (myId !== null) {
      socket.send(JSON.stringify({ type: "join", name: myName }));
    }
  });

  socket.addEventListener("message", handleMessage);

  socket.addEventListener("close", () => {
    console.warn("Disconnected! Reconnecting...");
    setTimeout(connectSocket, 2000);
  });

  socket.addEventListener("error", console.error);
}

function handleMessage(ev) {
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
    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(async () => {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", to: msg.from, sdp: pc.localDescription }));
    });
  }

  if (msg.type === "answer") {
    const pc = pcs[msg.from];
    if (pc) pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  }

  if (msg.type === "ice-candidate") {
    const pc = pcs[msg.from];
    if (pc) pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }
}

connectSocket();

async function startCamera() {
  const videoEl = document.getElementById("localVideo");
  if (!videoEl) return alert("Video element missing");

  videoEl.muted = true;
  videoEl.autoplay = true;
  videoEl.playsInline = true;

  try {
    await new Promise(r => setTimeout(r, 400));
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoEl.srcObject = localStream;
    await videoEl.play();

    document.getElementById("toggleCamBtn").disabled = false;
    document.getElementById("hangupBtn").disabled = false;
    showLocalNameOverlay(myName);
  } catch (err) {
    console.error("Camera error:", err);
    alert("Camera failed. Make sure no other app is using it.");
  }
}

function toggleCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.getElementById("toggleCamBtn").innerText = track.enabled ? "Turn Camera Off" : "Turn Camera On";
  const overlay = document.getElementById("localBox_name");
  if (overlay) overlay.style.display = track.enabled ? "none" : "flex";
}

function hangUp() {
  for (let id in pcs) {
    pcs[id].close();
    delete pcs[id];
    const el = document.getElementById(`remote_${id}`);
    if (el) el.remove();
  }
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null;
  document.getElementById("toggleCamBtn").disabled = true;
  document.getElementById("hangupBtn").disabled = true;
}

function createPeerConnection(remoteId, isOffer, remoteName = "Someone") {
  const pc = new RTCPeerConnection();

  pc.onicecandidate = e => {
    if (e.candidate) socket.send(JSON.stringify({ type: "ice-candidate", to: remoteId, candidate: e.candidate }));
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

      const nameOverlay = document.createElement("div");
      nameOverlay.id = `remote_${remoteId}_name`;
      nameOverlay.className = "nameBox";
      nameOverlay.innerText = remoteName;
     
