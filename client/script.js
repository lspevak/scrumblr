var cards = {};
var columnsCount = 0;
var columns = [];
var currentTheme = "bigcards";
var boardInitialized = false;
var keyTrap = null;
var ctrlPressed = false;
// select box attributes
var selectBoxX1 = 0, selectBoxY1 = 0, selectBoxX2 = 0, selectBoxY2 = 0;
var isSelectBoxActive = false
// position object (CSS) of card, which is being dragged
var startSourceCardPosition = null;
// Mapping of card ID -> original left, top positions
var selectedCardPositions = null;
// Undo/Redo functionality
var undoStack = [];
var redoStack = [];
var MAX_UNDO_STACK = 50;
var isUndoing = false;
var isRedoing = false;

var baseurl = location.pathname.substring(0, location.pathname.lastIndexOf('/'));
var socket = io.connect({path: baseurl + "/socket.io"});

var cardColours = [
    'white',
    'yellow',
    'green',
    'blue',
    'orange',
    'purple',
    'red'
];

//an action has happened, send it to the server
function sendAction(a, d) {
    // console.log('--> ' + a);

    var message = {
        action: a,
        data: d
    };

    socket.json.send(message);
}

socket.on('connect', function() {
    //console.log('successful socket.io connect');

    //let the final part of the path be the room name
    var room = location.pathname.substring(location.pathname.lastIndexOf('/'));

    //immediately join the room which will trigger the initializations
    sendAction('joinRoom', room);
});

socket.on('disconnect', function() {
    blockUI("Server disconnected. Refresh page to try and reconnect...");
    //$('.blockOverlay').click($.unblockUI);
});

socket.on('message', function(data) {
    getMessage(data);
});

function unblockUI() {
    $.unblockUI({fadeOut: 50});
}

function blockUI(message) {
    message = message || 'Waiting...';

    $.blockUI({
        message: message,

        css: {
            border: 'none',
            padding: '15px',
            backgroundColor: '#000',
            '-webkit-border-radius': '10px',
            '-moz-border-radius': '10px',
            opacity: 0.5,
            color: '#fff',
            fontSize: '20px'
        },

        fadeOut: 0,
        fadeIn: 10
    });
}

//respond to an action event
function getMessage(m) {
    var message = m;
    var action = message.action;
    var data = message.data;

    // alert('action received: ' + action)

    switch (action) {
        case 'roomAccept':
            //okay we're accepted, then request initialization
            //(this is a bit of unnessary back and forth but that's okay for now)
            sendAction('initializeMe', null);
            break;

        case 'roomDeny':
            //this doesn't happen yet
            break;

        case 'moveCard':
            moveCard($("#" + data.id), data.position);
            break;

        case 'initCards':
            initCards(data);
            break;

        case 'createCard':
            drawNewCard(data.id, data.text, data.x, data.y, data.rot, data.colour, null, data.type);
            break;

        case 'deleteCard':
            $("#" + data.id).fadeOut(500,
                function() {
                    $(this).remove();
                }
            );
            break;

        case 'editCard':
            cardObj = $("#" + data.id)
            if (data.value) {
                cardObj.children('.content:first').attr('data-text', data.value);
                cardObj.children('.content:first').html(marked(data.value));
                enableCheckboxes(data.id);
            }
            if (data.colour) {
                changeCardColour(cardObj, data.colour)
            }

            break;

        case 'pulsateCard':
            pulsateCard(data.id);
            break;

        case 'initColumns':
            initColumns(data);
            break;

        case 'updateColumns':
            initColumns(data);
            break;

        case 'initRows':
            initRows(data);
            break;

        case 'createRow':
            drawNewRow(data.id, data.text, data.y)
            break;

        case 'deleteRow':
            $("#" + data.id).fadeOut(500,
                function() {
                    $(this).remove();
                }
            )
            break;

        case 'updateRowPos':
            row = $("#" + data.id)
            if (row != null) {
                row.css('top', data.y + 'px');
            }
            break;

        case 'updateRowText':
            $("#" + data.id).children('.row-text').text(data.text);
            break;

        case 'moveEraser':
            moveEraser($("#" + data.id), data.x);
            break;

        case 'moveMarker':
            moveMarker($("#" + data.id), data.x);
            break;

        case 'changeTheme':
            changeThemeTo(data);
            break;

        case 'join-announce':
            displayUserJoined(data.sid, data.user_name);
            break;

        case 'leave-announce':
            displayUserLeft(data.sid);
            break;

        case 'initialUsers':
            displayInitialUsers(data);
            break;

        case 'nameChangeAnnounce':
            updateName(message.data.sid, message.data.user_name);
            break;

        case 'addSticker':
            addSticker(message.data.cardId, message.data.stickerId);
            break;

        case 'setBoardSize':
            resizeBoard(message.data);
            adjustRows(message.data.width);
            adjustEraserAndMarker(message.data.height);
            break;

        default:
            //unknown message
            alert('unknown action: ' + JSON.stringify(message));
            break;
    }
}

$(document).on('keyup', function(event) {
    keyTrap = event.which;

    if (keyTrap == 17) { // ctrl
        ctrlPressed = false;
     }
});

$(document).on('keydown', function(event) {
    keyTrap = event.which;

    if (keyTrap == 17) { // CTRL
        ctrlPressed = true;
    } else if (keyTrap == 46) { // DEL
        deleteSelectedCards();
    } else if (ctrlPressed && event.shiftKey && keyTrap == 90) { // CTRL+SHIFT+Z
        event.preventDefault();
        performRedo();
    } else if (ctrlPressed && keyTrap == 90) { // CTRL+Z
        event.preventDefault();
        performUndo();
    }
});

// Undo/Redo helper functions
function addToUndoStack(action) {
    if (isUndoing || isRedoing) {
        return; // Don't track undo/redo actions themselves
    }

    undoStack.push(action);
    // Any new action clears the redo history
    redoStack = [];

    // Limit stack size
    if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
    }
}

function addToRedoStack(action) {
    redoStack.push(action);

    // Limit stack size
    if (redoStack.length > MAX_UNDO_STACK) {
        redoStack.shift();
    }
}

function captureCardState(cardId) {
    var cardObj = $("#" + cardId);
    var cardPosition = cardObj.position();
    var cardText = cardObj.children('.content:first').attr('data-text') || '';
    var cardImgSrc = cardObj.children('.card-image').attr("src");
    var cardColor = null;
    var cardType = null;

    // Get card rotation
    var transform = cardObj.css('transform') || cardObj.css('-webkit-transform');
    var cardRot = 0;
    if (transform && transform !== 'none') {
        var values = transform.split('(')[1].split(')')[0].split(',');
        var a = parseFloat(values[0]);
        var b = parseFloat(values[1]);
        cardRot = Math.round(Math.atan2(b, a) * (180/Math.PI));
    }

    // Get card color and type
    for(var i = 0; i < cardColours.length; i++) {
        if (cardImgSrc.indexOf(cardColours[i]) !== -1) {
            cardColor = cardColours[i];
            cardType = cardImgSrc.indexOf('-pi') !== -1 ? 2 : 1;
            break;
        }
    }

    // Get stickers
    var stickers = getCardStickers(cardId);

    return {
        id: cardId,
        text: cardText,
        x: cardPosition.left,
        y: cardPosition.top,
        rot: cardRot,
        colour: cardColor,
        cardType: cardType,
        stickers: stickers
    };
}

