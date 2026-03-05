const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config(); // for MongoDB URI

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(cors());
app.use(express.static('public')); // serve frontend

// MongoDB
mongoose.connect(process.env.MONGO_URI || 'YOUR_MONGODB_ATLAS_URI', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(()=>console.log('MongoDB connected'))
.catch(err=>console.log(err));

// User Schema
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  username: { type: String, unique: true },
  password: String
});
const User = mongoose.model('User', userSchema);

// Channel Schema
const channelSchema = new mongoose.Schema({
  name: String,
  type: { type: String, enum: ['text','voice'], default:'text' },
  serverId: String,
  members: [String],
  messages: [{ user: String, text: String, timestamp: Date }]
});
const Channel = mongoose.model('Channel', channelSchema);

// Server Schema
const serverSchema = new mongoose.Schema({
  name: String,
  owner: String,
  channels: [{ type: mongoose.Schema.Types.ObjectId, ref:'Channel' }],
  members: [String]
});
const ServerModel = mongoose.model('Server', serverSchema);

// Middleware
function authenticate(req,res,next){
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).send('Unauthorized');
  try{
    const decoded = jwt.verify(token, 'secret_key');
    req.userId = decoded.id;
    next();
  } catch{
    res.status(401).send('Invalid token');
  }
}

// Register
app.post('/register', async (req,res)=>{
  const { firstName, lastName, password } = req.body;
  const username = `${firstName.trim()}${lastName.trim()}`.toLowerCase();
  const hashedPw = await bcrypt.hash(password, 10);
  try{
    const user = new User({ firstName, lastName, username, password: hashedPw });
    await user.save();
    res.status(201).send('User registered');
  } catch(err){
    if(err.code===11000) return res.status(400).send('Username taken');
    res.status(500).send('Error');
  }
});

// Login
app.post('/login', async (req,res)=>{
  const { firstName, lastName, password } = req.body;
  const username = `${firstName.trim()}${lastName.trim()}`.toLowerCase();
  const user = await User.findOne({ username });
  if(!user || !(await bcrypt.compare(password,user.password))){
    return res.status(400).send('Invalid credentials');
  }
  const token = jwt.sign({ id:user._id }, 'secret_key');
  res.json({ token, userId: user._id });
});

// Get servers
app.get('/servers', authenticate, async (req,res)=>{
  const servers = await ServerModel.find({ members: req.userId }).populate('channels');
  res.json(servers);
});

// Socket.io
io.on('connection', socket=>{
  console.log('User connected');

  socket.on('joinChannel', channelId=>{
    socket.join(channelId);
  });

  socket.on('sendMessage', async ({ channelId, userId, text })=>{
    const channel = await Channel.findById(channelId);
    if(!channel) return;
    const msg = { user:userId, text, timestamp: new Date() };
    channel.messages.push(msg);
    await channel.save();
    io.to(channelId).emit('message', msg);
  });

  socket.on('typing', channelId=>{
    socket.to(channelId).emit('showTyping','Someone');
  });

  // WebRTC
  socket.on('offer', data => socket.to(data.channelId).emit('offer', data));
  socket.on('answer', data => socket.to(data.channelId).emit('answer', data));
  socket.on('ice-candidate', data => socket.to(data.channelId).emit('ice-candidate', data));

  socket.on('disconnect', ()=>console.log('User disconnected'));
});

server.listen(3000, ()=>console.log('Server running on 3000'));


