const express = require('express');
const app = express();
const path = require('path');
const WebSocket = require('ws');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const PORT