function getCardStickers(cardId) {
    var stickers = [];
    var stickerImgs = $('#' + cardId + ' .filler img');
    stickerImgs.each(function() {
        var src = $(this).attr('src');
        if (src) {
            var match = src.match(/stickers\/(.+)\.png/);
            if (match) {
                stickers.push(match[1]);
            }
        }
    });
    return stickers;
}

function performUndo() {
    if (undoStack.length === 0) {
        return;
    }

    isUndoing = true;
    var action = undoStack.pop();

    try {
        switch (action.type) {
            case 'createCard':
                // Undo card creation by deleting it
                // Save state for redo before removing
                var state = captureCardState(action.id);
                addToRedoStack({
                    type: 'createCard',
                    id: state.id,
                    text: state.text,
                    x: state.x,
                    y: state.y,
                    rot: state.rot,
                    colour: state.colour,
                    cardType: state.cardType,
                    stickers: state.stickers
                });
                $("#" + action.id).remove();
                sendAction('deleteCard', { id: action.id });
                break;

            case 'deleteCard':
                // Undo card deletion by recreating it with stickers
                addToRedoStack({
                    type: 'deleteCard',
                    id: action.id
                });
                drawNewCard(action.id, action.text, action.x, action.y, action.rot, action.colour, null, action.cardType);
                sendAction('createCard', {
                    id: action.id,
                    text: action.text,
                    x: action.x,
                    y: action.y,
                    rot: action.rot,
                    colour: action.colour,
                    type: action.cardType
                });
                // Restore stickers if any
                if (action.stickers && action.stickers.length > 0) {
                    for (var i = 0; i < action.stickers.length; i++) {
                        addSticker(action.id, action.stickers[i]);
                        sendAction('addSticker', {
                            cardId: action.id,
                            stickerId: action.stickers[i]
                        });
                    }
                }
                break;

            case 'editCard':
                // Undo card text edit by restoring old text
                addToRedoStack({
                    type: 'editCard',
                    id: action.id,
                    oldText: action.newText,
                    newText: action.oldText
                });
                $("#" + action.id).children('.content:first').attr('data-text', action.oldText);
                var rendered = marked(action.oldText);
                $("#" + action.id).children('.content:first').html(rendered);
                sendAction('editCard', {
                    id: action.id,
                    value: action.oldText,
                    colour: null
                });
                // Re-enable checkboxes
                setTimeout(function() {
                    enableCheckboxes(action.id);
                }, 10);
                break;

            case 'moveCard':
                // Undo card move by moving it back
                addToRedoStack({
                    type: 'moveCard',
                    id: action.id,
                    oldPosition: action.newPosition,
                    newPosition: action.oldPosition
                });
                var card = $("#" + action.id);
                card.css({
                    left: action.oldPosition.left + "px",
                    top: action.oldPosition.top + "px"
                });
                sendAction('moveCard', {
                    id: action.id,
                    position: action.oldPosition,
                    oldposition: action.newPosition
                });
                break;

            case 'changeColour':
                // Undo color change by changing back to old color
                addToRedoStack({
                    type: 'changeColour',
                    id: action.id,
                    oldColour: action.newColour,
                    newColour: action.oldColour
                });
                var cardObj = $('#' + action.id);
                changeCardColour(cardObj, action.oldColour);
                sendAction('editCard', {
                    id: action.id,
                    value: null,
                    colour: action.oldColour
                });
                break;

            case 'addSticker':
                // Undo sticker addition by restoring previous stickers
                addToRedoStack({
                    type: 'addSticker',
                    cardId: action.cardId,
                    stickerId: action.stickerId,
                    previousStickers: action.previousStickers
                });
                var stickerContainer = $('#' + action.cardId + ' .filler');
                stickerContainer.html('');
                if (action.previousStickers && action.previousStickers.length > 0) {
                    for (var i = 0; i < action.previousStickers.length; i++) {
                        addSticker(action.cardId, action.previousStickers[i]);
                        sendAction('addSticker', {
                            cardId: action.cardId,
                            stickerId: action.previousStickers[i]
                        });
                    }
                } else {
                    // If there were no previous stickers, remove all
                    sendAction('addSticker', {
                        cardId: action.cardId,
                        stickerId: 'nosticker'
                    });
                }
                break;
        }
    } finally {
        isUndoing = false;
    }
}

function performRedo() {
    if (redoStack.length === 0) {
        return;
    }

    isRedoing = true;
    var action = redoStack.pop();

    try {
        switch (action.type) {
            case 'createCard':
                // Redo card creation by recreating it with stickers
                undoStack.push({
                    type: 'createCard',
                    id: action.id
                });
                drawNewCard(action.id, action.text, action.x, action.y, action.rot, action.colour, null, action.cardType);
                sendAction('createCard', {
                    id: action.id,
                    text: action.text,
                    x: action.x,
                    y: action.y,
                    rot: action.rot,
                    colour: action.colour,
                    type: action.cardType
                });
                // Restore stickers if any
                if (action.stickers && action.stickers.length > 0) {
                    for (var i = 0; i < action.stickers.length; i++) {
                        addSticker(action.id, action.stickers[i]);
                        sendAction('addSticker', {
                            cardId: action.id,
                            stickerId: action.stickers[i]
                        });
                    }
                }
                break;

            case 'deleteCard':
                // Redo card deletion by removing it again
                var state = captureCardState(action.id);
                undoStack.push({
                    type: 'deleteCard',
                    id: state.id,
                    text: state.text,
                    x: state.x,
                    y: state.y,
                    rot: state.rot,
                    colour: state.colour,
                    cardType: state.cardType,
                    stickers: state.stickers
                });
                $("#" + action.id).remove();
                sendAction('deleteCard', { id: action.id });
                break;

            case 'editCard':
                // Redo card text edit by applying the new text again
                undoStack.push({
                    type: 'editCard',
                    id: action.id,
                    oldText: action.newText,
                    newText: action.oldText
                });
                $("#" + action.id).children('.content:first').attr('data-text', action.oldText);
                var rendered = marked(action.oldText);
                $("#" + action.id).children('.content:first').html(rendered);
                sendAction('editCard', {
                    id: action.id,
                    value: action.oldText,
                    colour: null
                });
                setTimeout(function() {
                    enableCheckboxes(action.id);
                }, 10);
                break;

            case 'moveCard':
                // Redo card move by moving to the new position again
                undoStack.push({
                    type: 'moveCard',
                    id: action.id,
                    oldPosition: action.newPosition,
                    newPosition: action.oldPosition
                });
                var card = $("#" + action.id);
                card.css({
                    left: action.oldPosition.left + "px",
                    top: action.oldPosition.top + "px"
                });
                sendAction('moveCard', {
                    id: action.id,
                    position: action.oldPosition,
                    oldposition: action.newPosition
                });
                break;

            case 'changeColour':
                // Redo colour change by applying the new colour again
                undoStack.push({
                    type: 'changeColour',
                    id: action.id,
                    oldColour: action.newColour,
                    newColour: action.oldColour
                });
                var cardObj = $('#' + action.id);
                changeCardColour(cardObj, action.oldColour);
                sendAction('editCard', {
                    id: action.id,
                    value: null,
                    colour: action.oldColour
                });
                break;

            case 'addSticker':
                // Redo sticker addition by re-applying the sticker
                var currentStickers = getCardStickers(action.cardId);
                undoStack.push({
                    type: 'addSticker',
                    cardId: action.cardId,
                    stickerId: action.stickerId,
                    previousStickers: currentStickers
                });
                addSticker(action.cardId, action.stickerId);
                sendAction('addSticker', {
                    cardId: action.cardId,
                    stickerId: action.stickerId
                });
                break;
        }
    } finally {
        isRedoing = false;
    }
}

