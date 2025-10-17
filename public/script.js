const socket = io();

const video = document.getElementById("localVideo");
const startBtn = document.getElementById("startBtn");
const statusText = document.getElementById("status");
const usernameInput = document.getElementById("username");
const setNameBtn = document.getElementById("setNameBtn");
const onlineBtn = document.getElementById("onlineBtn");
const onlineList = document.getElementById("onlineList");
const usersDiv = document.getElementById("users");

let username = "";

socket.on("connect", () => {
  statusText.textContent = "Connected ✅";
});

socket.on("disconnect", () => {
  statusText.textContent = "Disconnected ❌";
});

startBtn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    alert("Camera error");
  }
});

setNameBtn.addEventListener("click", () => {
  const name = usernameInput.value.trim();
  if (name) {
    username = name;
    socket.emit("setName", name);
  }
});

onlineBtn.addEventListener("click", () => {
  onlineList.classList.toggle("show");
});

socket.on("users", (users) => {
  usersDiv.innerHTML = "";
  users.forEach((u) => {
    const div = document.createElement("div");
    div.textContent = u;
    div.classList.add("userItem");
    usersDiv.appendChild(div);
  });
});
