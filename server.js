// ---- User list with clickable names ----
socket.on('userList', userList => {
  const container = document.getElementById('users');
  container.innerHTML = '';
  
  userList.forEach(u => {
    if (u !== nickname) { // skip self
      const itemDiv = document.createElement('div');
      itemDiv.className = 'user-item';
      
      const dot = document.createElement('div');
      dot.className = 'online-dot';
      
      const nameP = document.createElement('p');
      nameP.className = 'user-name';
      nameP.textContent = u;
      
      // CLICK TO START DM
      nameP.onclick = () => {
        startDM(u);          // tell server to create/switch DM
      };
      
      // optional buttons
      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'user-options';
      optionsDiv.innerHTML = `
        <button onclick="startVoiceCallWith('${u}')">Call</button>
        <button onclick="addToGroup('${u}')">Add to Group</button>
      `;
      
      itemDiv.appendChild(dot);
      itemDiv.appendChild(nameP);
      itemDiv.appendChild(optionsDiv);
      container.appendChild(itemDiv);
    }
  });
});

// ---- Start DM function ----
function startDM(target) {
  if (!target) return;
  socket.emit('createDM', target);
}

// ---- Switch to DM when server responds ----
socket.on('switchToDM', dmChannel => {
  currentChannel = dmChannel;
  document.getElementById('messages').innerHTML = ''; // clear old messages
  socket.emit('allMessages', { channel: dmChannel });
});
