/*
app.js
Description: 
DTX Image Chart Batch Service
Objective(s):
Provide DTX Chart creator a way to batch create chart images for multiple .dtx files at once 

Ideas for Feature(s):
1. To support a standard song folder structure of multiple .dtx with a set.def within the folder. App parse set.def to find which .dtx to create chart images of
2. Support standard difficulty names (Basic, Advanced, Extreme, Master, Others) and draw them on chart images
3. User can upload multiple songs .dtx-es by zipping multiple song folders and upload the zip
4. After generation, user get back a zip containing:
a) .png chart images for each .dtx with difficulty label as defined in set.def
b) chart images are organized into song folders
c) A simple HTML index.html showing a table with links to the chart images (similar to XGPager)

Required external modules:
fabric for node
-->Requires node-canvas and its dependencies, which include native modules
fileHound
objectHash
ejs

Internal modules:
path
fs

Future required modules:
unzip
*/
'use strict';    
module.exports = function dtxbatchapplication(){
    var fs = require('fs'),
	stripBom = require('strip-bom'),
	path = require('path'),
	fileHoundMod = require('filehound'),
	objectHash = require('object-hash'),
    ejs = require('ejs'),
    Promise = require('bluebird'),
    DTXChartModule = require('./libs/dtxchart.js'),
    setDef = require('./libs/setdef.js'),
	fabric = DTXChartModule.fabric,
    DtxChart = DTXChartModule.DtxChart;

    //Promisify fs module
    Promise.promisifyAll(fs);

    
    //globals
    const inputPath = "input", 
    outputPath = "output",
    dtxFileExt = "dtx",
    defFileExt = "def";
    var diffcultyTier = ["Basic", "Advanced", "Extreme", "Master", "Ultimate"];
    var diffcultyTierMap = {"Basic": 0, "Advanced": 1, "Extreme": 2, "Master": 3, "Ultimate": 5};
    var modeMap = {"drum": 0, "guitar": 1, "bass": 2}
    

    //Starting point
    function start(){
        //Clean up output folder first
        

        var fileHound = fileHoundMod.create();
        //1st stage: Find all .def files in input folder with depth of 1
        var defPromises = fileHound
            .paths(inputPath)
            .ext(defFileExt)
            .depth(1)
            .find()
            .then(function(defFiles) {
                //console.log(defFiles);
                let promises = [];
                for(let i in defFiles){
                    promises.push(fs.readFileAsync(defFiles[i], 'utf8')
                    .then(function(defData){
                        //console.log(defData);
                        var content = stripBom(defData);
                        //console.log(content);
                        //Get Containing Directory of def file
                        //Nesting is required because we need access to defFiles by closure
                        var dirPath = path.dirname(defFiles[i]);
                        console.log(dirPath);

                        //Return a list of songs, each having different difficulty of dtx
                        var setDefFileObject = setDef.parseDefFile(content);
                        setDefFileObject.parentFolder = dirPath;
		                
                        return setDefFileObject;
                    }));
                }
                return promises;
            })
            //2nd stage: Read and parse all in dtx files
            .all()              
            .then(function(setDefFileObjectArray){
                let promises = [];
                for(let i in setDefFileObjectArray){
                    //console.log(setDefFileObjectArray[i]);
                    for(let j in setDefFileObjectArray[i].songs){
                        //console.log(setDefFileObjectArray[i].songs[j]);
                        //console.log(setDefFileObjectArray[i].parentFolder);
                        for(let k in setDefFileObjectArray[i].songs[j].files){
                            let dtxfileName = setDefFileObjectArray[i].songs[j].files[k];
                            if(dtxfileName !== null && dtxfileName.length > 0){
                                let fullPath = path.join(setDefFileObjectArray[i].parentFolder, dtxfileName);
                                let difficulty = diffcultyTier[k];
                                let title = setDefFileObjectArray[i].songs[j].title;
                                promises.push( readDtxFile(fullPath, difficulty, title) ); 
                            }
                        }
                    }

                }
                return promises;                
            })
            //3rd stage: Prepare to draw dtx charts
            .all()
            .then(function(dtxPlusObjectArray){
                console.log(dtxPlusObjectArray.length);
                let promises = []
                for(let i in dtxPlusObjectArray){
                    let dtxPlusObject = dtxPlusObjectArray[i];
                    if(dtxPlusObject !== null){                        
                        console.log(dtxPlusObject.title + " " + dtxPlusObject.difficulty);

                        var hashTitle = objectHash(dtxPlusObject.title);
                        //Make dir
                        let outDir = path.join(outputPath, hashTitle);
                        mkdirSync(outDir);

                        //Check available charts and draw accordingly
                        let outputChartUrl = "";
                        let outputFileName = "";
                        let chartMode = "";
                        if(dtxPlusObject.availableCharts.drum){                            
                            chartMode = "Drum";
                            outputFileName = path.join(outputPath, hashTitle, dtxPlusObject.difficulty) + "_" + chartMode;//TODO: Resolve the different naming issue
                            promises.push( drawCharts(dtxPlusObject, chartMode, outputFileName) );                           
                        }
                        if(dtxPlusObject.availableCharts.bass){                            
                            chartMode = "Bass";     
                            outputFileName = path.join(outputPath, hashTitle, dtxPlusObject.difficulty) + "_" + chartMode;//TODO: Resolve the different naming issue
                            promises.push( drawCharts(dtxPlusObject, chartMode, outputFileName) );                             
                        }
                        if(dtxPlusObject.availableCharts.guitar){                            
                            chartMode = "Guitar";
                            outputFileName = path.join(outputPath, hashTitle, dtxPlusObject.difficulty) + "_" + chartMode;//TODO: Resolve the different naming issue
                            promises.push( drawCharts(dtxPlusObject, chartMode, outputFileName) );                                  
                        }                                                
                    }
                }
                return promises;//promises of [{title, chartmode, difficulty, level, URL}]
            })
            .all()
            .then(function(dtxPageInfoObjectArray){
                console.log(dtxPageInfoObjectArray);
                // for (let i = 0; i < dtxPageInfoObjectArray.length; i++) {
                //     const dtxPageInfoObject = dtxPageInfoObjectArray[i];
                //     if(dtxPageInfoObject){
                //         let hashTitle = objectHash(dtxPageInfoObject.title);
                //     }
                    
                // }
            })
            .catch(function(err){
                console.log(err);
            });        
                
    }

    /**
     * 
     * @param {string} dtxPath 
     * @param {string} difficulty 
     * @param {string} title 
     */
    function readDtxFile(dtxPath, difficulty, title){
        var difficultyName = difficulty;
        var songTitle = title;
        return fs.readFileAsync(dtxPath, 'utf8')
            .then(function(dtxText){
                let dtxparserv2 = new DtxChart.Parser({mode: 'dtx'});
                if(dtxparserv2.parseDtxText(dtxText)){
                    let dtxObject = dtxparserv2.getDtxDataObject();
                    let availableCharts = dtxparserv2.availableCharts();
                    let lineMapper = new DtxChart.LinePositionMapper(dtxObject);
                    return {dtxObject: dtxObject, lineMapper: lineMapper, availableCharts: availableCharts, difficulty: difficultyName, title: songTitle};
                }
                else
                {
                    throw "Invalid DTX File";
                }
                
            })
            .catch(function(err){
                console.log(err);
            });
    }

    /**
     * 
     * @param {*} dtxPlusObject 
     * @param {*} chartMode 
     * @param {*} fileName 
     * {title, chartmode, difficulty, level, URL}
     */
    function drawCharts(dtxPlusObject, chartMode, fileName){
        let charter = new DtxChart.Charter();
        charter.setDtxData(dtxPlusObject.dtxObject, dtxPlusObject.lineMapper);
        //Prepare config parameters base on chart mode
        let drawParameters = null;
        let drawNoteFunction = null;
        let direction = "up";
        let level = "0.00";
        if(chartMode.toLowerCase() == "drum"){
            drawParameters = DtxChart.DMDrawMethods.createDrawParameters("Gitadora");
            drawNoteFunction = DtxChart.DMDrawMethods.drawNote;	
            level = dtxPlusObject.dtxObject.chartInfo.drumlevel;
        }else if(chartMode.toLowerCase() == "bass"){
            drawParameters = DtxChart.GFDrawMethods.createDrawParameters( "Gitadora", 'B' );
            drawNoteFunction = DtxChart.GFDrawMethods.drawNote;
            direction = "down";
            level = dtxPlusObject.dtxObject.chartInfo.basslevel;
        }else if(chartMode.toLowerCase() == "guitar"){
            drawParameters = DtxChart.GFDrawMethods.createDrawParameters( "Gitadora", 'G' );
            drawNoteFunction = DtxChart.GFDrawMethods.drawNote;
            direction = "down";
            level = dtxPlusObject.dtxObject.chartInfo.guitarlevel;
        }
        
        //Set config
        //TODO: Change charter to adjust canvas size dynamically to fit whole song in one canvas if possible
        charter.setConfig({
            scale: 1.00,
            pageHeight: 1600,
            pagePerCanvas: 12,
            chartType: "Gitadora",
            mode: chartMode.toLowerCase(),
            barAligned : true,//Test
            direction: direction,//up or down
            drawParameters: drawParameters,
            drawNoteFunction: drawNoteFunction
        });
        
        //Compute number of canvas required
        var canvasConfigArray = charter.canvasRequired();
        //console.log(canvasConfigArray);
        //console.log("Required canvas count: ",canvasConfigArray.length);
        charter.setCanvasArray(canvasConfigArray);
        charter.drawDTXChart();
        
        //Output save to image file
        for(let i in charter._chartSheets){
            let outfilename = fileName + "_" + i + '.png';//Need to generate the names earlier somewhere...
            let canvas = charter._chartSheets[i]._canvasObject;//Access "private" objects to get the actual fabric canvas object so we can use its API
            //Final Step: Save canvas in output folder
            saveCanvasAsImage(canvas, outfilename);
        }
        
        let outfilename = fileName + "_0" + '.png';
        var urlPath = outfilename.substring( outputPath.length + 1 );
        //console.log(urlPath);
        var outObject = {
            title: dtxPlusObject.title,
            chartMode: chartMode,
            difficulty: dtxPlusObject.difficulty,
            level: level,
            url: urlPath
        };

        return outObject;
    }

    //TODO: convert to promise type
    function saveCanvasAsImage(canvas, outfileName){
        var out = fs.createWriteStream(outfileName);
        var stream = canvas.createPNGStream();
        stream.on('data', function(chunk) {
            out.write(chunk);
        });
        stream.on('end', function(){
            out.end();
            canvas.dispose();
            //console.log(canvas, " is disposed");
        });
    }

    function mkdirSync(dirPath) {
        try {
          fs.mkdirSync(dirPath)
        } catch (err) {
          if (err.code !== 'EEXIST') throw err
        }
      }

    /*function(err, files){
        if(err) return console.error(err);
        
        //console.log(files);		
        
        //Only expect one def file and only parse one def file
        //Next step continues further inside
        for(var i in files){
            readDefFile(files[i]);
        }
        
        /* for(var i in files){
            var fileName = path.basename(files[i]);
            readDTXFile(files[i], "Other", fileName);
        } */
    //}




    var mod = {};

    mod.start = start;

    return mod;
}();