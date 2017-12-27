// accel.js
// Michael Saunby mike@saunby.net
//

// If acceleromter is available use this app to
// read x,y,z values.
var accel_ap_path = '../';
var accel_ap_name = 'accel_stream'

class accel{

  constructor(){
    console.log("ACCEL CONSTRUCTOR CALLED");
  }

  spawn_accel(){
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

};

// spawn_accel();

module.exports = accel;
