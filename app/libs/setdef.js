

'use strict';    
module.exports = function(){

    /*
    returns {songs: [{
        title: <TITLE>,
        files: ["","","","",""]//Always 5 items, empty string means no such file
    }, ...]}
    */
   function parseDefFile(defFileContent){
    //Split into lines
    let lines = defFileContent.split(/\r?\n/);
    let outObjectArray = [];
    //outObject.files = ["","","","",""];
    for(let i in lines){
        if(lines[i].length > 0){
            //Split by Colon
            //console.log(lines[i]);
            let keyValuePair = lines[i].split(/:(.+)?/,2);
            if(keyValuePair.length === 2 && keyValuePair[0].charAt(0) === '#'){
                let key = keyValuePair[0].substring(1);
                let value = keyValuePair[1].replace(/^\s+|\s+$/g, '');
                //console.log(key,":", value);
                if(key === "TITLE"){
                    let outObject = {};
                    outObject[key.toLowerCase()] = value;
                    outObject.files = ["","","","",""];
                    outObjectArray.push(outObject);					
                }else if(key === "L1FILE"){
                    outObjectArray[outObjectArray.length-1].files[0] = value;					
                }else if(key === "L2FILE"){
                    outObjectArray[outObjectArray.length-1].files[1] = value;					
                }else if(key === "L3FILE"){
                    outObjectArray[outObjectArray.length-1].files[2] = value;					
                }else if(key === "L4FILE"){
                    outObjectArray[outObjectArray.length-1].files[3] = value;					
                }else if(key === "L5FILE"){
                    outObjectArray[outObjectArray.length-1].files[4] = value;					
                }				
            }			
        }
    }
    let retObject = {};
    retObject.songs = outObjectArray;
    //console.log(outObjectArray);
    return retObject;
}

    var mod = {};
    mod.parseDefFile = parseDefFile;
    return mod;
}();