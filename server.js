#!/usr/bin/env node
var http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    PubSub = require("pubsub-js"),
    chokidar = require('chokidar');
    port = process.argv[2] || 3000;


// If acceleromter is available use this app to
// read x,y,z values.
var accel_ap_path = '../';
var accel_ap_name = 'accel_stream'

var options = {};
var isUseHTTPs = false;

if ( isUseHTTPs ) {
    options = {
        key: fs.readFileSync("./ssl/key.pem"),
        cert: fs.readFileSync("./ssl/cert.pem")
    };
    port = 8443;
}

// force auto reboot on failures
var autoRebootServerOnFailure = false;

var server = require(isUseHTTPs ? 'https' : 'http');
const queryString = require('querystring');

function cmd_exec(cmd, args, cb_stdout, cb_end) {
        var spawn = require('child_process').spawn;
        var child = spawn(cmd, args);
        child.on('error', function(err) {
           console.log('cmd_exec. ' + err);
        });

        var me = this;

        me.exit = 0;
        me.stdout = "";
        child.stdout.on('data', function(data) {
            cb_stdout(me, data)
        });
        child.stdout.on('end', function() {
            cb_end(me)
        });
}

// The interface to /dev/servoblaster provided by servod.
// See https://github.com/richardghirst/PiBits/tree/master/ServoBlaster

var servos = {
	"up-down":{id:0,position:0,min:-45,max:45},   // Default servo for id 0 RPi pin 7
	 "left-right":{id:1,position:0,min:-45,max:45} // Default servo for id 1 RPi pin 11
};
var buttons = {
	"left":{servo:"left-right",increment:-5},
	"right":{servo:"left-right",increment:+5},
	"up":{servo:"up-down",increment:-5},
	"down":{servo:"up-down",increment:+5}
};

function update_servo( movement ){
  var servo_name = movement.servo;
  var increment = movement.increment;
  console.log("servo update", servo_name, increment);
  var id = servos[servo_name].id;
  servos[servo_name].position += increment;
  if ( servos[servo_name].position < servos[servo_name].min ){
    servos[servo_name].position = servos[servo_name].min;
  }
  if ( servos[servo_name].position > servos[servo_name].max ){
    servos[servo_name].position = servos[servo_name].max;
  }
  var servo_cmd = "" + id + "=" + servos[servo_name].position  + "%\n";
  fs.access( "/dev/servoblaster", fs.constants.F_OK, (err)=>{
       if( err ){
        console.warn( err );
       } else {
        const servod = fs.createWriteStream( "/dev/servoblaster" );
        servod.write( servo_cmd );
       }
    }
  );
}

//http.createServer(function(request, response) {
function serverHandler(request, response) {
  var reqURL = url.parse(request.url);
  var uri = reqURL.pathname;

  if (uri == '/servo') {
                var query = queryString.parse( reqURL.query );
                console.log("servo", query);
		try {
		  var movement = buttons[query.camera];
      update_servo( movement );
		} catch (err) {
      console.warn( err );
    }
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end(JSON.stringify(servos));
  }else if (uri == '/image') {
	    // for image requests, return a HTTP multipart document (stream)
	    boundaryID = "BOUNDARY";

      response.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace;boundary="' + boundaryID + '"',
            'Connection': 'keep-alive',
            'Expires': 'Fri, 27 May 1977 00:00:00 GMT',
            'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
            'Pragma': 'no-cache'
      });

        //
        // send new frame to client
        //
        var subscriber_token = PubSub.subscribe('MJPEG', function(msg, data) {

            //console.log('sending image');

            response.write('--' + boundaryID + '\r\n')
            response.write('Content-Type: image/jpeg\r\n');
            response.write('Content-Length: ' + data.length + '\r\n');
            response.write("\r\n");
            response.write(Buffer(data), 'binary');
            response.write("\r\n");
        });

        //
        // connection is closed when the browser terminates the request
        //
        response.on('close', function() {
            console.log("Connection closed!");
            PubSub.unsubscribe(subscriber_token);
            response.end();
});
  }else if (uri == '/piset') {
                var query = queryString.parse( reqURL.query );
                response.end();
  }
  else{

  var filename = path.join(process.cwd(), uri);

  fs.exists(filename, function(exists) {
    if(!exists) {
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.write("404 Not Found\n");
      response.end();
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += '/index.html';

    fs.readFile(filename, "binary", function(err, file) {
      if(err) {
        response.writeHead(500, {"Content-Type": "text/plain"});
        response.write(err + "\n");
        response.end();
        return;
      }

      response.writeHead(200);
      response.write(file, "binary");
      response.end();
    });
  });
  }
}

