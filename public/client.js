async function startCamera() {
  const videoEl = document.getElementById("localVideo");
  if (!videoEl) return alert("Video element not found.");

  try {
    // Ensure video is visible and ready
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;

    // Wait a tiny bit for Chromebook rendering
    await new Promise(resolve => setTimeout(resolve, 200));

    // Request camera
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoEl.srcObject = localStream;

    // Wait for the video to play
    await videoEl.play();

    document.getElementById("toggleCamBtn").disabled = false;
    document.getElementById("hangupBtn").disabled = false;

    showLocalNameOverlay(myName);

    console.log("✅ Camera started on Chromebook!");
  } catch (err) {
    console.error("Camera error:", err);
    alert("Camera failed! Make sure no other app is using it, and reload the page.");
  }
}
