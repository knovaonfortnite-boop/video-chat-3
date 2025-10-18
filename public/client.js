let localStream, pcs = {}, myId, myName = prompt("Enter your name")||"You", socket, reconnectInterval;
let ringingAudio = new Audio("ringtone.mp3");

function connectWS() {
  socket = new WebSocket(`ws://${window.location.hostname}:10000`);
  socket.onopen = ()=>{ console.log("WS connected"); clearInterval(reconnectInterval); if(myId) socket.send(JSON.stringify({type:"join",name:myName})); };
  socket.onmessage = async ev=>{
    const msg = JSON.parse(ev.data);
    if(msg.type==="welcome"){ myId=msg.id; socket.send(JSON.stringify({type:"join",name:myName})); renderUsers(msg.users||[]); }
    if(msg.type==="user-list") renderUsers(msg.users||[]);
    if(msg.type==="offer"){ ringingAudio.play(); animateIncomingCall(msg.from); const pc=createPeerConnection(msg.from,false,msg.fromName); pcs[msg.from]=pc; await pc.setRemoteDescription(msg.sdp); const answer=await pc.createAnswer(); await pc.setLocalDescription(answer); socket.send(JSON.stringify({type:"answer",to:msg.from,sdp:pc.localDescription})); ringingAudio.pause(); ringingAudio.currentTime=0; stopIncomingAnimation(msg.from);}
    if(msg.type==="answer"){ const pc=pcs[msg.from]; if(pc) await pc.setRemoteDescription(msg.sdp); }
    if(msg.type==="ice-candidate"){ const pc=pcs[msg.from]; if(pc) await pc.addIceCandidate(msg.candidate); }
  };
  socket.onclose=()=>{ console.log("WS disconnected"); alert("⚠️ Disconnected from server. Reconnecting..."); reconnectInterval=setInterval(connectWS,3000); };
  socket.onerror=err=>{ console.log("WS error",err); socket.close(); };
}

async function startCamera(){ try{ localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true}); document.getElementById("localVideo").srcObject=localStream; document.getElementById("toggleCamBtn").disabled=false; document.getElementById("hangupBtn").disabled=false; }catch(err){ alert("Camera failed. Serve via LAN IP and reload."); } }
function toggleCamera(){ if(!localStream) return alert("Start camera first!"); const track=localStream.getVideoTracks()[0]; track.enabled=!track.enabled; document.getElementById("toggleCamBtn").innerText=track.enabled?"Turn Camera Off":"Turn Camera On"; }

function createPeerConnection(remoteId,isOffer,remoteName="Someone"){
  const pc=new RTCPeerConnection();
  pc.onicecandidate=e=>{ if(e.candidate) socket.send(JSON.stringify({type:"ice-candidate",to:remoteId,candidate:e.candidate})); };
  pc.ontrack=e=>{
    const container=document.getElementById("videoContainer");
    let box=document.getElementById(`remote_${remoteId}`);
    if(!box){
      box=document.createElement("div"); box.className="videoBox"; box.id=`remote_${remoteId}`; container.appendChild(box);
      const vid=document.createElement("video"); vid.autoplay=true; vid.playsInline=true; vid.srcObject=e.streams[0]; box.appendChild(vid);
      const nameBox=document.createElement("div"); nameBox.className="nameBox"; nameBox.innerText=remoteName; box.appendChild(nameBox);
      box.style.opacity=0; box.style.transform="scale(0.8)";
      setTimeout(()=>{ box.style.transition="opacity 0.5s, transform 0
