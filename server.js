/**************
 SYSTEM INCLUDES
**************/
var	http = require('http');
var sys = require('sys');
var	async = require('async');
var sanitizer = require('sanitizer');
var sanitizeMarkdown = require('sanitize-markdown');
var compression = require('compression');
var express = require('express');
var conf = require('./config.js').server;

/**************
 LOCAL INCLUDES
**************/
var	rooms	= require('./lib/rooms.js');
var	data	= require('./lib/data.js').db;

/**************
 GLOBALS
**************/
//Map of sids to user_names
var sids_to_user_names = [];

/**************
 SETUP EXPRESS
**************/
var app = express();
var router = express.Router();

app.use(compression());
app.use(conf.baseurl, router);

router.use(express.static(__dirname + '/client'));

var server = require('http').Server(app);
server.listen(conf.port);

console.log('Server running at http://127.0.0.1:' + conf.port + '/');

/**************
 SETUP Socket.IO
**************/
var io = require('socket.io')(server, {
	path: conf.baseurl == '/' ? '' : conf.baseurl + "/socket.io"
});

/**************
 ROUTES
**************/
router.get('/', function(req, res) {
	//console.log(req.header('host'));
	url = req.header('host') + req.baseUrl;

	var connected = io.sockets.connected;
	clientsCount = Object.keys(connected).length;

	res.render('home.jade', {
		url: url,
		connected: clientsCount
	});
});

router.get('/demo', function(req, res) {
	res.render('index.jade', {
		pageTitle: 'scrumblr - demo',
		demo: true
	});
});

router.get('/:id', function(req, res){
	res.render('index.jade', {
		pageTitle: ('scrumblr - ' + req.params.id)
	});
});

