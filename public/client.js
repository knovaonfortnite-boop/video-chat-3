// -------------------- GLOBALS --------------------
let localStream = null;
let pcs = {}; // peer connections
let myId = null;
let myName = "You"; // default, can be updated
let socket = new WebSocket(`ws://${window.location.hostname}:${window.location.port}`);

// -------------------- SOCKET HANDLING --------------------
socket.addEventListener("open", () => console.log("WebSocket connected"));

socket.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "welcome") {
    myId = msg.id;
    renderUsers(msg.users || []);
  }

  if (msg.type === "user-list") {
    renderUsers(msg.users || []);
  }

  if (msg.type === "offer") {
    const from = msg.from;
    const pc = createPeerConnection(from, false, msg.fromName);
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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true
