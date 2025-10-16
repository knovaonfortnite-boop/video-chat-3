async function startCamera() {
  const username = prompt("Enter your name:");
  if (!username) return alert("You must enter a name!");

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localLabel.textContent = username;
    startBtn.disabled = true;
    toggleCamBtn.disabled = false;
    updateStatus("Camera started - Connecting to server...");
    connectWebSocket(); // connect after camera is started
  } catch (err) {
    console.error(err);
    updateStatus("Error accessing camera/microphone");
  }
}

function connectWebSocket() {
  ws = new WebSocket('wss://video-chat-3-4.onrender.com');

  ws.onopen = () => {
    console.log("WebSocket OPEN!");
    updateStatus("Connected to server");
    joinBtn.disabled = false; // only allow joining after open
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'welcome': 
          myId = message.id; 
          console.log(`My ID: ${myId}`); 
          break;
        case 'existing-participants':
          for (const id of message.participants) await createPeerConnection(id, true);
          break;
        case 'offer': await handleOffer(message.offer, message.from); break;
        case 'answer': await handleAnswer(message.answer, message.from); break;
        case 'ice-candidate': await handleIceCandidate(message.candidate, message.from); break;
        case 'participant-left': handleParticipantLeft(message.id); break;
      }
    } catch (err) { console.error(err); }
  };

  ws.onerror = (err) => {
    console.error("WebSocket ERROR:", err);
    updateStatus("Connection error");
  };

  ws.onclose = () => {
    console.log("WebSocket CLOSED");
    updateStatus("Disconnected from server");
    joinBtn.disabled = true; // disable join if disconnected
  };
}
