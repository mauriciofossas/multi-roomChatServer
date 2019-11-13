//User side
const socket = io();
const root = $('#root');

let loggedIn = false;
let currentRoom = null;
let myNick = "";

const knownRooms = {}

//Shows the login button for users when page is displayed.
const showLogin = () => {
  const nickInput = $('<input type=text placeholder=Username>');
  const passwordInput = $('<input type=password placeholder=Password>');
  const loginButton = $('<button>Login</button>');
  const registerButton = $('<button>Register</button>');
  const login = $('<div id=login></div>')
    .append(nickInput)
    .append(passwordInput)
    .append(loginButton)
    .append(registerButton);
  //Changes the content of all root elements to be the "login" object
  root.html(login);
  //Upon clicking on the loginButton...
  loginButton.on('click', () => {
    //...we emit the nickname (user).
    socket.emit('nick', nickInput.val(), passwordInput.val());
    myNick = nickInput.val();
  });
  registerButton.on('click', () => {
    socket.emit('register', nickInput.val(), passwordInput.val());
  })
};

const deleteTyping = () =>{
  $('.mustDelete').remove();
};

const recreateSend = () => {
  $('.south').eq(0).empty();
  const messageInput = $('<input id=typing type=text>');

  messageInput.one('input', () => {
    socket.emit('typing', myNick);
  });

  messageInput.on('change', () =>{
    socket.emit('deleteTyping', myNick);
  });

  const messageSend = $('<button>Send</button>')
  .on('click', () => {
    socket.emit('sendMessage', messageInput.val());
    messageInput.val('')
  });
  messageSend.on('click', ()=>{
    socket.emit('recreateSend');
  });
  messageSend.on('click', ()=>{
    socket.emit('deleteTyping', myNick);
  });
  const chatLine = $('<div></div>')
  .addClass('south')
  .append(messageInput)
  .append(messageSend);
  $('.north').eq(0).append(chatLine);
}

const makeChatWindow = () => {
  const frame = $("<div id=chat></div>")
    .addClass('vert-fill');
  const chatLog = $("<div><ul id=chatMsgs></ul></div>")
    .addClass('north');
  const messageInput = $('<input id=typing type=text>')
    .prop('disabled', true);

  messageInput.one('input', () => {
    socket.emit('typing', myNick);
  });

  messageInput.on('change', () =>{
    socket.emit('deleteTyping', myNick);
  });

  const messageSend = $('<button>Send</button>')
  .on('click', () => {
    socket.emit('sendMessage', messageInput.val());
    messageInput.val('')
  });
  messageSend.on('click', ()=>{
    socket.emit('recreateSend');
  });
  messageSend.on('click', ()=>{
    socket.emit('deleteTyping', myNick);
  });
  const chatLine = $('<div></div>')
    .addClass('south')
    .append(messageInput)
    .append(messageSend);
  frame.append(chatLog).append(chatLine);
  return frame;
}

const makeRoomWindow = () => {
  const frame = $("<div id=rooms></div>")
  const roomNameInput = $("<input placeholder='Room name'></input>");
  const roomPasswordInput = $("<input placeholder='Password (empty for none)'></input>");
  const roomCreate = $("<button>+</button>")
    .on("click", () => {
      socket.emit('createRoom', roomNameInput.val(), roomPasswordInput.val());
      roomNameInput.val('');
      roomPasswordInput.val('');
    });
  const addLine = $("<div></div>").append(roomNameInput).append(roomPasswordInput).append(roomCreate);
  const roomList = $("<div><ul id=roomlist></ul></div>");
  frame.append(addLine).append(roomList);
  return frame;
}

const makeMemberWindow = () => {
  const frame = $("<div id=members></div>")
  const memberList = $("<div><ul id=memberList></ul></div>");
  frame.append(memberList);
  return frame;
}

const showSplitDisplay = () => {
  const rooms = makeRoomWindow()
    .addClass("col-3")
    .addClass("column");
  const chat = makeChatWindow()
    .addClass("col-6")
    .addClass("column");
  const nicks = makeMemberWindow()
    .addClass("col-3")
    .addClass("column");
  const splitDisplayParent = $("<div></div>")
    .addClass("row")
    .append(rooms)
    .append(chat)
    .append(nicks);
  root.html(splitDisplayParent);
}

const addRoom = (name, room) => {
  const roomLine = $('<li></li>')
    .append(name)
    .on('click', () => maybeJoinRoom(name));
  if(room.hasPassword){
    roomLine.append("🔒");
  }
  $('ul#roomlist').append(roomLine);
  roomLine.attr('data-room', name);
}

const ban = (room, bannedNick) => {
  socket.emit('ban', room, bannedNick);
}

const kick = (room, kickedNick) => {
  socket.emit('kick', room, kickedNick);
}