/**************
 SOCKET.I0
**************/
io.sockets.on('connection', function (client) {
	// sanitizes text
	function scrub(text) {
		if (typeof text != "undefined" && text !== null) {
            text = clip_text(text);
			return sanitizer.sanitize(text);
		} else {
			return null;
		}
	}

	// sanitizes markdown
	function scrub_md(text) {
		if (typeof text != "undefined" && text !== null) {
            text = clip_text(text);
			return sanitizeMarkdown(text);
		} else {
			return null;
		}
	}

	// ensure that the text has a reasonable length
	function clip_text(text) {
        if (text.length > 5000) {
            text = text.substr(0, 5000);
        }
        return text;
	}

	client.on('message', function( message ){
		console.log('Server action:' + message.action + ' -- ' + sys.inspect(message.data) );

		var clean_data = {};
		var clean_message = {};
		var message_out = {};

		if (!message.action) {
		    return;
		}

		switch (message.action) {
			case 'initializeMe':
				initClient(client);
				break;

			case 'joinRoom':
				joinRoom(client, message.data, function(clients) {
                    client.json.send( { action: 'roomAccept', data: '' } );
				});
				break;

			case 'moveCard':
				//report to all other browsers
				message_out = {
					action: message.action,
					data: {
						id: scrub(message.data.id),
						position: {
							left: scrub(message.data.position.left),
							top: scrub(message.data.position.top)
						}
					}
				};

				broadcastToRoom( client, message_out );

				getRoom(client, function(room) {
					db.cardSetXY( room , message.data.id, message.data.position.left, message.data.position.top);
				});
				break;

			case 'createCard':
				data = message.data;
				clean_data = {};
				clean_data.text = scrub_md(data.text);
				clean_data.id = scrub(data.id);
				clean_data.x = scrub(data.x);
				clean_data.y = scrub(data.y);
				clean_data.rot = scrub(data.rot);
				clean_data.colour = scrub(data.colour);
				clean_data.type = scrub(data.type);

				getRoom(client, function(room) {
					createCard(
					    room,
					    clean_data.id,
					    clean_data.text,
					    clean_data.x,
					    clean_data.y,
					    clean_data.rot,
					    clean_data.colour,
					    clean_data.type
					);
				});

				message_out = {
					action: 'createCard',
					data: clean_data
				};

				//report to all other browsers
				broadcastToRoom( client, message_out );
				break;

			case 'editCard':
				clean_data = {};
				clean_data.id = scrub(message.data.id);
				if (message.data.value) {
					clean_data.value = scrub_md(message.data.value);
				}

				if (message.data.colour) {
					clean_data.colour = scrub(message.data.colour);
				}

				//send update to database
				getRoom(client, function(room) {
					db.cardEdit( room , clean_data.id, clean_data.value, clean_data.colour);
				});

				message_out = {
					action: 'editCard',
					data: clean_data
				};

				broadcastToRoom(client, message_out);
				break;

			case 'deleteCard':
				clean_message = {
					action: 'deleteCard',
					data: { id: scrub(message.data.id) }
				};

				getRoom( client, function(room) {
					db.deleteCard ( room, clean_message.data.id );
				});

				//report to all other browsers
				broadcastToRoom( client, clean_message );

				break;

			case 'pulsateCard':
				clean_message = {
					action: 'pulsateCard',
					data: {
					    id: scrub(message.data.id)
					}
				};

				broadcastToRoom( client, clean_message );
				break;

			case 'createColumn':
				clean_message = { data: scrub(message.data) };

				getRoom( client, function(room) {
					db.createColumn( room, clean_message.data, function() {} );
				});

				broadcastToRoom( client, clean_message );
				break;

			case 'deleteColumn':
				getRoom( client, function(room) {
					db.deleteColumn(room);
				});

				broadcastToRoom( client, { action: 'deleteColumn' } );
				break;

			case 'updateColumns':
				var columns = message.data;

				if (!(columns instanceof Array))
					break;

				var clean_columns = [];

				for (var i in columns)
				{
					clean_columns[i] = scrub( columns[i] );
				}
				getRoom( client, function(room) {
					db.setColumns( room, clean_columns );
				});

				broadcastToRoom( client, { action: 'updateColumns', data: clean_columns } );
				break;

			case 'createRow':
				clean_message = {
					action: 'createRow',
					data: {
					    id: scrub(message.data.id),
					    text: scrub(message.data.text),
					    y: scrub(message.data.y)
					}
				};

				getRoom( client, function(room) {
					db.createRow( room, clean_message.data.id, clean_message.data);
				});

				broadcastToRoom( client, clean_message );
				break;

			case 'updateRowText':
				clean_message = {
					action: 'updateRowText',
					data: {
					    id: scrub(message.data.id),
					    text: scrub(message.data.text)
					}
				};

				getRoom( client, function(room) {
					db.updateRowText( room, clean_message.data.id, clean_message.data.text);
				});

				broadcastToRoom( client, clean_message );
				break;

			case 'updateRowPos':
				clean_message = {
					action: 'updateRowPos',
					data: {
					    id: scrub(message.data.id),
					    y: scrub(message.data.y)
					}
				};

				getRoom( client, function(room) {
					db.updateRowPos( room, clean_message.data.id, clean_message.data.y);
				});

				broadcastToRoom( client, clean_message );
				break;

			case 'deleteRow':
				clean_message = {
					action: 'deleteRow',
					data: {
					    id: scrub(message.data.id)
					}
				};

				getRoom( client, function(room) {
					db.deleteRow(room, clean_message.data.id);
				});

				broadcastToRoom( client, clean_message);
				break;

			case 'updateRows':
				var rows = message.data;

				if (!(rows instanceof Array))
					break;

				var clean_rows = [];

				for (var i in rows)
				{
					clean_rows[i] = scrub( rows[i] );
				}
				getRoom( client, function(room) {
					db.setRows( room, clean_rows );
				});

				broadcastToRoom( client, { action: 'updateRows', data: clean_rows } );
				break;

			case 'changeTheme':
				clean_message = {};
				clean_message.data = scrub(message.data);

				getRoom( client, function(room) {
					db.setTheme( room, clean_message.data );
				});

				clean_message.action = 'changeTheme';

				broadcastToRoom( client, clean_message );
				break;

			case 'setUserName':
				clean_message = {};

				clean_message.data = scrub(message.data);

				setUserName(client, clean_message.data);

				var msg = {};
				msg.action = 'nameChangeAnnounce';
				msg.data = { sid: client.id, user_name: clean_message.data };

				broadcastToRoom( client, msg );
				break;

			case 'addSticker':
				var cardId = scrub(message.data.cardId);
				var stickerId = scrub(message.data.stickerId);

				getRoom(client, function(room) {
					db.addSticker( room , cardId, stickerId );
				});

				broadcastToRoom( client, { action: 'addSticker', data: { cardId: cardId, stickerId: stickerId }});
				break;

			case 'setBoardSize':
				var size = {};
				size.width = scrub(message.data.width);
				size.height = scrub(message.data.height);

				getRoom(client, function(room) {
					db.setBoardSize( room, size );
				});

				broadcastToRoom( client, { action: 'setBoardSize', data: size } );
				break;

			case 'moveMarker':
				message_out = {
					action: message.action,
					data: {
						id: scrub(message.data.id),
						x: scrub(message.data.x)
					}
				};

				broadcastToRoom(client, message_out);

				getRoom(client, function(room) {
					db.moveMarkerX(room , message.data.id, message.data.x);
				});
				break;

			case 'moveEraser':
				message_out = {
					action: message.action,
					data: {
						id: scrub(message.data.id),
						x: scrub(message.data.x)
					}
				};

				broadcastToRoom(client, message_out);

				getRoom(client, function(room) {
					db.moveEraserX(room , message.data.id, message.data.x);
				});
				break;

			default:
			    console.log('unknown action: ' + message.action);
				break;
		}
	});

	client.on('disconnect', function() {
			leaveRoom(client);
	});

  //tell all others that someone has connected
  //client.broadcast('someone has connected');
});

