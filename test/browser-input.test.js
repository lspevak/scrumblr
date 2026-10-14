var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var jade = require('jade');

var script = fs.readFileSync(path.join(__dirname, '..', 'client', 'script.js'), 'utf8');
var layout = fs.readFileSync(path.join(__dirname, '..', 'views', 'layout.jade'), 'utf8');

assert(script.indexOf(".on('pointerdown'") >= 0, 'selection should start with a pointer event');
assert(script.indexOf(".on('pointermove'") >= 0, 'selection should track pointer movement');
assert(script.indexOf("addEventListener('pointerup'") >= 0,
    'selection should finish even when an interactive child consumes the event');
assert(script.indexOf("addEventListener('pointercancel'") >= 0,
    'cancelled pointers should clear selection state');
assert(script.indexOf('!event.isPrimary') < 0,
    'missing jQuery isPrimary properties must not reject pointer events');
assert(script.indexOf('cardX2 >= leftPos && cardX1 <= rightPos && cardY2 >= topPos && cardY1 <= bottomPos') >= 0,
    'selection should include every card touched by the selection rectangle');
assert(layout.indexOf('navigator.maxTouchPoints > 0') >= 0,
    'Touch Punch should only load on devices with touch input');

var html = jade.compileFile(path.join(__dirname, '..', 'views', 'layout.jade'))({pageTitle: 'test'});
var loader = html.match(/<script>([\s\S]*?)<\/script>/)[1];
[0, 1].forEach(function(maxTouchPoints) {
    var written = '';
    vm.runInNewContext(loader, {
        navigator: {maxTouchPoints: maxTouchPoints},
        document: {write: function(markup) { written += markup; }}
    });
    assert.strictEqual(written, maxTouchPoints > 0
        ? '<script src="lib/jquery.ui.touch-punch.min.js"></script>' : '',
        'touch loader must emit a complete script element only on touch devices');
});

console.log('browser input regression checks passed');
