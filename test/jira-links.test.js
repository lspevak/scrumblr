var assert = require('assert');
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var vm = require('vm');
var jade = require('jade');
var marked = require('../client/lib/marked.min.js');
var render = require('../client/card-markdown');
var base = 'https://jira.example.com/jira';

function link(key) {
    return '<a class="jira-reference" href="' + base + '/browse/' + key +
        '" target="_blank" rel="noopener noreferrer">' + key + '</a>';
}

assert.strictEqual(render('See ABC-1234, **XYZ-42** and (ABC-1234).', base + '/'),
    '<p>See ' + link('ABC-1234') + ', <strong>' + link('XYZ-42') +
    '</strong> and (' + link('ABC-1234') + ').</p>\n');
var excluded = '[ABC-1234](https://example.com) ![ABC-1234](image.png) `ABC-1234`\n\n' +
    '```\nABC-1234\n```\n\n<a href="/existing">ABC-1234</a> <code>XYZ-42</code>\n\n' +
    'abc-1234 prefixABC-1234 ABC-1234suffix X-ABC-1234';
assert.strictEqual(render(excluded, base), marked(excluded), 'links, code and partial keys stay unchanged');
assert.strictEqual(render('ABC-1234', ''), marked('ABC-1234'), 'unset configuration disables linking');
assert(render('- ABC-1234\n\n> XYZ-42', base).indexOf(link('XYZ-42')) >= 0, 'nested Markdown links keys');
assert(render('| Ref |\n| --- |\n| ABC-1234 |', base).indexOf(link('ABC-1234')) >= 0, 'table cells link keys');
assert.strictEqual(render.normalizeBaseUrl(' https://jira.example.com/jira/// '), base);
['javascript:alert(1)', 'ftp://jira.example.com', 'https://user:pass@jira.example.com',
    'https://jira.example.com?x=1', 'https://jira.example.com#x', 'not a URL'].forEach(function(url) {
    assert.throws(function() { render.normalizeBaseUrl(url); }, 'reject invalid Jira base URL: ' + url);
});

function configuredUrl(args, envValue) {
    return childProcess.execFileSync(process.execPath, ['-e',
        'process.argv.splice(1, 0, "config-test"); console.log(require("./config").server.jiraUrl)', '--'].concat(args), {
        cwd: path.join(__dirname, '..'),
        env: Object.assign({}, process.env, {JIRA_BASE_URL: envValue}),
        encoding: 'utf8'
    }).trim().split('\n').pop();
}
assert.strictEqual(configuredUrl([], base), base, 'environment config reaches server');
assert.strictEqual(configuredUrl(['--jira-url', 'https://other.example.com/'], base),
    'https://other.example.com', 'CLI overrides environment');

var html = jade.compileFile(path.join(__dirname, '..', 'views', 'index.jade'))({jiraBaseUrl: base});
assert(html.indexOf('name="jira-base-url" content="' + base + '"') >= 0, 'base URL reaches board');
assert(html.indexOf('src="card-markdown.js"') < html.indexOf('src="script.js"'), 'renderer loads before client');
var client = fs.readFileSync(path.join(__dirname, '..', 'client', 'script.js'), 'utf8');
assert(!/\bmarked\(/.test(client), 'all card rendering uses the shared renderer');

var browser = {marked: marked, URL: URL};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'client', 'card-markdown.js'), 'utf8'), browser);
assert.strictEqual(browser.renderCardMarkdown('ABC-1234', base), render('ABC-1234', base),
    'browser script exposes the same renderer as the Node tests');

console.log('Jira link regression checks passed');
