# ff-dns-server
FF-DNS-Server was a project developed for the Fried-Fame (VPN) project. Was designed to be deployed on the nodes of each server. It should be noted, this project is no longer actively developed or maintained.



# Deployment
Deployment of this application is simple. All you need to configure is the config file, forward port 53, and a NodeJS service monitor, such as PM2. In this README we will not give instructions on how to configure PM2, see their official documentation for configuration for further information..


## Configuration File
There are two main functionalities of this configuration file, the name servers an ddomain blacklist. The blacklist is to fend off any domiain you don't want to allow your clients access to, and the name servers is the service which this DNS server will piggy back off.


## Port Forwarding
To allow people to connect to this server, you must route port 53 to the IP this server is hosted on.


## Starting the Server
To start this server, all you will need to do is download all the packages used for this project, and starting it.

`npm install` - installs all of the depended packages

`npm start` - starts the server (see pm2 for better alternative to this)



# Trouble-shooting

## My DNS queries are not being received on the server

- Ensure the firewall of your server, and router have been configured to allow this server to run. This server requires port 53.
- Double check the server is properly running (see console for errors)
- Check the correct IP address of the server was configured on the client-machine.

## Unable to connect to specific domains
- This software comes with a domain blacklist in the config.json file. By default it has a list of blacklisted domains sourced from around the internet. Check to ensure the domain you are connecting to, is not on this blacklist.
