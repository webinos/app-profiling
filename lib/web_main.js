var express = require('express');
var app = express();
var fs = require('fs');
var join = require('path').join || fs.join ;
var tcRunner = require('./tc_runner.js');

var web_root = join(__dirname,'..','tests','web_root');
var tests_root = join(__dirname,'..','tests');

app.use('/', express.static(web_root));
app.use(express.bodyParser());

//get all available testsuites
app.get('/testsuites/', function(req, res){
	var testSuites = [];
	var fileCbCountdown = 0;
	fs.readdir(tests_root, function(err, files){
		for (var i = files.length - 1; i >= 0; i--) {
			if(files[i].indexOf(".json")!= -1){
				fileCbCountdown++;
				try{
					fs.readFile(join(tests_root,files[i]), 'utf8', (function(fileName){ return function (err, data) {
						data = JSON.parse(data);
					  if (err) {
					    console.log(err,'Error reading file: '+fileName);
					  }else{
					  	var testCases = [];
					  	if (data.testCases) for (var j = 0; data.testCases.length>j; j++) {
					  		testCases.push(data.testCases[j].testcaseTitle);
					  	};
					  	testSuites.push({"name":fileName,"title":data.testsuiteTitle,"testCases":testCases});
					  }
					  fileCbCountdown--;
					  if(fileCbCountdown<=0)
					  	res.send(testSuites);
					}  })(files[i]));
					
				}catch(e){console.log(e,"Testsuite file might be corrupt.");}
			}
		};
	});
});

//get all available testsuites
app.get('/profiles/', function(req, res){
	var profiles = {};
	fs.readdir(tests_root, function(err, files){
		for (var i = files.length - 1; i >= 0; i--) {
			if(files[i].indexOf(".raw")!= -1){
				var parts = files[i].split(".");
				if(parts.length>=5){
					if(!profiles[parts[0]]){
						profiles[parts[0]]={};
					}
					if(!profiles[parts[0]][parts[1]]){
						profiles[parts[0]][parts[1]]={};
					}
					if(!profiles[parts[0]][parts[1]][parts[2]]){
						profiles[parts[0]][parts[1]][parts[2]]=[];
					}
					var result = {"timestamp":parts[3]};
					try{
						var contents = fs.readFileSync(join(tests_root,files[i]), 'utf8');
						contents = JSON.parse(contents);
						if(contents.length){
							result.description=contents[0].description;
							result.testCaseName=contents[0].suite.testCases[parts[1]].testcaseTitle;							
						}
					}catch(e){console.log(e)}

					profiles[parts[0]][parts[1]][parts[2]].push(result);
				}
			}
		};
		res.send(profiles);
	});
});

//read a testsuite from file
app.get('/testsuite/:file', function(req, res){
	try{
		fs.readFile(join(tests_root,(req.params.file)?req.params.file:""), function (err, data) {
		  if (err) {
		    console.log(err,'Error reading file.');
		    res.send({});
		    return;
		  }
		  res.send(JSON.parse(data));
		});
		
	}catch(e){console.log(e,"Testsuite file might be corrupt or not present.");res.send({});}
  
});

//save a testsuite back to file
app.post('/testsuite/:file', function(req, res){
	try{
		//posting an empty testsuite we interpret as deletion
		if(!req.body || JSON.stringify(req.body)=="{}"){
			if(typeof req.params.file === "string" && req.params.file.indexOf("..")==-1){
				var filename = req.params.file.indexOf(".json")!=-1?req.params.file:req.params.file+".json";
				fs.exists(join(tests_root,filename), function (exists) {
	  				if(exists){
						fs.unlink(join(tests_root,filename), function (err) {
				  			if (err) return res.send({"error":"deleting failed."});
				  			res.send({});
						});
	  				}
				});
			}else{
				res.send({"error":"deleting failed."});
			}
		} else {
			if(typeof req.params.file === "string" && req.params.file.indexOf("..")==-1){
				var filename = req.params.file.indexOf(".json")!=-1?req.params.file:req.params.file+".json";
					fs.writeFile(join(tests_root,filename), JSON.stringify(req.body), function (err) {
			  			if (err) return res.send({"error":"saving failed."});
			  			res.send({"status":"ok","filename":filename});
					});
			}else{
				res.send({"error":"saving failed."});
			}
		}
	}catch(e){console.log(e,"");res.send({"error":"saving/deleting failed."});}
  
});

