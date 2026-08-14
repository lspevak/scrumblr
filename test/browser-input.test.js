var assert = require('assert');
var fs = require('fs');
var path = require('path');

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

console.log('browser input regression checks passed');
