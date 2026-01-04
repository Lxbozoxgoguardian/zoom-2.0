const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve static client
app.use(express.static(path.join(__dirname, 'public')));

// Create a new room id and return as JSON
app.get('/create', (req, res) => {
  const room = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  res.json({ room });
});

// Ensure /room/* serves the SPA (index.html)
app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory rooms metadata. For production persist to DB.
const rooms = {}; // rooms[roomId] = { participants: [{id, name}], hostId, started }

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join-room', ({ room, name }) => {
    if (!room) return;
    socket.join(room);

    // ensure room exists
    if (!rooms[room]) {
      rooms[room] = { participants: [], hostId: null, started: false };
    }

    const roomInfo = rooms[room];

    // add participant
    const existing = roomInfo.participants.find(p => p.id === socket.id);
    if (!existing) {
      roomInfo.participants.push({ id: socket.id, name: name || `Guest-${socket.id.slice(0,6)}` });
    }

    // assign host if none
    if (!roomInfo.hostId) {
      roomInfo.hostId = socket.id;
    }

    // send back current room info to this client
    socket.emit('room-info', {
      room,
      participants: roomInfo.participants,
      hostId: roomInfo.hostId,
      started: roomInfo.started
    });

    // notify room of lobby changes
    io.to(room).emit('lobby-updated', {
      participants: roomInfo.participants,
      hostId: roomInfo.hostId,
      started: roomInfo.started
    });
  });

  socket.on('start-call', ({ room }) => {
    const roomInfo = rooms[room];
    if (!roomInfo) return;
    if (socket.id !== roomInfo.hostId) {
      socket.emit('error-msg', 'Only the host can start the call.');
      return;
    }
    roomInfo.started = true;
    // broadcast that call started with ordered participant list
    io.to(room).emit('call-started', {
      participants: roomInfo.participants
    });
  });

  // generic signaling relay: { to, data }
  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('leave-room', ({ room }) => {
    leaveRoom(socket, room);
  });

  socket.on('disconnect', () => {
    // remove from any rooms
    for (const room of Object.keys(rooms)) {
      leaveRoom(socket, room);
    }
    console.log('socket disconnected', socket.id);
  });

  function leaveRoom(socket, room) {
    const roomInfo = rooms[room];
    if (!roomInfo) return;
    // remove participant
    roomInfo.participants = roomInfo.participants.filter(p => p.id !== socket.id);
    // if host left, assign next host
    if (roomInfo.hostId === socket.id) {
      roomInfo.hostId = roomInfo.participants.length ? roomInfo.participants[0].id : null;
    }
    // if room empty, delete it
    if (roomInfo.participants.length === 0) {
      delete rooms[room];
    } else {
      // notify remaining
      io.to(room).emit('lobby-updated', {
        participants: roomInfo.participants,
        hostId: roomInfo.hostId,
        started: roomInfo.started
      });
      // also notify peers someone left
      io.to(room).emit('participant-left', { id: socket.id });
    }
    socket.leave(room);
  }

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Listening on', PORT));
