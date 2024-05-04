//VARIABLES//////////////////////////////////////////////////////////////////////////
var side; //0 = white. 1 = black
var playerId;
var canPlay = false;



//MESSAGE SENDER/////////////////////////////////////////////////////////////////////////////
var socket = new WebSocket("ws://localhost:3000");

function moveMessage(wSocket, playerId, piece, from, target){
  wSocket.send(`PLAYER_MOVE, ${playerId}, ${piece}, ${from}, ${target}`);
}

function castleMessage(wSocket, playerId, piece, from, target){
  wSocket.send(`PLAYER_CASTLE, ${playerId}, ${piece}, ${from}, ${target}`);
}

function captureMessage(wSocket, playerId, piece, from, target){
  wSocket.send(`PLAYER_CAPTURE, ${playerId}, ${piece}, ${from}, ${target}`);
}

function checkmateMessage(wSocket, playerId){
  wSocket.send(`PLAYER_CHECKMATE, ${playerId}`);
}

function impossibleMessage(wSocket, playerId){
  wSocket.send(`PLAYER_IMPOSSIBLE, ${playerId}`);
}


//MESSAGE RECEIVER////////////////////////////////////////////////////////////////////

socket.onmessage = function(event){
  //socket.send("Server message received");
  var serverMessage = event.data.split(", ")
  if(serverMessage[0] == "GAME_READY"){
      console.log("Player found, game is ready");
      side = serverMessage[1];
      playerId = serverMessage[2];
      console.log(`You are side: ${side} with ID ${playerId}`)
      document.getElementById("turn").innerHTML = "White Plays";
      document.getElementById("sideLabel").visibility = "visible";
      timer();
      if(side == 0){
        canPlay = true;
        document.getElementById("sideLabel").innerHTML = "You are the whites";
      }
      else{
        document.getElementById("sideLabel").innerHTML = "You are the blacks";
      }
  }

  else if(serverMessage[0] == "OPPOSITE_MOVE"){
    console.log(`Piece: ${serverMessage[1]}, From: ${serverMessage[2]}, To: ${serverMessage[3]}`);
    main.variables.selectedpiece = serverMessage[1];
    faker = {
      id: serverMessage[3]
    }
    main.methods.move(faker, serverMessage[1]);
    main.methods.endturn();
  }

  else if(serverMessage[0] == "OPPOSITE_CASTLE"){
    console.log(`Piece: ${serverMessage[1]}, From: ${serverMessage[2]}, To: ${serverMessage[3]}`);
    main.variables.selectedpiece = serverMessage[1];
    faker = {
      id: serverMessage[3]
    }
    main.methods.move(faker, serverMessage[1]);
    main.methods.fakeEndTurn();
  }

  else if(serverMessage[0] == "OPPOSITE_CAPTURE"){
    console.log(`Piece: ${serverMessage[1]}, From: ${serverMessage[2]}, To: ${serverMessage[3]}`);
    main.variables.selectedpiece = serverMessage[1];
    faker = {
      id: serverMessage[3]
    }
    main.methods.capture(faker, serverMessage[1]);
    main.methods.endturn();
  }

  else if(serverMessage[0] == "OPPOSITE_CHECKMATE"){
    main.methods.togglehighlight(main.variables.highlighted);
    main.variables.highlighted.length = 0;
    canPlay = false;
    document.getElementById("turn").innerHTML = "YOU LOST :(";
  }

  else if(serverMessage[0] == "OPPOSITE_IMPOSSIBLE"){
    main.methods.togglehighlight(main.variables.highlighted);
    main.variables.highlighted.length = 0;
    canPlay = false;
    document.getElementById("turn").innerHTML = "YOU WON! 3rd IMPOSSIBLE MOVE BY THE OTHER SIDE";
  }

  else if(serverMessage[0] == "FORFEIT"){
    main.methods.togglehighlight(main.variables.highlighted);
    main.variables.highlighted.length = 0;
    playSound('sounds/pacman.wav');
    canPlay = false;
    document.getElementById("turn").innerHTML = "OTHER PLAYER LEFT. YOU WON!";
  }

  else{
    console.log(`Server says: <${serverMessage[0]}>`);
  }
}