const addMember = (nick) => {
  const memberLine = $('<li></li>')
    .append(nick + " ");
  const dmButton = $('<button></button>').text("@").on('click', () => dm(nick));
  memberLine.append(dmButton);
  if (knownRooms[currentRoom].op === myNick && nick !== myNick) {
    const kickButton = $("<button></button").text("👟").on('click', ()=> kick(currentRoom, nick));
    const banButton = $("<button></button").text("🚫").on('click', ()=> ban(currentRoom, nick)); 
    memberLine.append(kickButton).append(banButton); 
  }
  $('ul#memberList').append(memberLine);
  memberLine.attr('data-member', nick);
}

const removeMember = (nick) => {
  $('ul#memberList li[data-member=' +nick+ ']').remove();
}

const addMessage = (nick, msg) => {
  const message = $("<li></li>")
    .text(nick + ": " + msg);
  $('ul#chatMsgs').append("<hr>").append(message);
}

const joinRoom = (name) => {
  if (currentRoom) {
    socket.emit('leaveRoom', currentRoom);
    $('ul#memberList').empty();
    $('ul#chatMsgs').empty();
    $('ul#roomlist li').removeClass('selected');
  } else {
    $('#chat input').prop('disabled', false);
    $('#chat button').prop('disabled', false);
  }
  $('ul#roomlist li[data-room=\"' + name + '\"]').addClass('selected');
  currentRoom = name;
}

const maybeJoinRoom = (name) => {
  if (currentRoom && currentRoom === name) {
    return;
  }
  if(knownRooms[name].hasPassword) {
    const password = window.prompt("Password:");
    socket.emit('joinRoom', name, password);
  } else {
    socket.emit('joinRoom', name);
  }
}

const dm = (nick) => {
  $('#chat input').val(nick+ ':');
}

socket.on('loginSuccess', () => {
  loggedIn = true;
  showSplitDisplay();
});

socket.on('joinRoomSuccess', (name) => {
  joinRoom(name);
})

socket.on('loginFail', () => {
  errorWindow("login");
});

socket.on('joinRoomFail', (reason) => {
  if(reason==="banned"){
    errorWindow("banned");
    knownRooms[room].banned = true;
    $('ul#roomlist li[data-room=' + room + ']').addClass('banned');
  }
  else if(reason==="bad password"){
    errorWindow("login");
  }
})

socket.on('newRoom', (name, op, hasPassword) => {
  const room = {op, hasPassword};
  knownRooms[name] = room;
  if (loggedIn) {
    addRoom(name, room);
  }
})

socket.on('newMessage', (nick, msg) => {
  addMessage(nick, msg);
});

socket.on('someoneIsTyping', (nick)=>{
  const message = $("<li class=mustDelete></li>")
    .text(nick + " is typing...");
  $('ul#chatMsgs').append(message);
});

socket.on('removeTyping', (nick)=>{
  deleteTyping();
});

socket.on('createNewForm', () =>{
  recreateSend();
})

socket.on('new room member', (nick) => {
  addMember(nick);
});

socket.on("member left room", (nick) => {
  removeMember(nick);
});

socket.on('banned', (room)=>{
  $('ul#memberList').empty();
  $('ul#chatMsgs').empty();
  $('ul#roomlist li').removeClass('selected');
  $('#chat input').prop('disabled', true);
  $('#chat button').prop('disabled', true);
  currentRoom=null
  knownRooms[room].banned = true;
  $('ul#roomlist li[data-room=' + room + ']').addClass('banned');
});

socket.on('kicked', (room)=>{
  $('ul#memberList').empty();
  $('ul#chatMsgs').empty();
  $('ul#roomlist li').removeClass('selected');
  $('#chat input').prop('disabled', true);
  $('#chat button').prop('disabled', true);
  errorWindow("kicked");
  currentRoom=null;
});

function errorWindow(reason){
  let error;
  if (reason === "registration"){
    error = $('<p>This username has been taken</p>');
  } else if (reason === "login"){
    error = $('<p>Wrong password</p>');
  } else if (reason === "creation"){
    error = $('<p>There is already a room with this name</p>');
  } else if (reason === "kicked"){
    error = $('<p>You have been kicked from the room</p>');
  } else if (reason === "banned"){
    error = $('<p>You have been banned from the room</p>');
  }
  //Framework for pop-up window taken form: https://www.w3schools.com/howto/howto_css_modals.asp
  const content = $('<div>').addClass('content');
  const close = $('<span> &times; </span>').addClass('close');
  const innerPU = content.append(close).append(error);
  const popup = $("<div id='pop-up'>").addClass('pu')
                                      .append(innerPU);
  root.append(popup);
  const popUpElement = $('#pop-up')[0];
  const spanElement = $('.close').eq(0);
  popUpElement.style.display = "block";
  spanElement.on("click", () => {
    popUpElement.style.display = "none";
  });
}

socket.on('registerFail', (reason) =>{
  errorWindow(reason);
});

socket.on('createRoomFail', ()=>{
  errorWindow("creation");
})

showLogin();
