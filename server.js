// built-in node libs to load:
var http = require("http"),
    sys = require("sys"),
    url = require("url"),
    net = require('net'),
    qs = require("querystring");

var EventEmitter = require('events').EventEmitter;
var Buffer       = require('buffer').Buffer;
var createServer = require("http").createServer;
var readFile = require("fs").readFile;
var sys = require("sys");
var url = require("url");
DEBUG = false;

// =SERVER=
var server = {
  'getMap': {},
  'commandMap': {},
  'sockets': [],
  'sessions': [],
  'tweetstream': [],
  // null -- localhost
  'HOST' : null,
  'PORT' : 8001,
  'TCP_PORT' : 8002,
  'SESSION_TIMEOUT' : 60000,
  'TWEET_BUFF_MAX': 200 
};


// =TCP / CLI INTERFACE=
server.tcp = net.createServer(function(socket){
  socket.write( '=[TwitGrep]=\n' );
  socket.write( 'M for (m)enu\n' );
  socket.write( 'TwitGrep> ' );

  //add a new TCP connection to our pool
  server.sockets.push(socket);

  //remove TCP connection to our pool
  socket.on('end', function(d){
    var i = server.sockets.indexOf(socket);
    server.sockets.splice( i, d );
    sys.puts("TCP disconnect");
  });
  
  socket.on('data', function (d){
    socket.write( server.parseCommand(d) + '\nTwitGrep> ' );
  });
});


// =HTTP INTERFACE=
server.http = createServer(function (req, res) {
  //var socket = server.sockets.shift();
  //if(socket){
  //  socket.on('data', function (d){
  //    //output = server.command(d);
  //    //res.write('CLI: ' + output + '\n');
  //  });
  //}

  if (req.method === "GET" || req.method === "HEAD") {
    var handler = server.getMap[url.parse(req.url).pathname] || server.notFound;

    res.simpleText = function (code, body) {
      res.writeHead(code, { "Content-Type": "text/plain"
                          , "Content-Length": body.length
                          });
      res.end(body);
    };

    res.simpleJSON = function (code, obj) {
      var body = new Buffer(JSON.stringify(obj));
      res.writeHead(code, { "Content-Type": "text/json"
                          , "Content-Length": body.length
                          });
      res.end(body);
    };

    handler(req, res);
  }
});


// =UTILITY FUNCTIONS= for the server:

// mime type list from jack- thanks
server.mime = {      
  // returns MIME type for extension, or fallback, or octet-steam
  lookupExtension: function(ext, fallback) {
    return server.mime.TYPES[ext.toLowerCase()] || fallback || 'application/octet-stream';
  },

  // List of most common mime-types, stolen from Rack.
  TYPES: { 
    ".css" : "text/css",
    ".html": "text/html", 
    ".js"  : "application/javascript",
    ".json": "application/json"
  }
};

server.notFound = function(req, res) {
  var NOT_FOUND = "Not Found\n";
  res.writeHead(404, { "Content-Type": "text/plain", "Content-Length": NOT_FOUND.length });
  res.end(NOT_FOUND);
  sys.puts("404: " + req.url + "\n");
};

server.extname = function(path) {
  var index = path.lastIndexOf(".");
  return index < 0 ? "" : path.substring(index);
};

server.http.get = function (path, handler) {
  server.getMap[path] = handler;
};

server.http.staticHandler = function (filename) {
  var body, headers;
  var content_type = server.mime.lookupExtension(server.extname(filename));

  function loadResponseData(callback) {
    if (body && headers && !DEBUG) {
      callback();
      return;
    }

    readFile(filename, function (err, data) {
      if (err) {
        sys.puts("Error loading " + filename);
      } else {
        body = data;
        headers = { "Content-Type": content_type
                  , "Content-Length": body.length
                  };
        if (!DEBUG) {headers["Cache-Control"] = "public";}
        sys.puts("static file " + filename + " loaded");
        callback();
      }
    });
  }

  return function (req, res) {
    loadResponseData(function () {
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? "" : body);
    });
  };
};

//register a whitelist of commands that can be run
server.registerCommand = function (cmd, handler) {
  server.commandMap[cmd] = handler;
};