//start testcase
app.get('/testsuite/:file/testcase/:case', function(req, res){
	try{
		fs.readFile(join(tests_root,(req.params.file)?req.params.file:""), function (err, data) {
			if (err) {
				console.log(err,'Error reading file.');
				res.send({});
				return;
			}
			tcRunner.runTestCase(JSON.parse(data),req.params.case,{"path":tests_root,"suitefile":req.params.file, "desc":req.query.desc},function(result){
				res.send(result);
			});
		});

		
	}catch(e){console.log(e,"Testsuite file might be corrupt or not present.");res.send({});}
  
});


//Reporting
//create report

var reports = {};
var executions_description = {};

app.get('/report/:tsprefix/testcase/:tcnumber', function(req, res){
	reports = {};
    executions_description = {};
	fs.readdir(tests_root, function(err, files){
		var validFiles = 0;
		for (var x = files.length - 1; x >= 0; x--) {
			if(files[x].indexOf(".raw")!= -1){
				var parts = files[x].split('.');
				if(parts[0] === req.params.tsprefix && parts[1] === req.params.tcnumber){
					validFiles++;
					console.log("Add to parse list : " + files[x]);
					
                    var device_name = parts[2];
                    if(!reports[device_name])
                        reports[device_name] = {};

                    var report_id = parts[3];

                    reports[device_name][report_id] = {
						heap : [],
						functions : {},
						globals : {numFunctions:0, totTime:0},
						maxHeap : 0,
						timestamps : [],
						websocketframe_received_count : 0,
						websocketframe_sent_count : 0,
						websocketframe_received_bytes : 0,
						websocketframe_sent_bytes : 0,
                        rpc_received_bytes : [],
                        rpc_sent_bytes : [],
                        maxRPCSentBytes : 0,
                        maxRPCReceivedBytes: 0,
						fileName : files[x]
					};

					try{
						var filePath = join(tests_root,reports[device_name][report_id].fileName);
						fs.readFile(filePath, 'utf8', (function(device_name, report_id){ return function (err, str) {
							if (err) {
					    		console.log(err,'Error reading file.');
					    		res.send({});
					    		return;
					  		}
							var data = JSON.parse(str);
							var previousFunctionTime = 0;
							var startTimestamp = 0;
							if(data.length){
                                console.log("Add "+report_id);
								executions_description[report_id] = data[0].description;
							}

                            var firstReceivedRPCTimestamp = 0;
                            var firstSentRPCTimestamp = 0;

							for(var i=1; i<data.length; i++){
					        	if(data[i].method == "Network.webSocketFrameReceived"){
                                    if(firstReceivedRPCTimestamp == 0)
                                        firstReceivedRPCTimestamp = data[i].params.timestamp;
                                    var received_bytes = data[i].params.response.payloadData.length;
                                    reports[device_name][report_id].rpc_received_bytes.push([data[i].params.timestamp - firstReceivedRPCTimestamp, received_bytes]);
                                    if(received_bytes > reports[device_name][report_id].maxRPCReceivedBytes)
                                        reports[device_name][report_id].maxRPCReceivedBytes = received_bytes;
					        		
                                    reports[device_name][report_id].websocketframe_received_count++;
					        		reports[device_name][report_id].websocketframe_received_bytes += received_bytes;
					        	}
					        	else if(data[i].method == "Network.webSocketFrameSent"){
                                    if(firstSentRPCTimestamp == 0)
                                        firstSentRPCTimestamp = data[i].params.timestamp;
                                    var sent_bytes = data[i].params.response.payloadData.length;
                                    reports[device_name][report_id].rpc_sent_bytes.push([data[i].params.timestamp - firstSentRPCTimestamp, sent_bytes]);
                                    if(sent_bytes > reports[device_name][report_id].maxRPCSentBytes)
                                        reports[device_name][report_id].maxRPCSentBytes = sent_bytes;

					        		reports[device_name][report_id].websocketframe_sent_count++;
					        		reports[device_name][report_id].websocketframe_sent_bytes += sent_bytes;
					        	}
					            // console.log("Start: %s , Stop: %s , Type: %s", 
					            //             data[i].startTime, data[i].endTime, data[i].type);
					            var children = (data[i] && data[i].params && data[i].params.record)?data[i].params.record.children:false;
					            if (children) for(var j=0; j<children.length; j++){
					                //console.log("\tStart: %s , Stop: %s , Type: %s , UsedHeapSize: %s",
					                //            children[j].startTime, children[j].endTime, children[j].type, children[j].usedHeapSize);
					                if(!reports[device_name][report_id].functions[children[j].type])
					                    reports[device_name][report_id].functions[children[j].type] = {count:0, time:0};
					                
					                reports[device_name][report_id].functions[children[j].type].count++;
					                reports[device_name][report_id].globals.numFunctions++; 

					                if(startTimestamp == 0){
					                	startTimestamp = children[j].startTime;

					                }

					                if(children[j].startTime && children[j].endTime){
					                    var elapsedTime = children[j].startTime -startTimestamp - previousFunctionTime;
					                    reports[device_name][report_id].functions[children[j].type].time += elapsedTime;
					                    reports[device_name][report_id].globals.totTime += elapsedTime;
					                    previousFunctionTime = children[j].startTime -startTimestamp;
					                }
					                reports[device_name][report_id].heap.push([children[j].startTime, children[j].usedHeapSize]);

					                if(children[j].usedHeapSize > reports[device_name][report_id].maxHeap)
					                	reports[device_name][report_id].maxHeap = children[j].usedHeapSize;

					                //check for timeStamps
					                if(children[j].type = "FunctionCall"){
					                	if(children[j].children){
					                		var children2 = children[j].children;
					                		for(var z=0; z<children2.length; z++){
					                			if(children2[z].type == "TimeStamp"){
					                				var time = reports[device_name][report_id].functions[children[j].type].time;
					                				reports[device_name][report_id].timestamps.push({timestamp: (children[j].startTime - startTimestamp), description: children2[z].data.message});
					                			}
					                		}
					                	}
					                }
					            }
					        }
					        console.log("\n\nReport for " + report_id);
						    for(var i in reports[device_name][report_id].functions){
						        console.log(i+ " :  #=%s, time[ms]=%s",
						                    reports[device_name][report_id].functions[i].count, reports[device_name][report_id].functions[i].time);
						    }

						    console.log("webSocketFrameSent : #%s, bytes: %s" , reports[device_name][report_id].websocketframe_sent_count, reports[device_name][report_id].websocketframe_sent_bytes);
						    console.log("webSocketFrameReceived : #%s, bytes: %s" , reports[device_name][report_id].websocketframe_received_count, reports[device_name][report_id].websocketframe_received_bytes);
						    console.log("Total Number of functions : "+reports[device_name][report_id].globals.numFunctions);
						    console.log("Total Time elapsed : "+reports[device_name][report_id].globals.totTime);

						    validFiles--;
							if(validFiles<=0){
								res.send({"status":"ok"});
                            }
				        }})(device_name, report_id));
					}
					catch(e){console.log(e,"Report file might be corrupt or not present.");return false;}			
				}
			}
		}
	});
});

