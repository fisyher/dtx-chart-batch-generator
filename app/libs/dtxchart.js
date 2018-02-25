/*Parser*/
/*
DtxChart.Parser
*/
var DtxChart = (function(mod){
    'use strict';
    var VERSION = "2.0.0";

    var SUPPORTED_HEADERS = [
    "; Created by DTXCreator 024",
	"; Created by DTXCreator 025(verK)",
	"; Created by DTXCreator 020",
	";Created by GDA Creator Professional Ver.0.10",
	";Created by GDA Creator Professional Ver.0.22"];
    
    /**
     * Method: DtxChart.Parser constructor
     * Parameters:
     * config - The config object for the text parser
     *    mode - Either "dtx" or "gda"
     * Description: 
     * 
     */
    function Parser(config){
        this._config = config;
        
        //Initialize the dtxdata object
        //dtxdata follows the JSON Schema as described in "ChartData Scheme Doc.txt"
        this._dtxdata = initializeDtxData();
        
        //
		this._largestBarIndex = -1;
		this._rawBarLines = {};
        this._bpmMarkerLabelMap = {};

		//
		this._currBarLength = 1.0;
		var self = this;
    }
    
    //Public Methods

    /*
    Method: DtxChart.Parser.parseDtxText
    Parameters:
    dtxText - The text content of a .dtx or .gda File
    Description:
    Parse and decodes the .dtx or .gda file to retrieve chip data and store in 
    a DtxData object
    Returns:
    True if parsing is successful, otherwise return false.
    */ 
    Parser.prototype.parseDtxText = function(dtxText){
        var lines = dtxText.split('\n');
		//
		if(lines.length === 0){
			console.error('Fail to parse: File is empty!');
			return;
		}
        //Check if header is supported
		if(!checkSupportedHeader(lines[0])){
            console.warn('Warning: Header not supported or header is missing. Parsing may fail');
            //return;
        }
        
        //Start processing all valid lines
		for (var i = 1; i < lines.length; i++) {
			if(lines[i].length > 0 && lines[i][0]==='#')
			{
				this._parseTextLine(lines[i]);
			}
		}; 

        //
        if(this._dtxdata.chartInfo.drumlevel > 0.00){
            this._dtxdata.initMetadata("drum");
        }
        if(this._dtxdata.chartInfo.guitarlevel > 0.00){
            this._dtxdata.initMetadata("guitar");
        }
        if(this._dtxdata.chartInfo.basslevel > 0.00){
            this._dtxdata.initMetadata("bass");
        }

        //console.log(this._rawBarLines);
		//console.log(this._largestBarIndex);
        
        //Further decode rawBarLines
        for (var i = 0; i <= this._largestBarIndex; i++) {
            var barGroup = this._createBarGroup(this._rawBarLines[i]);
            this._dtxdata.barGroups.push(barGroup);
        }
        
        //parser incomplete, return true when complete
        return true;
    };
    
    /*
    Method: DtxChart.Parser.clear
    Parameters:
    None
    Description:
    Clear data inside DtxData object and reset the parser
    Returns:
    True if parsing is successful, otherwise return false.
    */
    Parser.prototype.clear = function(){
        this._dtxdata = initializeDtxData();
        //
		this._largestBarIndex = -1;
		this._rawBarLines = {};
        this._bpmMarkerLabelMap = {};
		//
		this._currBarLength = 1.0;
	};

    /*
    Method: DtxChart.Parser.getDtxDataObject
    Parameters:
    None
    Description:
    Use this method to access the dtxdata object created after successful parsing
    Returns:
    The internal dtxdata object. 
    */
    //May include extended object methods in future
    Parser.prototype.getDtxDataObject = function(){
        var dtxDataObject = this._dtxdata;
        return dtxDataObject;
    };

     /*
    Method: DtxChart.Parser.availableCharts
    Parameters:
    None
    Description:
    Use this method to query available types of charts the loaded dtx has. Check based on levels.
    All charts with notes must be given a non-zero levels.
    Returns:
    The availableCharts result object
    */
    //May include extended object methods in future
    Parser.prototype.availableCharts = function(){
        var ret = {
            drum: this._dtxdata.chartInfo.drumlevel > 0.00 ? true : false,
            guitar: this._dtxdata.chartInfo.guitarlevel > 0.00 ? true : false,
            bass: this._dtxdata.chartInfo.basslevel > 0.00 ? true : false
        };
        return ret;
    };
    
    //Internal methods are denoted with a first character underscore

    /*
    Method: DtxChart.Parser._parseDtxText
    Parameters:
    line - A single text line 
    Returns:
    None
    */
    Parser.prototype._parseTextLine = function(line){
        var trimLine = trimExternalWhiteSpace(line);

        var lineKeyValue = splitKeyValueByColonOrWhiteSpace(trimLine);

        var key = lineKeyValue["key"];
        var value = lineKeyValue["value"];          
        //Select which decode function to use
        if(decodeFunctionMap.hasOwnProperty(key)){
            decodeFunctionMap[key](this._dtxdata, value);
        }
        else if(key.length === 5 && key.indexOf('BPM') === 0){
            var bpmMarkerLabel = key.substring(3);

            decodeFunctionMap["BPM_Marker"](this, value, bpmMarkerLabel);
        }
        else{
            var barNum = parseInt(key.substring(0, 3));
            var laneCode = key.substring(3);
            decodeFunctionMap["BAR_LANE"](this, barNum, laneCode, value);
        }
    };
    
    //Returns a bar group object
    Parser.prototype._createBarGroup = function(rawLinesInBar){
        
        //Current Bar is empty
        if(!rawLinesInBar || !rawLinesInBar['Description'] || rawLinesInBar['Description'] !== "dtxBarLine"){
			var lineCountInCurrentBar = computeLinesFromBarLength(this._currBarLength);
            return {
                "lines": lineCountInCurrentBar,
                "notes": {}
            };
		}
        
        var newBarGroup = {};
        newBarGroup["notes"] = {};
        //Handle Bar Length change first
		if(rawLinesInBar.hasOwnProperty(DtxBarLabelMap.BAR_LENGTH_CHANGE_LABEL)){
            this._currBarLength = readBarLength(rawLinesInBar[DtxBarLabelMap.BAR_LENGTH_CHANGE_LABEL]);
		}        
        var lineCountInCurrentBar = computeLinesFromBarLength(this._currBarLength);        
        newBarGroup["lines"] = lineCountInCurrentBar;
        
        //Handle BPM change flag
        if(rawLinesInBar.hasOwnProperty(DtxBarLabelMap.BPM_CHANGE_LABEL)){
            var posArray = decodeBarLine(rawLinesInBar[DtxBarLabelMap.BPM_CHANGE_LABEL], lineCountInCurrentBar);
            
            newBarGroup["bpmMarkerArray"] = [];
            for(var i=0; i<posArray.length; i++){
                //Look for actual BPM from labelarray
                var label = posArray[i]["label"];
                var bpmValue = this._bpmMarkerLabelMap[label];
                
                newBarGroup["bpmMarkerArray"].push({
                    "pos": posArray[i]["pos"],
                    "bpm": bpmValue
                });
            }
        }
        
        //Handle show/hide bar line flags
        if(rawLinesInBar.hasOwnProperty(DtxBarLabelMap.LINE_SHOW_HIDE_LABEL)){
            var posArray = decodeBarLine(rawLinesInBar[DtxBarLabelMap.LINE_SHOW_HIDE_LABEL], lineCountInCurrentBar);
            
            newBarGroup["showHideLineMarkerArray"] = [];
            for(var i=0; i<posArray.length; i++){
                var label = posArray[i]["label"];
                var show = DtxShowLineLabelMap[label];
                if(!show){
                    show = false;
                }                
                newBarGroup["showHideLineMarkerArray"].push({
                    "pos":posArray[i]["pos"],
                    "show": show
                });
            }
        }

        //Handle BGM chip (normally only one per dtx)
        if(rawLinesInBar.hasOwnProperty(DtxBarLabelMap.BGM_LANE)){
            var posArray = decodeBarLine(rawLinesInBar[DtxBarLabelMap.BGM_LANE], lineCountInCurrentBar);

            newBarGroup["bgmChipArray"] = [];
            for(var i=0; i<posArray.length; i++){
                //var bgmChipLabel = posArray[i]["label"];                
                newBarGroup["bgmChipArray"].push({
                    "pos":posArray[i]["pos"]
                });
            }
        }  
                
        for(var prop in rawLinesInBar){
            if(prop === "Description"){
                continue;
            }

            //Handle the actual drum chips only if DLevel is available
            if(this._dtxdata.chartInfo.drumlevel > 0.00){
                var DLaneCodeToLaneLabelMap = DtxDrumsLaneCodeToLaneLabelMap;
                var DLaneCodeToCountLabelMap = DtxDrumsLaneCodeToCountLabelMap;
                if(this._config.mode === "dtx"){
                    DLaneCodeToLaneLabelMap = DtxDrumsLaneCodeToLaneLabelMap;
                    DLaneCodeToCountLabelMap = DtxDrumsLaneCodeToCountLabelMap;
                }
                else if(this._config.mode === "gda"){
                    DLaneCodeToLaneLabelMap = GDADrumsLaneCodeToLaneLabelMap;
                    DLaneCodeToCountLabelMap = GDADrumsLaneCodeToCountLabelMap;
                }

                if(rawLinesInBar.hasOwnProperty(prop) && DLaneCodeToLaneLabelMap.hasOwnProperty(prop)){
                    var LaneLabel = DLaneCodeToLaneLabelMap[prop];
                    var rawLine = rawLinesInBar[prop];
                    //
                    newBarGroup["notes"][LaneLabel] = rawLine;
                    //Compute Note count
                    var chipCount = countChipBarLine(rawLine, lineCountInCurrentBar);
                    var countLabel = DLaneCodeToCountLabelMap[prop];
                    this._dtxdata.increaseCount("drum", countLabel, chipCount);
                    //this._dtxdata.metadata[countLabel] += chipCount;
                    //this._dtxdata.metadata.totalNoteCount += chipCount;
                }
            }

            //Handle the actual guitar chips only if GLevel is available
            if(this._dtxdata.chartInfo.guitarlevel > 0.00){
                var GLanesToButtonsMap = DtxGuitarLanesCodeToButtonsMap;
                if(this._config.mode === "dtx"){
                    GLanesToButtonsMap = DtxGuitarLanesCodeToButtonsMap;
                }
                else if(this._config.mode === "gda"){
                    GLanesToButtonsMap = GDAGuitarLanesCodeToButtonsMap;
                }

                if(rawLinesInBar.hasOwnProperty(prop) && GLanesToButtonsMap.hasOwnProperty(prop)){
                    var ButtonCombination = GLanesToButtonsMap[prop];
                    var rawLine = rawLinesInBar[prop];
                    //
                    newBarGroup["notes"][ButtonCombination] = rawLine;
                    //Compute Note count...
                    var chipCount = countChipBarLine(rawLine, lineCountInCurrentBar);
                    this._dtxdata.increaseCount("guitar", ButtonCombination, chipCount);
                }
            }

            //Handle the actual guitar chips only if GLevel is available
            if(this._dtxdata.chartInfo.basslevel > 0.00){
                var BLanesToButtonsMap = DtxBassLanesCodeToButtonsMap;
                if(this._config.mode === "dtx"){
                    BLanesToButtonsMap = DtxBassLanesCodeToButtonsMap;
                }
                else if(this._config.mode === "gda"){
                    BLanesToButtonsMap = GDABassLanesCodeToButtonsMap;
                }


                if(rawLinesInBar.hasOwnProperty(prop) && BLanesToButtonsMap.hasOwnProperty(prop)){
                    var ButtonCombination = BLanesToButtonsMap[prop];
                    var rawLine = rawLinesInBar[prop];
                    //
                    newBarGroup["notes"][ButtonCombination] = rawLine;
                    //Compute Note count...
                    var chipCount = countChipBarLine(rawLine, lineCountInCurrentBar);
                    this._dtxdata.increaseCount("bass", ButtonCombination, chipCount);
                }
            }   
            
        } 
        

            
        
        //TODO: Finish _createBarGroup
        return newBarGroup;
        
    };
    
    
    //List all possible types of keys
    var decodeFunctionMap = {
        "TITLE": readTitle,
		"ARTIST": readArtist,
		"BPM": readBPM,
		"DLEVEL": readDLevel,
        "GLEVEL": readGLevel,
        "BLEVEL": readBLevel,
        "PREVIEW": readPreview,
        "PREIMAGE": readPreimage,
        //Following labels occur multiple times have index numbers
        "WAV": readWav,
        "VOLUME": readVolume,
        "PAN": readPan,
        "BMP": readBMPInfo,
        //Special decode functions
        "BPM_Marker": readBPMMarker,
        "BAR_LANE": readBarLane,
        //Reserved for future features
        "DTXC_LANEBINDEDCHIP": readDtxLaneChip,
        "DTXC_CHIPPALETTE": readChipPalette        
    };
    
    //Actual read in functions
    function readTitle(dtxData, value){
        dtxData.chartInfo.title = value;
    }
    
    function readArtist(dtxData, value){
        dtxData.chartInfo.artist = value;
    }
    
    function readBPM(dtxData, value){
        dtxData.chartInfo.bpm = parseFloat(value);
    }
    
    function readDLevel(dtxData, value){
        var drumlevel = 0;
        if(value.length <= 2){
            drumlevel = (parseInt(value) / 10).toFixed(2);
            //console.log(drumlevel);
        }
        else if(value.length === 3){
            drumlevel = (parseInt(value) / 100).toFixed(2);
            //console.log(drumlevel);	
        }
        dtxData.chartInfo.drumlevel = drumlevel;
    }

    function readGLevel(dtxData, value){
        var guitarlevel = 0;
        if(value.length <= 2){
            guitarlevel = (parseInt(value) / 10).toFixed(2);
            //console.log(guitarlevel);
        }
        else if(value.length === 3){
            guitarlevel = (parseInt(value) / 100).toFixed(2);
            //console.log(guitarlevel);	
        }
        dtxData.chartInfo.guitarlevel = guitarlevel;
    }

    function readBLevel(dtxData, value){
        var basslevel = 0;
        if(value.length <= 2){
            basslevel = (parseInt(value) / 10).toFixed(2);
            //console.log(basslevel);
        }
        else if(value.length === 3){
            basslevel = (parseInt(value) / 100).toFixed(2);
            //console.log(basslevel);	
        }
        dtxData.chartInfo.basslevel = basslevel;
    }
    
    function readPreview(dtxData, value){
        //TO BE ADDED
    }
    
    function readPreimage(dtxData, value){
        //TO BE ADDED
    }
    
    function readWav(dtxData, value, index){
        //TO BE ADDED
    }
    
    function readVolume(dtxData, value, index){
        //TO BE ADDED
    }
    
    function readPan(dtxData, value, index){
        //TO BE ADDED
    }
    
    function readBMPInfo(dtxData, value, index){
        //TO BE ADDED
    }
    
    function readBPMMarker(dtxParser, value, label){
        dtxParser._bpmMarkerLabelMap[label] = parseFloat(value);
    }
    
    function readBarLane(dtxParser, barNumber, lane, value){
        if(barNumber >=0 || barNumber <= 999){
            //console.log('barNumber: ' + value);
            if(barNumber > dtxParser._largestBarIndex){
                dtxParser._largestBarIndex = barNumber;
            }

            if(!dtxParser._rawBarLines[barNumber]){
                dtxParser._rawBarLines[barNumber] = {
                    "Description" : "dtxBarLine"
                };
            }
            dtxParser._rawBarLines[barNumber][lane] = value;

        }
    }
    
    function readBarLength(value){
        //Check for sensible values
        var barLength = parseFloat(value);
        //DtxCreator actually allows for up to 100 but not practical
        if(barLength >= 1/192 && barLength < 10.0){
            return barLength;
        }
        else{
            return 1.0;
        }
    }
    
    function readDtxLaneChip(dtxData, value){
        
    }
    
    function readChipPalette(dtxData, value){
        
    }
    
    
    
    //Create a starting object for dtxdata
    function initializeDtxData(){
        return new DTXDataObject();
    }

    /**
     * Constructor for wrapper class
     */
    function DTXDataObject(){
        this.chartInfo = {
                "title": "",
                "artist": "",
                "bpm": 0.0,
                "drumlevel": 0.00,
                "guitarlevel": 0.00,
                "basslevel": 0.00
            };
        this.metadata = {};
        this.barGroups = [];
    }

    /**
     * 
     */
    DTXDataObject.prototype.numberOfBars = function(){
        return this.barGroups.length;
    };

    DTXDataObject.prototype.initMetadata = function(mode){
        
        if(mode === "drum"){
            this.metadata.drum = {
                "totalNoteCount": 0,
                "LC_Count": 0,
                "HH_Count": 0,
                "LP_Count": 0,
                "LB_Count": 0,
                "SD_Count": 0,
                "HT_Count": 0,
                "BD_Count": 0,
                "LT_Count": 0,
                "FT_Count": 0,
                "RC_Count": 0,
                "RD_Count": 0
            };
        }
        else if(mode === "guitar")
        {
            this.metadata.guitar = {
                "totalNoteCount": 0,//Does not equal to total of each individual lane notes!
				"R_Count": 0,
				"G_Count": 0,
				"B_Count": 0,
				"Y_Count": 0,
                "M_Count": 0,
                "O_Count": 0,
                "Wail_Count": 0
            };
        }
        else if(mode === "bass")
        {
            this.metadata.bass = {
                "totalNoteCount": 0,//Does not equal to total of each individual lane notes!
				"R_Count": 0,
				"G_Count": 0,
				"B_Count": 0,
				"Y_Count": 0,
                "M_Count": 0,
                "O_Count": 0,
                "Wail_Count": 0
            };
        }
    };

     DTXDataObject.prototype.increaseCount = function(mode, countLabel, count){
        
        if(mode === "drum"){
            this.metadata[mode][countLabel] += count;
            this.metadata[mode].totalNoteCount += count;            
        }
        else if(mode === "guitar")
        {            
            if(countLabel === "GWail"){
                //Wailing does not count towards note count!
                this.metadata[mode].Wail_Count += count;
            }
            else{
                //Assumes no overlaps, which is always true for data from the editor
                this.metadata[mode].totalNoteCount += count;

                var flagArray = buttomCombinationsToFlagArray(countLabel);
                this.metadata[mode].R_Count += count * flagArray[0];
                this.metadata[mode].G_Count += count * flagArray[1];
                this.metadata[mode].B_Count += count * flagArray[2];
                this.metadata[mode].Y_Count += count * flagArray[3];
                this.metadata[mode].M_Count += count * flagArray[4];
                //For Open Notes
                if(flagArray.toString() == "0,0,0,0,0"){
                    this.metadata[mode].O_Count += count;
                }
            }
        }
        else if(mode === "bass")
        {
            //Assumes no overlaps, which is always true for data from the editor            
            if(countLabel === "BWail"){
                //Wailing does not count towards note count!
                this.metadata[mode].Wail_Count += count;
            }
            else{
                this.metadata[mode].totalNoteCount += count;

                var flagArray = buttomCombinationsToFlagArray(countLabel);
                this.metadata[mode].R_Count += count * flagArray[0];
                this.metadata[mode].G_Count += count * flagArray[1];
                this.metadata[mode].B_Count += count * flagArray[2];
                this.metadata[mode].Y_Count += count * flagArray[3];
                this.metadata[mode].M_Count += count * flagArray[4];
                //For Open Notes
                if(flagArray.toString() == "0,0,0,0,0"){
                    this.metadata[mode].O_Count += count;
                }
                
            }
        }        
     };
    
    //Helper functions
    function buttomCombinationsToFlagArray(buttonCombi){
        var flagArray = [0,0,0,0,0];//Array of integers
        flagArray[0] = buttonCombi.charAt(1) === "1" ? 1 : 0;
        flagArray[1] = buttonCombi.charAt(2) === "1" ? 1 : 0;
        flagArray[2] = buttonCombi.charAt(3) === "1" ? 1 : 0;
        flagArray[3] = buttonCombi.charAt(4) === "1" ? 1 : 0;
        flagArray[4] = buttonCombi.charAt(5) === "1" ? 1 : 0;
        return flagArray;
    }

    function checkSupportedHeader(inStr){
        var trimLine = trimExternalWhiteSpace(inStr);		
		//Check first line against any of the supported header
		var headerCheckPassed = false;
		for (var i = SUPPORTED_HEADERS.length - 1; i >= 0; i--) {
			if(trimLine === SUPPORTED_HEADERS[i]){
				headerCheckPassed = true;
				break;
			}
		};
        
        return headerCheckPassed;
    }
    
    /**
    Parameters:
    inputLine - A string
    totalLineCount - A number
    returns:
    chipPosArray - [{pos:<number>,label:<string>}]
    */    
    function decodeBarLine(inputLine, totalLineCount){
        //Split barline into array of 2 characters
		var chipStringArray = inputLine.match(/.{1,2}/g);
		//console.log(chipStringArray);
		var chipPosArray = [];
        
        for (var i = 0; i < chipStringArray.length; i++) {
			if(chipStringArray[i] !== '00'){
				var linePos = i*totalLineCount/chipStringArray.length;
				var item = {"pos":linePos, "label":chipStringArray[i]};
				chipPosArray.push(item);
			}
		};

		return chipPosArray;
    }
    
    /**
    Parameters:
    inputLine - A string
    totalLineCount - A number
    returns:
    chipCount - Number
    */ 
    function countChipBarLine(inputLine, totalLineCount){
        //Split barline into array of 2 characters
		var chipStringArray = inputLine.match(/.{1,2}/g);
		//console.log(chipStringArray);
		var chipCount = 0;        
        for (var i = 0; i < chipStringArray.length; i++) {
			if(chipStringArray[i] !== '00'){
				++chipCount;
			}
		};
        
        return chipCount;
    }
    
    function computeLinesFromBarLength(barLength){
        return Math.floor(192 * barLength / 1.0);
    }
    
    function trimExternalWhiteSpace(inStr){
		if(typeof inStr === 'string'){
			return inStr.replace(/^\s+|\s+$/g, '');
		}
	}
    
    function splitKeyValueByColonOrWhiteSpace(input){
        var keyValue = input.split(/:(.+)?/,2);
			if(keyValue.length !== 2){
				keyValue = input.split(/\s(.+)?/,2);
			}
        //Remove the remove character '#' from key string
        var key = keyValue[0].substring(1);
        var value = trimExternalWhiteSpace(keyValue[1]);
        
        return {
            "key": key,
            "value": value
        };
    }
    
    //Fixed mapping values
    var DtxBarLabelMap = {
        BGM_LANE: "01",
		BAR_LENGTH_CHANGE_LABEL: "02",
		LINE_SHOW_HIDE_LABEL: "C2",
		BPM_CHANGE_LABEL: "08"
	};

	var DtxDrumsLaneCodeToLaneLabelMap = {
		//New DTX Creator uses these codes
        "1A":"LC",
		"11":"HH",
		"18":"HH",
		"1C":"LB",//Should be LB
		"1B":"LP",
		"12":"SD",
		"14":"HT",
		"13":"BD",
		"15":"LT",
		"17":"FT",
		"16":"RC",
		"19":"RD",
		//Old GDA uses the label mostly as is
		// "SD":"SD",
		// "BD":"BD",
		// "CY":"RC",
		// "HT":"HT",
		// "LT":"LT",
		// "FT":"FT",
		// "HH":"HH"
	};

    var GDADrumsLaneCodeToLaneLabelMap = {
		//Old GDA uses the label mostly as is
		"SD":"SD",
		"BD":"BD",
		"CY":"RC",
		"HT":"HT",
		"LT":"LT",
		"FT":"FT",
		"HH":"HH"
	};

    var DtxGuitarLanesCodeToButtonsMap = {
        "20": "G00000",
        "21": "G00100",
        "22": "G01000",
        "24": "G10000",
        "93": "G00010",
        "9B": "G00001",
        "23": "G01100",
        "25": "G10100",
        "26": "G11000",
        "94": "G00110",
        "95": "G01010",
        "97": "G10010",
        "9C": "G00101",
        "9D": "G01001",
        "9F": "G10001",
        "AC": "G00011",
        "27": "G11100",
        "96": "G01110",
        "98": "G10110",
        "99": "G11010",
        "9E": "G01101",
        "A9": "G10101",
        "AA": "G11001",
        "AD": "G00111",
        "AE": "G01011",
        "D0": "G10011",
        "9A": "G11110",
        "AB": "G11101",
        "AF": "G01111",
        "D1": "G10111",
        "D2": "G11011",
        "D3": "G11111",
        "28": "GWail"
        //GDA style (May clashes with unknown dtx lane codes!)
        // "G0": "G000",
        // "G1": "G001",
        // "G2": "G010",
        // "G3": "G011",
        // "G4": "G100",
        // "G5": "G101",
        // "G6": "G110",
        // "G7": "G111",
        // "GW": "GWail"
    };

    var GDAGuitarLanesCodeToButtonsMap = {        
        //GDA style (May clashes with unknown dtx lane codes!)
        "G0": "G000",
        "G1": "G001",
        "G2": "G010",
        "G3": "G011",
        "G4": "G100",
        "G5": "G101",
        "G6": "G110",
        "G7": "G111",
        "GW": "GWail"
    };

    var DtxBassLanesCodeToButtonsMap = {
        "A0": "B00000",
        "A1": "B00100",
        "A2": "B01000",
        "A4": "B10000",
        "C5": "B00010",
        "CE": "B00001",
        "A3": "B01100",
        "A5": "B10100",
        "A6": "B11000",
        "C6": "B00110",
        "C8": "B01010",
        "CA": "B10010",
        "CF": "B00101",
        "DA": "B01001",
        "DC": "B10001",
        "E1": "B00011",
        "A7": "B11100",
        "C9": "B01110",
        "CB": "B10110",
        "CC": "B11010",
        "DB": "B01101",
        "DD": "B10101",
        "DE": "B11001",
        "E2": "B00111",
        "E3": "B01011",
        "E5": "B10011",
        "CD": "B11110",
        "DF": "B11101",
        "E4": "B01111",
        "E6": "B10111",
        "E7": "B11011",
        "E8": "B11111",
        "A8": "BWail"
        //GDA style (Clashes with unknown dtx lane codes!)
        // "B0": "B000",
        // "B1": "B001",
        // "B2": "B010",
        // "B3": "B011",
        // "B4": "B100",
        // "B5": "B101",
        // "B6": "B110",
        // "B7": "B111",
        // "BW": "BWail"
    };

    var GDABassLanesCodeToButtonsMap = {
        //GDA style (Clashes with unknown dtx lane codes!)
        "B0": "B000",
        "B1": "B001",
        "B2": "B010",
        "B3": "B011",
        "B4": "B100",
        "B5": "B101",
        "B6": "B110",
        "B7": "B111",
        "BW": "BWail"
    };
    
    var DtxDrumsLaneCodeToCountLabelMap = {
        //New DTX Creator uses these codes
		"1A":"LC_Count",
		"11":"HH_Count",
		"18":"HH_Count",
		"1C":"LB_Count",//Should be LB
		"1B":"LP_Count",
		"12":"SD_Count",
		"14":"HT_Count",
		"13":"BD_Count",
		"15":"LT_Count",
		"17":"FT_Count",
		"16":"RC_Count",
		"19":"RD_Count",
		//Old GDA uses the label mostly as is
		// "SD":"SD_Count",
		// "BD":"BD_Count",
		// "CY":"RC_Count",
		// "HT":"HT_Count",
		// "LT":"LT_Count",
		// "FT":"FT_Count",
		// "HH":"HH_Count"
    };

    var GDADrumsLaneCodeToCountLabelMap = {
		//Old GDA uses the label mostly as is
		"SD":"SD_Count",
		"BD":"BD_Count",
		"CY":"RC_Count",
		"HT":"HT_Count",
		"LT":"LT_Count",
		"FT":"FT_Count",
		"HH":"HH_Count"
    };
    
    var DtxShowLineLabelMap = {
        "01": true,
        "02": false
    };

    //Drums
	// Parser.DtxLaneLabels = [
	// 	"LC",
	// 	"HH",
	// 	"LP",
    //     "LB",
	// 	"SD",
	// 	"HT",
	// 	"BD",
	// 	"LT",
	// 	"FT",
	// 	"RC",
	// 	"RD"
	// ];

    Parser.utils = {
        computeLinesFromBarLength: computeLinesFromBarLength,
        decodeBarLine: decodeBarLine,
        trimExternalWhiteSpace: trimExternalWhiteSpace
    };
    
    //Export the module with new class and useful functions
    mod.Parser = Parser;
    mod.VERSION = VERSION;
    
    //Return the updated module
    return mod;
}(DtxChart || {}));