function drawNewCard(id, text, x, y, rot, colour, sticker, type) {
	var img_src = null;
	var style_content = null;

	if (!type || type == 1) {
	    img_src = colour + "-card.png";
	    style_content = "";
	    style_card_icon = " card-icon-default";
	    style_card_change_color_icon = " card-change-color-icon-default";
	    style_card_copy_icon = " card-copy-icon-default";
	    style_filler = "";
	} else if (type == 2) {
	    img_src = colour + "-card-pi.png";
	    style_content = " content-pi";
	    style_card_icon = " card-icon-pi";
	    style_card_change_color_icon = " card-change-color-icon-pi";
	    style_card_copy_icon = " card-copy-icon-pi";
	    style_filler = " filler-pi";
	}

    var h = '<div id="' + id + '" class="card ' +
        ' draggable" style="-webkit-transform:rotate(' + rot +
        'deg);\
	">\
	<img src="images/icons/token/Xion.png" class="card-icon' + style_card_icon + '" />\
	<img src="images/icons/token/copy-card.png" class="card-copy-icon' + style_card_copy_icon + '" />\
	<img src="images/icons/token/fill-colour.png" class="card-change-color-icon' + style_card_change_color_icon + '" />\
	<img class="card-image" src="images/' + img_src + '">\
	<div id="content:' + id + '" class="content' + style_content + ' stickertarget droppable" data-text="">' +
        marked(text) + '</div><span class="filler' + style_filler + '"></span></div>';

    var card = $(h);

    card.appendTo('#board');
    $("#" + id).children('.content:first').attr('data-text', text);

    card.draggable({
        snap: false,
        snapTolerance: 5,
        containment: [0, 0, 3100, 3100],
        stack: ".card",
        start: function(event, ui) {
            keyTrap = null;
            startMovingSelectedCards(this.id, ui.position);
        },
        drag: function(event, ui) {
            if (keyTrap == 27) {
                ui.helper.css(ui.originalPosition);
                cancelMovingOtherSelectedCards(this.id);
                return false;
            }

            moveOtherSelectedCards(this.id, ui.position);
        },
		handle: "div.content"
    });

    // After a drag
    card.on("dragstop", function(event, ui) {
        if (keyTrap == 27) {
            keyTrap = null;
            return;
        }

        var data = {
            id: this.id,
            position: ui.position,
            oldposition: ui.originalPosition,
        };

        sendAction('moveCard', data);
        finishMovingOtherSelectedCards(this.id);

        // Add to undo stack
        addToUndoStack({
            type: 'moveCard',
            id: this.id,
            oldPosition: ui.originalPosition,
            newPosition: ui.position
        });
    });

    card.children(".droppable").droppable({
        accept: '.sticker',
        drop: function(event, ui) {
            var stickerId = ui.draggable.attr("id");
            var cardId = $(this).parent().attr('id');

            // Capture previous stickers for undo
            var previousStickers = getCardStickers(cardId);

            addSticker(cardId, stickerId);

            var data = {
                cardId: cardId,
                stickerId: stickerId
            };
            sendAction('addSticker', data);

            // Add to undo stack
            addToUndoStack({
                type: 'addSticker',
                cardId: cardId,
                stickerId: stickerId,
                previousStickers: previousStickers
            });

            //remove hover state to everything on the board to prevent
            //a jquery bug where it gets left around
            $('.card-hover-draggable').removeClass('card-hover-draggable');
        },
        hoverClass: 'card-hover-draggable'
    });

    var speed = Math.floor(Math.random() * 1000);
    var startPosition = $("#create-card").position();

    card.css('top', startPosition.top - card.height() * 0.5);
    card.css('left', startPosition.left - card.width() * 0.5);

    card.animate({
        left: x + "px",
        top: y + "px"
    }, speed);

    card.hover(
        function() {
            $(this).addClass('hover');
            $(this).children('.card-icon').fadeIn(10);
            $(this).children('.card-change-color-icon').fadeIn(10);
            $(this).children('.card-copy-icon').fadeIn(10);
        },
        function() {
            $(this).removeClass('hover');
            $(this).children('.card-icon').fadeOut(150);
            $(this).children('.card-change-color-icon').fadeOut(150);
            $(this).children('.card-copy-icon').fadeOut(150);
        }
    );

    card.children('.card-icon').hover(
        function() {
            $(this).addClass('card-icon-hover');
        },
        function() {
            $(this).removeClass('card-icon-hover');
        }
    );

    card.children('.card-change-color-icon').hover(
        function() {
            $(this).addClass('card-icon-hover');
        },
        function() {
            $(this).removeClass('card-icon-hover');
        }
    );

    card.children('.card-copy-icon').hover(
        function() {
            $(this).addClass('card-icon-hover');
        },
        function() {
            $(this).removeClass('card-icon-hover');
        }
    );

    card.children('.card-icon').click(
        function() {
            // Capture card state for undo before deleting
            var cardState = captureCardState(id);
            addToUndoStack({
                type: 'deleteCard',
                id: cardState.id,
                text: cardState.text,
                x: cardState.x,
                y: cardState.y,
                rot: cardState.rot,
                colour: cardState.colour,
                cardType: cardState.cardType,
                stickers: cardState.stickers
            });

            $("#" + id).remove();
            //notify server of delete
            sendAction('deleteCard', {
                id: id
            });
        }
    );

    card.children('.card-change-color-icon').click(
        function() {
            changeToNextCardColour(id);
        }
    );

    card.children('.card-copy-icon').click(
        function() {
            copyCard(id);
        }
    );

    card.children('.content').editable(function(value, settings) {
        // Capture old text for undo before updating
        var oldText = $("#" + id).children('.content:first').attr('data-text') || '';

        $("#" + id).children('.content:first').attr('data-text', value);
        onCardChange(id, value, null);

        // Add to undo stack only if text actually changed
        if (oldText !== value) {
            addToUndoStack({
                type: 'editCard',
                id: id,
                oldText: oldText,
                newText: value
            });
        }

        var rendered = marked(value);
        // Re-enable checkboxes after editing
        setTimeout(function() {
            enableCheckboxes(id);
        }, 10);
        return rendered;
    }, {
        type: 'textarea',
        data: function() {
            return $("#" + id).children('.content:first').attr('data-text');
        },
        submit: 'OK',
        style: 'inherit',
        cssclass: 'card-edit-form',
        placeholder: 'Double click to edit...',
        onblur: 'submit',
        event: 'dblclick'
    });

    card.click(
        function() {
            if (!ctrlPressed) {
                return;
            }

            var data = {
                id: this.id
            };

            sendAction('pulsateCard', data);
            pulsateCard(this.id);
        }
    );

    //add applicable sticker
    if (sticker !== null)
        addSticker(id, sticker);

    // Enable clickable checkboxes
    enableCheckboxes(id);
}

