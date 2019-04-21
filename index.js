const DNSServer = require('./Library/DNSServer');

const server = new DNSServer();
server.bind(53, '127.0.0.1');