/**
 * DtxChart.CanvasEngine_Fabric
 */
var fabric = require('fabric').fabric;
DtxChart = (function(mod){
    
    //Check if fabric.js has been loaded
    if(!fabric){
        console.error("fabric.js not found! Please load fabric.js before loading DtxChart.ChartEngine module");
        return mod;
    }

    //var drumsChipImageSet = {};
    //CanvasEngine act as abstract interface to the actual canvas library
    
    /**
     * canvasConfig:
     *    pages - Number of pages in this canvas
     *    width - The full width of canvas
     *    height - The full height of canvas
     *    elementId - The id of the html5 canvas element
     *    backgroundColor - Color string of background color of canvas
     */
    function createCanvas(canvasConfig){
        //TODO: Handle thrown exceptions when elementID is invalid
        var canvas = null;
        try {
            canvas = new fabric.StaticCanvas( canvasConfig.elementId, 
            {
				backgroundColor: canvasConfig.backgroundColor,
				height: canvasConfig.height,
				width: canvasConfig.width,
				renderOnAddRemove: false
			});
        } catch (error) {
            //console.error("CanvasEngine error: ", error);
            throw new Error("Invalid <canvas> element. CanvasEngine fail to create canvasObject");
        }

        return canvas;
    }

    function addChip(positionSize, drawOptions, imgObject){
        if(imgObject){
            var rect = new fabric.Rect({
			  fill: drawOptions.fill,
			  width: imgObject.width,
			  height: imgObject.height,
              left: positionSize.x,
              top: positionSize.y,
			  originY: 'center'
			});
            rect.setPatternFill({
                source: imgObject,
                repeat: 'no-repeat'
            });            
        }
        else {
            var rect = new fabric.Rect({
			  fill: drawOptions.fill,
			  width: positionSize.width,
			  height: positionSize.height,
              left: positionSize.x,
              top: positionSize.y,
			  originY: 'center'
			});
        }
        this._canvasObject.add(rect);
    }

    function addRectangle(positionSize, drawOptions){
        var rect = new fabric.Rect({
			  fill: drawOptions.fill,
              originY: drawOptions.originY,
			  width: positionSize.width,
			  height: positionSize.height,
			  left: positionSize.x,
              top: positionSize.y
			});

        this._canvasObject.add(rect);
    }

    function addLine(positionSize, drawOptions){
        
        var line = new fabric.Line([
            positionSize.x, 
            positionSize.y, 
            positionSize.x + positionSize.width, 
            positionSize.y + positionSize.height
        ],{
            stroke: drawOptions.stroke,
            strokeWidth: drawOptions.strokeWidth
        });

        this._canvasObject.add(line);
        
    }

    function addText(positionSize, text, textOptions){
        /**
         * "BARNUM":new fabric.Text('000',{
				// backgroundColor: 'black',
				fill: '#ffffff',
				fontSize: 16,
				originY: 'center'
         */

        var textObject = new fabric.Text(text, {
            left: positionSize.x,
            top: positionSize.y,
            fill: textOptions.fill ? textOptions.fill : "#ffffff",
            fontSize: textOptions.fontSize ? textOptions.fontSize : 20,
            fontWeight: textOptions.fontWeight ? textOptions.fontWeight : "",
            fontFamily: textOptions.fontFamily ? textOptions.fontFamily : "Times New Roman",
            originY: textOptions.originY ? textOptions.originY : "center",
            originX: textOptions.originX ? textOptions.originX : "left"
        });

        var currTextWidth = textObject.width;
        if(positionSize.width && currTextWidth >  positionSize.width){
            textObject.scaleToWidth(positionSize.width); //positionSize.width/currTextWidth required for laptop browser but why? Scale becomes relative??? Behaviour different from jsfiddle...
        }

        this._canvasObject.add(textObject);
    }

    //Clears the canvas of all note chart information and resets the background color
    function clear(){
        var bgColor = this._canvasObject.backgroundColor;
        this._canvasObject.clear();
        this._canvasObject.setBackgroundColor(bgColor, this._canvasObject.renderAll.bind(this._canvasObject));
        //TODO: May still need to call renderAll

    }

    function update(){
        this._canvasObject.renderAll();
    }

    function setZoom(factor){
        this._canvasObject.setZoom(factor);
    }

    function loadChipImageAssets(url, laneLabel){
        var self = this;
        fabric.util.loadImage(url, function (img) {            
            self[laneLabel] = img;           
        });
    }
   //
    mod.CanvasEngine = {
        loadChipImageAssets: loadChipImageAssets,
        createCanvas: createCanvas,
        addChip: addChip,
        addRectangle: addRectangle,
        addLine: addLine,
        addText: addText,
        setZoom: setZoom,
        clear: clear,
        update: update
    };

    //
    return mod;
}( DtxChart || {} ));


