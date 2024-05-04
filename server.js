//PREREQS///////////////////////////////////////////////////

var cookieSecret = "my_secret_abc_123";

var express = require("express");
var http = require("http");
var websocket = require("ws");
var cookies = require("cookie-parser");
var sessions = require("express-session");
var ejs = require('ejs');


var port = process.argv[2];
var app = express();


//COOKIE FUNCTION////////////////////////////////////////////

app.use(cookies(cookieSecret));
var sessionConfiguration = {
	// Code is slightly adjusted to avoid deprecation warnings when running the code.
	secret: cookieSecret,
	resave: false,
	saveUninitialized: true,
};
app.use(sessions(sessionConfiguration));

app.get("/countMe", function (req, res) {
	var session = req.session;
  if (session.views) {
		session.views++;
		res.send("You have been here " + session.views + " times (last visit: " + session.lastVisit + ")");
		session.lastVisit = new Date().toLocaleDateString();
	}
  else {
		session.views = 1;
		session.lastVisit = new Date().toLocaleDateString();
		res.send("This is your first visit!");
	}
});


//GENERAL FUNCTION///////////////////////////////////////////
function findWSPlayer(wsArr, webSoc){
  for(let i = 0; i != wsArr.length; i++){
    if(wsArr[i].webSocket == webSoc){
      return wsArr[i];
    }
  }
}

function findPlayer(arr, givenId){
  for(let i = 0; i != arr.length; i++){
    if(arr[i].playerId == givenId){
      return arr[i];
    }
  }
}

function findOtherSide(givenPlayer){
  if(givenPlayer.game.whiteSide.webSocket == givenPlayer.webSocket){
    return findWSPlayer(players, givenPlayer.game.blackSide.webSocket);
  }
  else{
    return findWSPlayer(players, givenPlayer.game.whiteSide.webSocket);
  }
}

function wsExists(webSoc){
  for(var i = 0; i != players.length; i++){
    if(players[i].webSocket == webSoc){
      return true;
    }
  }
  return false;
}

//VARIABLES/////////////////////////////////////////////

var gameId = 0;
var playerId = 0;
var playerWaiting = false;
var waitingGame = null;
var games = [];
var players = [];
//var websockets = {};

//Game state legend: 0 = Not Fully populated, 1 = Fully Populated, 2 = Ongoing, 3 = Finished
var Player = function(playerId, ws){
  this.playerId = playerId + 1;
  this.webSocket = ws;
  this.game = null;
}

var Game = function (gameId){
  this.whiteSide = null;
  this.blackSide = null;
  this.id = gameId + 1;
  this.gameState = 0;
}

//TEMPLATING////////////////////////////////////////////////////

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

//SERVER FUNCTIONS//////////////////////////////////////
app.get('/', (req, res) =>{
  res.sendFile("splash.html", {root: "./public"});
  res.render('splash', { gamesPlayed: '24', gamesWon: '15', playedWhite: '11'});
})

app.use(express.static(__dirname + "/public"));
var server = http.createServer(app);
server.listen(port);

const wss = new websocket.Server({ server });