//parse and execute commands
server.parseCommand = function(input){
  output = ''; cmd = 'unknown'; args='';
  str = String(input).trim();

  //parse command
  b = str.indexOf(' ');
  if( -1 === b ){
    cmd = str;
  } else {
    cmd = str.slice(0,b);
    args = str.slice(b).trim();
  }

  //run
  var command_exec = server.commandMap[ cmd ] || server.commandMap.unknown;
  return command_exec( args );
};


// =TWITTER FEEDS=

var feedz = {
  'feedList': ['RootMusic', 'SF', 'node.js', 'javascript', 'beiber'],
  'active': false,
  'list': function(){
    //return current list
    sys.puts( 'Feeds: ' + server.feedz.feedList );
    return server.feedz.feedList;
  },
  'remove': function(id){
    //remove from list
    for( feed in server.feedz.feedList ) {
      if(server.feedz.feedList[feed] === id) {server.feedz.feedList.splice( feed, 1 );}
    }
    server.twit.stream();
    return server.feedz.list();
  },
  'add': function(feed){
    // add to list
    if( feed && feed !== ''){
      // don't allow duplicates.
      server.feedz.remove(feed);
      server.feedz.feedList.push(feed);
      server.twit.stream();
    }
    return server.feedz.list();
  },
  'menu': function(){
    menu =  '(a)dd feed\n';
    menu += '(r)emove feed\n';
    menu += '(l)ist\n';
    menu += '(m)enu\n';
    return menu;
  },
  'suspend': function(){
    //TODO: disconnet twitter stream when we have <= 0 active listeners
    server.feedz.active = false;
    server.twit.stream();
    sys.puts( '-twitter stream suspended-'); 
    return 'twitter stream suspended';
  },
  'resume': function(){
    //TODO: resume twitter data streaming when we have > 0 active listeners
    server.feedz.active = true;
    server.twit.stream();
    sys.puts( '-resume streaming from twitter-');
    return 'resume streaming from twitter';
  }
};
server.feedz = feedz;

// the following commands will be wired up and made available via these aliases:
server.commands = {
  'list': { 
    'handler': server.feedz.list,
    'alias'  : ['list','ls','dir','l','L']
  },
  'add' : {
    'handler': server.feedz.add,
    'alias'  : ['add','a','A','+','search','find','grep']
  },
  'remove' : {
    'handler': server.feedz.remove,
    'alias'  : ['remove','R','r','rm','del','-']
  },
  'resume' : {
    'handler': server.feedz.resume,
    'alias'  : ['on','resume']
  },
  'suspend' : {
    'handler': server.feedz.suspend,
    'alias'  : ['off','suspend']
  },
  'menu' : {
    'handler': server.feedz.menu,
    'alias'  : ['menu', 'M', 'help', 'm']
  }
};

//--------------------------------------------------------------//

// =EVENT HANDLERS=

// adding handlers for the above map of commands:
for( cmd_type in server.commands ){
  for( cmd_alias in server.commands[cmd_type].alias){
    server.registerCommand( server.commands[cmd_type].alias[cmd_alias], server.commands[cmd_type].handler);
  }
}
// default case
server.registerCommand('unknown', function(data){
  sys.puts("-unknown command-");
  return '';
});

// add handlers for the following HTTP routes:
server.http.get("/", server.http.staticHandler("index.html"));
server.http.get("/style.css", server.http.staticHandler("style.css"));
server.http.get("/client.js", server.http.staticHandler("client.js"));

server.http.get("/add", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  res.simpleJSON(200, { feeds: server.feedz.add(id) });
});
server.http.get("/remove", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  res.simpleJSON(200, { feeds: server.feedz.remove(id) });
});
server.http.get("/list", function (req, res) {
  res.simpleJSON(200, { feeds: server.feedz.list() });
});
server.http.get("/command", function (req, res) {
  var command = qs.parse(url.parse(req.url).query).command;
  res.simpleJSON(200, { result: server.parseCommand(command) });
});

server.http.get("/listen", function (req, res) {
  if(server.tweetstream.length > 0 ){
    res.simpleJSON(200, { 'tweet': server.tweetstream.shift() });
  }
});

// open a web client connection - register session_id
server.http.get("/open", function (req, res) {
  session = { 'id': Math.floor(Math.random()*99999999999).toString() };
  if (session === null) {
    res.simpleJSON(400, {error: "Error initializing session"});
    return;
  }
  server.feedz.resume();
  res.simpleJSON(200, { id: session.id });
});


