const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Generate a short random room id and return as JSON
app.get('/create', (req, res) => {
  const room = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  res.json({ room });
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('join', (room) => {
    socket.join(room);
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    // inform the joining client of current room state
    socket.emit('joined', { room, clients });
    // let others in the room know a new peer joined
    socket.to(room).emit('peer-joined', socket.id);
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    // broadcast leave to rooms (skip the socket's own room id)
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      socket.to(room).emit('peer-left', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Listening on', PORT));
