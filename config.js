var argv = require('yargs')
        .usage('Usage: $0 [--port INTEGER [8080]] [--baseurl STRING ["/"]] [--jira-url URL] [--redis STRING:INT [127.0.0.1:6379]] [--mongodb STRING:INT [127.0.0.1:27017]] [--gaEnabled] [--gaAccount STRING [UA-2069672-4]]')
        .argv;

exports.server = {
	port: argv.port || 8080,
	baseurl: argv.baseurl || '/',
    jiraUrl: require('./client/card-markdown').normalizeBaseUrl(
        argv['jira-url'] !== undefined ? argv['jira-url'] : process.env.JIRA_BASE_URL || '')
};

if ('mongodb' in argv) {
    // parse MongoDB URL
    dbHost = argv.mongodb.split(':')[0]
    dbPort = parseInt(argv.mongodb.split(':')[1])

    console.log('Connecting to MongoDB...' + dbHost + ':' + dbPort);

    exports.database = {
        type: 'mongodb',
        hostname: dbHost,
        port: dbPort,
        database: 'scrumblr'
    };
} else {
    redisUrl = 'redis' in argv ? 'redis://' + argv.redis : 'redis://127.0.0.1:6379';
    console.log('Connecting to Redis...' + redisUrl);

    // Use Redis as the default database
    exports.database = {
        type: 'redis',
        prefix: '#scrumblr#',
        redis: redisUrl
    };
}