// Checkbox handling functions
function enableCheckboxes(cardId) {
    var contentDiv = $("#" + cardId).children('.content:first');

    // Wrap checkbox characters in spans to make them clickable
    contentDiv.find('p').each(function() {
        var $p = $(this);
        var html = $p.html();

        // Skip if already processed (avoid double-wrapping)
        if (html.indexOf('class="checkbox"') !== -1) {
            return;
        }

        // Replace unchecked and checked boxes with clickable spans
        html = html.replace(/^☐/, '<span class="checkbox unchecked" style="cursor:pointer; user-select:none;">☐</span>');
        html = html.replace(/^☑/, '<span class="checkbox checked" style="cursor:pointer; user-select:none;">☑</span>');

        $p.html(html);
    });

    // Add click handlers to checkboxes
    contentDiv.off('click.checkbox').on('click.checkbox', '.checkbox', function(e) {
        e.stopPropagation();
        e.preventDefault();
        toggleCheckbox(cardId, $(this));
    });
}

function toggleCheckbox(cardId, $checkbox) {
    var contentDiv = $("#" + cardId).children('.content:first');
    var currentText = contentDiv.attr('data-text');

    var isChecked = $checkbox.hasClass('checked');

    // Find the line containing this checkbox by getting its paragraph
    var $p = $checkbox.closest('p');
    var $allP = contentDiv.find('p');

    // Find all paragraphs that contain checkboxes
    var $checkboxPs = $allP.filter(function() {
        return $(this).find('.checkbox').length > 0;
    });

    // Get the index of this paragraph among checkbox paragraphs
    var checkboxPIndex = $checkboxPs.index($p);

    // Split text into lines
    var lines = currentText.split('\n');

    // Find which lines have checkboxes
    var checkboxLineIndices = [];
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].match(/^[☐☑]/)) {
            checkboxLineIndices.push(i);
        }
    }

    // Toggle the checkbox on the corresponding line
    if (checkboxPIndex >= 0 && checkboxPIndex < checkboxLineIndices.length) {
        var lineIndex = checkboxLineIndices[checkboxPIndex];
        if (isChecked) {
            // Change ☑ to ☐
            lines[lineIndex] = lines[lineIndex].replace(/^☑/, '☐');
        } else {
            // Change ☐ to ☑
            lines[lineIndex] = lines[lineIndex].replace(/^☐/, '☑');
        }
    }

    var newText = lines.join('\n');

    // Update the data attribute
    contentDiv.attr('data-text', newText);

    // Re-render the content
    contentDiv.html(marked(newText));

    // Re-enable checkboxes after re-rendering
    enableCheckboxes(cardId);

    // Notify server of the change
    onCardChange(cardId, newText, null);
}

function onCardChange(id, text, colour) {
    sendAction('editCard', {
        id: id,
        value: text,
        colour: colour
    });
}

function moveCard(card, position) {
    card.animate({
        left: position.left + "px",
        top: position.top + "px"
    }, 500);
}

function moveOtherSelectedCards(sourceCardId, sourceCardPosition) {
    var diffX = sourceCardPosition.left - startSourceCardPosition.left;
    var diffY = sourceCardPosition.top - startSourceCardPosition.top;

    $(".card").each(function() {
        var card = $(this);

        if (card.hasClass('card-marked')) {
            var cardId = card.attr('id')
            if (cardId == sourceCardId) {
                return;
            }

            var cardPosition = selectedCardPositions[cardId];
            var newLeftPosition = Math.max(0, cardPosition.left + diffX);
            var newTopPosition = Math.max(0, cardPosition.top + diffY);

            card.css('left', newLeftPosition);
            card.css('top', newTopPosition);
        }
    });
}

function startMovingSelectedCards(sourceCardId, sourceCardPosition) {
    // global objects
    startSourceCardPosition = sourceCardPosition;
    selectedCardPositions = {}

    // deselect cards if clicked card is not selected
    $(".card").each(function() {
        var card = $(this);
        var cardId = card.attr('id')
        if (cardId == sourceCardId && !card.hasClass('card-marked')) {
            deselectCards();
        }
    });

    $(".card").each(function() {
        var card = $(this);

        if (card.hasClass('card-marked')) {
            var cardId = card.attr('id')

            selectedCardPositions[cardId] = {
                "left": card.position().left,
                "top": card.position().top,
            };
        }
    });
}

function cancelMovingOtherSelectedCards(sourceCardId) {
    $(".card").each(function() {
        var card = $(this);

        if (card.hasClass('card-marked')) {
            var cardId = card.attr('id')
            if (cardId == sourceCardId) {
                return;
            }

            var cardPosition = selectedCardPositions[cardId]

            card.css('left', cardPosition.left);
            card.css('top', cardPosition.top);
        }
    });
}

function finishMovingOtherSelectedCards(sourceCardId) {
    $(".card").each(function() {
        var card = $(this);

        if (card.hasClass('card-marked')) {
            var cardId = card.attr('id')
            if (cardId == sourceCardId) {
                return;
            }

            var origCardPosition = selectedCardPositions[cardId]
            var cardPosition = card.position()
            var clonedCardPosition = {...cardPosition}
            clonedCardPosition.left = origCardPosition.left
            clonedCardPosition.top = origCardPosition.top

            var data = {
                id: cardId,
                position: cardPosition,
                oldposition: clonedCardPosition,
            };

            sendAction('moveCard', data);

            // Add to undo stack
            addToUndoStack({
                type: 'moveCard',
                id: cardId,
                oldPosition: clonedCardPosition,
                newPosition: cardPosition
            });
        }
    });
}

