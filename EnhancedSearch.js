// ==UserScript==
// @name             WME Enhanced Search
// @namespace        https://greasyfork.org/en/users/166843-wazedev
// @version          2019.04.01.01
// @description      Enhances the search box to parse WME PLs and URLs from other maps to move to the location & zoom
// @author           WazeDev
// @include          https://www.waze.com/editor*
// @include          https://www.waze.com/*/editor*
// @include          https://beta.waze.com/editor*
// @include          https://beta.waze.com/*/editor*
// @exclude          https://www.waze.com/*user/editor*
// @grant            none
// @require          https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @contributionURL  https://github.com/WazeDev/Thank-The-Authors
// ==/UserScript==

/* global W */
/* global OL */
/* ecmaVersion 2017 */
/* global $ */
/* global I18n */
/* global _ */
/* global WazeWrap */
/* global require */
/* eslint curly: ["warn", "multi-or-nest"] */

(function() {
    'use strict';

    var updateMessage = "Regular expression (regex) highlighting is now possible!  With regex highlighting your searches must start and end with '/'.  Example: /McDonald's/  <br><br>If you want your search to be case insensitive you can append the 'i' flag to the end:  /mcdonald's/i  <br><br>  This will search all segments and Places checking both the primary and alternate names.";

    var WMEESLayer;
    var style = new OL.Style({
        strokeColor: "#ee9900",
        strokeDashstyle: "none",
        strokeLinecap: "round",
        strokeWidth: 18,
        strokeOpacity: 0.55,
        fill: false,
        pointRadius: 6
    });

    function bootstrap(tries = 1) {
        if (W && W.map &&
            W.model && W.loginManager.user &&
            $ && WazeWrap.Ready &&
           $('.search-query').length > 0)
            init();
        else if (tries < 1000)
            setTimeout(function () {bootstrap(tries++);}, 200);
    }

    bootstrap();

    function init(){
        //init function in case we need to set up a tab for configuration.  I don't want to do it.  Don't make me.
        enhanceSearch();

        WazeWrap.Interface.ShowScriptUpdate("WME Enhanced Search", GM_info.script.version, updateMessage, "https://greasyfork.org/en/scripts/381111-wme-enhanced-search", "https://www.waze.com/forum/viewtopic.php?f=819&t=279778");
    }

    var regexs = {
        'wazeurl': new RegExp('(?:http(?:s):\/\/)?(?:www\.|beta\.)?waze\.com\/(?:.*?\/)?(editor|livemap)[-a-zA-Z0-9@:%_\+,.~#?&\/\/=]*', "ig"),
        'gmapurl': new RegExp('(?:http(?:s):\/\/)?(?:www)?google\.com\/(?:.*?\/)?maps[-a-zA-Z0-9@:%_\+,.~#?&\/\/=]*', "ig"),
        'bingurl': new RegExp('(?:http(?:s):\/\/)?(?:www)?bing\.com\/(?:.*?\/)?maps[-a-zA-Z0-9@:%_\+,.~#?&\/\/=]*'),
        'openstreetmapurl': new RegExp('(?:http(?:s):\/\/)?(?:www)?openstreetmap\.org\/(?:.*?\/)?#map[-a-zA-Z0-9@:%_\+,.~#?&\/\/=]*'),
        'pluscodeurl': new RegExp('(?:http(?:s):\\/\\/)?plus\\.codes\\/([a-zA-Z0-9+]*)'),
        'what3wordsurl': new RegExp('(?:http(?:s):\\/\\/)?(?:w3w\\.co|map\\.what3words\\.com)\\/(.*\\..*\\..*)', "ig"),
        'place_mc_id': new RegExp('\d*\.\d*.\d*', "ig"),
        'segmentid': new RegExp('\d*'),
        'mandrillappurl': new RegExp('(?:http(?:s):\/\/)?(?:www\.)?mandrillapp\.com\/(?:.*?\/)?www\.waze\.com[-a-zA-Z0-9@:%_\+,.~#?&\/\/=]*_(.*)', "ig"),
        'what3wordcode': new RegExp('[a-z]*\.[a-z]*\.[a-z]*', "ig"),
        'pluscode': new RegExp('[23456789CFGHJMPQRVWX]{2,8}\\+[23456789CFGHJMPQRVWX]{0,2}'),
        'regexHighlight': new RegExp('^(\\/.*?\\/i?)')
    };

    function enhanceSearch(){
        $('.search-query')[0].removeEventListener('paste', readPaste, false);
        $('.search-query')[0].addEventListener('paste', readPaste, false);
        $('.search-query').css({"border": "#2f799b 2px solid", "margin-right":"2px"});
        $('.search-query').on("dragover", function(event) {
            event.preventDefault();
            event.stopPropagation();
            $('.search-query')[0].value="";
        });
        $('.search-query').on("drop", function(event) {
            event.preventDefault();
            event.stopPropagation();
            drop(event);
        });

        $('.search-query').keyup(regexHighlight);
    }

    function onScreen(obj) {
        if (obj.geometry)
            return(W.map.getExtent().intersectsBounds(obj.geometry.getBounds()));
        return(false);
    }

    function regexHighlight(){
        let query = $('.search-query')[0].value;
        if(query.match(regexs.regexHighlight)){
            let highlights=[];
            let regexFlag = "";
            if(query.length < 2)
                return;

            if(query[query.length-1] === "i"){
                regexFlag = "i";
                query=query.slice(0, -1);
            }
            query = query.substring(1, query.length-1);
            WazeWrap.Events.unregister('moveend', window, regexHighlight);
            WazeWrap.Events.register('moveend', window, regexHighlight);
            WazeWrap.Events.unregister('zoomend', window, regexHighlight);
            WazeWrap.Events.register('zoomend', window, regexHighlight);

            let onscreenSegments = WazeWrap.Model.getOnscreenSegments();
            for(let i = 0; i < onscreenSegments.length; i++){
                if(onscreenSegments[i].attributes.primaryStreetID){
                    let st = W.model.streets.getObjectById(onscreenSegments[i].attributes.primaryStreetID);
                    if(st.name && st.name.match(new RegExp(query, regexFlag)))
                        highlights.push(new OL.Feature.Vector(onscreenSegments[i].geometry.clone(), {}));
                    else{
                        if(onscreenSegments[i].attributes.streetIDs){
                            let alts = onscreenSegments[i].attributes.streetIDs;
                            for(let j=0; j < alts.length; j++){
                                let altSt = W.model.streets.getObjectById(alts[j]);
                                if(altSt.name.match(new RegExp(query, regexFlag))){
                                    highlights.push(new OL.Feature.Vector(onscreenSegments[i].geometry.clone(), {}));
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            let onscreenVenues = [];
            $.each(W.model.venues.objects, function(k, v){
                if(onScreen(v))
                    onscreenVenues.push(v);
            });

            for(let i = 0; i < onscreenVenues.length; i++){
                if(onscreenVenues[i].attributes.name && onscreenVenues[i].attributes.name.match(new RegExp(query, regexFlag)))
                    highlights.push(new OL.Feature.Vector(onscreenVenues[i].geometry.clone(), {}));
                else if(onscreenVenues[i].attributes.aliases){
                    let aliases = onscreenVenues[i].attributes.aliases;
                    for(let j=0; j< aliases.length; j++){
                        if(aliases[j].match(new RegExp(query, regexFlag)))
                            highlights.push(new OL.Feature.Vector(onscreenVenues[i].geometry.clone(), {}));
                        break;
                    }
                }
            }
            if(highlights.length > 0){
                if(!WMEESLayer)
                    WMEESLayer = new OL.Layer.Vector("WME_Enhanced_Search",{displayInLayerSwitcher: false, uniqueName: "__WME_Enhanced_Search", styleMap: new OL.StyleMap(style)});

                WMEESLayer.removeAllFeatures();
                WMEESLayer.addFeatures(highlights);
                if(W.map.getLayersByName(["WME_Enhanced_Search"]).length === 0)
                    W.map.addLayer(WMEESLayer);
            }
            else
                if(WMEESLayer && WMEESLayer.features.length>0){
                    WMEESLayer.removeAllFeatures();
                    WazeWrap.Events.unregister('moveend', window, regexHighlight);
                    WazeWrap.Events.unregister('zoomend', window, regexHighlight);
                }
        }
        else{
            WazeWrap.Events.unregister('moveend', window, regexHighlight);
            WazeWrap.Events.unregister('zoomend', window, regexHighlight);
            if(WMEESLayer){
                WMEESLayer.removeAllFeatures();
                W.map.removeLayer(WMEESLayer);
            }
        }
    }

    function drop(ev) {
        ev.preventDefault();
        var data = ev.originalEvent.dataTransfer.getData("text");
        parsePaste(data);
    }

    async function readPaste(){
        let pasteVal = await navigator.clipboard.readText();
        if(!pasteVal.match(regexs.regexHighlight)) //don't try and parse if it matches the regex highlight format - it will match some weird stuff
            parsePaste(pasteVal);
    }

    async function parsePaste(pasteVal){
        let processed = false;
        if(pasteVal.match(regexs.wazeurl)){
            let params = pasteVal.match(/lon=(-?\d*.\d*)&lat=(-?\d*.\d*)&zoom=(\d+)/);
            let lon = pasteVal.match(/lon=(-?\d*.\d*)/)[1];
            let lat = pasteVal.match(/lat=(-?\d*.\d*)/)[1];
            let zoom = parseInt(pasteVal.match(/zoom=(\d+)/)[1]);
            if(pasteVal.match(/livemap/))
                zoom -= 12;
            zoom = (Math.max(0,Math.min(10,zoom)));
            jump4326(lon, lat, zoom);

            WazeWrap.Model.onModelReady(function(){
                //Check for selected objects
                let selectObjs = [];
                if(pasteVal.match(/&segments=(.*)(?:&|$)/)){
                    let segs = pasteVal.match(/&segments=(.*)(?:&|$)/)[1];
                    segs = segs.split(',');
                    for(let i=0; i <segs.length; i++)
                        selectObjs.push(W.model.segments.getObjectById(segs[i]));
                }

                if(pasteVal.match(/&venues=(.*)(?:&|$)/)){
                    let venues = pasteVal.match(/&venues=(.*)(?:&|$)/)[1];
                    venues = venues.split(',');
                    for(let i=0; i <venues.length; i++)
                        selectObjs.push(W.model.venues.getObjectById(venues[i]));
                }

                if(pasteVal.match(/&mapUpdateRequest=(\d*)/)){
                    let ur = pasteVal.match(/&mapUpdateRequest=(\d*)/)[1];
                    W.map.updateRequestLayer.markers[ur].icon.$div[0].click()
                }

                if(pasteVal.match(/&mapProblem=(\d%2[a-zA-Z]\d*)/)){
                    let mp = pasteVal.match(/&mapProblem=(\d%2[a-zA-Z]\d*)/)[1];
                    mp = decodeURIComponent(mp);
                    W.map.problemLayer.markers[mp].icon.$div[0].click();
                }

                if(pasteVal.match(/&mapComments=(.*)(?:&|$)/)){
                    let mc = pasteVal.match(/&mapComments=(.*)(?:&|$)/)[1];
                    selectObjs.push(W.model.mapComments.getObjectById(`${mc}`));
                }

                if(selectObjs.length > 0)
                    W.selectionManager.setSelectedModels(selectObjs);
                processed = true;
                if(processed)
                    $('.search-query')[0].value = '';
            }, true, this);
        }
        else if(pasteVal.match(regexs.gmapurl)){
            let zoom;
            let params = pasteVal.split('@').pop().split(',');
            zoom = (Math.max(0,Math.min(10,(parseInt(params[2]) - 12))));
            jump4326(params[1], params[0], zoom);
            processed = true;
        }
        else if(pasteVal.match(regexs.bingurl)){
            let params = pasteVal.match(/&cp=(-?\d*.\d*)~(-?\d*.\d*)&lvl=(\d+)/);
            let zoom = (Math.max(0,Math.min(10,(parseInt(params[3]) - 12))));
            jump4326(params[2], params[1], zoom);
            processed = true;
        }
        else if(pasteVal.match(regexs.openstreetmapurl)){
            let params = pasteVal.match(/#map=(\d+)\/(-?\d*.\d*)\/(-?\d*.\d*)/);
            let zoom = (Math.max(0,Math.min(10,(parseInt(params[1]) - 12))));
            jump4326(params[3], params[2], zoom);
            processed = true;
        }
        else if(pasteVal.match(regexs.what3wordsurl)){
            try{
                let words = pasteVal.match(regexs.what3wordsurl)[1];
                let result = await $.get(`https://api.what3words.com/v3/convert-to-coordinates?words=${words}&key=7ZWY99SE`);
                jump4326(result.coordinates.lng, result.coordinates.lat);
                processed = true;
            }catch(err){
                alert("The three word address provided is not valid");
            }
        }
        else if(pasteVal.match(regexs.pluscodeurl)){
            let code = pasteVal.match(regexs.pluscodeurl)[1];
            try{
                let result = await $.get(`https://plus.codes/api?address=${encodeURIComponent(code)}`);
                let loc = result.plus_code.geometry.location;
                jump4326(loc.lng, loc.lat);
                processed = true;
            } catch(err){
                console.log(err);
            }
        }
        else if(pasteVal.match(regexs.pluscode)){ //plus code directly pasted
            try{
                let result = await $.get(`https://plus.codes/api?address=${encodeURIComponent(pasteVal)}`);
                let loc = result.plus_code.geometry.location;
                jump4326(loc.lng, loc.lat);
                processed = true;
            } catch(err){
                console.log(err);
            }
        }
        else if(pasteVal.match(regexs.mandrillappurl)){
            let decoded = pasteVal.match(/(?:http(?:s):\/\/)?(?:www\.)?mandrillapp\.com\/(?:.*?\/)?www\.waze\.com[-a-zA-Z0-9@:%_\+,.~#?&\/\/=]*_(.*)/)[1];
            let url = atob(decoded).split(",")[0];
            processed = true;
            parsePaste(`https://www.waze.com/editor/${url}`);
        }
        else if(pasteVal.match(/[a-z]*\.[a-z]*\.[a-z]*/)){ //What3words code pasted directly
            try{
                let result = await $.get(`https://api.what3words.com/v3/convert-to-coordinates?words=${pasteVal}&key=7ZWY99SE`);
                jump4326(result.coordinates.lng, result.coordinates.lat);
                processed = true;
            }catch(err){
                alert("The three word address provided is not valid");
            }
        }
        else if(pasteVal.match(/\d*\.\d*.\d*/)){ //Waze Place/mapComment id pasted directly
            let landmark = W.model.venues.getObjectById(pasteVal);
            let mapcomment = W.model.mapComments.getObjectById(pasteVal);
            if(landmark){
                W.selectionManager.setSelectedModels(landmark);
                processed = true;
            }
            else if(mapcomment){
                W.selectionManager.setSelectedModels(mapcomment);
                processed = true;
            }
            else{ //use segmentFinder to find the venue, jump there & select
                if(W.app.getAppRegionCode() === "usa"){//segment finder currently only works for the NA server
                    try{
                        let result = await $.get(`https://w-tools.org/api/SegmentFinder?find=${pasteVal}`);

                        jump4326(result.coordinates.longitude, result.coordinates.latitude, 6); //jumping to z6 to try and ensure all places are on screen, without zooming out too far
                        WazeWrap.Model.onModelReady(function(){
                            W.selectionManager.setSelectedModels(W.model.venues.getObjectById(pasteVal));
                        }, true, this);
                    }
                    catch(err){
                        console.log(err);
                    }
                }
            }
        }
        else if(pasteVal.match()){
            let segsArr = pasteVal.split(',');
            let segsObjs = [];
            for(let i=0; i <segsArr.length; i++){
                let seg = W.model.segments.getObjectById(segsArr[i])
                if(seg)
                    segsObjs.push(seg);
            }
            if(segsObjs.length > 0)
                W.selectionManager.setSelectedModels(segsObjs);
            else{
                //Couldn't find segment(s) - try to locate the first one and then select them all
                if(W.app.getAppRegionCode() === "usa"){//segment finder currently only works for the NA server
                    try{
                        let result = await $.get(`https://w-tools.org/api/SegmentFinder?find=${segsArr[0]}`);

                        jump4326(result.coordinates.longitude, result.coordinates.latitude, 6); //jumping to z6 to try and ensure all segments are on screen, without zooming out too far
                        WazeWrap.Model.onModelReady(function(){
                            for(let i=0; i <segsArr.length; i++){
                                let seg = W.model.segments.getObjectById(segsArr[i])
                                if(seg)
                                    segsObjs.push(seg);
                            }
                            W.selectionManager.setSelectedModels(segsObjs);
                        }, true, this);
                    }
                    catch(err){
                        console.log(err);
                    }
                }
            }
        }

        if(processed)
            $('.search-query')[0].value = '';
    }

    function jump900913(lon, lat, zoom){
        W.map.setCenter(new OL.Geometry.Point(lon, lat));
        if(zoom)
            W.map.zoomTo(zoom);
    }

    function jump4326(lon, lat, zoom){
        var xy = WazeWrap.Geometry.ConvertTo900913(lon, lat);
        W.map.setCenter(xy);
        if(zoom)
            W.map.zoomTo(zoom);
    }
})();
