const fs = require('fs');
const DNSServer = require('./Library/DNSServer');

const configFile = './config.json';
let config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

const server = new DNSServer(config);

server.bind(53, '0.0.0.0');

fs.watchFile(configFile, () => {
	console.log('Modification to config file.');

	fs.readFile(configFile, (err, configContent) => {
		if(err) {
			throw err;
		}
		config = JSON.parse(configContent);
		console.log(config);
		server.resetConfig(config);
		console.log('Updated configuration');
	});
});
