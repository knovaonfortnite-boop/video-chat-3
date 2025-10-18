let localStream;
let pcs = {};
let myId;
let myName = prompt("Enter your name") || "You";

const socket = new WebSocket(`ws://${window.location.hostname}:10000`);

socket.onopen = () => {
  console.log("Connected to WS");
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

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;
    document.getElementById("toggleCamBtn").disabled = false;
    document.getElementById("hangupBtn").disabled = false;
  } catch (err) {
    alert("Camera failed. Make sure the page is served via LAN IP and not localhost.");
  }
}

function createPeerConnection(remoteId, isOffer, remoteName="Someone") {
  const pc = new RTCPeerConnection();
  pc.onicecandidate = e => {
    if (e.candidate) socket.send(JSON.stringify({ type: "ice-candidate", to: remoteId, candidate: e.candidate }));
  };

  pc.ontrack = e => {
    let vid = document.createElement("video");
    vid.autoplay = true;
    vid.playsInline = true;
    vid.srcObject = e.streams[0];
    document.getElementById("videoContainer").appendChild(vid);
  };

  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  return pc;
}

function renderUsers(users) {
  const ul = document.getElementById("userList");
  ul.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.innerText = u.id === myId ? "You" : u.name;
    if (u.id !== myId) li.onclick = () => startCall(u.id, u.name);
    ul.appendChild(li);
  });
}

async function startCall(remoteId, remoteName) {
  if (!localStream) return alert("Start camera first");
  const pc = createPeerConnection(remoteId, true, remoteName);
  pcs[remoteId] = pc;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: "offer", to: remoteId, from: myId, fromName: myName, sdp: pc.localDescription }));
}

document.getElementById("startBtn").onclick = startCamera;
document.getElementById("toggleCamBtn").onclick = () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
};
document.getElementById("hangupBtn").onclick = () => {
  Object.values(pcs).forEach(pc => pc.close());
  pcs = {};
  if (localStream) localStream.getTracks().forEach(t => t.stop());
};