app.get('/heap/:devname', function(req, res){
    console.log("Required Heap");
    var heap_data = {};
    var max_heap_data = {};
    var executions_data = [];
    var device_name = req.params.devname;

    var sorted_keys = Object.keys(reports[device_name]).sort();
    for(var j=0; j<sorted_keys.length; j++){
        var report_id = sorted_keys[j];
    	heap_data[report_id] = [];
    	var heap = reports[device_name][report_id].heap;
	    if(heap.length > 0){
	        heap_data[report_id].push([0, heap[0][1]]);
	        for(var i=1; i<heap.length; i++){
	            var tmp_time = heap_data[report_id][i-1][0] + (heap[i][0]-heap[i-1][0]);
	            heap_data[report_id].push([tmp_time, heap[i][1]]); //byte
	            max_heap_data[report_id] = reports[device_name][report_id].maxHeap;
	        }
	    }
        executions_data.push(executions_description[report_id]);
    }
    
    var data = {data: heap_data, max:max_heap_data, executions:executions_data};
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

function createSet(arr1, arr2){
    var set = [];
    for(var i=0; i<arr1.length; i++)
        set.push(arr1[i]);
    for(var i=0; i<arr2.length; i++)
        if(set.indexOf(arr2[i]) == -1)
            set.push(arr2[i]);
    return set;
}

app.get('/functionstime/:devname', function(req, res){
    console.log("Required Functions");
    var functions_data = {};
    var executions_data = [];
    var device_name = req.params.devname;

    var functionsKeySet = [];
    for(var report_id in reports[device_name]){
        functionsKeySet = createSet(functionsKeySet, Object.keys(reports[device_name][report_id].functions));
    }

    var sorted_keys = Object.keys(reports[device_name]).sort();
    for(var j=0; j<sorted_keys.length; j++){
        var report_id = sorted_keys[j];
        for(var k=0; k<functionsKeySet.length; k++){
            var func = functionsKeySet[k];
            if(!functions_data[func])
                functions_data[func] = [];
            if(reports[device_name][report_id].functions[func])
                functions_data[func].push(reports[device_name][report_id].functions[func].time);
            else
                functions_data[func].push(0);
        }
        if(executions_description[report_id] != "")
            executions_data.push(executions_description[report_id]);
        else
            executions_data.push("Series "+(j+1));
    }

    var data = {data:functions_data, executions:executions_data};
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

app.get('/timestamps/:devname', function(req, res){
    console.log("Required Timestamps");
    var ts_data = {};
    var descr_data = {};
    var device_name = req.params.devname;

    for(var report_id in reports[device_name]){
    	ts_data[report_id] = [];
    	descr_data[report_id] = [];
    
	    for(var i in reports[device_name][report_id].timestamps){
	    	ts_data[report_id].push(reports[device_name][report_id].timestamps[i].timestamp);
	    	if(i==0)
	    		descr_data[report_id].push("Start Simulation");
	    	else
	    		descr_data[report_id].push(reports[device_name][report_id].timestamps[i-1].description);
	    }
	    ts_data[report_id].push(reports[device_name][report_id].globals.totTime);
	    descr_data[report_id].push(reports[device_name][report_id].timestamps[reports[device_name][report_id].timestamps.length-1].description);
	}
    
    var data = {data:ts_data, legend:descr_data};
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

app.get('/rpcfrequency/:devname', function(req, res){
    console.log("Required RPC frequency");
    var frequency_data = {};
    var executions_data = [];
    var device_name = req.params.devname;

    var sorted_keys = Object.keys(reports[device_name]).sort();
    for(var j=0; j<sorted_keys.length; j++){
        var report_id = sorted_keys[j];
    	frequency_data[report_id] = [reports[device_name][report_id].websocketframe_sent_count, reports[device_name][report_id].websocketframe_received_count];
        executions_data.push(executions_description[report_id]);
    }
    
    var data = {categories:["Sent", "Received"], data:frequency_data, executions:executions_data};
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

app.get('/rpctraffic/:devname', function(req, res){
    console.log("Required RPC traffic");
    var traffic_data = {};
    var executions_data = [];
    var device_name = req.params.devname;

    var sorted_keys = Object.keys(reports[device_name]).sort();
    for(var j=0; j<sorted_keys.length; j++){
        var report_id = sorted_keys[j];
    	traffic_data[report_id] = [reports[device_name][report_id].websocketframe_sent_bytes, reports[device_name][report_id].websocketframe_received_bytes];
        executions_data.push(executions_description[report_id]);
    }
    
    var data = {categories:["Sent", "Received"], data:traffic_data, executions:executions_data};
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

app.get('/rpcreceived/:devname', function(req, res){
    console.log("Required RPC Received over time");
    var rpc_data = {};
    var executions_data = [];
    var max_rpc_received_bytes = {};
    var device_name = req.params.devname;

    var sorted_keys = Object.keys(reports[device_name]).sort();
    for(var j=0; j<sorted_keys.length; j++){
        var report_id = sorted_keys[j];
        rpc_data[report_id] = [];
        var rpcs = reports[device_name][report_id].rpc_received_bytes;
        if(rpcs.length > 0){
            rpc_data[report_id].push([0, rpcs[0][1]]);
            for(var i=1; i<rpcs.length; i++){
                var tmp_time = rpcs[i][0];
                rpc_data[report_id].push([tmp_time*1000, rpcs[i][1]]); //byte
                max_rpc_received_bytes[report_id] = reports[device_name][report_id].maxRPCReceivedBytes;
            }
        }
        executions_data.push(executions_description[report_id]);
    }
    
    var data = {data: rpc_data, max:max_rpc_received_bytes, executions:executions_data};
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

app.get('/rpcsent/:devname', function(req, res){
    console.log("Required RPC Sent over time");
    var rpc_data = {};
    var executions_data = [];
    var max_rpc_sent_bytes = {};
    var device_name = req.params.devname;

    var sorted_keys = Object.keys(reports[device_name]).sort();
    for(var j=0; j<sorted_keys.length; j++){
        var report_id = sorted_keys[j];
        rpc_data[report_id] = [];
        var rpcs = reports[device_name][report_id].rpc_sent_bytes;
        if(rpcs.length > 0){
            rpc_data[report_id].push([0, rpcs[0][1]]);
            for(var i=1; i<rpcs.length; i++){
                var tmp_time = rpcs[i][0];
                rpc_data[report_id].push([tmp_time*1000, rpcs[i][1]]); //byte
                max_rpc_sent_bytes[report_id] = reports[device_name][report_id].maxRPCSentBytes;
            }
        }
        executions_data.push(executions_description[report_id]);
    }
    
    var data = {data: rpc_data, max:max_rpc_sent_bytes, executions:executions_data};
    
    var body = JSON.stringify(data);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

app.listen(3000);