function changeToNextCardColour(id) {
    var cardObj = $('#' + id)
    var cardImgSrc = cardObj.children('.card-image').attr("src");
    var currentColour = null;
    var i = 0;
    for(i=0; i < cardColours.length;i++) {
        var idx = cardImgSrc.indexOf(cardColours[i]);
        if (idx != -1) {
            currentColour = cardColours[i];
            break;
        }
    }

    newColour = i + 1 < cardColours.length ? cardColours[i + 1] : cardColours[0];

    // replace image
    var newImgSrc = cardImgSrc.replace(currentColour, newColour);
    cardObj.children('.card-image').attr("src", newImgSrc);

    onCardChange(id, null, newColour);

    // Add to undo stack
    addToUndoStack({
        type: 'changeColour',
        id: id,
        oldColour: currentColour,
        newColour: newColour
    });
}

function changeCardColour(cardObj, colour) {
    var cardImgSrc = cardObj.children('.card-image').attr("src");
    var currentColour = null;
    var i = 0;
    for(i=0; i < cardColours.length;i++) {
        var idx = cardImgSrc.indexOf(cardColours[i]);
        if (idx != -1) {
            currentColour = cardColours[i];
            break;
        }
    }

    // replace image
    var newImgSrc = cardImgSrc.replace(currentColour, colour);
    cardObj.children('.card-image').attr('src', newImgSrc);
}

function copyCard(id) {
    var cardObj = $('#' + id);
    var cardPosition = cardObj.position();
    var cardText = cardObj.children('.content:first').attr('data-text');
    var cardImgSrc = cardObj.children('.card-image').attr("src");
    var cardColor = null;
    var cardType = null;
    var cardOffset = null;
    var i = 0;
    for(i = 0; i < cardColours.length;i++) {
        var idx = cardImgSrc.indexOf(cardColours[i]);
        if (idx != -1) {
            cardColor = cardColours[i];

            var idxSuffix = cardImgSrc.indexOf('-pi');
            if (idxSuffix == -1) {
                cardType = 1;

                if (currentTheme == "smallcards") {
                    cardOffset = 90;
                } else if (currentTheme == "mediumcards") {
                    cardOffset = 180;
                } else if (currentTheme == "bigcards") {
                    cardOffset = 230;
                }
            } else {
                cardType = 2;

                if (currentTheme == "smallcards") {
                    cardOffset = 110;
                } else if (currentTheme == "mediumcards") {
                    cardOffset = 220;
                } else if (currentTheme == "bigcards") {
                    cardOffset = 280;
                }
            }

            break;
        }
    }

    // Create the card to the right with offset based on card type and theme
    var newCardId = createCardAtPos(cardPosition.left + cardOffset, cardPosition.top, cardColor, cardText, cardType);

    // Bring the new card to the top of the stacking order
    var maxZ = 0;
    $('.card').each(function() {
        var z = parseInt($(this).css('z-index')) || 0;
        if (z > maxZ) maxZ = z;
    });
    $('#' + newCardId).css('z-index', maxZ + 1);
}

function moveEraser(eraser, x) {
    eraser.animate({
        left: x + "px",
        top: eraser.position.top + "px"
    }, 500);
}

function moveMarker(marker, x) {
    marker.animate({
        left: x + "px",
        top: marker.position.top + "px"
    }, 500);
}

function adjustEraserAndMarker(boardHeight) {
    h = boardHeight == null ? $('#board').height() : boardHeight;

    eraser = $('#eraser');
    eraser.css('top', (h - eraser.height()) + 'px');

    marker = $('#marker');
    marker.css('top', (h - marker.height()) + 'px');
}

function addSticker(cardId, stickerId) {
    stickerContainer = $('#' + cardId + ' .filler');

    if (stickerId === "nosticker") {
        stickerContainer.html("");
        return;
    }

    if (Array.isArray(stickerId)) {
        for (var i in stickerId) {
            stickerContainer.prepend('<img src="images/stickers/' + stickerId[i] +
                '.png">');
        }
    } else {
        if (stickerContainer.html().indexOf(stickerId) < 0)
            stickerContainer.prepend('<img src="images/stickers/' + stickerId +
                '.png">');
    }
}

//----------------------------------
// cards
//----------------------------------
function createCard(id, text, x, y, rot, colour, type) {
    drawNewCard(id, text, x, y, rot, colour, null, type);

    var action = "createCard";
    var data = {
        id: id,
        text: text,
        x: x,
        y: y,
        rot: rot,
        colour: colour,
        type: type
    };

    sendAction(action, data);

    // Add to undo stack
    addToUndoStack({
        type: 'createCard',
        id: id
    });
}

function randomCardColour() {
    var i = Math.floor(Math.random() * cardColours.length);
    return cardColours[i];
}

function createCardAtRandomPos(color, type) {
    var rotation = Math.random() * 10 - 5; //add a bit of random rotation (+/- 10deg)
    var id = Math.round(Math.random() * 99999999); //is this big enough to assure uniqueness?
    var offsetX = Math.round(Math.random() * 50)
    var offsetY = Math.round(Math.random() * 20)

    createCard(
        'card' + id,
        '',
        60 + offsetX,
        $('div.board-outline').height() + 30 + offsetY,
        rotation,
        color,
        type);
}

function createCardAtDlgPos(color, type) {
    var rotation = Math.random() * 10 - 5; //add a bit of random rotation (+/- 10deg)
    var id = Math.round(Math.random() * 99999999); //is this big enough to assure uniqueness?

    var dlg = $('#buttons-dialog');

    createCard(
        'card' + id,
        '',
        dlg.position().left + 60,
        dlg.position().top,
        rotation,
        color,
        type);

    dlg.css('visibility', 'hidden');
}

function createCardAtPos(x, y, color, text, type) {
    var rotation = Math.random() * 10 - 5; //add a bit of random rotation (+/- 10deg)
    var id = Math.round(Math.random() * 99999999); //is this big enough to assure uniqueness?
    var cardId = 'card' + id;

    createCard(
        cardId,
        text,
        x,
        y,
        rotation,
        color,
        type);

    return cardId;
}

function initCards(cardArray) {
    //first delete any cards that exist
    $('.card').remove();

    cards = cardArray;

    for (var i in cardArray) {
        card = cardArray[i];

        drawNewCard(
            card.id,
            card.text,
            card.x,
            card.y,
            card.rot,
            card.colour,
            card.sticker,
            card.type
        );
    }

    boardInitialized = true;
    unblockUI();
}

function pulsateCard(id) {
    $("#" + id).effect("pulsate", { times: 3 }, 2000);
}