const spawn = require('child_process').spawn;

var maxXYZ = [], minXYZ =[];



function spawn_accel(){
  accel = spawn( accel_ap_path + accel_ap_name, ['','',''],
    {cwd: accel_ap_path,
     shell:true,
     stdio:['pipe','pipe','pipe']});

  accel.on('error', function(err) {
        console.log('spawn_accel. ' + err);
     });

  accel.on('close', (code) => {
        console.log(`accel_stream child process exited with code ${code}`);
  });

  accel.stderr.on('data', (data) => {
        console.log(`accel stderr: ${data}`);
  });

  accel.stdio[1].on('data', (data) => {
    var rows = `${data}`.split("\n");
    // Likely get 88 or 89 rows per call.
    // No need to process more than 20
    maxXYZ = [-100,-100,-100], minXYZ = [100,100,100];

    for(var i=1; i < rows.length; i+=4){
      //console.log(rows[i]);
      var vals = rows[i].split(",");
      var x = Number(vals[0]), y = Number(vals[1]), z = Number(vals[4]);
      if( x > maxXYZ[0]) maxXYZ[0] = x;
      if( y > maxXYZ[1]) maxXYZ[1] = y;
      if( z > maxXYZ[2]) maxXYZ[2] = z;
      if( x < minXYZ[0]) minXYZ[0] = x;
      if( y < minXYZ[1]) minXYZ[1] = y;
      if( z < minXYZ[2]) minXYZ[2] = z;
      //console.log(`xyz ${x} ${y} ${z}`);
    }
    //console.log("max", maxXYZ);
    //console.log("min", minXYZ);
    var triggerXYZ =[];
    var sensitivity = 10.0; // 5 too low
    triggerXYZ[0] = (sensitivity * (maxXYZ[0] - minXYZ[0])).toFixed();
    triggerXYZ[1] = (sensitivity * (maxXYZ[1] - minXYZ[1])).toFixed();
    triggerXYZ[2] = (sensitivity * (maxXYZ[2] - minXYZ[2])).toFixed();;
    if((triggerXYZ[0] + triggerXYZ[1] + triggerXYZ[2] ) > 0){
      status.trigger = Date.now();
      //console.log(`triggered ${status.trigger}`)
    }
  });
}

spawn_accel();

//spawn_browser();


var app;

if (isUseHTTPs) {
    app = server.createServer(options, serverHandler);
} else {
    app = server.createServer(serverHandler);
}

function runServer() {
    app.on('error', function(e) {
        if (e.code == 'EADDRINUSE') {
            if (e.address === '0.0.0.0') {
                e.address = 'localhost';
            }

            var socketURL = (isUseHTTPs ? 'https' : 'http') + '://' + e.address + ':' + e.port + '/';

            console.log('------------------------------');
            console.log('\x1b[31m%s\x1b[0m ', 'Unable to listen on port: ' + e.port);
            console.log('\x1b[31m%s\x1b[0m ', socketURL + ' is already in use. Please kill below processes using "kill PID".');
            console.log('------------------------------');

            foo = new cmd_exec('lsof', ['-n', '-i4TCP:9001'],
                function(me, data) {
                    me.stdout += data.toString();
                },
                function(me) {
                    me.exit = 1;
                }
            );
        }
    });

    app = app.listen(port, process.env.IP || '0.0.0.0', function(error) {
        var addr = app.address();

        if (addr.address === '0.0.0.0') {
            addr.address = 'localhost';
        }

        var domainURL = (isUseHTTPs ? 'https' : 'http') + '://' + addr.address + ':' + addr.port + '/';

	console.log( "Starting server on: " + domainURL );
    });
}

var tmpFolder = '/dev/shm/mjpeg',
    tmpImage = 'cam.jpg';

var tmpFile = path.resolve(path.join(tmpFolder, tmpImage));

// start watching the temp image for changes
var watcher = chokidar.watch(tmpFile, {
  persistent: true,
  usePolling: true,
  interval: 10,
});

// hook file change events and send the modified image to the browser
watcher.on('change', function(file) {

    //console.log('change >>> ', file);

    fs.readFile(file, function(err, imageData) {
        if (!err) {
            PubSub.publish('MJPEG', imageData);
        }
        else {
            console.log(err);
        }
    });
});

process.on('uncaughtException', function(err) {
    console.warn(err);
});

if (autoRebootServerOnFailure) {
    // auto restart app on failure
    var cluster = require('cluster');
    if (cluster.isMaster) {
        cluster.fork();

        cluster.on('exit', function(worker, code, signal) {
            cluster.fork();
        });
    }

    if (cluster.isWorker) {
        runServer();
    }
} else {
    runServer();
}