/**
 * DtxChart.dmdrawmethods
 */

DtxChart = (function(mod){

    var CanvasEngine = mod.CanvasEngine;//Can be FabricJS, EaselJS or even raw Canvas API
    if(!CanvasEngine){
        console.error("CanvasEngine not loaded into DtxChart module! DtxChart.Charter will not render without a Canvas engine");
    }
    //Preload drum chips image assets
    var drumsChipImageSet = {};
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/leftcymbal_chip.png", "LC");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/hihat_chip.png", "HH");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/snare_chip.png", "SD");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/leftbass_chip.png", "LB");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/lefthihatpedal_chip.png", "LP");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/hitom_chip.png", "HT");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/rightbass_chip.png", "BD");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/lowtom_chip.png", "LT");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/floortom_chip.png", "FT");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/rightcymbal_chip.png", "RC");
    CanvasEngine.loadChipImageAssets.call(drumsChipImageSet, "assets/images/ridecymbal_chip.png", "RD");

    //Width and Height of chips are standard
    var DEFAULT_CHIP_HEIGHT = 5;
	var DEFAULT_CHIP_WIDTH = 18;
    var DEFAULT_LANE_BORDER = 1;

    //Put in a map and reference this map instead in case need to change
    var DtxChipWidthHeight = {
        "LC":{width: DEFAULT_CHIP_WIDTH+6, height: DEFAULT_CHIP_HEIGHT},
		"HH":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
        "LB":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"LP":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"SD":{width: DEFAULT_CHIP_WIDTH+3, height: DEFAULT_CHIP_HEIGHT},
		"HT":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"BD":{width: DEFAULT_CHIP_WIDTH+5, height: DEFAULT_CHIP_HEIGHT},
		"LT":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"FT":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"RC":{width: DEFAULT_CHIP_WIDTH+6, height: DEFAULT_CHIP_HEIGHT},
		"RD":{width: DEFAULT_CHIP_WIDTH+1, height: DEFAULT_CHIP_HEIGHT},
    };

    var DtxChipLaneOrder = {
        "full": ["LC","HH","LP","SD","HT","BD","LT","FT","RC","RD"],//LP and LB are in the same position
        "Gitadora": ["LC","HH","LP","SD","HT","BD","LT","FT","RC"],
        "Vmix": ["HH","SD","BD","HT","LT","RC"]
    }; 

    var DtxChipColor = {
        "LC":"#ff4ca1",
		"HH":"#00ffff",
        "LB":"#e7baff",
		"LP":"#ffd3f0",
		"SD":"#fff040",
		"HT":"#00ff00",
		"BD":"#e7baff",
		"LT":"#ff0000",
		"FT":"#fea101",
		"RC":"#00ccff",
		"RD":"#5a9cf9",
    };

    function createDrawParameters(chartType){
        var drawParameters = {};        
        //Currently works for proper charts but when drawing mismatch chart, chips in lanes ignored are never drawn
        drawParameters.ChipHorizontalPositions = _computeChipHorizontalPositions(chartType);

        //Widths
        drawParameters.chipWidthHeight = _computeChipWidthHeight(chartType);

        //Color
        drawParameters.chipColors = {};
        for(var prop in DtxChipColor){
            if(DtxChipColor.hasOwnProperty(prop)){
                drawParameters.chipColors[prop] = DtxChipColor[prop];
            }
        }
        //Image if available
        drawParameters.imageSet = drumsChipImageSet;

        //
        drawParameters.elementIDPrefix = "dtxdrums";
        return drawParameters;
    };

    function drawNote(laneLabel, chartSheet, pixSheetPos, drawParameters){
        //Compute the final x position for this specific chip given the laneLabel
        var chipPixXpos =  pixSheetPos.posX + drawParameters.ChipHorizontalPositions[laneLabel];

        chartSheet.addChip({x: chipPixXpos, 
                                y: pixSheetPos.posY,
                                width: drawParameters.chipWidthHeight[laneLabel].width,
                                height: drawParameters.chipWidthHeight[laneLabel].height
                            }, {
                                fill: drawParameters.chipColors[laneLabel]
                            }, drawParameters.imageSet[laneLabel]);

    }

    function _computeChipHorizontalPositions(chartType){
        var ChipHorizontalPositions = {
            "BarNum":5,
            "LeftBorder":47
        };

        var innerChartType = chartType;
        if(DtxChipLaneOrder[chartType] === undefined)
        {
            innerChartType = "full";
        }

        var currXpos = 50;
        for(var i=0; i < DtxChipLaneOrder[innerChartType].length; ++i ){
            var lane = DtxChipLaneOrder[innerChartType][i];
            var chipWidth = drumsChipImageSet[lane] ? drumsChipImageSet[lane].width : DtxChipWidthHeight[lane].width;
            ChipHorizontalPositions[lane] = currXpos;
            currXpos += chipWidth + DEFAULT_LANE_BORDER;
        }

        ChipHorizontalPositions["RightBorder"] = currXpos;
        ChipHorizontalPositions["Bpm"] = currXpos + 8;
        ChipHorizontalPositions["width"] = currXpos + 8 + 48;

        //"full", "Gitadora", "Vmix"
        //Do following mapping based on ChartType
        if(innerChartType === "full")
        {
            ChipHorizontalPositions["LB"] = ChipHorizontalPositions["LP"];
        }
        else if(innerChartType === "Gitadora")
        {
            ChipHorizontalPositions["RD"] = ChipHorizontalPositions["RC"];//RD notes will appear at RC lane for Gitadora mode
            ChipHorizontalPositions["LB"] = ChipHorizontalPositions["LP"];
        }
        else if(innerChartType === "Vmix")
        {
            ChipHorizontalPositions["LC"] = ChipHorizontalPositions["HH"];
            ChipHorizontalPositions["LP"] = ChipHorizontalPositions["HH"];
            ChipHorizontalPositions["FT"] = ChipHorizontalPositions["LT"];
            ChipHorizontalPositions["RD"] = ChipHorizontalPositions["RC"];
            ChipHorizontalPositions["LB"] = ChipHorizontalPositions["BD"];
        }

        return ChipHorizontalPositions;
    }

    function _computeChipWidthHeight(chartType){
        var chipWidthHeight = {};
        for(var prop in DtxChipWidthHeight){
            if(DtxChipWidthHeight.hasOwnProperty(prop)){
                chipWidthHeight[prop] = {};
                chipWidthHeight[prop].width = drumsChipImageSet[prop] ? drumsChipImageSet[prop].width : DtxChipWidthHeight[prop].width;
                chipWidthHeight[prop].height = drumsChipImageSet[prop] ? drumsChipImageSet[prop].height : DtxChipWidthHeight[prop].height;
            }
        }

        var innerChartType = chartType;
        if(DtxChipLaneOrder[chartType] === undefined)
        {
            innerChartType = "full";
        }

        //"full", "Gitadora", "Vmix"
        //Do following mapping based on ChartType
        if(innerChartType === "full")
        {
            chipWidthHeight["LB"] = chipWidthHeight["LP"];
        }
        else if(innerChartType === "Gitadora")
        {
            chipWidthHeight["LB"] = chipWidthHeight["LP"];
            chipWidthHeight["RD"] = chipWidthHeight["RC"];//RD notes will appear at RC lane for Gitadora mode
        }
        else if(innerChartType === "Vmix")
        {
            chipWidthHeight["LC"] = chipWidthHeight["HH"];
            chipWidthHeight["LP"] = chipWidthHeight["HH"];
            chipWidthHeight["FT"] = chipWidthHeight["LT"];
            chipWidthHeight["RD"] = chipWidthHeight["RC"];
            chipWidthHeight["LB"] = chipWidthHeight["BD"];
        }

        return chipWidthHeight;
    }     

    var DMDrawMethods = {
        createDrawParameters: createDrawParameters,
        drawNote: drawNote
    };

    mod.DMDrawMethods = DMDrawMethods;
    return mod;
}(DtxChart || {} ));


/**
 * Dtxchart.gfdrawmethods
 */