/**************
 FUNCTIONS
**************/
function initClient(client)
{
	//console.log ('initClient Started');
	getRoom(client, function(room) {

		db.getAllCards(room , function (cards) {
			client.json.send(
				{
					action: 'initCards',
					data: cards
				}
			);

		});

		db.getAllColumns(room, function (columns) {
			client.json.send(
				{
					action: 'initColumns',
					data: columns
				}
			);
		});

		db.getAllRows(room, function (rows) {
			client.json.send(
				{
					action: 'initRows',
					data: rows
				}
			);
		});

		db.getEraser(room, function(eraser) {
		    if (eraser == null) {
		        eraser = {id: 'eraser', x: '70px'};
		    }

			client.json.send(
				{
					action: 'moveEraser',
					data: eraser
				}
			);
		});

		db.getMarker(room, function(marker) {
		    if (marker == null) {
		        marker = {id: 'marker', x: '200px'};
		    }

			client.json.send(
				{
					action: 'moveMarker',
					data: marker
				}
			);
		});

		db.getTheme(room, function(theme) {
			if (theme === null) {
			    theme = 'bigcards';
			}

			client.json.send(
				{
					action: 'changeTheme',
					data: theme
				}
			);
		});

		db.getBoardSize( room, function(size) {
			if (size !== null) {
				client.json.send(
					{
						action: 'setBoardSize',
						data: size
					}
				);
			}
		});

		roommates_clients = rooms.room_clients(room);
		roommates = [];

		var j = 0;
		for (var i in roommates_clients) {
			if (roommates_clients[i].id != client.id) {
				roommates[j] = {
					sid: roommates_clients[i].id,
					user_name:  sids_to_user_names[roommates_clients[i].id]
					};
				j++;
			}
		}

		client.json.send(
			{
				action: 'initialUsers',
				data: roommates
			}
		);

	});
}


function joinRoom (client, room, successFunction) {
	var msg = {};
	msg.action = 'join-announce';
	msg.data = { sid: client.id, user_name: client.user_name };

	rooms.add_to_room_and_announce(client, room, msg);
	successFunction();
}

function leaveRoom (client) {
	//console.log (client.id + ' just left');
	var msg = {};
	msg.action = 'leave-announce';
	msg.data = { sid: client.id };
	rooms.remove_from_all_rooms_and_announce(client, msg);

	delete sids_to_user_names[client.id];
}

function broadcastToRoom ( client, message ) {
	rooms.broadcast_to_roommates(client, message);
}

//----------------CARD FUNCTIONS
function createCard( room, id, text, x, y, rot, colour, type) {
	var card = {
		id: id,
		colour: colour,
		rot: rot,
		x: x,
		y: y,
		text: text,
		sticker: null,
		type: type
	};

	db.createCard(room, id, card);
}

function roundRand( max ) {
	return Math.floor(Math.random() * max);
}

//------------ROOM STUFF
// Get Room name for the given Session ID
function getRoom( client , callback ) {
	room = rooms.get_room( client );
	callback(room);
}

function setUserName ( client, name ) {
	client.user_name = name;
	sids_to_user_names[client.id] = name;
	console.dir(sids_to_user_names);
}

function cleanAndInitializeDemoRoom() {
    room_name = '/demo'

	// DUMMY DATA
	db.clearRoom(room_name, function() {
		db.setBoardSize(room_name, { width: 1200, height: 600 });
		db.setTheme(room_name, 'bigcards')

		db.createColumn(room_name, 'To Do' );
		db.createColumn(room_name, 'In progress' );
		db.createColumn(room_name, 'Done' );

		createCard(room_name, 'card1', '**Discuss** new topics', 64, 235, Math.random() * 10 - 5, 'yellow');
		createCard(room_name, 'card2', '# Important\n- Water the **flowers**!\n- Send a letter', 424, 217, Math.random() * 10 - 5, 'white');
		createCard(room_name, 'card3', 'Buy tickets to the _cinema_.', 430, 450, Math.random() * 10 - 5, 'blue');
		createCard(room_name, 'card4', 'Read funny book', 423, 66, Math.random() * 10 - 5, 'green');
		createCard(room_name, 'card5', 'Learn [markdown syntax](https://www.markdownguide.org/basic-syntax/)', 0, 47, Math.random() * 10 - 5, 'red');
		createCard(room_name, 'card6', 'Call your **friends**...', 855, 72, Math.random() * 10 - 5, 'orange');
		createCard(room_name, 'card7', '# Repair printer\n---\nand test it!', 902, 240, Math.random() * 10 - 5, 'purple');
		createCard(room_name, 'card8', 'Meet your family', 18, 444, Math.random() * 10 - 5, 'red');

		db.createRow(room_name, 'row123', {id: 'row123', text: 'Other tasks...', y: 400});
	});
}

/**************
 SETUP DATABASE ON FIRST RUN
**************/
// (runs only once on startup)
var db = new data(function() {
	cleanAndInitializeDemoRoom();
});
