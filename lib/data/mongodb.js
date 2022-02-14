var Db = require('mongodb').Db;
    Server = require('mongodb').Server,
    BSON = require('mongodb').BSONNative,
    conf = require('../../config.js').database;

var db = function(callback) {
    this.rooms = false;
    var t = this;
    var db = new Db(conf.database, new Server(conf.hostname, conf.port), {native_parser:true});

    db.open(function(err, db) {
        db.collection('rooms', function(err, collection) {
            // make sure we have an index on name
            collection.ensureIndex([['name',1]],false,function() {});
            t.rooms = collection;
        });

        callback();
    });
}

db.prototype = {
    clearRoom: function(room, callback) {
        this.rooms.remove({name:room},callback);
    },

    // theme commands
    setTheme: function(room, theme) {
        this.rooms.update(
            {name:room},
            {$set:{theme:theme}},
            {upsert:true}
        );
    },

    getTheme: function(room, callback) {
        this.rooms.findOne(
            {name:room},
            {theme:true},
            function(err, res) {
                callback(res != null && 'theme' in res ? res.theme : 'bigcards');
            }
        );
    },

    // Column commands
    createColumn: function(room, name, callback) {
        this.rooms.update(
            {name:room},
            {$push:{columns:name}},
            {upsert:true}
            ,callback
        );
    },

    getAllColumns: function(room, callback) {
        this.rooms.findOne({name:room},{columns:true},function(err, res) {
            if (res != null && 'columns' in res && res.columns != null) {
                callback(res.columns);
            } else {
                callback([]);
            }
        });
    },

    setColumns: function(room, columns) {
        this.rooms.update(
            {name:room},
            {$set:{columns:columns}},
            {upsert:true}
        );
    },

    deleteColumn: function(room) {
        this.rooms.update(
            {name:room},
            {$pop:{columns:1}}
        );
    },

    // Card commands
    createCard: function(room, id, card) {
        var doc = {};
        doc['cards.'+id] = card;
        this.rooms.update(
            {name:room},
            {$set:doc},
            {upsert:true}
        );
    },

    getAllCards: function(room, callback) {
        this.rooms.findOne({name:room},{cards:true},function(err, res) {
            var cards = [];
            if (res != null && 'cards' in res) {
                for (var id in res.cards) {
                    cards.push(res.cards[id]);
                }
            }
            callback(cards);
        });
    },

    cardEdit: function(room, id, text, colour) {
        var doc = {};

        if (text) {
            doc['cards.'+id+'.text'] = text;
        }
        if (colour) {
            doc['cards.'+id+'.colour'] = colour;
        }

        this.rooms.update(
            {name:room},
            {$set:doc}
        );
    },

    cardSetXY: function(room, id, x, y) {
        var doc = {};
        doc['cards.'+id+'.x'] = x;
        doc['cards.'+id+'.y'] = y;
        this.rooms.update(
            {name:room},
            {$set:doc}
        );
    },

    deleteCard: function(room, id) {
        var doc = {};
        doc['cards.'+id] = true;
        this.rooms.update(
            {name:room},
            {$unset:doc}
        );
    },

    addSticker: function(room, cardId, stickerId) {
        var doc = {};
        doc['cards.'+cardId+'.sticker'] = stickerId;
        this.rooms.update(
            {name:room},
            {$set:doc}
        );
    },

    getBoardSize: function(room, callback) {
        this.rooms.findOne(
            {name:room},
            function(err, res) {
                if (res != null && 'size' in res && res.size != null) {
                    callback(res.size);
                }
            }
        );
    },

    setBoardSize: function(room, size) {
        this.rooms.update(
            {name:room},
            {$set:{'size':size}}
        );
    },

    // Row commands
    createRow: function(room, id, row) {
        var doc = {};
        doc['rows.'+id] = row;
        this.rooms.update(
            {name:room},
            {$set:doc},
            {upsert:true}
        );
    },

    getAllRows: function(room, callback) {
        this.rooms.findOne({name:room},{rows:true},function(err, res) {
            var rows = [];
            if (res != null && 'rows' in res) {
                for (var i in res.rows) {
                    rows.push(res.rows[i]);
                }
            }

            callback(rows);
        });
    },

    updateRowText: function(room, id, text) {
        var doc = {};
        doc['rows.'+id+'.text'] = text;
        this.rooms.update(
            {name:room},
            {$set:doc}
        );
    },

    updateRowPos: function(room, id, y) {
        var doc = {};
        doc['rows.'+id+'.y'] = y;
        this.rooms.update(
            {name:room},
            {$set:doc}
        );
    },

    deleteRow: function(room, id) {
        var doc = {};
        doc['rows.'+id] = true;
        this.rooms.update(
            {name:room},
            {$unset:doc}
        );
    },

    moveEraserX: function(room, id, x) {
        eraser = {id: id, x: x};

        this.rooms.update(
            {name:room},
            {$set:{eraser:eraser}},
            {upsert:true}
        );
    },

    moveMarkerX: function(room, id, x) {
        marker = {id: id, x: x};

        this.rooms.update(
            {name:room},
            {$set:{marker:marker}},
            {upsert:true}
        );
    },

    getEraser: function(room, callback) {
        this.rooms.findOne(
            {name:room},
            {eraser:true},
            function(err, res) {
                callback(res == null ? null : res.eraser);
            }
        );
    },

    getMarker: function(room, callback) {
        this.rooms.findOne(
            {name:room},
            {marker:true},
            function(err, res) {
                callback(res == null ? null : res.marker);
            }
        );
    }
};

exports.db = db;