DtxChart = (function(mod){

    var CanvasEngine = mod.CanvasEngine;//Can be FabricJS, EaselJS or even raw Canvas API
    if(!CanvasEngine){
        console.error("CanvasEngine not loaded into DtxChart module! DtxChart.Charter will not render without a Canvas engine");
    }

    //Preload drum chips image assets
    var gfChipImageSet = {};
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/red_gfchip.png", "GFR");
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/green_gfchip.png", "GFG");
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/blue_gfchip.png", "GFB");    
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/yellow_gfchip.png", "GFY");
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/mag_gfchip.png", "GFM");
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/open_gfchip.png", "GFO");
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/open_gfvchip.png", "GFOV");
    CanvasEngine.loadChipImageAssets.call(gfChipImageSet, "assets/images/wail_gfchip.png", "GFW");

    //Width and Height of chips are standard
    var DEFAULT_CHIP_HEIGHT = 5;
	var DEFAULT_CHIP_WIDTH = 19;
    var DEFAULT_LANE_BORDER = 0;

    //Put in a map and reference this map instead in case need to change
    var DtxChipWidthHeight = {
        "GFR":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"GFG":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
        "GFB":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"GFY":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"GFM":{width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT},
		"GFO":{width: DEFAULT_CHIP_WIDTH*5, height: DEFAULT_CHIP_HEIGHT},
        "GFOV":{width: DEFAULT_CHIP_WIDTH*3, height: DEFAULT_CHIP_HEIGHT},
		"GFW":{width: DEFAULT_CHIP_WIDTH, height: 19}
    };

    var DtxDefaultChipsHorizontalPos = {
            "BarNum":5,
            "LeftBorder":47,
            //Placeholders for lanelabels but does not have actual positions
            "G00000": 0,
            "G00100": 0,
            "G01000": 0,
            "G10000": 0,
            "G00010": 0,
            "G00001": 0,
            "G01100": 0,
            "G10100": 0,
            "G11000": 0,
            "G00110": 0,
            "G01010": 0,
            "G10010": 0,
            "G00101": 0,
            "G01001": 0,
            "G10001": 0,
            "G00011": 0,
            "G11100": 0,
            "G01110": 0,
            "G10110": 0,
            "G11010": 0,
            "G01101": 0,
            "G10101": 0,
            "G11001": 0,
            "G00111": 0,
            "G01011": 0,
            "G10011": 0,
            "G11110": 0,
            "G11101": 0,
            "G01111": 0,
            "G10111": 0,
            "G11011": 0,
            "G11111": 0,
            "GWail": 0,
            "B00000": 0,
            "B00100": 0,
            "B01000": 0,
            "B10000": 0,
            "B00010": 0,
            "B00001": 0,
            "B01100": 0,
            "B10100": 0,
            "B11000": 0,
            "B00110": 0,
            "B01010": 0,
            "B10010": 0,
            "B00101": 0,
            "B01001": 0,
            "B10001": 0,
            "B00011": 0,
            "B11100": 0,
            "B01110": 0,
            "B10110": 0,
            "B11010": 0,
            "B01101": 0,
            "B10101": 0,
            "B11001": 0,
            "B00111": 0,
            "B01011": 0,
            "B10011": 0,
            "B11110": 0,
            "B11101": 0,
            "B01111": 0,
            "B10111": 0,
            "B11011": 0,
            "B11111": 0,
            "BWail": 0,
            "G000": 0,
            "G001": 0,
            "G010": 0,
            "G011": 0,
            "G100": 0,
            "G101": 0,
            "G110": 0,
            "G111": 0,
            "B000": 0,
            "B001": 0,
            "B010": 0,
            "B011": 0,
            "B100": 0,
            "B101": 0,
            "B110": 0,
            "B111": 0,
            };

    var DtxChipColor = {
        "GFR":"#ff0000",
		"GFG":"#00ff00",
        "GFB":"#0000ff",
		"GFY":"#ffff00",
		"GFM":"#ff00ff",
		"GFO":"#ffffff",
		"GFW":"#654321"
    };

    var DtxChipLaneOrder = {
        "full": ["GFR","GFG","GFB","GFY","GFM","GFW"],
        "Gitadora": ["GFR","GFG","GFB","GFY","GFM","GFW"],
        "Vmix": ["GFR","GFG","GFB","GFW"]
    }; 

    function createDrawParameters(chartType, bassGuitar){
        var drawParameters = {};        
        //Currently works for proper charts but when drawing mismatch chart, chips in lanes ignored are never drawn
        drawParameters.ChipHorizontalPositions = _computeChipHorizontalPositions(chartType);

        //Widths
        drawParameters.chipWidthHeight = _computeChipWidthHeight(chartType);

        //flagArray
        drawParameters.flagArray = _getFlagArray(chartType);

        //Color
        drawParameters.chipColors = {};
        for(var prop in DtxChipColor){
            if(DtxChipColor.hasOwnProperty(prop)){
                drawParameters.chipColors[prop] = DtxChipColor[prop];
            }
        }

        drawParameters.bassGuitar = bassGuitar;//"B" or "G" 
        //
        drawParameters.elementIDPrefix = "dtxGF" + bassGuitar;

        //Image if available
        drawParameters.imageSet = gfChipImageSet;
        return drawParameters;
    };

    function drawNote(laneLabel, chartSheet, pixSheetPos, drawParameters){
        
        if(drawParameters.bassGuitar !== laneLabel.charAt(0)){
            return;
        }

        if(laneLabel === "GWail" || laneLabel === "BWail")
        {
            var chipPixXpos =  pixSheetPos.posX + drawParameters.ChipHorizontalPositions["GFW"];

            chartSheet.addChip({x: chipPixXpos, 
                                    y: pixSheetPos.posY,
                                    width: drawParameters.chipWidthHeight["GFW"].width,
                                    height: drawParameters.chipWidthHeight["GFW"].height
                                }, {
                                    fill: drawParameters.chipColors["GFW"]
                                }, drawParameters.imageSet["GFW"]);
        }
        else
        {
            //laneLabel needs to be decoded 
            //var flagArray = [0,0,0,0,0];//Array of integers
            var isOpen = true;
            var currNoteFlagArray = [];
            for (var i = 0; i < drawParameters.flagArray.length; i++) {
                var flag = laneLabel.charAt(i+1) === "1" ? 1 : 0;
                if(flag === 1){
                    isOpen = false;
                }
                currNoteFlagArray.push(flag);                
            }

            if(isOpen){
                var code = "GFO";
                if(drawParameters.flagArray.length === 5){
                    code = "GFO";
                }
                else if(drawParameters.flagArray.length === 3){
                    code = "GFOV";
                }

                var chipPixXpos =  pixSheetPos.posX + drawParameters.ChipHorizontalPositions[code];

                chartSheet.addChip({x: chipPixXpos, 
                                        y: pixSheetPos.posY,
                                        width: drawParameters.chipWidthHeight[code].width,
                                        height: drawParameters.chipWidthHeight[code].height
                                    }, {
                                        fill: drawParameters.chipColors[code]
                                    }, drawParameters.imageSet[code]);
            }
            else{
                
                for (var j = 0; j < drawParameters.flagArray.length; j++) {
                    var flag = currNoteFlagArray[j];
                    var flagLabel = drawParameters.flagArray[j]; 
                    if(flag === 1){
                        var chipPixXpos =  pixSheetPos.posX + drawParameters.ChipHorizontalPositions[flagLabel];

                        chartSheet.addChip({x: chipPixXpos, 
                                                y: pixSheetPos.posY,
                                                width: drawParameters.chipWidthHeight[flagLabel].width,
                                                height: drawParameters.chipWidthHeight[flagLabel].height
                                            }, {
                                                fill: drawParameters.chipColors[flagLabel]
                                            }, drawParameters.imageSet[flagLabel]);


                    }
                    
                    
                }


            }
            
        }
        

    }


    function _computeChipHorizontalPositions(chartType){
        var ChipHorizontalPositions = DtxDefaultChipsHorizontalPos;

        var innerChartType = chartType;
        if(DtxChipLaneOrder[chartType] === undefined)
        {
            innerChartType = "full";
        }

        var currXpos = 50;
        for(var i=0; i < DtxChipLaneOrder[innerChartType].length; ++i ){
            var lane = DtxChipLaneOrder[innerChartType][i];
            var chipWidth = gfChipImageSet[lane] ? gfChipImageSet[lane].width : DtxChipWidthHeight[lane].width;
            ChipHorizontalPositions[lane] = currXpos;
            currXpos += chipWidth + DEFAULT_LANE_BORDER;
        }

        ChipHorizontalPositions["RightBorder"] = currXpos;
        ChipHorizontalPositions["Bpm"] = currXpos + 8;
        ChipHorizontalPositions["width"] = currXpos + 8 + 48;

        

        //"full", "Gitadora", "Vmix"
        //Do following mapping based on ChartType
        if(innerChartType === "Vmix")
        {
            ChipHorizontalPositions["GFY"] = ChipHorizontalPositions["GFG"];
            ChipHorizontalPositions["GFM"] = ChipHorizontalPositions["GFB"];
            ChipHorizontalPositions["GFOV"] = ChipHorizontalPositions["LeftBorder"] + 3;//
        }
        else {
            ChipHorizontalPositions["GFO"] = ChipHorizontalPositions["LeftBorder"] + 3;//
        }

        return ChipHorizontalPositions;
    }

    function _getFlagArray(chartType){
        var innerChartType = chartType;
        if(DtxChipLaneOrder[chartType] === undefined)
        {
            innerChartType = "full";
        }

        var flagArray = []

        //"full", "Gitadora", "Vmix"
        //Do following mapping based on ChartType
        if(innerChartType === "Vmix")
        {
            flagArray.push("GFR");
            flagArray.push("GFG");
            flagArray.push("GFB");
        }
        else
        {
            flagArray.push("GFR");
            flagArray.push("GFG");
            flagArray.push("GFB");
            flagArray.push("GFY");
            flagArray.push("GFM");
        }

        return flagArray;
    }

    function _computeChipWidthHeight(chartType){
        var chipWidthHeight = {};
        for(var prop in DtxChipWidthHeight){
            if(DtxChipWidthHeight.hasOwnProperty(prop)){
                chipWidthHeight[prop] = {};
                chipWidthHeight[prop].width = gfChipImageSet[prop] ? gfChipImageSet[prop].width : DtxChipWidthHeight[prop].width;
                chipWidthHeight[prop].height = gfChipImageSet[prop] ? gfChipImageSet[prop].height : DtxChipWidthHeight[prop].height;
            }
        }

        var innerChartType = chartType;
        if(DtxChipLaneOrder[chartType] === undefined)
        {
            innerChartType = "full";
        }

        //"full", "Gitadora", "Vmix"
        //Do following mapping based on ChartType
        if(innerChartType === "Vmix")
        {
            chipWidthHeight["GFY"] = chipWidthHeight["GFG"];
            chipWidthHeight["GFM"] = chipWidthHeight["GFB"];
        }

        return chipWidthHeight;
    }


    var GFDrawMethods = {
        createDrawParameters: createDrawParameters,
        drawNote: drawNote
    };

    mod.GFDrawMethods = GFDrawMethods;
    return mod;
}(DtxChart || {} ));

/**
 * Dtxchart.chartsheet
 */

DtxChart = (function(mod){
    
    var CanvasEngine = mod.CanvasEngine;//Can be FabricJS, EaselJS or even raw Canvas API
    if(!CanvasEngine){
        console.error("CanvasEngine not loaded into DtxChart module! DtxChart.ChartSheet will not render without a Canvas engine");
    }

    /**
     * Parameters:
     * canvasConfig is an object with following information:
     *    pages - Number of pages in this canvas
     *    width - The full width of canvas
     *    height - The full height of canvas
     *    elementId - The id of the html5 canvas element
     *    backgroundColor - Color string of background color of canvas
     */
    function ChartSheet(canvasConfig){
        
        this._canvasConfig = canvasConfig;
        if(CanvasEngine){
            this._canvasObject = CanvasEngine.createCanvas(canvasConfig);//The actual canvasObject
        }

    }

    /**
     * 
     */
    ChartSheet.prototype.canvasWidthHeightPages = function(){
        return {
            width: this._canvasConfig.width,
            height: this._canvasConfig.height,
            pages: this._canvasConfig.pages
        };
    };

    /**
     * positionSize - An object defined as {x: <number>, y: <number>, width: <number>, height: <number>}
     * drawOptions - Drawing options consisting of following options:
     *      fill - Fill Color code in string
     *      stroke - Stroke Color, Default is black
     *      strokeWidth - The width of stroke in pixels. Default is 0
     * Remarks: Origin of rect is assumed to be top-left corner by default, unless otherwise 
     */
    ChartSheet.prototype.addRectangle = function(positionSize, drawOptions){
        if(CanvasEngine){
            CanvasEngine.addRectangle.call(this, positionSize, drawOptions);
        }
    };

    ChartSheet.prototype.addChip = function(positionSize, drawOptions, imgObject){
        if(CanvasEngine){
            CanvasEngine.addChip.call(this, positionSize, drawOptions, imgObject);
        }
    };

    ChartSheet.prototype.addLine = function(positionSize, drawOptions){
        if(CanvasEngine){
            CanvasEngine.addLine.call(this, positionSize, drawOptions);
        }
    };

    ChartSheet.prototype.addText = function(positionSize, text, textOptions){
        if(CanvasEngine){
            CanvasEngine.addText.call(this, positionSize, text, textOptions);
        }
    };

    ChartSheet.prototype.clear = function(){
        if(CanvasEngine){
            CanvasEngine.clear.call(this);
        }
    };

    ChartSheet.prototype.update = function(){
        if(CanvasEngine){
            CanvasEngine.update.call(this);
        }
    };

    //
    mod.ChartSheet = ChartSheet;
    return mod;
}( DtxChart || {} ));

/**
 * Dtxchart.charter
 */