//----------------------------------
// COLUMNS
//----------------------------------

function drawNewColumn(columnName) {
    var cls = "col";
    if (columnsCount === 0) {
        cls = "col first";
    }

    $('#icon-col').before('<td class="' + cls +
        '" width="10%" style="display:none"><h2 id="col-' + (columnsCount + 1) +
        '" class="editable">' + columnName + '</h2></td>');

    $('.editable').editable(function(value, settings) {
        onColumnChange(this.id, value);
        return (value);
    }, {
        style: 'inherit',
        cssclass: 'card-edit-form',
        type: 'textarea',
        placeholder: 'New',
        onblur: 'submit',
        width: '',
        height: '',
        xindicator: '<img src="images/ajax-loader.gif">',
        event: 'dblclick'
    });

    $('.col:last').fadeIn(1500);

    columnsCount++;
}

function onColumnChange(id, text) {
    var names = [];

    //Get the names of all the columns right from the DOM
    $('.col').each(function() {
        //get ID of current column we are traversing over
        var thisID = $(this).children("h2").attr('id');

        if (id == thisID) {
            names.push(text);
        } else {
            names.push($(this).text());
        }
    });

    updateColumns(names);
}

function displayRemoveColumn() {
    if (columnsCount <= 0) return false;

    $('.col:last').fadeOut(150,
        function() {
            $(this).remove();
        }
    );

    columnsCount--;
}

function createColumn(name) {
    if (columnsCount >= 8) {
        return false;
    }

    drawNewColumn(name);
    columns.push(name);

    var action = "updateColumns";
    var data = columns;

    sendAction(action, data);
}

function deleteColumn() {
    if (columnsCount <= 0) {
        return false;
    }

    displayRemoveColumn();
    columns.pop();

    var action = "updateColumns";
    var data = columns;

    sendAction(action, data);
}

function updateColumns(c) {
    columns = c;

    var action = "updateColumns";
    var data = columns;

    sendAction(action, data);
}

function deleteColumns(next) {
    //delete all existing columns:
    $('.col').fadeOut('slow', next());
}

//----------------------------------
// ROWS
//----------------------------------

function drawNewRow(id, text, y) {
    var h = '<div id="' + id + '" class="draggable row-line">' +
    '<span id="row-text-' + id + '" class="editable row-text" style="padding-left: 25px;">' + text + '</span>' +
	'<img src="images/icons/token/Xion.png" class="row-icon" />' +
	'</div>'

    var row = $(h);
    w = $('#board').width()
    row.appendTo('#board');
    row.css('width', w + 'px');
    row.css('top', y + 'px');
    row.css('left', 0 + 'px');

    row.draggable(
        {
           axis: "y",
           containment: "#board",
           stop: function(event, ui) {
               var newY = ui.position.top;
               updateRowPos(id, newY);
           }
        }
    )

    row.children('.editable').editable(function(value, settings) {
        updateRowText(id, value);
        return (value);
    }, {
        type: 'textarea',
        style: 'inherit',
        cssclass: 'card-edit-form',
        placeholder: 'Double Click to Edit.',
        width: '200px',
        height: '',
        onblur: 'submit',
        event: 'dblclick'
    });

    row.hover(
        function() {
            $(this).addClass('hover');
            $(this).children('.row-icon').fadeIn(10);
        },
        function() {
            $(this).removeClass('hover');
            $(this).children('.row-icon').fadeOut(150);
        }
    );

    row.children('.row-icon').hover(
        function() {
            $(this).addClass('row-icon-hover');
        },
        function() {
            $(this).removeClass('row-icon-hover');
        }
    );

    row.children('.row-icon').click(
        function() {
            if (confirm('Do you really want to delete the row?')) {
                deleteRow(id);
                $("#" + id).remove();
            }
        }
    );
}

function createNewRow() {
    var id = 'row' + Math.round(Math.random() * 99999999);
    createRow(id, 'Sample text', 200);
}

function createRow(id, text, y) {
    drawNewRow(id, text, y);

    var action = "createRow";
    var data = {
        id: id,
        text: text,
        y: y
    };

    sendAction(action, data);
}

function deleteRow(id) {
    var action = "deleteRow";
    var data = {
        id: id
    };

    sendAction(action, data);
}

function adjustRows(newWidth) {
    w = newWidth == null ? $('#board').width() : newWidth;

    $('.row-line').each(function() {
        $(this).css('width', w + 'px');
    });
}

function updateRowText(id, text) {
    var action = "updateRowText";
    var data = {
        id: id,
        text: text,
    };

    sendAction(action, data);
}

function updateRowPos(id, y) {
    var action = "updateRowPos";
    var data = {
        id: id,
        y: y
    };

    sendAction(action, data);
}

function initColumns(columnArray) {
    columnsCount = 0;
    columns = columnArray;

    $('.col').remove();

    for (var i in columnArray) {
        column = columnArray[i];
        drawNewColumn(column);
    }
}

function initRows(rowArray) {
    $('.row-line').remove();

    for (var i in rowArray) {
        row = rowArray[i];
        drawNewRow(row.id, row.text, row.y);
    }

    adjustRows(null);
}

function changeThemeTo(theme) {
    currentTheme = theme;
    $("link[title=cardsize]").attr("href", "css/" + theme + ".css");
}

//////////////////////////////////////////////////////////
////////// NAMES STUFF ///////////////////////////////////
//////////////////////////////////////////////////////////


function setCookie(c_name, value, exdays) {
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + exdays);
    var c_value = encodeURIComponent(value) + ((exdays === null) ? "" : "; expires=" + exdate.toUTCString());
    document.cookie = c_name + "=" + c_value;
}

function getCookie(c_name) {
    var i, x, y, ARRcookies = document.cookie.split(";");
    for (i = 0; i < ARRcookies.length; i++) {
        x = ARRcookies[i].substring(0, ARRcookies[i].indexOf("="));
        y = ARRcookies[i].substring(ARRcookies[i].indexOf("=") + 1);
        x = x.replace(/^\s+|\s+$/g, "");
        if (x == c_name) {
            return decodeURIComponent(y);
        }
    }
}

function setName(name) {
    sendAction('setUserName', name);
    setCookie('scrumscrum-username', name, 365);
}

function displayInitialUsers(users) {
    for (var i in users) {
        displayUserJoined(users[i].sid, users[i].user_name);
    }
}

function displayUserJoined(sid, user_name) {
    name = '';
    if (user_name)
        name = user_name;
    else
        name = sid.substring(0, 5);

    $('#names-ul').append('<li id="user-' + sid + '">' + name + '</li>');
}

function displayUserLeft(sid) {
    name = '';
    if (name)
        name = user_name;
    else
        name = sid;

    var id = '#user-' + sid.toString();

    $('#names-ul').children(id).fadeOut(1000, function() {
        $(this).remove();
    });
}

