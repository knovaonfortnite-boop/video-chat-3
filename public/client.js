const ws = new WebSocket("wss://video-chat-3-8.onrender.com");

const userList = document.getElementById("userList");
const startBtn = document.getElementById("startBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const localVideo = document.getElementById("localVideo");
const localWrapper = document.getElementById("localWrapper");
const status = document.getElementById("status");

let myId = null;
let myName = null;
let localStream = null;
let camOn = true;

// Generate a random color (for camera off)
function randomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

// Update status
function updateStatus(msg) {
  status.textContent = msg;
}

// WebSocket messages
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "welcome":
      myId = msg.id;
      updateStatus(`Connected - ID: ${myId}`);
      renderUserList(msg.users);
      break;

    case "update-users":
      renderUserList(msg.users);
      break;

    case "call-offer":
      alert(`${msg.fromName} is calling you!`);
      break;
  }
};

// Render all online users
function renderUserList(users) {
  userList.innerHTML = "";
  users.forEach((u) => {
    if (u.id === myId) return; // skip self
    const li = document.createElement("li");
    li.textContent = u.name;
    li.style.cursor = "pointer";
    li.onclick = () => {
      ws.send(JSON.stringify({ type: "call", to: u.id }));
      alert(`Calling ${u.name}...`);
    };
    userList.appendChild(li);
  });
}

// Start camera and join server
startBtn.onclick = async () => {
  myName = prompt("Enter your name:");
  if (!myName) return alert("You must enter a name!");

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startBtn.disabled = true;
    toggleCamBtn.disabled = false;

    ws.send(JSON.stringify({ type: "join", name: myName }));
    updateStatus("Camera started and connected!");
  } catch (err) {
    console.error(err);
    updateStatus("Error: Could not start camera");
  }
};

// Toggle camera
toggleCamBtn.onclick = () => {
  if (!localStream) return;
  camOn = !camOn;
  localStream.getVideoTracks()[0].enabled = camOn;
  toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";

  if (!camOn) {
    localVideo.style.display = "none";
    localWrapper.style.background = randomColor();
    const label = document.getElementById("localLabel");
    label.textContent = myName || "You";
  } else {
    localVideo.style.display = "block";
    localWrapper.style.background = "#000";
  }
};
