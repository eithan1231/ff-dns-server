const dgram = require('dgram');
const nativeDnsPacket = require('native-dns-packet');
const wildcard = require('wildcard2');
const DNS_PORT = 53;


module.exports = class DNSServer
{
	constructor(config = {})
	{
		this.resetConfig(config);

		this._cache = {};

		this._records = {
			1: 'A',
			2: 'NS',
			5: 'CNAME',
			6: 'SOA',
			12: 'PTR',
			15: 'MX',
			16: 'TXT',
			28: 'AAAA'
		};

		this._server = dgram.createSocket('udp4');
		this._server.on('listening', this._listening.bind(this));
		this._server.on('error', this._error.bind(this));
		this._server.on('message', this._message.bind(this));
	}

	resetConfig(config)
	{
		this.config = config;

		if(typeof config !== 'object') {
			config = {};
		}

		if(typeof config.nameservers === 'undefined') {
			config.nameservers = [
				'1.1.1.1',
				'8.8.8.8'
			];
		}

		if(typeof config.domainOverwrites === 'undefined') {
			config.domainOverwrites = { };
		}

		if(typeof config.domainBlacklists === 'undefined') {
			config.domainBlacklists = { };
		}

		if(typeof config.IPBlacklists === 'undefined') {
			config.IPBlacklists = { };
		}

		this.config = config;

		console.log('nameservers:');
		for (const server of this.config.nameservers) {
			console.log(`\t${server}`);
		}

		console.log('domain overwrites:');
		for (let key in this.config.domainOverwrites) {
			console.log(`\t${key} is overwritten by ${this.config.domainOverwrites[key]['type']} ${this.config.domainOverwrites[key]['address']}`);
		}
	}

	_createResponse(response)
	{
		const buf = Buffer.alloc(1024 * 4);
		const wrt = nativeDnsPacket.write(buf, response);
		const res = buf.slice(0, wrt);
		return res;
	}

	_getType(stringType)
	{
		for (let recordKey in this._records) {
			if(this._records[recordKey] == stringType) {
				return recordKey;
			}
		}
		return null;
	}

	_listening()
	{
		console.log('listening');
	}

	_error(err)
	{
		console.error(err);
	}

	_cacheStore(key, value)
	{
		this._cache[key] = value;
	}

	_cacheExists(key)
	{
		return typeof this._cache[key] !== 'undefined';
	}

	_cacheGet(key)
	{
		return this._cacheExists(key) ? this._cache[key] : null;
	}

	_cacheDelete(key)
	{
		if(this._cacheExists(key)) {
			delete this._cache[key];
		}
	}

	_message(data, requestInfo)
	{
		const query = nativeDnsPacket.parse(data);
		if(!query || typeof query.question[0] === 'undefined') {
			// Bad query
			return;
		}

		const cacheKey = `${query.question[0].type}:${query.question[0].class}::${query.question[0].name}`;

		// Domain overwrites.
		if(typeof this.config.domainOverwrites[query.question[0].name] !== 'undefined') {
			// Storing overwrite in a convenient variable
			const overwrite = this.config.domainOverwrites[query.question[0].name];

			// Fixing up the type
			overwrite.type = parseInt(this._getType(overwrite.type));

			// verifying type (don't want to return the wrong record type.)
			if(overwrite.type == query.question[0].type) {
				console.log(`(OVERWRITE) QUERY: ${requestInfo.address}:${requestInfo.port} ${this._records[query.question[0].type]} ${query.question[0].name}`);

				// Recomputing response
				query.header.qr = 1;
				query.header.rd = 1;
				query.header.ra = 1;
				query.answer.push({
					name: query.question[0].name,
					type: overwrite.type,
					class: 1,
					ttl: overwrite.ttl || 30,
					address: overwrite.address
				});

				// Creating a response object from cached object
				const responsePacket = this._createResponse(
					query
				);

				// Sending response.
				this._server.send(
					responsePacket,
					0,
					responsePacket.length,
					requestInfo.port,
					requestInfo.address
				);

				return;
			}
		}

		// Domain blacklists
		if(typeof this.config.domainBlacklists[query.question[0].name] != 'undefined') {
			console.log(`(BLACKLIST) QUERY: ${requestInfo.address}:${requestInfo.port} ${this._records[query.question[0].type]} ${query.question[0].name} (${cacheKey})`);

			// Recomputing response
			query.header.qr = 1;
			query.header.rd = 1;
			query.header.ra = 1;

			// Creating a response object from cached object
			const responsePacket = this._createResponse(query);

			// Sending response.
			this._server.send(
				responsePacket,
				0,
				responsePacket.length,
				requestInfo.port,
				requestInfo.address
			);

			return;
		}

		// Cached responses.
		if(this._cacheExists(cacheKey)) {
			console.log(`(CACHE) QUERY: ${requestInfo.address}:${requestInfo.port} ${this._records[query.question[0].type]} ${query.question[0].name} (${cacheKey})`);

			// Creating a response object from cached object
			const response = this._createResponse(
				this._cacheGet(cacheKey)
			);

			// Sending response.
			this._server.send(
				response,
				0,
				response.length,
				requestInfo.port,
				requestInfo.address
			);

			return;
		}

		// Fallback (used for a retry-timeout)
		let fallback = null;

		// Establishing socket that is used for sending data to name-servers.
		const sock = dgram.createSocket('udp4');

		// Sends the response (with automated retry)
		const sendAttempt = (nsIndex) => {
			if(nsIndex > this.config.nameservers.length) {
				this._error(new Error('Failed to send - exceeded nameserver reattempts'));
				fallback = null;
				return;
			}

			// Timeout is 350 milliseconds, and on each retry attempt, increment
			// timeout by 100 milliseconds
			const timeout = 350 + (nsIndex * 100);

			sock.send(data, 0, data.length, DNS_PORT, this.config.nameservers[nsIndex], () => {
				fallback = setTimeout(() => {
					sendAttempt(nsIndex + 1);
				}, timeout);
			})
		}

		// Send attempt (has auto retrys)
		sendAttempt(0);

		// Errors
		sock.on('error', (err) => {
			console.error(err);
			sock.close();
		})

		// Received response message from remote nameserver
		sock.on('message', (response) => {
			clearTimeout(fallback);

			// Caching response (assuming everything is okay)
			let responsePacket = nativeDnsPacket.parse(response);
			if(responsePacket.answer.length > 0) {
				this._cacheStore(cacheKey, responsePacket)
				const ttl = responsePacket.answer[0].ttl;

				// Setting the auto deleter (TTL is in seconds)
				setTimeout(() => {
					this._cacheDelete(cacheKey);
				}, ttl * 1000)
			}

			// Sending response (After parsed)
			const responseReparsed = this._createResponse(responsePacket);
			this._server.send(
				responseReparsed,
				0,
				responseReparsed.length,
				requestInfo.port,
				requestInfo.address
			);
			sock.close();

			console.log(`(FETCHED) Question ${requestInfo.address}:${requestInfo.port} ${this._records[query.question[0].type]} ${query.question[0].name}`);
		});
	}

	bind(port, host)
	{
		this._server.bind(port, host)
	}
}