function updateName(sid, name) {
    var id = '#user-' + sid.toString();

    $('#names-ul').children(id).text(name);
}

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

function boardResizeHappened(event, ui) {
    var newsize = ui.size;

    sendAction('setBoardSize', newsize);
}

function resizeBoard(size) {
    $(".board-outline").animate({
        height: size.height,
        width: size.width
    });
}
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

function calcCardOffset() {
    var offsets = {};
    $(".card").each(function() {
        var card = $(this);
        $(".col").each(function(i) {
            var col = $(this);
            if (col.offset().left + col.outerWidth() > card.offset().left +
                card.outerWidth() || i === $(".col").length - 1) {
                offsets[card.attr('id')] = {
                    col: col,
                    x: ((card.offset().left - col.offset().left) / col.outerWidth())
                };
                return false;
            }
        });
    });
    return offsets;
}

//moves cards with a resize of the Board
//doSync is false if you don't want to synchronize
//with all the other users who are in this room
function adjustCard(offsets, doSync) {
    $(".card").each(function() {
        var card = $(this);
        var offset = offsets[this.id];
        if (offset) {
            var data = {
                id: this.id,
                position: {
                    left: offset.col.position().left + (offset.x * offset.col.outerWidth()),
                    top: parseInt(card.css('top').slice(0, -2))
                },
                oldposition: {
                    left: parseInt(card.css('left').slice(0, -2)),
                    top: parseInt(card.css('top').slice(0, -2))
                }
            };
            if (!doSync) {
                card.css('left', data.position.left);
                card.css('top', data.position.top);
            } else {
                moveCard(card, data.position);
                sendAction('moveCard', data);
            }
        }
    });
}

function reCalcSelectBox() {
    var x3 = Math.min(selectBoxX1, selectBoxX2);
    var x4 = Math.max(selectBoxX1, selectBoxX2);
    var y3 = Math.min(selectBoxY1, selectBoxY2);
    var y4 = Math.max(selectBoxY1, selectBoxY2);

    var selectBox = $('#select-box')
    selectBox.css('left', x3 + 'px');
    selectBox.css('top', y3 + 'px');
    selectBox.css('width', x4 - x3 + 'px');
    selectBox.css('height', y4 - y3 + 'px');
}

function selectCards() {
    $(".card").each(function() {
        var card = $(this);
        var cardOffset = card.offset();
        var cardX1 = cardOffset.left + 25;
        var cardY1 = cardOffset.top + 25;
        var cardX2 = cardX1 + card.width() - 25;
        var cardY2 = cardY1 + card.height() - 25;

        // Convert selection box coordinates from viewport to document coordinates
        var scrollLeft = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft;
        var scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        var leftPos = Math.min(selectBoxX1, selectBoxX2) + scrollLeft;
        var topPos = Math.min(selectBoxY1, selectBoxY2) + scrollTop;
        var rightPos = Math.max(selectBoxX1, selectBoxX2) + scrollLeft;
        var bottomPos = Math.max(selectBoxY1, selectBoxY2) + scrollTop;

        if (cardX1 >= leftPos && cardX2 <= rightPos && cardY1 >= topPos && cardY2 <= bottomPos) {
            card.addClass('card-marked');
        }
    });
}

function deselectCards() {
    $(".card").each(function() {
        var card = $(this);
        card.removeClass('card-marked')
    });
}

function deleteSelectedCards() {
    $(".card").each(function() {
        var card = $(this);

        if (card.hasClass('card-marked')) {
            var cardId = card.attr('id');

            // Capture card state for undo before deleting
            var cardState = captureCardState(cardId);
            addToUndoStack({
                type: 'deleteCard',
                id: cardState.id,
                text: cardState.text,
                x: cardState.x,
                y: cardState.y,
                rot: cardState.rot,
                colour: cardState.colour,
                cardType: cardState.cardType,
                stickers: cardState.stickers
            });

            $("#" + cardId).remove();
            // notify server of delete
            sendAction('deleteCard', {
                id: cardId
            });
        }
    });
}


//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

