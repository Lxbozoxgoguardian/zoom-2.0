const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('join', (room) => {
    socket.join(room);
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    socket.to(room).emit('peer-joined', socket.id);
    socket.emit('joined', { room, clients });
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    // broadcast leave to rooms
    socket.rooms.forEach((room) => {
      socket.to(room).emit('peer-left', socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Listening on', PORT));
