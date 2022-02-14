var conf = require('../../config.js').database;
var redis = require("redis");
var async = require("async");
var sets = require('simplesets');
var REDIS_PREFIX = '#scrumblr#';

var redisClient = null;

//For Redis Debugging
var db = function(callback) {
    console.log('Opening redis connection to ' + conf.redis);
    redisClient = redis.createClient(conf.redis);

    redisClient.on("connect", function (err) {
        callback();
    });

    redisClient.on("error", function (err) {
        console.log("Redis error: " + err);
    });

};

db.prototype = {
    clearRoom: function(room, callback) {
        redisClient.del(REDIS_PREFIX + '-room:' + room + '-cards', function (err, res) {
            redisClient.del(REDIS_PREFIX + '-room:' + room + '-columns', function (err, res) {
                redisClient.del(REDIS_PREFIX + '-room:' + room + '-rows', function (err, res) {
                    callback();
                });
            });
        });
    },

    // theme commands
    setTheme: function(room, theme) {
        redisClient.set(REDIS_PREFIX + '-room:' + room + '-theme', theme);
    },

    getTheme: function(room, callback) {
        redisClient.get(REDIS_PREFIX + '-room:' + room + '-theme', function (err, res) {
            callback(res);
        });
    },

    // Column commands
    createColumn: function(room, name, callback) {
        redisClient.rpush(REDIS_PREFIX + '-room:' + room + '-columns', name,
            function (err, res) {
                if (typeof callback != "undefined" && callback !== null) {
                    callback();
                }
            }
        );
    },

    getAllColumns: function(room, callback) {
        redisClient.lrange(REDIS_PREFIX + '-room:' + room + '-columns', 0, -1, function(err, res) {
            callback(res);
        });
    },

    deleteColumn: function(room) {
        redisClient.rpop(REDIS_PREFIX + '-room:' + room + '-columns');
    },

    setColumns: function(room, columns) {
        //1. first delete all columns
        redisClient.del(REDIS_PREFIX + '-room:' + room + '-columns', function () {
            //2. now add columns for each thingy
            async.forEachSeries(
                columns,
                function(item, callback ) {
                    redisClient.rpush(REDIS_PREFIX + '-room:' + room + '-columns', item,
                        function (err, res) {
                            callback();
                        }
                    );
                },
                function() {
                    //this happens when the series is complete
                }
            );
        });
    },

    // Card commands
    createCard: function(room, id, card) {
        var cardString = JSON.stringify(card);
        redisClient.hset(
            REDIS_PREFIX + '-room:' + room + '-cards',
            id,
            cardString
        );
    },

    getAllCards: function(room, callback) {
        redisClient.hgetall(REDIS_PREFIX + '-room:' + room + '-cards', function (err, res) {
            var cards = [];

            for (var i in res) {
                cards.push( JSON.parse(res[i]) );
            }

            callback(cards);
        });
    },

    cardEdit: function(room, id, text, colour) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-cards', id, function(err, res) {
            var card = JSON.parse(res);
            if (card !== null) {
                if (text) {
                    card.text = text;
                }
                if (colour) {
                    card.colour = colour;
                }
                redisClient.hset(REDIS_PREFIX + '-room:' + room + '-cards', id, JSON.stringify(card));
            }
        });
    },

    cardSetXY: function(room, id, x, y) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-cards', id, function(err, res) {
            var card = JSON.parse(res);
            if (card !== null) {
                card.x = x;
                card.y = y;
                redisClient.hset(REDIS_PREFIX + '-room:' + room + '-cards', id, JSON.stringify(card));
            }
        });
    },

    deleteCard: function(room, id) {
        redisClient.hdel(
            REDIS_PREFIX + '-room:' + room + '-cards',
            id
        );
    },

    addSticker: function(room, cardId, stickerId) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-cards', cardId, function(err, res) {
            var card = JSON.parse(res);
            if (card !== null) {
                if (stickerId === "nosticker")
                {
                    card.sticker = null;

                    redisClient.hset(REDIS_PREFIX + '-room:' + room + '-cards', cardId, JSON.stringify(card));
                }
                else
                {
                    if (card.sticker !== null)
                        stickerSet = new sets.Set( card.sticker );
                    else
                        stickerSet = new sets.Set();

                    stickerSet.add(stickerId);

                    card.sticker = stickerSet.array();

                    redisClient.hset(REDIS_PREFIX + '-room:' + room + '-cards', cardId, JSON.stringify(card));
                }

            }
        });
    },

    setBoardSize: function(room, size) {
        redisClient.set(REDIS_PREFIX + '-room:' + room + '-size', JSON.stringify(size));
    },

    getBoardSize: function(room, callback) {
        redisClient.get(REDIS_PREFIX + '-room:' + room + '-size', function (err, res) {
            callback(JSON.parse(res));
        });
    },

    // Row commands
    createRow: function(room, id, row) {
        var rowString = JSON.stringify(row);
        redisClient.hset(
            REDIS_PREFIX + '-room:' + room + '-rows',
            id,
            rowString
        );
    },

    getAllRows: function(room, callback) {
        redisClient.hgetall(REDIS_PREFIX + '-room:' + room + '-rows', function (err, res) {
            var rows = [];
            for (var i in res) {
                rows.push(JSON.parse(res[i]));
            }
            callback(rows);
        });
    },

    updateRowText: function(room, id, text) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-rows', id, function(err, res) {
            var row = JSON.parse(res);
            if (row !== null) {
                row.text = text;
                redisClient.hset(REDIS_PREFIX + '-room:' + room + '-rows', id, JSON.stringify(row));
            }
        });
    },

    updateRowPos: function(room, id, y) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-rows', id, function(err, res) {
            var row = JSON.parse(res);
            if (row !== null) {
                row.y = y;
                redisClient.hset(REDIS_PREFIX + '-room:' + room + '-rows', id, JSON.stringify(row));
            }
        });
    },

    deleteRow: function(room, id) {
        redisClient.hdel(
            REDIS_PREFIX + '-room:' + room + '-rows',
            id
        );
    },

    moveEraserX: function(room, id, x) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-eraser', id, function(err, res) {
            var eraser = JSON.parse(res);
            if (eraser !== null) {
                eraser.id = id;
                eraser.x = x;
            } else {
                eraser = {id: id, x: x}
            }

            redisClient.hset(REDIS_PREFIX + '-room:' + room + '-eraser', id, JSON.stringify(eraser));
        });
    },

    moveMarkerX: function(room, id, x) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-marker', id, function(err, res) {
            var marker = JSON.parse(res);
            if (marker !== null) {
                marker.id = id;
                marker.x = x;
            } else {
                marker = {id: id, x: x}
            }

            redisClient.hset(REDIS_PREFIX + '-room:' + room + '-marker', id, JSON.stringify(marker));
        });
    },

    getMarker: function(room, callback) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-marker', 'marker', function (err, res) {
            callback(JSON.parse(res));
        });
    },

    getEraser: function(room, callback) {
        redisClient.hget(REDIS_PREFIX + '-room:' + room + '-eraser', 'eraser', function (err, res) {
            callback(JSON.parse(res));
        });
    }
};

exports.db = db;