$(function() {
    if (boardInitialized === false)
        blockUI('<img src="images/ajax-loader.gif" width=43 height=11/>');

    $("#create-card")
        .click(function() {
            createCardAtRandomPos(randomCardColour(), 1)
        });

    $("#create-card-yellow")
        .click(function() {
            createCardAtRandomPos('yellow', 1)
        });

    $("#create-card-green")
        .click(function() {
            createCardAtRandomPos('green', 1)
        });

    $("#create-card-blue")
        .click(function() {
            createCardAtRandomPos('blue', 1)
        });

    $("#create-card-white")
        .click(function() {
            createCardAtRandomPos('white', 1)
        });

    $("#create-card-orange")
        .click(function() {
            createCardAtRandomPos('orange', 1)
        });

    $("#create-card-purple")
        .click(function() {
            createCardAtRandomPos('purple', 1)
        });

    $("#create-card-red")
        .click(function() {
            createCardAtRandomPos('red', 1)
        });

    $("#create-card-pi-white")
        .click(function() {
            createCardAtRandomPos('white', 2)
        });

    $("#create-card-pi-yellow")
        .click(function() {
            createCardAtRandomPos('yellow', 2)
        });

    $("#create-card-pi-green")
        .click(function() {
            createCardAtRandomPos('green', 2)
        });

    $("#create-card-pi-blue")
        .click(function() {
            createCardAtRandomPos('blue', 2)
        });

    $("#create-card-pi-orange")
        .click(function() {
            createCardAtRandomPos('orange', 2)
        });

    $("#create-card-pi-purple")
        .click(function() {
            createCardAtRandomPos('purple', 2)
        });

    $("#create-card-pi-red")
        .click(function() {
            createCardAtRandomPos('red', 2)
        });

    $("#create-card-yellow-dlg")
        .click(function() {
            createCardAtDlgPos('yellow', 1)
        });

    $("#create-card-red-dlg")
        .click(function() {
            createCardAtDlgPos('red', 1)
        });

    $("#create-card-green-dlg")
        .click(function() {
            createCardAtDlgPos('green', 1)
        });

    $("#create-card-blue-dlg")
        .click(function() {
            createCardAtDlgPos('blue', 1)
        });

    $("#create-card-white-dlg")
        .click(function() {
            createCardAtDlgPos('white', 1)
        });

    $("#create-card-orange-dlg")
        .click(function() {
            createCardAtDlgPos('orange', 1)
        });

    $("#create-card-purple-dlg")
        .click(function() {
            createCardAtDlgPos('purple', 1)
        });

    $("#create-card-pi-yellow-dlg")
        .click(function() {
            createCardAtDlgPos('yellow', 2)
        });

    $("#create-card-pi-red-dlg")
        .click(function() {
            createCardAtDlgPos('red', 2)
        });

    $("#create-card-pi-green-dlg")
        .click(function() {
            createCardAtDlgPos('green', 2)
        });

    $("#create-card-pi-blue-dlg")
        .click(function() {
            createCardAtDlgPos('blue', 2)
        });

    $("#create-card-pi-white-dlg")
        .click(function() {
            createCardAtDlgPos('white', 2)
        });

    $("#create-card-pi-orange-dlg")
        .click(function() {
            createCardAtDlgPos('orange', 2)
        });

    $("#create-card-pi-purple-dlg")
        .click(function() {
            createCardAtDlgPos('purple', 2)
        });

    // Style changer
    $("#smallify").click(function() {
        if (currentTheme == "smallcards") {
            changeThemeTo('mediumcards');
        } else if (currentTheme == "mediumcards") {
            changeThemeTo('bigcards');
        } else {
            changeThemeTo('smallcards');
        }

        sendAction('changeTheme', currentTheme);
        return false;
    });

    $('#icon-col').hover(
        function() {
            $('.col-icon').fadeIn(10);
        },
        function() {
            $('.col-icon').fadeOut(150);
        }
    );

    $('#add-col').click(
        function() {
            cardCount = $(".card").length;
            if (cardCount > 0 && !confirm('Do you really want to add a column?')) {
                return false;
            }

            createColumn('New');
            return false;
        }
    );

    $('#delete-col').click(
        function() {
            cardCount = $(".card").length;
            if (cardCount > 0 && !confirm('Do you really want to delete the column?')) {
                return false;
            }

            deleteColumn();
            return false;
        }
    );

    $('#add-row').click(
        function() {
            createNewRow();
            return false;
        }
    );

    var user_name = getCookie('scrumscrum-username');

    $("#yourname-input").focus(function() {
        if ($(this).val() == 'unknown') {
            $(this).val("");
        }

        $(this).addClass('focused');
    });

    $("#yourname-input").blur(function() {
        if ($(this).val() === "") {
            $(this).val('unknown');
        }
        $(this).removeClass('focused');

        setName($(this).val());
    });

    $("#yourname-input").val(user_name);
    $("#yourname-input").blur();
    $("#yourname-li").hide();

    $("#yourname-input").keypress(function(e) {
        code = (e.keyCode ? e.keyCode : e.which);
        if (code == 10 || code == 13) {
            $(this).blur();
        }
    });

    $(".sticker").draggable({
        revert: true,
        zIndex: 1000
    });

    $(".board-outline").resizable({
        ghost: false,
        minWidth: 700,
        minHeight: 400,
        maxWidth: 3200,
        maxHeight: 3200,
    });

    //A new scope for precalculating
    (function() {
        var offsets;

        $(".board-outline").on("resizestart", function() {
            offsets = calcCardOffset();
        });
        $(".board-outline").on("resize", function(event, ui) {
            adjustCard(offsets, false);
            adjustEraserAndMarker(null);
        });
        $(".board-outline").on("resizestop", function(event, ui) {
            boardResizeHappened(event, ui);
            adjustCard(offsets, true);
            adjustRows(ui.position.width);
            adjustEraserAndMarker(ui.position.height);
        });
    })();

    marker = $('#marker')
    marker.draggable({
        axis: 'x',
        containment: 'parent',
        start: function(event, ui) {
            keyTrap = null;
        },
        drag: function(event, ui) {
            if (keyTrap == 27) {
                ui.helper.css(ui.originalPosition);
                return false;
            }
        }
    });

    // After a drag
    marker.on("dragstop", function(event, ui) {
        if (keyTrap == 27) {
            keyTrap = null;
            return;
        }

        var data = {
            id: this.id,
            x: ui.position.left
        };

        sendAction('moveMarker', data);
    });

    eraser = $('#eraser');
    eraser.draggable({
        axis: 'x',
        containment: 'parent',
        start: function(event, ui) {
            keyTrap = null;
        },
        drag: function(event, ui) {
            if (keyTrap == 27) {
                ui.helper.css(ui.originalPosition);
                return false;
            }
        }
    });

    // After a drag
    eraser.on("dragstop", function(event, ui) {
        if (keyTrap == 27) {
            keyTrap = null;
            return;
        }

        var data = {
            id: this.id,
            x: ui.position.left
        };

        sendAction('moveEraser', data);
    });

    board = $('#board')
    selectBox = $('#select-box')
    buttonsDialog = $('#buttons-dialog');

    // Handle show select box for cards or buttons dialog
    $(document).mousedown(function(event) {
        // ignore clicking on a card or other interactive elements
        var target = $(event.target)
        var isCard = target.hasClass('card') || target.closest('.card').length > 0;
        var isSticker =target.hasClass('sticker-img');
        var isEditable = target.hasClass('editable');
        var isButton = target.closest('.buttons').length > 0;
        var isStickers = target.closest('.stickers').length > 0;
        var isNames = target.closest('.names').length > 0;
        var isButtonsDialog = target.closest('#buttons-dialog').length > 0;
        var isColIcon = target.hasClass('col-icon');
        var isRow = target.hasClass('row-line') || target.closest('.row-line').length > 0;
        var isResizeHandle = target.hasClass('ui-resizable-handle') || target.closest('.ui-resizable-handle').length > 0;
        var isDraggable = target.hasClass('ui-draggable'); // eraser/marker

        if (isCard || isSticker || isEditable || isButton || isStickers || isNames || isButtonsDialog || isColIcon || isRow || isResizeHandle || isDraggable) {
            return;
        }

        deselectCards();

        // if clicking outsize of dialog, hide it
        if (buttonsDialog.css('visibility') == 'visible') {
            buttonsDialog.css('visibility', 'hidden');
        }

        if (ctrlPressed) {
            // show create card dialog
            var top = event.pageY - 50;
            var left = event.pageX - 20;
            buttonsDialog.css({top: top + 'px', left: left + 'px', position: 'relative'});
            buttonsDialog.css('visibility', 'visible');
            ctrlPressed = false;
            return;
        } else {
            // Use clientX/clientY for fixed positioning
            selectBoxX1 = event.clientX;
            selectBoxY1 = event.clientY;
            selectBoxX2 = event.clientX;
            selectBoxY2 = event.clientY;
            isSelectBoxActive = true;

            reCalcSelectBox();
        }
    });

    $(document).mousemove(function(event) {
        if (!isSelectBoxActive) {
            return;
        }

        // show select box if not visible
        if (selectBox.css('visibility') != 'visible') {
            selectBox.css('visibility', 'visible');
        }

        // Use clientX/clientY for fixed positioning
        selectBoxX2 = event.clientX;
        selectBoxY2 = event.clientY;

        reCalcSelectBox();
    });

    $(document).mouseup(function(event) {
        if (!isSelectBoxActive) {
            return;
        }

         selectBox.css('visibility', 'hidden');
         isSelectBoxActive = false;
         selectCards();
    });
});