DtxChart = (function(mod){

    var ChartSheet = mod.ChartSheet;
    if(!ChartSheet){
        console.error("ChartSheet not loaded into DtxChart module! DtxChart.Charter depends on DtxChart.ChartSheet");
    }

    var Parser = mod.Parser;//Parser needs to be loaded first
    if(!Parser){
        console.warn("DtxChart.Parser should be loaded first");
    }

    var DEFAULT_SCALE = 1.0;
    var MIN_SCALE = 0.5;
    var MAX_SCALE = 3.0;

    var DEFAULT_PAGE_HEIGHT = 720;
    var MIN_PAGE_HEIGHT = 480;
    var MAX_PAGE_HEIGHT = 3840;

    var DEFAULT_PAGEPERCANVAS = 20;
    var MIN_PAGEPERCANVAS = 6;
    var MAX_PAGEPERCANVAS = 25;

    var BEAT_LINE_GAP = 48;//192/4

    //A collection of width/height constants for positioning purposes. Refer to diagram for details 
    var DtxChartCanvasMargins = {
        "A": 58,//Info section height
        "B": 2,//Top margin of page//31
        "C": 3,//Left margin of chart
        "D": 3,//Right margin of chart
        "E": 30,//Bottom margin of page
        "F": 0,//Right margin of each page (Except the last page for each canvas)
        "G": 12,//Top/Bottom margin of Last/First line from the top/bottom border of each page
        "H": 2, //Bottom Margin height of Sheet Number text from the bottom edge of canvas
    };    

    var DtxFillColor = {
        "Background": "#ffffff",
        "ChartInfo":"#221e1a",
        "PageFill": "#221e1a"
    };

    var DtxBarLineColor = {
        "BarLine": "#707070",
        "QuarterLine": "#4b4c4a",
        "EndLine": "#ff0000",
        "StartLine":"#00ff00",
        "TitleLine": "#707070",
        "BorderLine": "#707070",
        "BPMMarkerLine": "#eeffab"
    };

    var DtxTextColor = {
        "BarNumber": "#000000",
        "BpmMarker": "#ffffff",
        "ChartInfo": "#ffffff",
        "PageNumber": "#000000"
    };   

    var DtxFontSizes = {
        "BarNumber": 24,
        "BpmMarker": 14,
        "Title": 30,
        "Artist": 16,
        "ChartInfo": 24,
        "PageNumber": 18
    };

    /** 
     * Constructor of Charter
     * 
    */
    function Charter(){
        this._dtxdata = null;
        this._positionMapper = null;
        this._pageList = null;
        //
        this._scale = DEFAULT_SCALE;
        this._pageHeight = DEFAULT_PAGE_HEIGHT;
        this._pagePerCanvas = DEFAULT_PAGEPERCANVAS;

        this._chartSheets = [];
        this._pageCount = 0;
        //this._heightPerCanvas = 0;
        this._barAligned = false;
        this._chartType = "full";
        this._mode = null;
        this._DTXDrawParameters = {};
        this._direction = "up";
    }

    /**
     * Parameters:
     * dtxData - DtxDataObject type
     * positionMapper - LinePositionMapper type
     */
    Charter.prototype.setDtxData = function(dtxData, positionMapper){
        this._dtxdata = dtxData;
        this._positionMapper = positionMapper;
    }

    /**
     * Parameters:
     * config - An object consist of following options:
     *   scale (Number): The vertical scaling factor for each page. Min value accepted is 1.0 and Max is 3.0. Default is 1.0
     *   pageHeight (Number): The height for each page in pixels. Min is 960 pixel, Max is 3840, Default is 1920 pixel
     *   pagePerCanvas (Number): The number of pages to be rendered per canvas element. Min 4 pages and max 20
     *   chartType {String}: Type of chart to draw. Valid options are "full", "Gitadora", "Vmix". Defaults to "full"
     *   mode {String}: "drum", "bass", "guitar"
     *   barAligned (bool): true if all pages are drawn with only full bars in it.
     *   direction (String): Direction in which bar numbers are increasing. Valid options are "up" (DM style) and "down" (GF style). Defaults to "up"
     *   drawParameters (Object): DrawParameters object
     *   drawNoteFunction (function): Draw Note function that takes in 4 arguments: laneLabel, chartSheet, pixSheetPos, drawParameters
     */
    Charter.prototype.setConfig = function(config){
        //
        this._scale = limit(typeof config.scale === "number" ? config.scale : DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
        this._pageHeight = limit(typeof config.pageHeight === "number" ? config.pageHeight : DEFAULT_PAGE_HEIGHT, MIN_PAGE_HEIGHT, MAX_PAGE_HEIGHT);
        this._pagePerCanvas = limit(typeof config.pagePerCanvas === "number" ? config.pagePerCanvas : DEFAULT_PAGEPERCANVAS, MIN_PAGEPERCANVAS, MAX_PAGEPERCANVAS);

        this._barAligned = config.barAligned === undefined ? false : config.barAligned;
        if(this._barAligned)
        {
            this._pageList = this._computeBarAlignedPositions();
            //console.log(this._pageList);
        }

        this._direction = config.direction === undefined ? "up" : config.direction;

        this._chartType = config.chartType? config.chartType : "full";//full, Gitadora, Vmix
        this._mode = config.mode;//
        this._DTXDrawParameters = config.drawParameters;//config.createDrawParameters(this._chartType);
        this._drawNoteFunction = config.drawNoteFunction;
    }

    Charter.prototype.clearDTXChart = function(){
        //
        for(var i in this._chartSheets){
            this._chartSheets[i].clear();
        }

        //this._chartSheets = [];
        this._pageCount = 0;
        //this._heightPerCanvas = 0;
        this._barAligned = false;
        this._chartType = "full";
        this._mode = null;
        this._DTXDrawParameters = {};

        this._pageList = null;
        this._direction = "up";
    };

    /**
     * Method: DtxChart.Charter.canvasRequired
     * Parameters: None
     * Description: 
     * Charter will calculate the number of canvas, the width/height and pages in each canvas required to draw all bars in the loaded dtxData.
     * and return an array of canvasConfig objects for the calling object to dynamically creat <canvas> elements based on provided information.
     * Returns: A canvasConfigArray object, which is an array of canvasConfig object
     *      pages - The number of pages in each canvas 
            width - Canvas width
            height - Canvas height
            backgroundColor - Default is black
            elementId - The suggested elementID which takes the form of "dtxdrumchart_0", "dtxdrumchart_1", "dtxdrumchart_2"... 
     */
    Charter.prototype.canvasRequired = function(){
        //Calculate the canvas required, including the width height of each canvas and number of pages per canvas

        //Find total number of pages required
        var chartLength = this._positionMapper.chartLength();
        var requiredPageCount = this._barAligned ? this._pageList.length : Math.ceil((chartLength * this._scale) / this._pageHeight);
        this._pageCount = requiredPageCount;

        var canvasCount = Math.ceil(requiredPageCount / this._pagePerCanvas);
        var pageInLastCanvas = requiredPageCount % this._pagePerCanvas;

        //Height required for all canvas
        var heightPerCanvas = this._pageHeight + DtxChartCanvasMargins.A + DtxChartCanvasMargins.B + DtxChartCanvasMargins.E + DtxChartCanvasMargins.G * 2;
        //this._heightPerCanvas = heightPerCanvas;

        //Width required for all canvas and last canvas
        var widthPerCanvas = DtxChartCanvasMargins.C + 
            (this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F) * this._pagePerCanvas + DtxChartCanvasMargins.D;
        
        var canvasConfigArray = [];
        for(var i=0; i < canvasCount; ++i ){
            //The last canvas has less pages if pageInLastCanvas is not zero so width needs to be calculated again
            if(pageInLastCanvas !== 0 && i === canvasCount - 1){
                var widthFinalCanvas = DtxChartCanvasMargins.C + 
            (this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F) * 
            (pageInLastCanvas < MIN_PAGEPERCANVAS ? MIN_PAGEPERCANVAS : pageInLastCanvas) + //The width cannot be less than 6 page wide even though the last sheet may contain less than 6 pages  
            DtxChartCanvasMargins.D;

                if(this._barAligned)
                {
                    //Find the max page height required for last sheet
                    var currCanvasPageList = this._pageList.slice( i*this._pagePerCanvas, this._pageList.length );
                    var maxPageHeightForCurrSheet = currCanvasPageList.reduce(function(prevItem, currItem){
                        return currItem.BAPageHeight >= prevItem.BAPageHeight ? currItem : prevItem;
                    }).BAPageHeight;

                    heightPerCanvas = maxPageHeightForCurrSheet + DtxChartCanvasMargins.A + DtxChartCanvasMargins.B + DtxChartCanvasMargins.E + DtxChartCanvasMargins.G * 2;
                }
                canvasConfigArray.push({
                    "pages": pageInLastCanvas,
                    //"pageHeight": this._pageHeight,
                    "width": widthFinalCanvas,
                    "height": heightPerCanvas,
                    "backgroundColor": DtxFillColor.Background,
                    "elementId": this._DTXDrawParameters.elementIDPrefix + "_" + i
                });
            }
            else{

                if(this._barAligned)
                {   //Find the max page height required for each sheet
                    var currCanvasPageList = this._pageList.slice( i*this._pagePerCanvas, (i+1)*this._pagePerCanvas );
                    var maxPageHeightForCurrSheet = currCanvasPageList.reduce(function(prevItem, currItem){
                        return currItem.BAPageHeight >= prevItem.BAPageHeight ? currItem : prevItem;
                    }).BAPageHeight;

                    heightPerCanvas = maxPageHeightForCurrSheet + DtxChartCanvasMargins.A + DtxChartCanvasMargins.B + DtxChartCanvasMargins.E + DtxChartCanvasMargins.G * 2;
                }

                canvasConfigArray.push({
                    "pages": this._pagePerCanvas,
                    //"pageHeight": this._pageHeight,
                    "width": widthPerCanvas,
                    "height": heightPerCanvas,
                    "backgroundColor": DtxFillColor.Background,
                    "elementId": this._DTXDrawParameters.elementIDPrefix + "_" + i
                });
            }
        }

        return canvasConfigArray;
    };

    Charter.prototype._computeBarAlignedPositions = function(){
        //
        var pageList = [];
        var barGroups = this._positionMapper.barGroups;
        var positionMapper = this._positionMapper;
        var currPage = 0;
        var currAccumulatedHeight = 0;
        var pageHeightLimit = this._pageHeight;

        //First page always starts with bar 0
        pageList.push({
            "startBarIndex" : 0,
            "endBarIndex": null,
            "BAPageHeight": 0
        });

        for(var i=0; i < barGroups.length; ++i ){
            
            //Compute pixel height of current bar
            var currBarStartAbsPos = barGroups[i].absStartPos;
            var nextBarStartAbsPos = i === barGroups.length - 1 ? positionMapper.chartLength() : barGroups[i+1].absStartPos;   
            var pixelHeightOfCurrentBar = (nextBarStartAbsPos - currBarStartAbsPos) * this._scale;

            //Check end height for current bar to ensure it fit within page
            if(currAccumulatedHeight + pixelHeightOfCurrentBar <= pageHeightLimit){
                currAccumulatedHeight += pixelHeightOfCurrentBar;
            }
            else{
                //The current page has reached its max height so fill this data
                pageList[pageList.length - 1]["endBarIndex"] = i - 1;
                pageList[pageList.length - 1]["BAPageHeight"] = currAccumulatedHeight;

                //This bar will start on next page
                pageList.push({
                    "startBarIndex" : i
                });
                currAccumulatedHeight = 0;
                //We have to restart the analysis for this bar again on the next iteration
                --i;
            }

        }

        pageList[pageList.length - 1]["endBarIndex"] = barGroups.length - 1;
        //Last page takes the height of 2nd last page
        pageList[pageList.length - 1]["BAPageHeight"] = pageList[pageList.length - 2]["BAPageHeight"];//currAccumulatedHeight

        return pageList;

    };

    /**
     * Parameters:
     * canvasConfigArray - An array of canvasConfig objects, one per canvas sheet in sequence:
     *    canvasConfig is an object with following information:
     *    pages - Number of pages in this canvas
     *    width - The full width of canvas
     *    height - The full height of canvas
     *    elementId - The id of the html5 canvas element. The caller must ensure the id is valid, otherwise this method will throw an error
     *    backgroundColor - Color string of background color of canvas
     * Remarks: 
     * If the number of sheets created does not match the required number, Charter will only render up to available number of sheets.
     */
    Charter.prototype.setCanvasArray = function(canvasConfigArray){
        this._chartSheets = [];//NOTE: Repeated calls may cause memory issues
        for(var i in canvasConfigArray){
            var chartSheet = new ChartSheet(canvasConfigArray[i]);
            if(!chartSheet){
                console.log("Sheet creation failed! Please ensure the id of a valid canvas element is used");
            }
            this._chartSheets.push(chartSheet);
        }        
    };

    Charter.prototype.drawDTXChart = function(){

        //iterate through barGroups
        var barGroups = this._dtxdata.barGroups;
        var chartInfo = this._dtxdata.chartInfo;
        var metadata = this._dtxdata.metadata[this._mode];
        var positionMapper = this._positionMapper;

        //Draw ChartInfo
        this.drawChartInfo(chartInfo, metadata ? metadata.totalNoteCount : 0);

        //Draw frames
        this.drawPageFrames();

        //Draw notes
        for(var i in barGroups){
            var index = parseInt(i);
            var barInfo = barGroups[i];
            var absPosBarInfo = positionMapper.barGroups[i];
            var lineCount = barInfo["lines"];

            //Draw BarLines and intermediate lines
            this.drawLinesInBar(lineCount, index);

            //Draw Bar Numbers
            this.drawBarNumber(index);

            //Draw BPM Markers
            for(var j in absPosBarInfo["bpmMarkerArray"]){
                this.drawBPMMarker( absPosBarInfo["bpmMarkerArray"][j]["absPos"], absPosBarInfo["bpmMarkerArray"][j]["bpm"].toFixed(2));
            } 

            //Draw chips
            for(var laneLabel in barInfo["notes"]){
                //Make use of utility functions in Parser to decode the line                
                if(this._DTXDrawParameters.ChipHorizontalPositions.hasOwnProperty(laneLabel)){
                    //Make use of utility functions in Parser to decode the line
                    var chipPosArray = Parser.utils.decodeBarLine( barInfo["notes"][laneLabel], lineCount );
                    this.drawChipsInBar(chipPosArray, laneLabel, index);
                }
            }

        }

        //Draw the start and end line
        this.drawChartLine(this._positionMapper.bgmStartAbsolutePosition(), {
            stroke: DtxBarLineColor.StartLine,
            strokeWidth: 3
        });

        this.drawChartLine(this._positionMapper.chartLength(), {
            stroke: DtxBarLineColor.EndLine,
            strokeWidth: 3
        });

        

        //Draw Chartsheet Number if there are more than 1 sheets used
        if(this._chartSheets.length > 1){
            for(var i in this._chartSheets){
                if(!this._chartSheets[i]){
                    console.log("Sheet unavailable! Unable to draw");
                    continue;
                }
                this.drawSheetNumber(parseInt(i), this._chartSheets.length);
            }
        }        

        //Update all canvas
        for(var i in this._chartSheets){
            this._chartSheets[i].update();
        }

    };

    Charter.prototype.drawPageFrames = function(){
        for(var i in this._chartSheets){
            if(!this._chartSheets[i]){
                console.log("Sheet unavailable! Unable to draw");
                continue;
            }
            var chartSheet = this._chartSheets[i];
            var sheetIndex = parseInt(i);

            //Iterate for each page, draw the frames
            var canvasWidthHeightPages = chartSheet.canvasWidthHeightPages();
            var pageCount = canvasWidthHeightPages.pages;
            var canvasHeight = canvasWidthHeightPages.height;
            if(this._direction === "up"){
                var startPoint = canvasHeight;
                var edgeOffset = DtxChartCanvasMargins.E;
                var directionMultiplier = -1.0;
                var originYRect = "bottom";
            } else if(this._direction === "down"){
                var startPoint = 0;
                var edgeOffset = DtxChartCanvasMargins.A + DtxChartCanvasMargins.B;
                var directionMultiplier = 1.0;
                var originYRect = "top";
            }
            
            for(var j = 0; j<pageCount; ++j){
                var pageStartXPos = DtxChartCanvasMargins.C + (this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F) * j;
                var lineWidth = this._DTXDrawParameters.ChipHorizontalPositions.RightBorder - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder;
                
                //
                if(this._barAligned){
                    //Abs page index;
                    var pageAbsIndex = sheetIndex*this._pagePerCanvas + j;

                    //Draw End bar line for the last bar within each page
                    //var endPageBarLineAbsPos = pageAbsIndex === this._pageList.length - 1 ? this._positionMapper.chartLength() : this._positionMapper.barGroups[this._pageList[pageAbsIndex+1].startBarIndex].absStartPos; 
                    //var startPageBarLineAbsPos = this._positionMapper.barGroups[this._pageList[pageAbsIndex].startBarIndex].absStartPos;

                    //var endPageBarLineRelPixHeight = (endPageBarLineAbsPos - startPageBarLineAbsPos)*this._scale;
                    var endPageBarLineRelPixHeight = this._pageList[pageAbsIndex].BAPageHeight;
                    var currPageHeight = endPageBarLineRelPixHeight;
                }
                else{
                    var currPageHeight = this._pageHeight;
                }

                //Draw Page Body
                chartSheet.addRectangle({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                    y: startPoint + directionMultiplier * edgeOffset,
                                    width: this._DTXDrawParameters.ChipHorizontalPositions.width - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                    height: currPageHeight + DtxChartCanvasMargins.G * 2
                                    }, {
                                        fill: DtxFillColor.PageFill,
                                        originY: originYRect
                                    });
                
                if(this._barAligned){                    

                    chartSheet.addLine({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                y: startPoint + directionMultiplier * (edgeOffset + DtxChartCanvasMargins.G + endPageBarLineRelPixHeight),
                                width: this._DTXDrawParameters.ChipHorizontalPositions.width - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                height: 0
                                }, {
                                    stroke: DtxBarLineColor.BarLine,
		                            strokeWidth: 2,
                                });

                } 
                
                //Draw Top Border Line
                chartSheet.addLine({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                y: startPoint + directionMultiplier * (edgeOffset + currPageHeight + DtxChartCanvasMargins.G * 2),
                                width: this._DTXDrawParameters.ChipHorizontalPositions.width - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                height: 0
                                }, {
                                    stroke: DtxBarLineColor.BorderLine,
		                            strokeWidth: 3,
                                });

                //Draw Bottom Border Line
                chartSheet.addLine({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                y: startPoint + directionMultiplier * edgeOffset,
                                width: this._DTXDrawParameters.ChipHorizontalPositions.width - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                height: 0
                                }, {
                                    stroke: DtxBarLineColor.BorderLine,
		                            strokeWidth: 3,
                                });
                //Draw Left Border Line
                chartSheet.addLine({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                y: startPoint + directionMultiplier * edgeOffset,
                                width: 0,
                                height: directionMultiplier * (currPageHeight + DtxChartCanvasMargins.G * 2)
                                }, {
                                    stroke: DtxBarLineColor.BorderLine,
		                            strokeWidth: 3,
                                });

                //Draw Inner Right Border Line
                chartSheet.addLine({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.RightBorder,
                                y: startPoint + directionMultiplier * edgeOffset,
                                width: 0,
                                height: directionMultiplier * (currPageHeight + DtxChartCanvasMargins.G * 2)
                                }, {
                                    stroke: DtxBarLineColor.BorderLine,
		                            strokeWidth: 3,
                                });

                //Draw Outer Right Border Line
                chartSheet.addLine({x: pageStartXPos + this._DTXDrawParameters.ChipHorizontalPositions.width,
                                y: startPoint + directionMultiplier * edgeOffset,
                                width: 0,
                                height: directionMultiplier * (currPageHeight + DtxChartCanvasMargins.G * 2)
                                }, {
                                    stroke: DtxBarLineColor.BorderLine,
		                            strokeWidth: 3,
                                });
            }

        }
    };

    Charter.prototype.drawSheetNumber = function(currentSheet, sheetCount){
        if(!this._chartSheets[currentSheet]){
                console.log("Sheet unavailable! Unable to draw");
                return;
            }

        var pageWidthHeight = this._chartSheets[currentSheet].canvasWidthHeightPages();
        var width = pageWidthHeight.width;
        var height = pageWidthHeight.height;

        var text = "Part " + (currentSheet + 1) + " of " + sheetCount;
        
        this._chartSheets[currentSheet].addText({
                            x: width - DtxChartCanvasMargins.D - 85,
                            y: height - DtxChartCanvasMargins.H, //
                            }, text, {
                            fill: DtxTextColor.PageNumber,
                            fontSize: DtxFontSizes.PageNumber,
                            fontFamily: "Arial",
                            originY: "bottom",
                            textAlign: "right"
                        });
    };

    Charter.prototype.drawChartInfo = function(chartInfo, totalNoteCount){
        
        var songLength = this._positionMapper.estimateSongDuration();

        var songMinutes = Math.floor(songLength/60) + "";
        var songSeconds = Math.round(songLength%60).toFixed(0);
        songSeconds = songSeconds < 10 ? "0" + songSeconds : "" + songSeconds;//Convert to string with fixed 2 characters

        var diffLevel = this._chartType === "Vmix" ? Math.floor(chartInfo[this._mode + "level"]*10).toFixed(0) : chartInfo[this._mode + "level"] + "";
        
        var modeInfo = this._mode.toUpperCase();
        var otherInfoUpperLine = modeInfo + " Level: " + diffLevel + "  BPM: " + chartInfo.bpm;
        var otherInfoLowerLine = "Length: " + songMinutes + ":" + songSeconds +"  Total Notes: " + totalNoteCount;
        //var otherInfo = modeInfo + " Level:" + diffLevel + "  BPM:" + chartInfo.bpm + "  Length:" + songMinutes + ":" + songSeconds +"  Total Notes:" + totalNoteCount;

        var otherInfoPosX = DtxChartCanvasMargins.C + 
        ( this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F ) * (MIN_PAGEPERCANVAS);//Information appears at 4 page wide

        var DtxMaxTitleWidth = (this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F)*3.8 + DtxChartCanvasMargins.C;//Max span 4 pages long
        var DtxMaxArtistWidth = DtxMaxTitleWidth;
        var DtxMaxOtherInfoWidth = (this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F)*2 + DtxChartCanvasMargins.D;

        //Repeat for every sheet available
        for(var i in this._chartSheets){
            if(!this._chartSheets[i]){
                console.log("Sheet unavailable! Unable to draw");
                continue;
            }

            //Draw Background Box first
            this._chartSheets[i].addRectangle({x: -1,
                                    y: -1,
                                    width: this._chartSheets[i].canvasWidthHeightPages().width + 2,
                                    height: DtxChartCanvasMargins.A + 3
                                    }, {
                                        fill: DtxFillColor.ChartInfo,
                                        originY: "top"
                                    });

            this._chartSheets[i].addText({
                                x: DtxChartCanvasMargins.C + 2,
                                y: DtxChartCanvasMargins.A - 19, //A is the Line divider, The Title text will be above the Artist text
                                width: DtxMaxTitleWidth
                                }, chartInfo.title, {
                                fill: DtxTextColor.ChartInfo,
                                fontSize: DtxFontSizes.Title,
                                fontFamily: "Meiryo UI",
                                originY: "bottom"
                            });

            if(chartInfo.artist && chartInfo.artist !== ""){
                this._chartSheets[i].addText({
                                x: DtxChartCanvasMargins.C + 2,
                                y: DtxChartCanvasMargins.A, //A is the Line divider, The Artist text will be slightly below it
                                width: DtxMaxArtistWidth
                                }, chartInfo.artist, {
                                fill: DtxTextColor.ChartInfo,
                                fontSize: DtxFontSizes.Artist,
                                fontFamily: "Meiryo UI",
                                originY: "bottom"
                            });
            }
            
            //Mode information
            this._chartSheets[i].addText({
                                x: otherInfoPosX,
                                y: DtxChartCanvasMargins.A - 19, //A is the Line divider, The Info text will be slightly above it
                                width: DtxMaxOtherInfoWidth
                                }, otherInfoUpperLine, {
                                fill: DtxTextColor.ChartInfo,
                                fontSize: DtxFontSizes.ChartInfo,
                                fontFamily: "Arial",
                                originY: "bottom",
                                originX: "right"
                            });

            //Other Information Text
            this._chartSheets[i].addText({
                                x: otherInfoPosX,
                                y: DtxChartCanvasMargins.A, //A is the Line divider, The Info text will be slightly above it
                                width: DtxMaxOtherInfoWidth
                                }, otherInfoLowerLine, {
                                fill: DtxTextColor.ChartInfo,
                                fontSize: DtxFontSizes.Artist,
                                fontFamily: "Arial",
                                originY: "bottom",
                                originX: "right"
                            });

            this._chartSheets[i].addLine({x: DtxChartCanvasMargins.C,
                                y: DtxChartCanvasMargins.A,
                                width:  this._chartSheets[i].canvasWidthHeightPages().width - DtxChartCanvasMargins.C - DtxChartCanvasMargins.D,
                                height: 0
                                }, {
                                    stroke: DtxBarLineColor.TitleLine,
		                            strokeWidth: 2,
                                });
        }
    };

    Charter.prototype.drawBPMMarker = function(absPosition, bpmText){
        var pixSheetPos = this.getPixelPositionOfLine(absPosition);

        //Finally select the correct sheet to draw the chip
        var chartSheet = this._chartSheets[pixSheetPos.sheetIndex];
        if(!chartSheet){
            console.log("Sheet unavailable! Unable to draw");
            return;
        }

        chartSheet.addLine({x: pixSheetPos.posX + this._DTXDrawParameters.ChipHorizontalPositions.RightBorder,
                                y: pixSheetPos.posY,
                                width:  this._DTXDrawParameters.ChipHorizontalPositions.Bpm - this._DTXDrawParameters.ChipHorizontalPositions.RightBorder,
                                height: 0
                                }, {
                                    stroke: DtxBarLineColor.BPMMarkerLine,
		                            strokeWidth: 1,
                                });

        chartSheet.addText({x: pixSheetPos.posX + this._DTXDrawParameters.ChipHorizontalPositions.Bpm,
                            y: pixSheetPos.posY}, bpmText, {
                                fill: DtxTextColor.BpmMarker,
                                fontSize: DtxFontSizes.BpmMarker,
                                fontFamily: "Arial"
                            });
    };

    Charter.prototype.drawBarNumber = function(barIndex){
        //Sanity checks
        if(barIndex < 0 || barIndex >= 999){
            console.error('barIndex is out of range [000,999]');
        }

        var barNumText = "";
        if(barIndex < 10){
            barNumText = "00" + barIndex;
        }
        else if(barIndex < 100){
            barNumText = "0" + barIndex;
        }
        else{
            barNumText = "" + barIndex;
        }
        
        var absLinePos = this._positionMapper.absolutePositionOfLine(barIndex, 0);
        var pixSheetPos = this.getPixelPositionOfLine(absLinePos);

        //Finally select the correct sheet to draw the chip
        var chartSheet = this._chartSheets[pixSheetPos.sheetIndex];
        if(!chartSheet){
            console.log("Sheet unavailable! Unable to draw");
            return;
        }

        if(this._direction === "up"){            
            var textoffset = 5;
            var originYValue = "bottom";
        } else if(this._direction === "down"){
            var textoffset = 0;
            var originYValue = "top";
        }

        chartSheet.addText({x: pixSheetPos.posX + this._DTXDrawParameters.ChipHorizontalPositions.BarNum,
                            y: pixSheetPos.posY + textoffset}, //+5 works only for this font size and family
                            barNumText, {
                                fill: DtxTextColor.BarNumber,
                                fontSize: DtxFontSizes.BarNumber,
                                fontFamily: "Arial",
                                originY: originYValue
                            });
    };

    /**
     * Draws arbitrary lines in chart. Currently used to draw start and end lines of DTX
     */
    Charter.prototype.drawChartLine = function(absPosition, drawOptions){
        var pixSheetPos = this.getPixelPositionOfLine(absPosition);

        //
        var chartSheet = this._chartSheets[pixSheetPos.sheetIndex];
        if(!chartSheet){
            console.log("Sheet unavailable! Unable to draw");
            return;
        }
        var lineWidth = this._DTXDrawParameters.ChipHorizontalPositions.RightBorder - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder;
            chartSheet.addLine({x: pixSheetPos.posX + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                y: pixSheetPos.posY,
                                width: lineWidth,
                                height: 0
                                }, drawOptions);
    };

    Charter.prototype.drawLinesInBar = function(lineCount, barIndex){
        for(var j=0; j<lineCount; j += BEAT_LINE_GAP){
            var lineColor = j == 0 ? DtxBarLineColor.BarLine : DtxBarLineColor.QuarterLine;

            var absLinePos = this._positionMapper.absolutePositionOfLine(barIndex, j);
            var pixSheetPos = this.getPixelPositionOfLine(absLinePos);

            //Finally select the correct sheet to draw the chip
            var chartSheet = this._chartSheets[pixSheetPos.sheetIndex];
            if(!chartSheet){
                console.log("Sheet unavailable! Unable to draw");
                continue;
            }

            var lineWidth = this._DTXDrawParameters.ChipHorizontalPositions.RightBorder - this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder;

            if(j == 0)
            {
                //Draw start bar line differently
                chartSheet.addLine({x: pixSheetPos.posX,
                                y: pixSheetPos.posY,
                                width: lineWidth + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                height: 0
                                }, {
                                    stroke: lineColor,
		                            strokeWidth: 1,
                                });
            } else {
                chartSheet.addLine({x: pixSheetPos.posX + this._DTXDrawParameters.ChipHorizontalPositions.LeftBorder,
                                y: pixSheetPos.posY,
                                width: lineWidth,
                                height: 0
                                }, {
                                    stroke: lineColor,
		                            strokeWidth: 1,
                                });
            }
            
        }
    };

    /**
     * Parameters:
     * chipPosArray - An array of {pos: <number>, label: <string>}
     * laneLabel - A string containing one of lane code inside Parser.DtxLaneLabels
     * barIndex - The index of bar which the chipPosArray belongs to
     */
    Charter.prototype.drawChipsInBar = function(chipPosArray, laneLabel, barIndex){
        //Iterate for each chip
        for(var i in chipPosArray){
            //Find absolutePosition of current chip (the time dimension only)
            var chipPos = chipPosArray[i];
            var absLinePos = this._positionMapper.absolutePositionOfLine(barIndex, chipPos["pos"]);

            //Convert absLinePos to Sheet Index and actual pixel x,y position of line
            var pixSheetPos = this.getPixelPositionOfLine(absLinePos);

            //Compute the final x position for this specific chip given the laneLabel
            //var chipPixXpos =  pixSheetPos.posX + this._DTXDrawParameters.ChipHorizontalPositions[laneLabel];

            //Finally select the correct sheet to draw the chip
            var chartSheet = this._chartSheets[pixSheetPos.sheetIndex];
            if(!chartSheet){
                console.log("Sheet unavailable! Unable to draw");
                continue;
            }

            //laneLabel, chartsheet, pixSheetPos, drawParameters
            this._drawNoteFunction(laneLabel, chartSheet, pixSheetPos, this._DTXDrawParameters);
        }

    };

    /**
     * Method: getPixelPositionOfLine
     * Parameter:
     * absolutePositon - The absolute position of the a line
     */
    Charter.prototype.getPixelPositionOfLine = function(absolutePositon){
        //Check if in range of chart
        if(typeof absolutePositon !== "number" || absolutePositon < 0 || absolutePositon > this._positionMapper.chartLength()){//Allow the first line of bar after last bar to be computed
            console.error("absolutePositon is invalid or out of range");
            return;
        }

        if(this._barAligned)
        {
            //TODO:
            var pageIndex;

            var relativeAbsPos = 0;

            //Iterate from the back
            //Find out which page this position falls within
            for(var i = this._pageList.length - 1; i >= 0; --i){
                var lowerLimit = this._positionMapper.barGroups[this._pageList[i].startBarIndex].absStartPos;
                relativeAbsPos = absolutePositon - lowerLimit;//Will be negative until it first falls within the page
                if(relativeAbsPos >= 0){
                    pageIndex = i;
                    break;//found
                }
            }
            //
            var sheetIndex = Math.floor( pageIndex / this._pagePerCanvas );
            var sheetPageIndex = pageIndex % this._pagePerCanvas;
            var relativeYPixPos = relativeAbsPos * this._scale;

            if(this._direction === "up"){
                var startPoint = this._chartSheets[sheetIndex].canvasWidthHeightPages().height;
                var edgeOffset = DtxChartCanvasMargins.E;
                var directionMultiplier = -1.0;                
            } else if(this._direction === "down"){
                var startPoint = 0;
                var edgeOffset = DtxChartCanvasMargins.A + DtxChartCanvasMargins.B;
                var directionMultiplier = 1.0;
            }
            
            var actualPixHeightPosofLine = startPoint + directionMultiplier * (edgeOffset + DtxChartCanvasMargins.G + relativeYPixPos);
            var actualPixWidthPosofLine = DtxChartCanvasMargins.C + 
            ( this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F ) * sheetPageIndex;

            return {
                sheetIndex: sheetIndex,
                posX: actualPixWidthPosofLine,
                posY: actualPixHeightPosofLine
            };
        }
        else{
            var pageIndex = Math.floor((absolutePositon * this._scale) / this._pageHeight);

            if(pageIndex < 0 || pageIndex >= this._pageCount){
                console.error("absolutePositon is out of range of the charter!");
                return;
            }

            //
            var sheetIndex = Math.floor( pageIndex / this._pagePerCanvas );
            var sheetPageIndex = pageIndex % this._pagePerCanvas;
            var remainingRelativePos = (absolutePositon * this._scale) % this._pageHeight;

            if(this._direction === "up"){
                var startPoint = this._chartSheets[sheetIndex].canvasWidthHeightPages().height;
                var edgeOffset = DtxChartCanvasMargins.E;
                var directionMultiplier = -1.0;                
            } else if(this._direction === "down"){
                var startPoint = 0;
                var edgeOffset = DtxChartCanvasMargins.A + DtxChartCanvasMargins.B;
                var directionMultiplier = 1.0;
            }
            
            var actualPixHeightPosofLine = startPoint + directionMultiplier * (edgeOffset + DtxChartCanvasMargins.G + remainingRelativePos);            
            var actualPixWidthPosofLine = DtxChartCanvasMargins.C + 
            ( this._DTXDrawParameters.ChipHorizontalPositions.width + DtxChartCanvasMargins.F ) * sheetPageIndex;

            return {
                sheetIndex: sheetIndex,
                posX: actualPixWidthPosofLine,
                posY: actualPixHeightPosofLine
            };
        }
    };

    /**
     * Helper functions
     */
    function limit(input, min, max){
        if(input > max){
            return max;
        }
        else if(input < min){
            return min;
        }
        else{
            return input;
        }            
    }    

    mod.Charter = Charter;
    return mod;
}(DtxChart || {} ));


/**
 * Dtxchart.graph
 */

DtxChart = (function(mod){

    var CanvasEngine = mod.CanvasEngine;//Can be FabricJS, EaselJS or even raw Canvas API
    if(!CanvasEngine){
        console.error("CanvasEngine not loaded into DtxChart module! DtxChart.Graph will not render without a Canvas engine");
    }

    var DtxGraphLaneColor = {
        "LC_Count":"#ff1f7b",
		"HH_Count":"#6ac0ff",
        "LB_Count":"#ff4bed",
		"LP_Count":"#ff4bed",
		"SD_Count":"#fcfe16",
		"HT_Count":"#02ff00",
		"BD_Count":"#9b81ff",
		"LT_Count":"#ff0000",
		"FT_Count":"#ffa919",
		"RC_Count":"#00ccff",
		"RD_Count":"#5eb5ff",
        "Empty":"#2f2f2f",
        "R_Count": "#ff0000",
        "G_Count": "#00ff00",
        "B_Count": "#0000ff",
        "Y_Count": "#ffff00",
        "M_Count": "#ff00ff",
        "O_Count": "#ffffff",

    };
	var DTX_EMPTY_LANE = "Empty";

    var DtxGraphTextColor = {
        "LaneNoteCount":"#ffffff",
        "OtherText": "#ffffff",
        "BaseLine": "#b7b7b7"
    };
	
	var GRAPH_ASP_RATIO = 190/505;//Base on 180/500
	var GRAPH_CANVAS_HEIGHT = 750;//845
    var GRAPH_CANVAS_WIDTH = GRAPH_CANVAS_HEIGHT * GRAPH_ASP_RATIO;//425
	var REF_HEIGHT = 505;
	var REF_WIDTH = REF_HEIGHT * GRAPH_ASP_RATIO;//180
    var DEFAULT_GRAPH_BAR_WIDTH = 6 * GRAPH_CANVAS_WIDTH / REF_WIDTH;
	var DEFAULT_GRAPH_BAR_GAP_WIDTH = DEFAULT_GRAPH_BAR_WIDTH * 2;
    var LANE_FONT_SIZE = 12;
    var TOTAL_COUNT_FONT_SIZE = 48;
    var TOTAL_COUNTLABEL_FONT_SIZE = 24;
    
    var DtxGraphMargins = {
        "B": 86*(GRAPH_CANVAS_HEIGHT / REF_HEIGHT),
        "C": 12*(GRAPH_CANVAS_HEIGHT / REF_HEIGHT),
        "D": 3*(GRAPH_CANVAS_HEIGHT / REF_HEIGHT),
        "E": 16*(GRAPH_CANVAS_HEIGHT / REF_HEIGHT),
        "F": 40*(GRAPH_CANVAS_HEIGHT / REF_HEIGHT)
    };
    var GRAPH_DIAGRAM_HEIGHT = GRAPH_CANVAS_HEIGHT - DtxGraphMargins.B - DtxGraphMargins.C - DtxGraphMargins.D;
    var GRAPH_PROPORTION_CAP = 0.33;//
	var GRAPH_PROPORTION_MIN = 150;
	var GRAPH_PROPORTION_MAX = 250;

    // var DtxGraphLaneOrderArrays = {
    //     "full":["LC_Count", "HH_Count", "LP_Count", "LB_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count", "RD_Count"],
    //     "LP+LB":["LC_Count", "HH_Count", "LP_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count", "RD_Count"],
    //     "RC+RD":["LC_Count", "HH_Count", "LP_Count", "LB_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count"],
    //     "Gitadora":["LC_Count", "HH_Count", "LP_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count"]
    // };

    /*
    "R_Count": 0,
        "G_Count": 0,
        "B_Count": 0,
        "Y_Count": 0,
        "M_Count": 0,
        "O_Count": 0,
    */ 

    var DtxGraphLaneOrderArrays = { "Drum": {
        "full":["LC_Count", "HH_Count", "LP_Count", "LB_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count", "RD_Count"],
        "LP+LB":["LC_Count", "HH_Count", "LP_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count", "RD_Count"],
        "RC+RD":["LC_Count", "HH_Count", "LP_Count", "LB_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count"],
        "Gitadora":["LC_Count", "HH_Count", "LP_Count", "SD_Count", "HT_Count", "BD_Count", "LT_Count", "FT_Count", "RC_Count"]
        },
        "Guitar":{
            "Gitadora":["R_Count", "G_Count", "B_Count", "Y_Count", "M_Count", "O_Count"]
        },
        "Bass":{
            "Gitadora":["R_Count", "G_Count", "B_Count", "Y_Count", "M_Count", "O_Count"]
        }
    };

    /**
     * Parameters:
     * dtxData - The dtxData object
     * canvasID - The id of the canvas element used to draw the graph. If not provided, defaults to "dtxgraph"
     * option - Option <string> to choose which type of graph to draw. Valid options are "full", "LP+LB", "RC+RD", "Gitadora", "Vmix". Defaults to "Gitadora"
     * type - Type <string> to choose from "Drum", "Bass", "Guitar"
     */
    function Graph(dtxData, canvasID, option, type){
        
        this._canvasConfig = {
                    "width": GRAPH_CANVAS_WIDTH,
                    "height": GRAPH_CANVAS_HEIGHT,
                    "backgroundColor": "#111111",
                    "elementId": canvasID ? canvasID : "dtxgraph"
                };
        this._graphOption = option? option : "Gitadora";//full, LP+LB, RC+RD, Gitadora, Vmix 
        this._graphType = type? type : "Drum";//Drum, Bass, Guitar
        //this._metadata = dtxData.metadata;

        convertMetadata.call(this, dtxData.metadata, this._graphOption, this._graphType);

        //this._dtxData = dtxData;
        if(CanvasEngine){
            this._canvasObject = CanvasEngine.createCanvas(this._canvasConfig);//The actual canvasObject
        }
    }

    //Another way to express private function?
    function convertMetadata(metadata, option, type){
        
        var l_metadata;
        var l_type = type.toLowerCase();
        l_metadata = metadata[l_type];
        
        if(l_type === "drum")
        {
            if(option === "full"){
                this._metadata = {};
                for(var prop in l_metadata){
                    if(l_metadata.hasOwnProperty(prop)){
                        this._metadata[prop] = l_metadata[prop];
                    }
                }
            }
            else if(option === "LP+LB"){
                this._metadata = {
                    "totalNoteCount": l_metadata.totalNoteCount,
                    "LC_Count": l_metadata.LC_Count,
                    "HH_Count": l_metadata.HH_Count,
                    "LP_Count": l_metadata.LP_Count + l_metadata.LB_Count,
                    "SD_Count": l_metadata.SD_Count,
                    "HT_Count": l_metadata.HT_Count,
                    "BD_Count": l_metadata.BD_Count,
                    "LT_Count": l_metadata.LT_Count,
                    "FT_Count": l_metadata.FT_Count,
                    "RC_Count": l_metadata.RC_Count,
                    "RD_Count": l_metadata.RD_Count
                };
            }
            else if(option === "RC+RD"){
                this._metadata = {
                    "totalNoteCount": l_metadata.totalNoteCount,
                    "LC_Count": l_metadata.LC_Count,
                    "HH_Count": l_metadata.HH_Count,
                    "LP_Count": l_metadata.LP_Count,
                    "LB_Count": l_metadata.LB_Count,
                    "SD_Count": l_metadata.SD_Count,
                    "HT_Count": l_metadata.HT_Count,
                    "BD_Count": l_metadata.BD_Count,
                    "LT_Count": l_metadata.LT_Count,
                    "FT_Count": l_metadata.FT_Count,
                    "RC_Count": l_metadata.RC_Count + l_metadata.RD_Count
                };
            }
            else if(option === "Gitadora"){
                this._metadata = {
                    "totalNoteCount": l_metadata.totalNoteCount,
                    "LC_Count": l_metadata.LC_Count,
                    "HH_Count": l_metadata.HH_Count,
                    "LP_Count": l_metadata.LP_Count + l_metadata.LB_Count,
                    "SD_Count": l_metadata.SD_Count,
                    "HT_Count": l_metadata.HT_Count,
                    "BD_Count": l_metadata.BD_Count,
                    "LT_Count": l_metadata.LT_Count,
                    "FT_Count": l_metadata.FT_Count,
                    "RC_Count": l_metadata.RC_Count + l_metadata.RD_Count
                };
            }
            else{//All invalid option will be converted to "full"
                this._metadata = {};
                for(var prop in l_metadata){
                    if(l_metadata.hasOwnProperty(prop)){
                        this._metadata[prop] = l_metadata[prop];
                    }
                }
                this._graphOption = "full";
            }
        }
        else
        {
            if(option === "Gitadora"){
                this._metadata = {};
                for(var prop in l_metadata){
                    if(l_metadata.hasOwnProperty(prop)){
                        this._metadata[prop] = l_metadata[prop];
                    }
                }
            }
        }
        
    }

    /**
     * Remarks: Based on observation, the max height of note graphs in Gitadora is computed using a fixed proportion of 25% of total note count.
     */
    Graph.prototype.drawGraph = function(){
        //Draw a graph where highest count in graph is a fixed proportion of the song note count
        var proportionFactorCount = this._metadata["totalNoteCount"] * GRAPH_PROPORTION_CAP;
		proportionFactorCount = Math.max( GRAPH_PROPORTION_MIN, Math.min( GRAPH_PROPORTION_MAX, proportionFactorCount ) );//Cap between min and max number
		console.log("Proportion Factor count is " + proportionFactorCount);
	   /*  var proportionFactorCount = 0;
        for(var prop in this._metadata){
            if(this._metadata.hasOwnProperty(prop) && prop !== "totalNoteCount"){
                if(this._metadata[prop] > proportionFactorCount){
                    proportionFactorCount = this._metadata[prop];
                }
            }
        } */

        var option = this._graphOption;
        var type = this._graphType;
        //Compute Side margin based on selected option
        var graphDiagramWidth = DtxGraphLaneOrderArrays[type][option].length * (DEFAULT_GRAPH_BAR_WIDTH + DEFAULT_GRAPH_BAR_GAP_WIDTH) - DEFAULT_GRAPH_BAR_GAP_WIDTH;
        var marginA = (GRAPH_CANVAS_WIDTH - graphDiagramWidth)/2;
        marginA = marginA > 0 ? marginA : 0;

        for(var i in DtxGraphLaneOrderArrays[type][option]){
            //Find the proportion value for current lane
            var lane = DtxGraphLaneOrderArrays[type][option][i];
            var proportion = this._metadata[ lane ] / proportionFactorCount;
            proportion = proportion > 1.0 ? 1.0 : proportion;//Cap the height to 1.0

            //Calculate the positionSize of current lane
            var index = parseInt(i);
            var currpositionSize = {
                x: index*(DEFAULT_GRAPH_BAR_WIDTH + DEFAULT_GRAPH_BAR_GAP_WIDTH) + marginA, 
                y: GRAPH_CANVAS_HEIGHT - DtxGraphMargins.B - DtxGraphMargins.C,
                width: DEFAULT_GRAPH_BAR_WIDTH,
                height: GRAPH_DIAGRAM_HEIGHT
            };
			/* var currpositionSize = {
                x: index*(DEFAULT_GRAPH_BAR_WIDTH + DEFAULT_GRAPH_BAR_GAP_WIDTH) + marginA, 
                y: GRAPH_CANVAS_HEIGHT - DtxGraphMargins.B - DtxGraphMargins.C,
                width: DEFAULT_GRAPH_BAR_WIDTH,
                height: proportion * GRAPH_DIAGRAM_HEIGHT
            }; */
			
			//Draw empty graph bar
			this._drawGraphOfLane(currpositionSize, DTX_EMPTY_LANE);			
			
            //Draw Graph
			currpositionSize.height = proportion * GRAPH_DIAGRAM_HEIGHT;
            this._drawGraphOfLane(currpositionSize, lane);

            //Draw count
            var textpositionSize = {
                x: index*(DEFAULT_GRAPH_BAR_WIDTH + DEFAULT_GRAPH_BAR_GAP_WIDTH) + marginA + DEFAULT_GRAPH_BAR_WIDTH*0.5, 
                y: GRAPH_CANVAS_HEIGHT - DtxGraphMargins.B
            };

            var text = this._metadata[ lane ] + "";
            this._drawLaneNoteCount(textpositionSize, text);
        }   

        //Draw BaseLine
        var linePosSize = {
            x: marginA,
            y: GRAPH_CANVAS_HEIGHT - DtxGraphMargins.B - DtxGraphMargins.C,
            width: graphDiagramWidth,
            height: 0
        };
        var drawOption = {
            stroke: DtxGraphTextColor.BaseLine,
            strokeWidth: 2
        };
        CanvasEngine.addLine.call(this, linePosSize, drawOption);

        //Draw TOTAL NOTES Label
        var textpositionSize = {
            x: GRAPH_CANVAS_WIDTH - marginA,
            y: GRAPH_CANVAS_HEIGHT - DtxGraphMargins.E - DtxGraphMargins.F
        };
        this._drawTotalNoteCountLabelText(textpositionSize, "Total Notes");

        //Draw Count
        var totalNoteCountTextPosSize = {
            x: GRAPH_CANVAS_WIDTH - marginA,
            y: GRAPH_CANVAS_HEIGHT - DtxGraphMargins.E
        };
        this._drawTotalNoteCount(totalNoteCountTextPosSize, "" + this._metadata.totalNoteCount);

        CanvasEngine.update.call(this);    
        
        //Add other metadata if necesary
    };

    Graph.prototype._drawTotalNoteCountLabelText = function(positionSize, text){
        var textOptions = {
            fill: DtxGraphTextColor.OtherText,
            fontSize: TOTAL_COUNTLABEL_FONT_SIZE,
            fontFamily: "Verdana",
            //fontWeight: "bold",
            originY: "bottom",
            originX: "right"
        };

        CanvasEngine.addText.call(this, positionSize, text, textOptions);
    }

    Graph.prototype._drawTotalNoteCount = function(positionSize, text){
        var textOptions = {
            fill: DtxGraphTextColor.OtherText,
            fontSize: TOTAL_COUNT_FONT_SIZE,
            fontFamily: "Verdana",
            //fontWeight: "bold",
            originY: "bottom",
            originX: "right"
        };

        CanvasEngine.addText.call(this, positionSize, text, textOptions);
    };

    Graph.prototype._drawLaneNoteCount = function(positionSize, text){
        var textOptions = {
            fill: DtxGraphTextColor.LaneNoteCount,
            fontSize: LANE_FONT_SIZE,
            fontFamily: "Arial",
            originY: "bottom",
            originX: "center"
        };

        CanvasEngine.addText.call(this, positionSize, text, textOptions);
    };

    //positionSize {x: <number>, y: <number>, width: <number>, height: <number>}
    Graph.prototype._drawGraphOfLane = function(positionSize, lane){
        var drawOptions = {
            fill: DtxGraphLaneColor[lane],
            originY: "bottom"
        };
        
        CanvasEngine.addRectangle.call(this, positionSize, drawOptions);
        
    };

    //Sample meta data for drum chart
    var sampleMetadata = {
		"totalNoteCount": 512,
		"LC_Count": 19,
		"HH_Count": 138,
		"LP_Count": 11,//Counted as same lane as LB
		"LB_Count": 0,
		"SD_Count": 122,
		"HT_Count": 12,
		"BD_Count": 168,
		"LT_Count": 10,
		"FT_Count": 9,
		"RC_Count": 23,
		"RD_Count": 0
    };
    
    //sample meta data for guitar chart
    var sampleGuitarMetadata = {
        "totalNoteCount": 0,//Does not equal to total of each individual lane notes!
        "R_Count": 0,
        "G_Count": 0,
        "B_Count": 0,
        "Y_Count": 0,
        "M_Count": 0,
        "O_Count": 0,
        "Wail_Count": 0
    };

    mod.Graph = Graph;
    return mod;
}( DtxChart || {} ) );


/*
DtxChart.LinePositionMapper
Description: The LinePositionMapper reads in dtxdata object, 
calculate and stores absolute line positions for the start of each bar and all bpmChangeMarkers within each bar
This allows easy computing of absolute position of any line given a bar and line number now that each bar has independent absolute position information
*/
DtxChart = (function(mod){

    //Constants
    var BASEBPM = 180.00;
    var QUARTER_BEAT_LINES = 48;

    /**
     *Constructor 
     */
    function LinePositionMapper(dtxdata){
        this._initialize();
        this._computePositions(dtxdata);
        //
        //console.log(this.barGroups);
    }

    /**
     * Returns: The absolute position of a given bar number and line number position.
     * Absolute position is defined as the number of 1/192 beats elapsed at 180 BPM for standard 4/4 bar
     * 1 Abs Pos is equal to 60/(180*48) seconds
     */
    LinePositionMapper.prototype.absolutePositionOfLine = function(barNumber, lineNumber){
        //check barNumber
        if(typeof barNumber !== "number" || barNumber < 0 || barNumber >= this.barGroups.length){
            console.error("barNumber is invalid or out of range");
            return;
        }

        //Check lineNumber
        if(typeof lineNumber !== "number" || lineNumber < 0 || lineNumber >= this.barGroups[barNumber]["lines"]){
            console.error("lineNumber is invalid or out of range");
            return;
        }

        //Search for line number iteratively and compute accordingly
        var currBar = this.barGroups[barNumber];
        var currLinePos = 0;
        var currAbsPos = this.barGroups[barNumber]["absStartPos"];
        var currBPM = this.barGroups[barNumber]["barStartBPM"];

        //Search through bpm marker array if the line number fits within any section
        for(var i in currBar["bpmMarkerArray"]){
            var currBPMMarkerPos = currBar["bpmMarkerArray"][i]["pos"];

            //Check if lineNumber is within currStartLine inclusive and first bpm marker position (exclusive)
            if(lineNumber >= currLinePos && lineNumber < currBPMMarkerPos) 
            {
                var distance = (lineNumber - currLinePos) * BASEBPM / currBPM;//Formula to compute distance
                return distance + currAbsPos;
            }

            //update variables for next iteration
            currLinePos = currBPMMarkerPos;
            currAbsPos = currBar["bpmMarkerArray"][i]["absPos"];
            currBPM = currBar["bpmMarkerArray"][i]["bpm"];
        }
        //End Search

        //If line number is not found within any bpm markers or bpmMarkerArray is empty, compute with updated information
        var distance = (lineNumber - currLinePos) * BASEBPM / currBPM;//Formula to compute distance
        return distance + currAbsPos;

    }

    LinePositionMapper.prototype.estimateSongDuration = function(){
        var distance = this.endLineAbsPosition - this.bgmStartLineAbsPosition;

        //Duration in seconds
        return (60*distance)/(BASEBPM * QUARTER_BEAT_LINES);

    };

    /**
     * Useful for getting the bgm start line for drawing on chart
     */
    LinePositionMapper.prototype.bgmStartAbsolutePosition = function(){
        return this.bgmStartLineAbsPosition;
    };

    /**
     * Returns the length of entire chart in absolute position number
     */
    LinePositionMapper.prototype.chartLength = function(){
        return this.endLineAbsPosition;
    }

    /**
     * Remarks: This method does not check for correctness of values
     * dtxdata data correctness to be done inside parser instead
     */    
    LinePositionMapper.prototype._computePositions = function(dtxdata){

        var currBPM = dtxdata.chartInfo.bpm;//Initial BPM, this variable keeps changing within the nested loop as bpm markers are iterated through
        var currBarStartLineAbsPos = 0.0;//Starts at 0.0 for the first bar
        var bgmChipFound = false;//Flag to indicate bgm marker has been found the first time. Subsequent bgm chips are ignored.
        var bgmChipBarLinePos = null;//will be object of {barNum: <number>, pos: <number>} after bgmChip is found
        
        for(var i in dtxdata.barGroups){
            //Check for earliest bgm chip
            if(!bgmChipFound && dtxdata.barGroups[i]["bgmChipArray"]){
                bgmChipBarLinePos = {
                    barNum: parseInt(i),
                    pos: dtxdata.barGroups[i]["bgmChipArray"][0].pos
                };
                bgmChipFound = true;
            }
            //Create and Initialize the barPosInfo object for current bar
            var barPosInfo = {
                "lines": dtxdata.barGroups[i]["lines"],
                "bpmMarkerArray": dtxdata.barGroups[i]["bpmMarkerArray"] ? dtxdata.barGroups[i]["bpmMarkerArray"] : [],//Note that in actual JSON bpmMarkerArray property may not exist so we need to check and set default empty array if not available
                "absStartPos": currBarStartLineAbsPos,
                "barStartBPM": currBPM//Need to store this info, otherwise have to re-compute from previous bars!
            };

            //
            var currBarLineCount = barPosInfo["lines"];

            //Calculate the absolute position for each bpm marker
            var currLineAbsPos = currBarStartLineAbsPos;
            var currLineNumPosInBar = 0;

            //This section is skipped for most songs that have constant BPM throughout
            for(var j in barPosInfo["bpmMarkerArray"]){
                var currBPMMarkerBPM = barPosInfo["bpmMarkerArray"][j]["bpm"];
                var currBPMMarkerLineNumPos = barPosInfo["bpmMarkerArray"][j]["pos"];

                //Compute the absolute position of current marker
                var distance = (currBPMMarkerLineNumPos - currLineNumPosInBar) * BASEBPM / currBPM;//Formula to compute distance
                var currMarkerAbsPos = currLineAbsPos + distance;

                //Save inside barPosInfo
                barPosInfo["bpmMarkerArray"][j]["absPos"] = currMarkerAbsPos;

                //Update state variables for the next marker
                currLineAbsPos = currMarkerAbsPos;
                currLineNumPosInBar = currBPMMarkerLineNumPos;
                currBPM = currBPMMarkerBPM;//To be carried over to next bar once this for-loop ends
            }
            //End BPM marker absolute position computation

            //Calculate currBarStartLineAbsPos to be used for the next bar in next iteration
            var finalDistance = (currBarLineCount - currLineNumPosInBar) * BASEBPM / currBPM;
            currBarStartLineAbsPos = currLineAbsPos + finalDistance;

            //Push current barPosInfo into array
            this.barGroups.push(barPosInfo);
        }

        //Calculate the actual absolute position of first bgmChip here if found
        if(bgmChipFound){
            var absPos = this.absolutePositionOfLine(bgmChipBarLinePos.barNum, bgmChipBarLinePos.pos);
            if(absPos){
                this.bgmStartLineAbsPosition = absPos;
            }
        }


        //The end line does not belong to any bar and is one line after very last line of last bar
        //This is useful information for chart drawing class
        this.endLineAbsPosition = currBarStartLineAbsPos;

    };

    

    LinePositionMapper.prototype._initialize = function(){
        this.barGroups = [];
        this.endLineAbsPosition = 0.0;
        this.bgmStartLineAbsPosition = 0.0;
    };

    //For internal reference
    var sampleLinePosMap = {
        "barGroups":[
            {
                "lines": 192,
                "absStartPos": 0,
                "barStartBPM": 180,
                "bpmMarkerArray": [
                    {
                        "absPos": 0,
                        "pos": 0,
                        "bpm": 135
                    },
                    {
                        "absPos": 48,
                        "pos": 48,
                        "bpm": 130
                    },
                    {
                        "absPos": 96,
                        "pos": 96,
                        "bpm": 118
                    }
                ]
            },
            {

            }
        ]
    };

    //
    mod.LinePositionMapper = LinePositionMapper;

    return mod;
}(DtxChart || {} ));

//
module.exports = {
	DtxChart: DtxChart,
	fabric: fabric
};