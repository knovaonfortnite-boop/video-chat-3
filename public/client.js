// --- REPLACE your socket.onmessage handler with this one ---
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
    const sdp = msg.sdp;
    const fromName = msg.fromName || "Someone";

    const pc = createPeerConnection(from, false);
    pcs[from] = pc;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.send(JSON.stringify({ type: "answer", to: from, sdp: pc.localDescription }));
  }

  if (msg.type === "answer") {
    const pc = pcs[msg.from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }
  }

  if (msg.type === "ice-candidate") {
    const pc = pcs[msg.from];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  }
});


// --- REPLACE your startCall() with this one ---
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