wss.on("connection", function(ws) {

    const con = ws;
    ws.send("Connection upgraded...");
    var newPlayer = new Player(playerId, con);
    players.push(newPlayer);
    playerId++;
    if(playerWaiting){
      //Setting serverside variables
      waitingGame.blackSide = newPlayer;
      waitingGame.gameState = 1;
      games.push(waitingGame);
      playerWaiting = false;
      ws.addEventListener('close', () => {
        var forfeiter = findWSPlayer(players, ws);
        var winner = findOtherSide(forfeiter);
        winner.webSocket.send("FORFEIT");
      });
      //Black side messaging
      console.log(`Player ${newPlayer.playerId} connected as black side`);
      newPlayer.webSocket.send(`CONNECTION_OK, ${newPlayer.playerId}`);
      newPlayer.game = waitingGame;
      //White side messaging
      console.log(`Game ${games[gameId].id} is ready to start with game state: ${games[gameId].gameState}`);
      games[gameId].whiteSide.game = waitingGame;
      //Send game ready
      newPlayer.webSocket.send(`GAME_READY, 1, ${newPlayer.playerId}`); //message type, side, playerId
      games[gameId].whiteSide.webSocket.send(`GAME_READY, 0, ${findWSPlayer(players, games[gameId].whiteSide.webSocket).playerId}`);
      gameId++;
      //Start game
    }
    else{
     waitingGame = new Game(gameId);
      waitingGame.whiteSide = newPlayer;
      playerWaiting = true;
      ws.addEventListener('close', () => {
        var forfeiter = findWSPlayer(players, ws);
        var winner = findOtherSide(forfeiter);
        winner.webSocket.send("FORFEIT");
      });
      console.log(`Player ${newPlayer.playerId} connected as white side`);
      newPlayer.webSocket.send(`CONNECTION_OK, ${newPlayer.playerId}`);
    }


    ws.on("message", function incoming(message){
      //console.log("Message received: " + message);
      var clientMessage = message.split(", ");
      if(clientMessage[0] == "PLAYER_MOVE"){
        console.log(`Player ${clientMessage[1]} moved ${clientMessage[2]} from ${clientMessage[3]} to ${clientMessage[4]}`);
        let sender = findPlayer(players, clientMessage[1]);
        let receiver = findOtherSide(sender);
        //console.log(sender.playerId);
        //console.log(findWSPlayer(players, sender.webSocket).playerId);
        //console.log(receiver.playerId);
        receiver.webSocket.send(`OPPOSITE_MOVE, ${clientMessage[2]}, ${clientMessage[3]}, ${clientMessage[4]}`);
      }

      else if(clientMessage[0] == "PLAYER_CASTLE"){
        console.log("Castle");
        let sender = findPlayer(players, clientMessage[1]);
        let receiver = findOtherSide(sender);
        //console.log(sender.playerId);
        //console.log(findWSPlayer(players, sender.webSocket).playerId);
        //console.log(receiver.playerId);
        receiver.webSocket.send(`OPPOSITE_CASTLE, ${clientMessage[2]}, ${clientMessage[3]}, ${clientMessage[4]}`);
      }

      else if(clientMessage[0] == "PLAYER_CAPTURE"){
        //console.log("Move request received");
        console.log(`Player ${clientMessage[1]} moved ${clientMessage[2]} from ${clientMessage[3]} to ${clientMessage[4]}, CAPTURE`);
        let sender = findPlayer(players, clientMessage[1]);
        let receiver = findOtherSide(sender);
        //console.log(sender.playerId);
        //console.log(findWSPlayer(players, sender.webSocket).playerId);
        //console.log(receiver.playerId);
        receiver.webSocket.send(`OPPOSITE_CAPTURE, ${clientMessage[2]}, ${clientMessage[3]}, ${clientMessage[4]}`);
      }

      else if(clientMessage[0] == "PLAYER_CHECKMATE"){
        console.log("Checkmate!");
        let sender = findPlayer(players, clientMessage[1]);
        let receiver = findOtherSide(sender);
        //console.log(sender.playerId);
        //console.log(receiver.playerId);
        receiver.webSocket.send(`OPPOSITE_CHECKMATE`);
      }

      else if(clientMessage[0] == "PLAYER_IMPOSSIBLE"){
        let sender = findPlayer(players, clientMessage[1]);
        let receiver = findOtherSide(sender);
        receiver.webSocket.send(`OPPOSITE_IMPOSSIBLE`);
      }

      else{
        console.log(`Player says: ${clientMessage[0]}`);
      }
    })

  });


// wss.on("connection", function(ws) {


//   //let's slow down the server response time a bit to make the change visible on the client side
//   setTimeout(function() {
//       console.log("Connection state: "+ ws.readyState);
//       ws.send("Thanks for the message. --Your server.");
//       // ws.close();
//       console.log("Connection state: "+ ws.readyState);
//   }, 2000);
  
//   ws.on("message", function incoming(message){
//           console.log("Message recived: " + message);
//           var clientMessage = message.split(", ");
//           if(clientMessage[0] == "PLAYER_MOVE"){
//             console.log("Move request recieved");
//     //       //   // let sender = findPlayer(players, clientMessage[1]);
//     //       //   // let receiver = findOtherSide(sender);
//     //       //   // receiver.webSocket.send(`OPPOSITE_MOVE, ${clientMessage[2]}, ${clientMessage[3]}`);
//             }
//             else{
//              console.log(`Player says: ${clientMessage[0]}`);
//           }
//   })


// });