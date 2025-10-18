// client.js
const WS_URL = `wss://${window.location.host}`; // works on Render domain
const socket = new WebSocket(WS_URL);

const startBtn = document.getElementById("startBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const hangupBtn = document.getElementById("hangupBtn");
const localVideo = document.getElementById("localVideo");
const localBox = document.getElementById("localBox");
const localLabel = document.getElementById("localLabel");
const userList = document.getElementById("userList");
const closeSidebar = document.getElementById("closeSidebar");
const videoContainer = document.getElementById("videoContainer");

let myId = null;
let myName = null;
let localStream = null;
let camOn = true;
let pcs = {}; // peer connections keyed by remoteId
const ICE_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// helper: random color
function randomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

// socket handlers
socket.addEventListener("open", () => console.log("ws open"));
socket.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "welcome") {
    myId = msg.id;
    renderUsers(msg.users || []);
  }

  if (msg.type === "user-list") {
    renderUsers(msg.users || []);
  }

  if (msg.type === "incoming-call") {
    // show a confirm dialog, accept starts the P2P flow
    const accept = confirm(`${msg.fromName} is calling you. Accept?`);
    if (!accept) return;
    // create pc and reply (wait for offer path below)
    // we expect to receive 'offer' next, so nothing else here
  }

  // incoming offer from another
  if (msg.type === "offer") {
    const from = msg.from;
    const sdp = msg.sdp;
    const fromName = msg.fromName;

    // auto-accept via prompt
    const accept = confirm(`${fromName} is calling you. Accept?`);
    if (!accept) {
      // nothing
      return;
    }

    // create pc and set remote description, then answer
    const pc = createPeerConnection(from, false);
    pcs[from] = pc;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // send answer back
    socket.send(JSON.stringify({ type: "answer", to: from, sdp: pc.localDescription }));
  }

  // incoming answer to our offer
  if (msg.type === "answer") {
    const from = msg.from;
    const sdp = msg.sdp;
    const pc = pcs[from];
    if (pc) {
      pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(console.error);
    }
  }

  // incoming ice candidate
  if (msg.type === "ice-candidate") {
    const from = msg.from;
    const candidate = msg.candidate;
    const pc = pcs[from];
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  }

  // call prompt (simple notification)
  if (msg.type === "call-offer") {
    alert(`${msg.fromName} tried to call you.`);
  }
});

// UI: render online users (list of {id,name})
function renderUsers(users) {
  userList.innerHTML = "";
  users.forEach(u => {
    if (u.id === myId) return;
    const li = document.createElement("li");
    li.textContent = u.name;
    li.onclick = () => startCall(u.id, u.name);
    userList.appendChild(li);
  });
}

// start camera button
startBtn.onclick = async () => {
  myName = prompt("Enter your name:") || `User-${Math.floor(Math.random()*1000)}`;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startBtn.disabled = true;
    toggleCamBtn.disabled = false;
    hangupBtn.disabled = false;
    localLabel.textContent = myName;

    // notify server with join + name
    socket.send(JSON.stringify({ type: "join", name: myName }));
  } catch (err) {
    console.error("getUserMedia error", err);
    alert("Camera/microphone access failed.");
  }
};

// toggle camera on/off (show name and color when off)
toggleCamBtn.onclick = () => {
  if (!localStream) return;
  camOn = !camOn;
  const track = localStream.getVideoTracks()[0];
  if (track) track.enabled = camOn;
  toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";

  // when off: hide video and show centered name/color box
  if (!camOn) {
    localVideo.style.display = "none";
    // add name box overlay
    let nameBox = localBox.querySelector(".nameBox");
    if (!nameBox) {
      nameBox = document.createElement("div");
      nameBox.className = "nameBox";
      nameBox.style.position = "absolute";
      nameBox.style.top = "0";
      nameBox.style.left = "0";
      nameBox.style.width = "100%";
      nameBox.style.height = "100%";
      nameBox.style.fontSize = "22px";
      nameBox.style.fontWeight = "800";
      localBox.appendChild(nameBox);
    }
    nameBox.style.background = randomColor();
    nameBox.textContent = myName || "You";
  } else {
    localVideo.style.display = "block";
    const nameBox = localBox.querySelector(".nameBox");
    if (nameBox) nameBox.remove();
  }
};

// hangup: close all peer connections and remove remote videos
hangupBtn.onclick = () => {
  Object.values(pcs).forEach(pc => pc.close());
  pcs = {};
  // remove remote video elements
  Array.from(document.querySelectorAll(".remoteBox")).forEach(el => el.remove());
  socket.send(JSON.stringify({ type: "hangup" }));
};

// create peer connection (initiator true => we will create offer)
function createPeerConnection(remoteId, initiator = true) {
  const pc = new RTCPeerConnection(ICE_CONFIG);

  // add local tracks
  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  // handle remote track
  pc.ontrack = (ev) => {
    // create a remote box only once
    if (document.getElementById(`remote-${remoteId}`)) return;
    const box = document.createElement("div");
    box.className = "videoBox remoteBox";
    box.id = `remote-${remoteId}`;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = ev.streams[0];
    const label = document.createElement("div");
    label.className = "labelOverlay";
    label.textContent = `User ${remoteId.slice(0,4)}`;
    box.appendChild(video);
    box.appendChild(label);
    videoContainer.appendChild(box);
  };

  // ICE candidates -> send to remote through server
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "ice-candidate", to: remoteId, candidate: e.candidate }));
    }
  };

  pcs[remoteId] = pc;
  return pc;
}

// start call to a user
async function startCall(remoteId, remoteName) {
  if (!localStream) {
    alert("Start your camera first.");
    return;
  }
  // create pc and make offer
  const pc = createPeerConnection(remoteId, true);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // send offer via server
  socket.send(JSON.stringify({ type: "offer", to: remoteId, sdp: pc.localDescription }));
}

// sidebar close button
closeSidebar.onclick = () => {
  document.getElementById("sidebar").style.display = "none";
};
