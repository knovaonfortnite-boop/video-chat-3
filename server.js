// server.js
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const clients = new Map(); // id -> { ws, name }

function broadcast(msg, exceptId=null) {
  const data = JSON.stringify(msg);
  for (const [id, client] of clients) {
    if (id !== exceptId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

wss.on('connection', ws => {
  const id = Math.random().toString(36).substr(2, 9);
  let username = 'Anonymous';
  clients.set(id, { ws, name: username });

  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', msg => {
    let message;
    try { message = JSON.parse(msg); } catch(e){ return; }

    switch(message.type){
      case 'join':
        username = message.name || 'Anonymous';
        clients.get(id).name = username;
        // notify others
        broadcast({ type: 'new-participant', id, name: username }, id);
        // send current participants to this client
        ws.send(JSON.stringify({ type: 'existing-participants', participants: Array.from(clients.keys()).filter(cid => cid !== id) }));
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        const target = clients.get(message.to);
        if(target && target.ws.readyState === WebSocket.OPEN){
          target.ws.send(JSON.stringify({...message, from:id}));
        }
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    broadcast({ type: 'user-left', id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Video chat server running on port ${PORT}`));
