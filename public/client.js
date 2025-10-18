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

    // show name overlay
    showNameOverlay("localBox", myName);

    console.log("Camera started!");
  } catch (err) {
    console.error("Camera error:", err);
    alert("Unable to access camera. Make sure Chrome has permission to use it.");
  }
}

// --- TOGGLE CAMERA ---
function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  document.getElementById("toggleCamBtn").innerText = videoTrack.enabled ? "Turn Camera Off" : "Turn Camera On";

  // show/hide name overlay
  const overlay = document.getElementById("localBox_name");
  if (overlay) overlay.style.display = videoTrack.enabled ? "none" : "flex";
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

      box.appendChild(videoEl);
      box.appendChild(label);
      container.appendChild(box);
    }
  };

  // attach local stream
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  return pc;
}

// --- SHOW NAME OVERLAY ---
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

// --- BUTTON EVENTS ---
document.getElementById("startBtn").addEventListener("click", startCamera);
document.getElementById("toggleCamBtn").addEventListener("click", toggleCamera);
document.getElementById("hangupBtn").addEventListener("click", hangUp);