// disconnect web client - close this session
//   if there is nobody listening, suspend streaming
server.http.get("/close", function (req, res) { 
  //var id = qs.parse(url.parse(req.url).query).id;
  server.feedz.suspend();
  sys.puts("disconnect from: " + res.connection.remoteAddress);
  res.simpleJSON(200, {});
});

function extend(a, b) {
  Object.keys(b).forEach(function (key) {
    a[key] = b[key];
  });
  return a;
}

// every 10 seconds poll for the memory.
//setInterval(function () {
//  mem = process.memoryUsage();
//}, 10*1000);

// TODO:
// -Init session on connect
//    - triggers stream resume
// -part triggers suspend 
// -on (makes sure that twitter has our latest feeds)
// -off (not working currently)

// Borrowed parts of this parser from https://github.com/technoweenie/twitter-node/blob/master/lib/twitter-node/parser.js
var Parser = function() {
  // call parent constructor
  EventEmitter.call(this);
  this.buffer = '';
  return this;
};

Parser.prototype = Object.create(EventEmitter.prototype);
Parser.END        = '\r\n';
Parser.END_LENGTH = 2;
Parser.prototype.receive = function receive(buffer) {
  this.buffer += buffer.toString('utf8');
  var index, json;
  while ((index = this.buffer.indexOf(Parser.END)) > -1) {
    json = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + Parser.END_LENGTH);
    if (json.length > 0) {
      try {
        json = JSON.parse(json);
        this.emit('object', json);
      } catch (error) {
        this.emit('error', error);
      }
    }
  }
};

// =Twitter API interface=

// Took a few notes from techoweenie - https://github.com/technoweenie/twitter-node/blob/master/lib/twitter-node/index.js
// Creates a streaming connection with twitter, and pushes any incoming statuses to a tweet event.
var Twit = function() {
  EventEmitter.call(this);
  var self           = this;
  this.options       = {};
  this.host          = 'stream.twitter.com';
  this.port          = 80;
  this.path          = '/1/statuses/';
  this.headers       = { "User-Agent": 'Node' };
  this.parser        = new Parser();
  this.parser.addListener('object', server.feedz.processJSONObject(this));
  this.parser.addListener('error', function (error) {
    self.emit('error', new Error('parser error: ' + error.message));
    sys.puts("Error - " + error.message);
  });
};

Twit.prototype = Object.create(EventEmitter.prototype);

Twit.prototype.stream = function() {
  //dont waste server resources
  if (this.clientResponse && this.clientResponse.connection) {
    this.clientResponse.socket.end();
  }
  //if (server.feedz.feedList.join(",") == '') {  return};

  //convert our search terms into http params
  var params = "?track=" + server.feedz.feedList.join(",");
  var client  = http.createClient(this.port, this.host),
      headers = extend({}, this.headers),
      twit    = this,
      request;

  headers.Host = this.host;
  headers.Authorization = "Basic c2FtcGxldHdpdHM6bWV0cm9wb2xpcw==";
  uri = this.path + "filter.json" + params;
  request = client.request("GET", uri, headers);

  request.addListener('response', function(response) {
    twit.clientResponse = response;
    response.addListener('data', function(chunk) {
      // Passes the received data to the streaming JSON parser.
      // chunk - String data received from the HTTP stream.
      twit.parser.receive(chunk);
    });

    response.addListener('end', function() {
      twit.emit('end', this);
      twit.emit('close', this);
    });
  });
  request.end();
  return this;
};

// =UTILITY METHODS=

//twitter data callback
server.feedz.processJSONObject = function(twit) {
  return function(tweet) {
    if (tweet.limit) {
      twit.emit('limit', tweet.limit);
    } else {
      twit.emit('tweet', tweet);
    }
  };
};

server.twit = new Twit();
server.twit.addListener('tweet', function(tweet) {
  tweet_out = "<span class='user'>@" + tweet.user.screen_name + "</span>: " + tweet.text;
  if( server.tweetstream.length > server.TWEET_BUFF_MAX )
  {
    server.tweetstream.shift();
  }
  if(server.feedz.active )
  {
    server.tweetstream.push(tweet_out);
    sys.puts(tweet_out);
  }
});
server.twit.addListener('limit', function(limit) {
  sys.puts("LIMIT: " + sys.inspect(limit));
});

server.http.listen(Number( process.env.PORT || server.PORT), server.HOST);
server.tcp.listen( server.TCP_PORT );
