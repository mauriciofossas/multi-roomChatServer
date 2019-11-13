//Server side
const http = require('http');
const util = require('util');
const express = require('express');
const socketio = require('socket.io');
const path = require('path');
const _ = require('lodash');
const passwordHash = require('password-hash');

const app = express();
const server = http.createServer(app);
//Socket works on our server created by our express app.
const io = socketio(server);

//Our server listens on port 8000.
server.listen(8000, () => {
  console.log("Server up! Listening on port 8000.");
});

//Our express app finds index.html in public.
app.use(express.static(path.join(__dirname, 'public')));

// Database stuff
const mysqli = require('mysql').createConnection({
  host: 'localhost',
  user: 'CHATUSER',
  password: '1dane&2mau',
  database: 'chat',
  connectTimeout: 0
});

mysqli.query = util.promisify(mysqli.query);

const login = async (nick, password) => {
  const res = await mysqli.query('select password from users where nick = ?', [nick]);
  if (res.length === 0) {
    return 'bad nick';
  } else if (passwordHash.verify(password, res[0].password)) {
    return 'ok';
  } else {
    return 'bad password';
  }
};

const createUser = async (nick, password) => {
  const hashedPassword = passwordHash.generate(password);
  try {
    await mysqli.query('insert into users (nick, password) values (?, ?)', [nick, hashedPassword]);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

const createRoom = async (name, op, password) => {
  try {
    await mysqli.query('insert into rooms (name, password, op) values (?, ?, ?)', [name, password || null, op]);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

const issueBan = (name, nick) => {
  mysqli.query('insert into bans (name, nick) values (?, ?)', [name, nick]);
}

const nicks = {};
const rooms = {};

// Populate rooms and bans from db

const getRooms = async () => {
  mysqli.query('select name, password, op from rooms')
        .then((res) => {
          res.forEach((room) => {
            rooms[room.name] = {password: room.password, op: room.op, members: [], bans: []};
          })
        });
}

const getBans = async () => {
  mysqli.query('select name, nick from bans')
        .then((res) => {
          res.forEach((ban) => {
            rooms[ban.name].bans.push(ban.nick);
          })
        });
}

const getRoomsAndBans = async () => {
  await getRooms();
  getBans();
}

getRoomsAndBans();

//Listens for connection from the browser; socket refers to particular instance
//of the socket that is made when a connection is established (each socket has a unique id)
io.on('connection', (socket) => {
  socket.on('register', async (nick, password) => {
    if (await createUser(nick, password)) {
      socket.emit('registerSuccess');
      console.log('registered user', nick);
    } else {
      socket.emit('registerFail', "registration");
    }
  });
  //Listens for the nickname (user) from the frontend.
  socket.on('nick', async (nick, password) => {
    if (socket.nick) {
      // Already logged in
      socket.emit('loginFailed', 'already logged in');
    } else {
      const loginRes = await login(nick, password);
      if (loginRes !== 'ok') {
        console.log(nick, 'failed login', loginRes);
        socket.emit('loginFail', loginRes);
      } else {
        // Associate socket session with name
        nicks[nick] = socket;
        socket.nick = nick;
        console.log(socket.nick + " joined.");
        socket.emit('loginSuccess');
        // Send the new user all the room options
        _.forEach(rooms, (room, name) => {
          socket.emit('newRoom', name, room.op, !!room.password);
        });
      }
    }
  });

  const leaveRoom = (nick) => {
    _.forEach(rooms, (room) => {
      if (_.includes(room.members, nick)) {
        _.pull(room.members, nick);
        room.members.forEach((memberNick) => {
          nicks[memberNick].emit("member left room", nick);
        });
      }
    });
  };

  socket.on('createRoom', async (name, password) => {
    if (!socket.nick || name in rooms) {
      // Room in use or user unnamed
      socket.emit("createRoomFail");
    } else {
      if (await createRoom(name, socket.nick, password)) {
        // Associate new room with this user as op
        const room = {password, members: [], bans: [], kicks: [], op: socket.nick};
        rooms[name] = room;
        socket.emit("createRoomSuccess");
        io.emit('newRoom', name, room.op, !!room.password);
      } else {
        socket.emit("createRoomFail");
      }
    }
  });

  socket.on('joinRoom', (name, password) => {
    const room = rooms[name];
    if (!room || !socket.nick){
      socket.emit('joinRoomFail', 'server error');
    }
    else if(_.includes(room.bans, socket.nick)){
      socket.emit('joinRoomFail', 'banned');
    }
    else if((room.password && room.password !== password)){
      socket.emit('joinRoomFail', 'bad password');
    } else {
      // Add user to this room
      room.members.forEach((member) => {
        nicks[member].emit('new room member', socket.nick);
      })
      room.members.push(socket.nick);
      socket.emit('joinRoomSuccess', name);
      room.members.forEach((member) => {
        socket.emit('new room member', member);
      })
    }
  });

  socket.on('leaveRoom', (name) => {
    const room = rooms[name];
    if (room) {
      // Remove this user from the room
      _.pull(room.members, socket.nick);
      room.members.forEach((nick) => {
        nicks[nick].emit("member left room", socket.nick);
      });
    }
    // Do we need to send a success/fail here?
  });

  socket.on('typing', (nick)=>{
    _.forEach(rooms, (room, name) => {
      if (_.includes(room.members, socket.nick)) {
        _.forEach(room.members, nick => {
          // Send all in this room the new message
          // (including the sender, keeps it simplier)
          nicks[nick].emit("someoneIsTyping", socket.nick);
        });
      }
    });
  });

  socket.on('deleteTyping', (nick)=>{
    _.forEach(rooms, (room, name) => {
      if (_.includes(room.members, socket.nick)) {
        _.forEach(room.members, nick => {
          // Send all in this room the new message
          // (including the sender, keeps it simplier)
          nicks[nick].emit("removeTyping");
        });
      }
    });
  });

  socket.on('recreateSend', ()=>{
    _.forEach(rooms, (room, name) => {
      if (_.includes(room.members, socket.nick)) {
        _.forEach(room.members, nick => {
          // Send all in this room the new message
          // (including the sender, keeps it simplier)
          nicks[nick].emit("createNewForm");
        });
      }
    });
  });

  socket.on('sendMessage', message => {
    // See if this is a DM
    const match = /([^:]+):/.exec(message);
    if (match && match[1] in nicks) {
      // This is a dm to match[1]
      nicks[match[1]].emit("newMessage", socket.nick, message);
      // Also emit to the sender
      socket.emit("newMessage", socket.nick, message);
      return // Don't send to everyone else
    }
    // Sorry for nested function calls, I blame Javascript
    _.forEach(rooms, (room, name) => {
      if (_.includes(room.members, socket.nick)) {
        _.forEach(room.members, nick => {
          // Send all in this room the new message
          // (including the sender, keeps it simplier)
          nicks[nick].emit("newMessage", socket.nick, message);
        });
      }
    });
  }); 

  socket.on('ban', (roomName, bannedNick) =>{
    const room = rooms[roomName]
    if(room.op === socket.nick){
      leaveRoom(bannedNick);
      room.bans.push(bannedNick);
      nicks[bannedNick].emit('banned', roomName);
      issueBan(roomName, bannedNick);
    }
  });

  socket.on('kick', (roomName, kickedNick) =>{
    const room = rooms[roomName]
    if(room.op === socket.nick){
      leaveRoom(kickedNick);
      nicks[kickedNick].emit('kicked', roomName);
    }
  });

  socket.on('disconnect', () => {
    if (socket.nick) {
      // Right now, if you leave, your name goes back to the pool
      console.log(socket.nick + " left.");
      delete nicks[socket.nick];
      leaveRoom(socket.nick);
    }
  });
});

