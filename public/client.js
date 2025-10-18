let localStream = null;
let pcs = {};
let myId = null;
let myName = "You"; // default name

// --- START CAMERA ---
async function startCamera() {
  const videoEl = document.getElementById("localVideo");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoEl.srcObject = localStream;
    await videoEl.play();

    document.getElementById("toggleCamBtn").disabled = false;
    document.getElementById("hangupBtn").disabled = false;

    // make sure label shows even if video stops
    updateVideoLabel("localBox", myName);

    alert("Camera started!");
  } catch (err) {
    console.error("Camera error:", err);
    alert("Unable to access camera. Make sure permissions are allowed.");
  }
}

// --- TOGGLE CAMERA ---
function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  document.getElementById("toggleCamBtn").innerText = videoTrack.enabled ? "Turn Camera Off" : "Turn Camera On";

  // show name overlay if camera is off
  const boxId = "localBox";
  const nameOverlay = document.getElementById(`${boxId}_name`);
  if (videoTrack.enabled) {
    if (nameOverlay) nameOverlay.style.display = "none";
  } else {
    if (!nameOverlay) {
      const overlay = document.createElement("div");
      overlay.id = `${boxId}_name`;
      overlay.className = "nameBox";
      overlay.innerText = myName;
      document.getElementById(boxId).appendChild(overlay);
    } else {
      nameOverlay.style.display = "flex";
    }
  }
}

// --- UPDATE NAME LABEL FOR ANY VIDEO BOX ---
function updateVideoLabel(boxId, label) {
  const box = document.getElementById(boxId);
  if (!box) return;
  let overlay = box.querySelector(".labelOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "labelOverlay";
    box.appendChild(overlay);
  }
  overlay.innerText = label;
}

// --- HANG UP ---
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

// --- CREATE PEER CONNECTION ---
function createPeerConnection(remoteId, isOffer) {
  const pc = new RTCPeerConnection();

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "ice-candidate", to: remoteId, candidate: e.candidate }));
    }
  };

  pc.ontrack = e => {
    let videoEl = document.getElementById(`remote_${remoteId}`);
    if (!videoEl) {
      const container = document.getElementById("videoContainer");
      const box = document.createElement("div");
      box.className = "videoBox";
      box.id = `remote_${remoteId}`;

      videoEl = document.createElement("video");
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.srcObject = e.streams[0];

      const label = document.createElement("div");
      label.className = "labelOverlay";
      label.innerText = "Remote";

      box.appendChild(videoEl);
      box.appendChild(label);
      container.appendChild(box);
    }
  };

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  return pc;
}

// --- BUTTON EVENTS ---
document.getElementById("startBtn").addEventListener("click", startCamera);
document.getElementById("toggleCamBtn").addEventListener("click", toggleCamera);
document.getElementById("hangupBtn").addEventListener("click", hangUp);