//Main is an object with objects inside
let main = {
  
  variables: {
    turn: 'w',
    selectedpiece: '',
    highlighted: [],
    pieces: {
      whiteKing: {
        position: '5_1',
        img: '&#9812;',
        captured: false,
        moved: false,
        type: 'whiteKing'
        
      },
      whiteQueen: {
        position: '4_1',
        img: '&#9813;',
        captured: false,
        moved: false,
        type: 'whiteQueen'
      },
      whiteBishop1: {
        position: '3_1',
        img: '&#9815;',
        captured: false,
        moved: false,
        type: 'whiteBishop'
      },
      whiteBishop2: {
        position: '6_1',
        img: '&#9815;',
        captured: false,
        moved: false,
        type: 'whiteBishop'
      },
      whiteKnight1: {
        position: '2_1',
        img: '&#9816;',
        captured: false,
        moved: false,
        type: 'whiteKnight'
      },
      whiteKnight2: {
        position: '7_1',
        img: '&#9816;',
        captured: false,
        moved: false,
        type: 'whiteKnight'
      },
      whiteRook1: {
        position: '1_1',
        img: '&#9814;',
        captured: false,
        moved: false,
        type: 'whiteRook'
      },
      whiteRook2: {
        position: '8_1',
        img: '&#9814;',
        captured: false,
        moved: false,
        type: 'whiteRook'
      },
      whitePawn1: {
        position: '1_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn2: {
        position: '2_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn3: {
        position: '3_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn4: {
        position: '4_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn5: {
        position: '5_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn6: {
        position: '6_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn7: {
        position: '7_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },
      whitePawn8: {
        position: '8_2',
        img: '&#9817;',
        captured: false,
        type: 'whitePawn',
        moved: false
      },

      blackKing: {
        position: '5_8',
        img: '&#9818;',
        captured: false,
        moved: false,
        type: 'blackKing'
      },
      blackQueen: {
        position: '4_8',
        img: '&#9819;',
        captured: false,
        moved: false,
        type: 'blackQueen'
      },
      blackBishop1: {
        position: '3_8',
        img: '&#9821;',
        captured: false,
        moved: false,
        type: 'blackBishop'
      },
      blackBishop2: {
        position: '6_8',
        img: '&#9821;',
        captured: false,
        moved: false,
        type: 'blackBishop'
      },
      blackKnight1: {
        position: '2_8',
        img: '&#9822;',
        captured: false,
        moved: false,
        type: 'blackKnight'
      },
      blackKnight2: {
        position: '7_8',
        img: '&#9822;',
        captured: false,
        moved: false,
        type: 'blackKnight'
      },
      blackRook1: {
        position: '1_8',
        img: '&#9820;',
        captured: false,
        moved: false,
        type: 'blackRook'
      },
      blackRook2: {
        position: '8_8',
        img: '&#9820;',
        captured: false,
        moved: false,
        type: 'blackRook'
      },
      blackPawn1: {
        position: '1_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn2: {
        position: '2_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn3: {
        position: '3_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn4: {
        position: '4_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn5: {
        position: '5_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn6: {
        position: '6_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn7: {
        position: '7_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      },
      blackPawn8: {
        position: '8_7',
        img: '&#9823;',
        captured: false,
        type: 'blackPawn',
        moved: false
      }
    }
  },





  //Functions are declared here
  methods: {

    pieceConstructor: function(poisiton, type){
      this.position = position;
      this.position = '&#9823',
      this.captured = false;
      this.type = type;
      this.moved = false;
    },


    //Stuff required for setup
    gamesetup: function() {
      $('.chessSquare').attr('chess', 'null');
      for (let gamepiece in main.variables.pieces) {
        $('#' + main.variables.pieces[gamepiece].position).html(main.variables.pieces[gamepiece].img);
        $('#' + main.variables.pieces[gamepiece].position).attr('chess', gamepiece);
      }
    },


    //For highlighting
    moveoptions: function(selectedpiece) {
  
      let position = { x: '', y: '' };
      position.x = main.variables.pieces[selectedpiece].position.split('_')[0];
      position.y = main.variables.pieces[selectedpiece].position.split('_')[1];

      var options = []; 
      var coordinates = [];
      var startpoint = main.variables.pieces[selectedpiece].position;
      var c1,c2,c3,c4,c5,c6,c7,c8;
      if (main.variables.highlighted.length != 0) {
        main.methods.togglehighlight(main.variables.highlighted);
      }
      switch (main.variables.pieces[selectedpiece].type) {
        case 'whiteKing':
  
          //Two castling positions available
          if($('#6_1').attr('chess') == 'null' && $('#7_1').attr('chess') == 'null' && main.variables.pieces['whiteKing'].moved == false &&
            main.variables.pieces['whiteRook2'].moved == false && $('#2_1').attr('chess') == 'null' && $('#3_1').attr('chess') == 'null' &&
            $('#4_1').attr('chess') == 'null' && main.variables.pieces['whiteKing'].moved == false && main.variables.pieces['whiteRook1'].moved == false){
              coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 },{x: 2, y: 0},
              {x: -3, y: 0}].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          }
          //Right castling
          else if ($('#6_1').attr('chess') == 'null' && $('#7_1').attr('chess') == 'null' && main.variables.pieces['whiteKing'].moved == false && main.variables.pieces['whiteRook2'].moved == false) {
            coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 },{x: 2, y: 0}].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          } 
          //Left castling
          else if($('#2_1').attr('chess') == 'null' && $('#3_1').attr('chess') == 'null' &&
            $('#4_1').attr('chess') == 'null' && main.variables.pieces['whiteKing'].moved == false && main.variables.pieces['whiteRook1'].moved == false){
              coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 },{x: -3, y: 0}].map(function(val){
                return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
              });
          }
          else {
            coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 }].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          }
          options = (main.methods.options(startpoint, coordinates, main.variables.pieces[selectedpiece].type)).slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;

        case 'blackKing':
        //Two castling positions available
        if($('#6_8').attr('chess') == 'null' && $('#7_8').attr('chess') == 'null' && main.variables.pieces['blackKing'].moved == false &&
        main.variables.pieces['blackRook2'].moved == false && $('#2_8').attr('chess') == 'null' && $('#3_8').attr('chess') == 'null' &&
        $('#4_8').attr('chess') == 'null' && main.variables.pieces['blackRook1'].moved == false){
            coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 },{x: 2, y: 0},
            {x: -3, y: 0}].map(function(val){
            return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
          });
        //Right castling
        }
        else if ($('#6_8').attr('chess') == 'null' && $('#7_8').attr('chess') == 'null' && main.variables.pieces['blackKing'].moved == false && main.variables.pieces['blackRook2'].moved == false) {
          coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 },{x: 2, y: 0}].map(function(val){
            return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
          });
        }
        //Left castling
        else if($('#2_8').attr('chess') == 'null' && $('#3_8').attr('chess') == 'null' &&
        $('#4_8').attr('chess') == 'null' && main.variables.pieces['blackKing'].moved == false && main.variables.pieces['blackRook1'].moved == false){
            coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 },{x: -3, y: 0}].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
        }
        else {
          coordinates = [{ x: 1, y: 1 },{ x: 1, y: 0 },{ x: 1, y: -1 },{ x: 0, y: -1 },{ x: -1, y: -1 },{ x: -1, y: 0 },{ x: -1, y: 1 },{ x: 0, y: 1 }].map(function(val){
            return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
          });
        }
          options = (main.methods.options(startpoint, coordinates, main.variables.pieces[selectedpiece].type)).slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;

        case 'whiteQueen':
          c1 = main.methods.w_options(position,[{x: 1, y: 1},{x: 2, y: 2},{x: 3, y: 3},{x: 4, y: 4},{x: 5, y: 5},{x: 6, y: 6},{x: 7, y: 7}]);
          c2 = main.methods.w_options(position,[{x: 1, y: -1},{x: 2, y: -2},{x: 3, y: -3},{x: 4, y: -4},{x: 5, y: -5},{x: 6, y: -6},{x: 7, y: -7}]);
          c3 = main.methods.w_options(position,[{x: -1, y: 1},{x: -2, y: 2},{x: -3, y: 3},{x: -4, y: 4},{x: -5, y: 5},{x: -6, y: 6},{x: -7, y: 7}]);
          c4 = main.methods.w_options(position,[{x: -1, y: -1},{x: -2, y: -2},{x: -3, y: -3},{x: -4, y: -4},{x: -5, y: -5},{x: -6, y: -6},{x: -7, y: -7}]);
          c5 = main.methods.w_options(position,[{x: 1, y: 0},{x: 2, y: 0},{x: 3, y: 0},{x: 4, y: 0},{x: 5, y: 0},{x: 6, y: 0},{x: 7, y: 0}]);
          c6 = main.methods.w_options(position,[{x: 0, y: 1},{x: 0, y: 2},{x: 0, y: 3},{x: 0, y: 4},{x: 0, y: 5},{x: 0, y: 6},{x: 0, y: 7}]);
          c7 = main.methods.w_options(position,[{x: -1, y: 0},{x: -2, y: 0},{x: -3, y: 0},{x: -4, y: 0},{x: -5, y: 0},{x: -6, y: 0},{x: -7, y: 0}]);
          c8 = main.methods.w_options(position,[{x: 0, y: -1},{x: 0, y: -2},{x: 0, y: -3},{x: 0, y: -4},{x: 0, y: -5},{x: 0, y: -6},{x: 0, y: -7}]);
          coordinates = c1.concat(c2).concat(c3).concat(c4).concat(c5).concat(c6).concat(c7).concat(c8);
          options = coordinates.slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;

        case 'blackQueen':        
            c1 = main.methods.b_options(position,[{x: 1, y: 1},{x: 2, y: 2},{x: 3, y: 3},{x: 4, y: 4},{x: 5, y: 5},{x: 6, y: 6},{x: 7, y: 7}]);
            c2 = main.methods.b_options(position,[{x: 1, y: -1},{x: 2, y: -2},{x: 3, y: -3},{x: 4, y: -4},{x: 5, y: -5},{x: 6, y: -6},{x: 7, y: -7}]);
            c3 = main.methods.b_options(position,[{x: -1, y: 1},{x: -2, y: 2},{x: -3, y: 3},{x: -4, y: 4},{x: -5, y: 5},{x: -6, y: 6},{x: -7, y: 7}]);
            c4 = main.methods.b_options(position,[{x: -1, y: -1},{x: -2, y: -2},{x: -3, y: -3},{x: -4, y: -4},{x: -5, y: -5},{x: -6, y: -6},{x: -7, y: -7}]);
            c5 = main.methods.b_options(position,[{x: 1, y: 0},{x: 2, y: 0},{x: 3, y: 0},{x: 4, y: 0},{x: 5, y: 0},{x: 6, y: 0},{x: 7, y: 0}]);
            c6 = main.methods.b_options(position,[{x: 0, y: 1},{x: 0, y: 2},{x: 0, y: 3},{x: 0, y: 4},{x: 0, y: 5},{x: 0, y: 6},{x: 0, y: 7}]);
            c7 = main.methods.b_options(position,[{x: -1, y: 0},{x: -2, y: 0},{x: -3, y: 0},{x: -4, y: 0},{x: -5, y: 0},{x: -6, y: 0},{x: -7, y: 0}]);
            c8 = main.methods.b_options(position,[{x: 0, y: -1},{x: 0, y: -2},{x: 0, y: -3},{x: 0, y: -4},{x: 0, y: -5},{x: 0, y: -6},{x: 0, y: -7}]);
            coordinates = c1.concat(c2).concat(c3).concat(c4).concat(c5).concat(c6).concat(c7).concat(c8);          
            options = coordinates.slice(0);
            main.variables.highlighted = options.slice(0);
            main.methods.togglehighlight(options);
            break; 
                 
        case 'whiteBishop':
          c1 = main.methods.w_options(position,[{x: 1, y: 1},{x: 2, y: 2},{x: 3, y: 3},{x: 4, y: 4},{x: 5, y: 5},{x: 6, y: 6},{x: 7, y: 7}]);
          c2 = main.methods.w_options(position,[{x: 1, y: -1},{x: 2, y: -2},{x: 3, y: -3},{x: 4, y: -4},{x: 5, y: -5},{x: 6, y: -6},{x: 7, y: -7}]);
          c3 = main.methods.w_options(position,[{x: -1, y: 1},{x: -2, y: 2},{x: -3, y: 3},{x: -4, y: 4},{x: -5, y: 5},{x: -6, y: 6},{x: -7, y: 7}]);
          c4 = main.methods.w_options(position,[{x: -1, y: -1},{x: -2, y: -2},{x: -3, y: -3},{x: -4, y: -4},{x: -5, y: -5},{x: -6, y: -6},{x: -7, y: -7}]);
          coordinates = c1.concat(c2).concat(c3).concat(c4);
          options = coordinates.slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;     

        case 'blackBishop':
          c1 = main.methods.b_options(position,[{x: 1, y: 1},{x: 2, y: 2},{x: 3, y: 3},{x: 4, y: 4},{x: 5, y: 5},{x: 6, y: 6},{x: 7, y: 7}]);
          c2 = main.methods.b_options(position,[{x: 1, y: -1},{x: 2, y: -2},{x: 3, y: -3},{x: 4, y: -4},{x: 5, y: -5},{x: 6, y: -6},{x: 7, y: -7}]);
          c3 = main.methods.b_options(position,[{x: -1, y: 1},{x: -2, y: 2},{x: -3, y: 3},{x: -4, y: 4},{x: -5, y: 5},{x: -6, y: 6},{x: -7, y: 7}]);
          c4 = main.methods.b_options(position,[{x: -1, y: -1},{x: -2, y: -2},{x: -3, y: -3},{x: -4, y: -4},{x: -5, y: -5},{x: -6, y: -6},{x: -7, y: -7}]);
          coordinates = c1.concat(c2).concat(c3).concat(c4);
          options = coordinates.slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;

        case 'whiteKnight':
          coordinates = [{ x: -1, y: 2 },{ x: 1, y: 2 },{ x: 1, y: -2 },{ x: -1, y: -2 },{ x: 2, y: 1 },{ x: 2, y: -1 },{ x: -2, y: -1 },{ x: -2, y: 1 }].map(function(val){
            return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
          });
          options = (main.methods.options(startpoint, coordinates, main.variables.pieces[selectedpiece].type)).slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;

        case 'blackKnight':
          coordinates = [{ x: -1, y: 2 },{ x: 1, y: 2 },{ x: 1, y: -2 },{ x: -1, y: -2 },{ x: 2, y: 1 },{ x: 2, y: -1 },{ x: -2, y: -1 },{ x: -2, y: 1 }].map(function(val){
            return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
          });
          options = (main.methods.options(startpoint, coordinates, main.variables.pieces[selectedpiece].type)).slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;

        case 'whiteRook':
          c1 = main.methods.w_options(position,[{x: 1, y: 0},{x: 2, y: 0},{x: 3, y: 0},{x: 4, y: 0},{x: 5, y: 0},{x: 6, y: 0},{x: 7, y: 0}]);
          c2 = main.methods.w_options(position,[{x: 0, y: 1},{x: 0, y: 2},{x: 0, y: 3},{x: 0, y: 4},{x: 0, y: 5},{x: 0, y: 6},{x: 0, y: 7}]);
          c3 = main.methods.w_options(position,[{x: -1, y: 0},{x: -2, y: 0},{x: -3, y: 0},{x: -4, y: 0},{x: -5, y: 0},{x: -6, y: 0},{x: -7, y: 0}]);
          c4 = main.methods.w_options(position,[{x: 0, y: -1},{x: 0, y: -2},{x: 0, y: -3},{x: 0, y: -4},{x: 0, y: -5},{x: 0, y: -6},{x: 0, y: -7}]);
          coordinates = c1.concat(c2).concat(c3).concat(c4);
          options = coordinates.slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);        
          break;

        case 'blackRook':      
          c1 = main.methods.b_options(position,[{x: 1, y: 0},{x: 2, y: 0},{x: 3, y: 0},{x: 4, y: 0},{x: 5, y: 0},{x: 6, y: 0},{x: 7, y: 0}]);
          c2 = main.methods.b_options(position,[{x: 0, y: 1},{x: 0, y: 2},{x: 0, y: 3},{x: 0, y: 4},{x: 0, y: 5},{x: 0, y: 6},{x: 0, y: 7}]);
          c3 = main.methods.b_options(position,[{x: -1, y: 0},{x: -2, y: 0},{x: -3, y: 0},{x: -4, y: 0},{x: -5, y: 0},{x: -6, y: 0},{x: -7, y: 0}]);
          c4 = main.methods.b_options(position,[{x: 0, y: -1},{x: 0, y: -2},{x: 0, y: -3},{x: 0, y: -4},{x: 0, y: -5},{x: 0, y: -6},{x: 0, y: -7}]);
          coordinates = c1.concat(c2).concat(c3).concat(c4);
          options = coordinates.slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);        
          break;

        case 'whitePawn':
          if (main.variables.pieces[selectedpiece].moved == false) {
            coordinates = [{ x: 0, y: 1 },{ x: 0, y: 2 },{ x: 1, y: 1 },{ x: -1, y: 1 }].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          }
          else if (main.variables.pieces[selectedpiece].moved == true) {
            coordinates = [{ x: 0, y: 1 },{ x: 1, y: 1 },{ x: -1, y: 1 }].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          }
          options = (main.methods.options(startpoint, coordinates, main.variables.pieces[selectedpiece].type)).slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;
          
        case 'blackPawn':
          if (main.variables.pieces[selectedpiece].moved == false) {
            coordinates = [{ x: 0, y: -1 },{ x: 0, y: -2 },{ x: 1, y: -1 },{ x: -1, y: -1 }].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          }
          else if (main.variables.pieces[selectedpiece].moved == true) {
            coordinates = [{ x: 0, y: -1 },{ x: 1, y: -1 },{ x: -1, y: -1 }].map(function(val){
              return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
            });
          }
          options = (main.methods.options(startpoint, coordinates, main.variables.pieces[selectedpiece].type)).slice(0);
          main.variables.highlighted = options.slice(0);
          main.methods.togglehighlight(options);
          break;
      }
    },

    //Filters out movement for pieces which can go more than one space in one direction
    options: function(startpoint, coordinates, piecetype) { // first check if any of the possible coordinates is out of bounds;      
      coordinates = coordinates.filter(val => {
        let pos = { x: 0, y: 0 };
        pos.x = parseInt(val.split('_')[0]);
        pos.y = parseInt(val.split('_')[1]);
        if (!(pos.x < 1) && !(pos.x > 8) && !(pos.y < 1) && !(pos.y > 8)) { // if it is not out of bounds, return the coordinate;
          return val;
        }
      });
      switch (piecetype) {
        //Will only highlight if the tile is empty or is occupied by a piece of the opposite side
        case 'whiteKing':
          coordinates = coordinates.filter(val => {
            return ($('#' + val).attr('chess') == 'null' || ($('#' + val).attr('chess')).slice(0,1) == 'b');
          });
          break;
        case 'blackKing':      
          coordinates = coordinates.filter(val => {
            return ($('#' + val).attr('chess') == 'null' || ($('#' + val).attr('chess')).slice(0,1) == 'w');
          });
          break;
        case 'whiteKnight':
          coordinates = coordinates.filter(val => {
            return ($('#' + val).attr('chess') == 'null' || ($('#' + val).attr('chess')).slice(0,1) == 'b');
          });
          break;
        case 'blackKnight':
          coordinates = coordinates.filter(val => {
            return ($('#' + val).attr('chess') == 'null' || ($('#' + val).attr('chess')).slice(0,1) == 'w');
          });
          break;
        case 'whitePawn':
            coordinates = coordinates.filter(val => {
              let sp = { x: 0, y: 0 };
              let coordinate = val.split('_');
              sp.x = startpoint.split('_')[0];
              sp.y = startpoint.split('_')[1];
              
              if (coordinate[0] < sp.x || coordinate[0] > sp.x){ // if the coordinate is on either side of the center, check if it has an opponent piece on it;
                return ($('#' + val).attr('chess') != 'null' && ($('#' + val).attr('chess')).slice(0,1) == 'b'); // return coordinates with opponent pieces on them
              } else { // else if the coordinate is in the center;
                if (coordinate[1] == (parseInt(sp.y) + 2) && $('#' + sp.x + '_' + (parseInt(sp.y) + 1)).attr('chess') != 'null'){
                } else {
                  return ($('#' + val).attr('chess') == 'null'); // otherwise return the coordinate if there is no chess piece on it;
                }
              }                        
            });      
          break;
        case 'blackPawn':
          coordinates = coordinates.filter(val => {
            let sp = { x: 0, y: 0 };
            let coordinate = val.split('_');
            sp.x = startpoint.split('_')[0];
            sp.y = startpoint.split('_')[1];
            
            if (coordinate[0] < sp.x || coordinate[0] > sp.x){ // if the coordinate is on either side of the center, check if it has an opponent piece on it;
              return ($('#' + val).attr('chess') != 'null' && ($('#' + val).attr('chess')).slice(0,1) == 'w'); // return coordinates with opponent pieces on them
            } else { // else if the coordinate is in the center;
              if (coordinate[1] == (parseInt(sp.y) - 2) && $('#' + sp.x + '_' + (parseInt(sp.y) - 1)).attr('chess') != 'null'){
                // do nothing if this is the pawns first move, and there is a piece in front of the 2nd coordinate;
              } else {
                return ($('#' + val).attr('chess') == 'null'); // otherwise return the coordinate if there is no chess piece on it;
              }
            }
          });
          break;
      }      
      return coordinates;
    },
  
    //White player options filters out movements which are out of bounds or coincide with other pieces
    w_options: function (position,coordinates) {  
      let flag = false;  
      coordinates = coordinates.map(function(val){ // convert the x,y into actual grid id coordinates;
          return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
        }).filter(val => {
          let pos = { x: 0, y: 0 };
          pos.x = parseInt(val.split('_')[0]);
          pos.y = parseInt(val.split('_')[1]);
          if (!(pos.x < 1) && !(pos.x > 8) && !(pos.y < 1) && !(pos.y > 8)) { // if it is not out of bounds, return the coordinate;
            return val;
          }
        }).filter(val => { // Determines line-of-sight movement options for bishop/rook/queen;
          if (flag == false){
            if ($('#' + val).attr('chess') == 'null'){
              //console.log(val)
              return val;
            } else if (($('#' + val).attr('chess')).slice(0,1) == 'b') {
              flag = true;
              //console.log(val)
              return val;
            } else if (($('#' + val).attr('chess')).slice(0,1) == 'w') {
              //console.log(val+'-3')
              flag = true;
            }
          }
        });
      return coordinates;    
    },

    //White player options filters out movements which are out of bounds or coincide with other pieces
    b_options: function (position,coordinates) {   
      let flag = false;    
      coordinates = coordinates.map(function(val){ // convert the x,y into actual grid id coordinates;
          return (parseInt(position.x) + parseInt(val.x)) + '_' + (parseInt(position.y) + parseInt(val.y));
        }).filter(val => {
          let pos = { x: 0, y: 0 };
          pos.x = parseInt(val.split('_')[0]);
          pos.y = parseInt(val.split('_')[1]);
          if (!(pos.x < 1) && !(pos.x > 8) && !(pos.y < 1) && !(pos.y > 8)) { // if it is not out of bounds, return the coordinate;
            return val;
          }
        }).filter(val => { // Determines line-of-sight movement options for bishop/rook/queen;
          if (flag == false){
            if ($('#' + val).attr('chess') == 'null'){
              return val;
            } else if (($('#' + val).attr('chess')).slice(0,1) == 'w') {
              flag = true;
              return val;
            } else if (($('#' + val).attr('chess')).slice(0,1) == 'b') {
              flag = true;
            }
          }
        });
      return coordinates;   
    },

    //Capturing
    capture: function (target, servergiven) {
      // let selectedpiece = {
      //   name: $('#' + main.variables.selectedpiece).attr('chess'),
      //   id: main.variables.selectedpiece
      // };   
      //   $('#' + target.id).html(main.variables.pieces[selectedpiece.name].img);
      //   $('#' + target.id).attr('chess',selectedpiece.name);
      //   $('#' + selectedpiece.id).html('');
      //   $('#' + selectedpiece.id).attr('chess','null');
      //   main.variables.pieces[selectedpiece.name].position = target.id;
      //   main.variables.pieces[selectedpiece.name].moved = true;
      //   main.variables.pieces[target.name].captured = true;
      
      let selectedpiece = $('#' + main.variables.selectedpiece).attr('chess');
      if(servergiven != undefined){
        selectedpiece = servergiven;
      }
      //to be captured piece
      var toBeCaptured = $('#' + target.id).attr('chess');

      $('#' + target.id).html(main.variables.pieces[selectedpiece].img);
      $('#' + target.id).attr('chess', selectedpiece);
      if(servergiven != undefined){
        $('#' + main.variables.pieces[selectedpiece].position).html('');
        $('#' + main.variables.pieces[selectedpiece].position).attr('chess','null');
      }
      else{
        $('#' + main.variables.selectedpiece).html('');
        $('#' + main.variables.selectedpiece).attr('chess','null');
      }
      main.variables.pieces[selectedpiece].position = target.id;
      main.variables.pieces[selectedpiece].moved = true;
      toBeCaptured.captured = true;
    },

    //Moving
    move: function (target, servergiven) {
      let selectedpiece = $('#' + main.variables.selectedpiece).attr('chess');
      if(servergiven != undefined){
        selectedpiece = servergiven;
      }

      $('#' + target.id).html(main.variables.pieces[selectedpiece].img);
      $('#' + target.id).attr('chess', selectedpiece);
      if(servergiven != undefined){
        $('#' + main.variables.pieces[selectedpiece].position).html('');
        $('#' + main.variables.pieces[selectedpiece].position).attr('chess','null');
      }
      else{
        $('#' + main.variables.selectedpiece).html('');
        $('#' + main.variables.selectedpiece).attr('chess','null');
      }
      main.variables.pieces[selectedpiece].position = target.id;
      main.variables.pieces[selectedpiece].moved = true;
    },

    //What happens at the end of the turn
    endturn: function(targetId){
      if (main.variables.turn == 'w') {

        if(targetId != undefined){
          console.log(`White king threatened: ${main.methods.checkKingThreatened(0)}`);
          console.log(`Black king threatened: ${main.methods.checkKingThreatened(1)}`);
        }


        main.variables.turn = 'b';  
        main.methods.togglehighlight(main.variables.highlighted);
        main.variables.highlighted.length = 0;
        main.variables.selectedpiece = '';
        $('#turn').html("Black Plays");
        $('#turn').addClass('turnhighlight');
        window.setTimeout(function(){
          $('#turn').removeClass('turnhighlight');
        }, 1500);
        if(side == 0){
          canPlay = false;
        }
        else if(side == 1){
          canPlay = true;
        }
      } else if (main.variables.turn = 'b'){


        if(targetId != undefined){
          console.log(`White king threatened: ${main.methods.checkKingThreatened(0)}`);
          console.log(`Black king threatened: ${main.methods.checkKingThreatened(1)}`);
        }


        main.variables.turn = 'w';
        // toggle highlighted coordinates
        main.methods.togglehighlight(main.variables.highlighted);
        main.variables.highlighted.length = 0;
        // set the selected piece to '' again
        main.variables.selectedpiece = '';
        $('#turn').html("White Plays");
        $('#turn').addClass('turnhighlight');
        window.setTimeout(function(){
          $('#turn').removeClass('turnhighlight');
        }, 1500);
        if(side == 1){
          canPlay = false;
        }
        else if(side == 0){
          canPlay = true;
        }
      }
      //console.log("Turn ended");
    },

    //Workaround end turn for castling only
    fakeEndTurn: function(){
      main.methods.togglehighlight(main.variables.highlighted);
      main.variables.highlighted.length = 0;
      main.variables.selectedpiece = '';
      $('#turn').addClass('turnhighlight');
      window.setTimeout(function(){
        $('#turn').removeClass('turnhighlight');
      }, 1500);
      //console.log("ALTERNATVE Turn ended");
    },

    //For a specific tile, checks if that tile is controlled by the whites
    checkTileWhite: function(targetId){
      main.methods.togglehighlight(main.variables.highlighted);
      main.variables.highlighted.length = 0;
      var result = false;
      for (let gamepiece in main.variables.pieces){
        //console.log("This happens");
        if(main.variables.pieces[gamepiece].type.slice(0,1) == 'w'){
          main.methods.moveoptions(gamepiece);
        }
        if($('#' + targetId).attr('class') == 'chessSquare blue' || $('#' + targetId).attr('class') == 'chessSquare brown blue'){
          result = true;
        }
      }
      main.methods.togglehighlight(main.variables.highlighted);
      main.variables.highlighted.length = 0;
      return result;
    },

    //For a specific tile, checks if that tile is controlled by the blacks
    checkTileBlack: function(targetId){
      main.methods.togglehighlight(main.variables.highlighted);
      main.variables.highlighted.length = 0;
      var result = false;
      for (let gamepiece in main.variables.pieces){
        //console.log("This happens");
        if(main.variables.pieces[gamepiece].type.slice(0,1) == 'b'){
          main.methods.moveoptions(gamepiece);
        }
        if($('#' + targetId).attr('class') == 'chessSquare blue' || $('#' + targetId).attr('class') == 'chessSquare brown blue'){
          result = true;
          break;
        }
      }
      main.methods.togglehighlight(main.variables.highlighted);
      main.variables.highlighted.length = 0;
      return result;
    },

    checkKingThreatened: function(givenSide, targetId){
      if(targetId != undefined){
        if(givenSide == 0){
          return main.methods.checkTileBlack(targetId);
        }
        else{
          return main.methods.checkTileWhite(targetId);
        }
      }
      else{
        if(givenSide == 0){
          return main.methods.checkTileBlack(main.variables.pieces["whiteKing"].position);
        }
        else{
          return main.methods.checkTileWhite(main.variables.pieces["blackKing"].position);
        }
      }
    },

    impossibleMove: function(){
      console.log("Impossible Move!");
      var temp = document.getElementById("impossibleCounter").innerHTML.split(": ");
      temp = parseInt(temp[1]);
      temp++;
      if(temp == 3){
        impossibleMessage(socket, playerId);
        main.methods.togglehighlight(main.variables.highlighted);
        main.variables.highlighted.length = 0;
        canPlay = false;
        document.getElementById("turn").innerHTML = "YOU LOST! 3rd IMPOSSIBLE MOVE";
      }
      document.getElementById("impossibleCounter").innerHTML = `Impossible Moves: ${temp}`;
    },

    checkMate: function(){
      if(side == 0){ //White side checkmate
        if(!main.methods.checkKingThreatened(1)){
          console.log("Black king not threatened");
          return false;
        }
        main.methods.moveoptions("blackKing");
        for(var i = 1; i != 9; i++){
          console.log("First checkmate loop");
          for(var j = 1; j != 9; j++){
            console.log("Second checkmate loop");
            if($(`#${i}_${j}`).attr('class') == 'chessSquare blue' || $(`#${i}_${j}`).attr('class') == 'chessSquare brown blue'){
              console.log(`Found blue tile at: ${i}_${j}`);
              var thisTile = main.methods.checkTileWhite(`${i}_${j}`);
              var whitePiecePresent = $(`#${i}_${j}`).attr('chess').slice(0, 1) == 'w';
              if(!thisTile && !whitePiecePresent){
                console.log("Checkmate returned false");
                return false;
              }
            }
            main.methods.moveoptions("blackKing");
          }
        }
        console.log("CHECKMATE MMMMM");
        main.methods.togglehighlight(main.variables.highlighted);
        main.variables.highlighted.length = 0;
        canPlay = false;
        document.getElementById("turn").innerHTML = "CONGRATS! YOU WON";
        return true;
      }
      else{ //Black side checkmate
        if(!main.methods.checkKingThreatened(0)){
          return false;
        }
        main.methods.moveoptions("whiteKing");
        for(var i = 1; i != 9; i++){
          for(var j = 1; j != 9; j++){
            if($(`#${i}_${j}`).attr('class') == 'chessSquare blue' || $(`#${i}_${j}`).attr('class') == 'chessSquare brown blue'){
              var thisTile = main.methods.checkTileBlack(`${i}_${j}`);
              var blackPiecePresent = $(`#${i}_${j}`).attr('chess').slice(0, 1) == 'b';
              if(!thisTile && !blackPiecePresent){
                return false;
              }
            }
            main.methods.moveoptions("whiteKing");
          }
        }
        console.log("CHECKMATE MMMMM");
        main.methods.togglehighlight(main.variables.highlighted);
        main.variables.highlighted.length = 0;
        canPlay = false;
        document.getElementById("turn").innerHTML = "CONGRATS! YOU WON";
        return true;
      }
    },

    //Toggles blue highlights
    togglehighlight: function(options) {
      options.forEach(function(element, index, array) {
        $('#' + element).toggleClass("blue");
      });
    },
  }
};
    $(document).ready(function() {
    main.methods.gamesetup();
    $('.chessSquare').click(function godLike(e) {
      if(canPlay){
        var selectedpiece = {
          name: '',
          id: main.variables.selectedpiece
        };
        if (main.variables.selectedpiece == ''){
          selectedpiece.name = $('#' + e.target.id).attr('chess');
        } else {
          selectedpiece.name = $('#' + main.variables.selectedpiece).attr('chess');
        }
        var target = {
          name: $(this).attr('chess'),
          id: e.target.id
        };
        if (main.variables.selectedpiece == '' && target.name.slice(0,1) == main.variables.turn) { // show options
          main.variables.selectedpiece = e.target.id;
          main.methods.moveoptions($(this).attr('chess'));
        } else if (main.variables.selectedpiece !='' && target.name == 'null') { // move selected piece
          if (selectedpiece.name == 'whiteKing' || selectedpiece.name == 'blackKing'){   
            let t0 = (selectedpiece.name == 'whiteKing');
            let t1 = (selectedpiece.name == 'blackKing');
            let t2 = (main.variables.pieces[selectedpiece.name].moved == false);
            let t3 = (main.variables.pieces['blackRook2'].moved == false);
            let t4 = (main.variables.pieces['whiteRook2'].moved == false);
            let t5 = (target.id == '7_8');
            let t6 = (target.id == '7_1');
            let t7 = (main.variables.pieces['blackRook1'].moved == false);
            let t8 = (main.variables.pieces['whiteRook1'].moved == false);
            let t9 = (target.id == '2_8');
            let t10 = (target.id == '2_1');
      
            if (t0 && t2 && t4 && t6){ // castle right whiteKing
              let k_position = '5_1';
              let k_target = '7_1';
              let r_position = '8_1';
              let r_target = '6_1';
              main.variables.pieces['whiteKing'].position = '7_1';
              main.variables.pieces['whiteKing'].moved = true;
              $('#'+k_position).html('');
              $('#'+k_position).attr('chess','null');
              $('#'+k_target).html(main.variables.pieces['whiteKing'].img);
              $('#'+k_target).attr('chess','whiteKing');
              main.variables.pieces['whiteRook2'].position = '6_1';
              main.variables.pieces['whiteRook2'].moved = true;
              $('#'+r_position).html('');
              $('#'+r_position).attr('chess','null');
              $('#'+r_target).html(main.variables.pieces['whiteRook2'].img);
              $('#'+r_target).attr('chess','whiteRook2');

              console.log(`White side right castle`);
              moveMessage(socket, playerId, "whiteKing", "5_1", "7_1");
              castleMessage(socket, playerId, "whiteRook2", "8_1", "6_1");
              main.methods.endturn(target.id);
            }
            else if(t0 && t2 && t8 && t10){ // castle left whiteKing
              let k_position = '5_1';
              let k_target = '2_1';
              let r_position = '1_1';
              let r_target = '3_1';
              main.variables.pieces['whiteKing'].position = '2_1';
              main.variables.pieces['whiteKing'].moved = true;
              $('#'+k_position).html('');
              $('#'+k_position).attr('chess','null');
              $('#'+k_target).html(main.variables.pieces['whiteKing'].img);
              $('#'+k_target).attr('chess','whiteKing');
              main.variables.pieces['whiteRook1'].position = '3_1';
              main.variables.pieces['whiteRook1'].moved = true;
              $('#'+r_position).html('');
              $('#'+r_position).attr('chess','null');
              $('#'+r_target).html(main.variables.pieces['whiteRook1'].img);
              $('#'+r_target).attr('chess','whiteRook1');

              console.log(`White side left castle`);
              moveMessage(socket, playerId, "whiteKing", "5_1", "2_1");
              castleMessage(socket, playerId, "whiteRook1", "1_1", "3_1");
              main.methods.endturn(target.id);
            }

            else if (t1 && t2 && t7 && t9){ // castle left blackKing
              let k_position = '5_8';
              let k_target = '2_8';
              let r_position = '1_8';
              let r_target = '3_8';
              main.variables.pieces['blackKing'].position = '2_8';
              main.variables.pieces['blackKing'].moved = true;
              $('#'+k_position).html('');
              $('#'+k_position).attr('chess','null');
              $('#'+k_target).html(main.variables.pieces['blackKing'].img);
              $('#'+k_target).attr('chess','blackKing');
              main.variables.pieces['blackRook1'].position = '3_8';
              main.variables.pieces['blackRook1'].moved = true;
              $('#'+r_position).html('');
              $('#'+r_position).attr('chess','null');
              $('#'+r_target).html(main.variables.pieces['blackRook1'].img);
              $('#'+r_target).attr('chess','blackRook1');

              console.log(`Black side left castle`);
              moveMessage(socket, playerId, "blackKing", "5_8", "2_8");
              castleMessage(socket, playerId, "blackRook1", "1_8", "3_8");
              main.methods.endturn(target.id);        
            } 

            else if(t1 && t2 && t3 && t5){ // castle right blackKing
              let k_position = '5_8';
              let k_target = '7_8';
              let r_position = '8_8';
              let r_target = '6_8';
              main.variables.pieces['blackKing'].position = '7_8';
              main.variables.pieces['blackKing'].moved = true;
              $('#'+k_position).html('');
              $('#'+k_position).attr('chess','null');
              $('#'+k_target).html(main.variables.pieces['blackKing'].img);
              $('#'+k_target).attr('chess','blackKing');
              main.variables.pieces['blackRook2'].position = '6_8';
              main.variables.pieces['blackRook2'].moved = true;
              $('#'+r_position).html('');
              $('#'+r_position).attr('chess','null');
              $('#'+r_target).html(main.variables.pieces['blackRook2'].img);
              $('#'+r_target).attr('chess','blackRook2');

              console.log(`Black side right castle`);
              moveMessage(socket, playerId, "blackKing", "5_8", "7_8");
              castleMessage(socket, playerId, "blackRook2", "8_8", "6_8");
              main.methods.endturn(target.id);        
            }

            else { // move selectedpiece
              if($('#' + target.id).attr('class') == 'chessSquare blue' || $('#' + target.id).attr('class') == 'chessSquare brown blue'){
                if(main.methods.checkKingThreatened(side, target.id)){
                  main.methods.impossibleMove();
                }
                else{
                  main.methods.move(target);
                  console.log(`Move made by: ${selectedpiece.name}, from ${selectedpiece.id}, to ${target.id}`);
                  moveMessage(socket, playerId, selectedpiece.name, selectedpiece.id, target.id);
                  main.methods.endturn(target.id);
                  if(main.methods.checkMate()){
                    console.log("Checkmate!");
                    checkmateMessage(socket, playerId);
                  } 
                }
              }
            }


          } else { // else if selecedpiece.name is not white/black king than move
            if($('#' + target.id).attr('class') == 'chessSquare blue' || $('#' + target.id).attr('class') == 'chessSquare brown blue'){
              if(main.methods.checkKingThreatened(side)){
                main.methods.impossibleMove();
              }
              else{
                main.methods.move(target);
                console.log(`Move made by: ${selectedpiece.name}, from ${selectedpiece.id}, to ${target.id}`);
                moveMessage(socket, playerId, selectedpiece.name, selectedpiece.id, target.id);
                main.methods.endturn(target.id);
                if(main.methods.checkMate()){
                  console.log("Checkmate!");
                  checkmateMessage(socket, playerId);
                } 
              }
            }

          }     
        } else if (main.variables.selectedpiece !='' && target.name != 'null' && target.id != selectedpiece.id && selectedpiece.name.slice(0,1) != target.name.slice(0,1)){ // capture a piece   
          if (selectedpiece.id != target.id && main.variables.highlighted.indexOf(target.id) != (-1)) { // if it's not trying to capture pieces not in its movement range   
            if(main.methods.checkKingThreatened(side)){
              main.methods.impossibleMove();
            } 
            else{
              main.methods.capture(target)
              console.log(`Move made by: ${selectedpiece.name}, from ${selectedpiece.id}, to ${target.id}, CAPTURE`);
              captureMessage(socket, playerId, selectedpiece.name, selectedpiece.id, target.id);
              main.methods.endturn(target.id);  
              if(main.methods.checkMate()){
                console.log("Checkmate!");
                checkmateMessage(socket, playerId);
              } 
            }
          }
        } else if (main.variables.selectedpiece !='' && target.name != 'null' && target.id != selectedpiece.id && selectedpiece.name.slice(0,1) == target.name.slice(0,1)){ // toggle move options
          // toggle
          main.methods.togglehighlight(main.variables.highlighted);
          main.variables.highlighted.length = 0;
          main.variables.selectedpiece = target.id;
          main.methods.moveoptions(target.name);
        }
      }
    });
        $('body').contextmenu(function(e) {
        e.preventDefault();
        });
    });



    //FULSCREEN////////////////////////////////////////////////////////////////////////////
    var db, isfullscreen = false;
    function toggleFullScreen(){
        db = document.body;
        if(isfullscreen == false){
            if(db.requestFullScreen){
                db.requestFullScreen();
            } else if(db.webkitRequestFullscreen){
                db.webkitRequestFullscreen();
            } else if(db.mozRequestFullScreen){
                db.mozRequestFullScreen();
            } else if(db.msRequestFullscreen){
                db.msRequestFullscreen();
            }
            isfullscreen = true;
            wrap.style.width = window.screen.width+"px";
            wrap.style.height = window.screen.height+"px";
            //document.getElementsByClassName("fullscreen").innerHTML = "Windowed";
        } else {
            if(document.cancelFullScreen){
                document.cancelFullScreen();
            } else if(document.exitFullScreen){
                document.exitFullScreen();
            } else if(document.mozCancelFullScreen){
                document.mozCancelFullScreen();
            } else if(document.webkitCancelFullScreen){
                document.webkitCancelFullScreen();
            } else if(document.msExitFullscreen){
                document.msExitFullscreen();
            }
            isfullscreen = false;
            wrap.style.width = "100%";
            wrap.style.height = "auto";
        }
    }
    // If the viewport is less than, or equal to, 700 pixels wide, the background color will be yellow. If it is greater than 700, it will change to pink.
    function resolution(x) {
      if (x.matches) { // If media query matches
        document.body.style.backgroundColor = "red";
      } 
      else {
       document.body.style.backgroundColor = "#454545";
      }
    }
    
    var x = window.matchMedia("(max-width: 600px)")
    resolution(x) // Call listener function at run time
    x.addListener(resolution) // Attach listener function on state changes
    window.alert("If your background is red it means the resolution of the website is not same with game's resolution please change it");
    