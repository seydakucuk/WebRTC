var vcwindow = null;
var examples = {};
var testCase = window.location.hash.substr(1) || "test";
let displayLog = false;
let useWebRTC = false;
let peerConnection = null;
let dataChannelOut = null;
let dataChannelIn = null;
const sessionID = "1234";
const geoViewURL = "../geo-viewer/";
const querystring = sessionID !== "" ? "?sessionID=" + sessionID : "";
let isNegotiating = false;
const logChannels = new Map();
// These channels will be unselected by default (and not show in the logs)
const hideByDefaultList = [
  "nmap.view.mousemoved",
  "map.view.mouseup",
  "map.view.mousedown",
  "nmap.setting.get",
  "nmap.setting.set",
];

// List settings files to respond to GV with files from 'static/nmapi-settings/'. File names should match the settingId being sent.
const settingFiles = ["ribbon-bar", "security-context"];

const updateLogView$ = new rxjs.Subject();
updateLogView$
  .pipe(rxjs.operators.debounceTime(100))
  .subscribe((_) => renderLogView());
window.addEventListener("load", () => {
  // Load the examples
  document.getElementById("test-case-number").value = testCase;
  loadTestCase();
});
const logs = [];
const cleanupLogChannels = () => {
  Array.from(logChannels.keys()).forEach((channel) => {
    const hasMessageInChannel = logs.find((log) => log.channel === channel);
    if (!hasMessageInChannel) logChannels.delete(channel);
  });
};
const logMessage = (prefix, channel, data) => {
  const timeStamp = new Date().getTime();
  const bufferLength =
    document.getElementById("logs-buffer-length")?.value || 0;
  logs.push({ prefix, channel, data, timeStamp });
  if (logs.length >= bufferLength) logs.splice(-bufferLength);
  if (!logChannels.has(channel) && !!channel) {
    if (hideByDefaultList.includes(channel)) {
      logChannels.set(channel, false);
    } else {
      logChannels.set(channel, true);
    }
  }
  if (displayLog) {
    updateLogView$.next();
  }
};
const parse = (data) => {
  var result;
  try {
    result = JSON.parse(data);
  } catch (e) {
    console.log(e);
    result = null;
  }
  return result;
};
// geoViewReady implies gv is able to receive nmapi msgs
const geoViewReadySub$ = new rxjs.BehaviorSubject(false);
const geoViewReady$ = geoViewReadySub$.asObservable();
// geoViewMapReady indicates map is initialized, map.feature.plot should be held until mapReady
const geoViewMapReadySub$ = new rxjs.BehaviorSubject(false);
const geoViewMapReady$ = geoViewMapReadySub$.asObservable();

const loadGeoViewWebRTC$ = geoViewReady$.pipe(
  rxjs.operators.filter((ready) => !ready),
  rxjs.operators.tap((_) => {
    window.open(
      geoViewURL + querystring,
      "GeoView",
      "left=600,height=900,width=1600, noopener"
    );
    console.log("Opening GeoView with WebRTC");
  }),
  rxjs.operators.take(1)
);
const loadGeoViewPostMessage$ = geoViewReady$.pipe(
  rxjs.operators.filter((ready) => !ready),
  rxjs.operators.tap((_) => {
    vcwindow = window.open(
      geoViewURL,
      "GeoView",
      "left=600,height=900,width=1600"
    );
    vcwindow.addEventListener("beforeunload", (_) => {
      geoViewReadySub$.next(false);
      geoViewMapReadySub$.next(false);
      console.log("Opening GeoView with PostMessage");
    });
    vcwindow.onclose = () => {
      geoViewReady$.next(false);
      geoViewMapReady$.next(false);
    };
  }),
  rxjs.operators.take(1)
);
const geoViewPreLoaded$ = geoViewReady$.pipe(
  rxjs.operators.filter((ready) => ready),
  rxjs.operators.take(1),
  rxjs.operators.mapTo(undefined)
);
const startGeoView$ = rxjs
  .merge(geoViewPreLoaded$, loadGeoViewPostMessage$)
  .pipe(rxjs.operators.take(1));
const startGeoViewWebRTC$ = rxjs
  .merge(geoViewPreLoaded$, loadGeoViewWebRTC$)
  .pipe(rxjs.operators.take(1));

var clipboard = function (element) {
  /* Get the text field */
  var copyText = document.getElementById(element);

  /* Select the text field */
  copyText.select();

  /* Copy the text inside the text field */
  document.execCommand("copy");
};

//======== Handle Test Data ========
const loadTestCase = () => {
  testCase = document.getElementById("test-case-number").value;
  window.location.hash = testCase;
  getJSON(`tests/${testCase}.json`, function (err, data) {
    if (err !== null) {
      alert("Unable to load examples: " + err);
    } else {
      examples = data;
      makeButtons();
    }
  });
};

const convertLog = () => {
  var payload = document.getElementById("appviewLog").value;

  try {
    try {
      //try parsing JSON
      var output = JSON.parse(payload);
      examples = output;
    } catch (err) {
      //try adding parent object and parsing JSON
      var output = JSON.parse("{" + payload + "}");
      examples = output;
    }
  } catch (err) {
    //try parsing AppView Log
    payload = payload.replace(/(?<=\n)\/\/.*(?=\n)/g, "");
    payload = payload.replace(/(?<=\n)\/\*.*\*\/(?=\n)/g, "");
    payload = payload.replace(/\n|\r/g, "");

    payload = payload.replace(/(NMAPI Sending|NMAPI Received)/g, "\n$1");
    var result = payload.split(/\n/g);

    //clean up array
    for (var i = 0; i < result.length; i++) {
      if (result[i].search(/NMAPI Sending/) < 0) {
        result.splice(i, 1);
        i--;
      }
    }

    for (var i = 0; i < result.length; i++) {
      result[i] = result[i].replace(
        /NMAPI Sending.+?(n?map.+?): ?\{/g,
        '"[AV Sample ' + i + '] $1" : {"channel":"$1", "payload":{'
      );
      result[i] = result[i] + "}";

      //match commas
      if (i < result.length - 1) {
        result[i] = result[i] + ",";
      }
    }

    //add root JSON
    result.unshift("{");
    result.push("}");
    var output = JSON.parse(result.join(""));
    examples = output;
  } finally {
    //[FUTURE WORK] The vision was to make this input also parse NVG like the sendNVG window. This would make it an all-in-one.
    //sendNVG()
  }
  //print JSON object to console
  console.log(examples);
  makeButtons();
};
const makeButtons = () => {
  var co = document.getElementById("demoButtons");
  co.innerHTML = "";

  var totalFeat = document.createElement("label");
  totalFeat.setAttribute("class", "countFeat");
  totalFeat.innerHTML =
    "Total Features: " +
    (JSON.stringify(examples).match(/featureId/g) || []).length;
  co.appendChild(totalFeat);
  co.appendChild(document.createElement("br"));

  Object.keys(examples).forEach(function (item, index) {
    var btn = document.createElement("button");
    btn.setAttribute("id", item);
    if (Array.isArray(examples[item])) {
      const messagesPayload = JSON.stringify(examples[item]);
      btn.setAttribute("onclick", `processMessages('${messagesPayload}')`);
    } else {
      var pay = JSON.stringify(examples[item].payload);
      btn.setAttribute("value", pay);
      btn.setAttribute(
        "onclick",
        "processMessage('" + examples[item].channel + "', this.value)"
      );
    }

    btn.innerHTML = item;
    co.appendChild(btn);

    //add tag - number of features
    var features = (JSON.stringify(examples[item]).match(/featureId/g) || [])
      .length;
    if (features != 0) {
      var countFeat = document.createElement("label");
      countFeat.innerHTML = features;
      countFeat.setAttribute("class", "countFeat");
      countFeat.setAttribute("title", "Number of Features in this message");
      co.appendChild(countFeat);
    }

    var br = document.createElement("br");
    co.appendChild(br);
  });
};

// Predefined symbol codes for random selection

var countryCodes = ["CA", "US", "UK", "FR", "DE"];

//======== Test Automation ========

let playLoop = [];
let item = 0;

const playTestCase = () => {
  Object.keys(examples).forEach(function (item, index) {
    playLoop[index] = setTimeout((_) => {
      if (Array.isArray(examples[item])) {
        const messagesPayload = JSON.stringify(examples[item]);
        console.log("messagePayload: ", messagesPayload);
        processMessages(messagesPayload);
      } else {
        var pay = JSON.stringify(examples[item].payload);
        processMessage(examples[item].channel, pay);
        console.log("messagePayload: ", examples[item]);
      }
      document.getElementById(item).innerHTML += " ✔";
    }, index * document.getElementById("playValue").value);
  });
};

const stopTestCase = () => {
  //setTimeout is non-blocking, so all need to be cleared if the loop is going to stop
  playLoop.forEach((timer) => {
    clearTimeout(timer);
  });
};

var getJSON = function (url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "json";
  xhr.onload = function () {
    var status = xhr.status;
    if (status === 200) {
      callback(null, xhr.response);
    } else {
      callback(status, xhr.response);
    }
  };
  xhr.send();
};

let customHandler;

var messageHandler = function (data) {
  if (customHandler) {
    customHandler(data);
  }
  logMessage("from GV:", data.channel, data);
  if (data.channel && data.payload) {
    // We know GV is ready to accept nmapi messages if GV sends one.
    // This prevents the constant reload as messages other than map init
    // are sent by GV before map is initialized
    geoViewReadySub$.next(true);
    var ci = document.getElementById("channel_in");
    var channel_in = ci?.options[ci.selectedIndex].value;
    if (data.channel === channel_in) {
      var d = document.getElementById("cincoming");
      d.value = JSON.stringify(data.payload, null, 2);
    }
    if (data.channel === "map.status.initialization") {
      console.log("Data Channel Initialization. Payload: ", data.payload);
      if (data.payload.status === "ready") {
        geoViewMapReadySub$.next(true);
      }
    }

    switch (data.channel) {
      case "nmap.command.list.request":
        // for any right click on a c4isr object, send the context menu
        processMessage(
          "nmap.command.list.response",
          NmapServiceUtils.createListResponse(data)
        );
        break;
      case "nmap.object.update":
      case "nmap.object.create":
      case "nmap.object.delete":
      case "nmap.feature.delete":
        processMessage(
          "map.message.complete",
          NmapServiceUtils.createMessageComplete(data)
        );
        break;
      case "nmap.object.attributes.request":
        processMessage(
          "nmap.object.attributes.response",
          NmapServiceUtils.createAttributeResponse(data.payload.messageId)
        );
        break;
      case "nmap.command.execute":
        processMessage(
          "map.message.ack",
          NmapServiceUtils.createMessageAck(data)
        );
        processMessage(
          "map.message.complete",
          NmapServiceUtils.createMessageComplete(data)
        );
        break;
      case "nmap.app.status.request":
        processMessage(
          "nmap.app.status.state",
          NmapServiceUtils.createStatusResponse(event.data)
        );
        break;
      case "nmap.app.object.history.request":
        processMessage(
          "nmap.app.object.history.response",
          NmapServiceUtils.createHistoryResponse(data)
        );
        break;
      case "nmap.app.process.request":
        processMessage(
          "nmap.app.process.response",
          NmapServiceUtils.createProcessResponse(data)
        );
        break;
      case "nmap.setting.get":
        if (settingFiles.indexOf(data.payload.settingId) >= 0) {
          getJSON(
            `nmapi-settings/${data.payload.settingId}.json`,
            function (err, settingData) {
              if (err !== null) {
                alert("Unable to load nmapi-settings: " + err);
              } else {
                const response = {
                  messageId:
                    "dynamic-setting-response-" +
                    settingFiles.indexOf(data.payload.settingId),
                  settingId: data.payload.settingId,
                  setting: settingData,
                };
                processMessage(
                  "nmap.setting.response",
                  JSON.stringify(response)
                );
              }
            }
          );
        } else {
          /**
           * it's observed that AV can send empty settings (when there's nothing in workspace?), although this
           * is not the root cause but it does expose a defect in GV (TRITON-30473) so this is to simulate this part of
           * behavior on AV
           */
          processMessage(
            "nmap.setting.response",
            NmapServiceUtils.createEmptySettingResponse(data)
          );
        }
        break;
      case "nmap.object.list.request":
        processMessage(
          "nmap.object.list.response",
          NmapServiceUtils.createObjectListResponse(data)
        );
        break;
      default:
        break;
    }
  }
};

var eventHandler = function (event) {
  messageHandler(event.data);
};
// register for messages
window.addEventListener("message", eventHandler, false);

initDataChannelIn = (dc) => {
  dataChannelIn = dc;
  dataChannelIn.onclose = (e) => {
    geoViewReadySub$.next(false);
    geoViewMapReadySub$.next(false);
    initWebRTC();
  };
  dataChannelIn.onopen = (_) => {
    dataChannelIn.onmessage = (e) => {
      messageHandler(JSON.parse(event.data));
    };
  };
  console.log(`Data Channel Initialized. State: ${dataChannel.readyState}`);
};

const initWebRTC = (_) => {
  peerConnection = new RTCPeerConnection();
  dataChannelOut = peerConnection.createDataChannel("gvIn");
  peerConnection.ondatachannel = (e) => initDataChannelIn(e.channel);
  peerConnection.onsignalingstatechange = (e) => {
    isNegotiating = peerConnection.signalingState != "stable";
  };
  peerConnection.onicecandidate = (e) => {
    var candidate = JSON.stringify({ candidate: e.candidate });
    localStorage.setItem("candidateB" + sessionID, candidate);
    localStorage.removeItem("candidateB" + sessionID);
  };
  window.addEventListener("storage", (event) => {
    if (event.key == "offer" + sessionID) {
      var offer = parse(event.newValue);
      if (offer != null && offer.sdp != null && !isNegotiating) {
        isNegotiating = true;
        peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer.sdp)
        );
        peerConnection
          .createAnswer()
          .then((answer) => peerConnection.setLocalDescription(answer))
          .then(() => {
            var answer = JSON.stringify({
              sdp: peerConnection.localDescription,
            });
            localStorage.setItem("answer" + sessionID, answer);
            localStorage.removeItem("answer" + sessionID);
          });
      }
    } else if (event.key == "candidateA" + sessionID) {
      var candidateString = event.newValue;
      var candidate = parse(candidateString);
      localStorage.removeItem("candidateA" + sessionID);
      if (candidate != null && candidate.candidate != null) {
        peerConnection
          .addIceCandidate(new RTCIceCandidate(candidate.candidate))
          .catch((e) => console.log(e));
      }
    }
  });
};

// Predefined symbol codes for random selection

var countryCodes = ["CA", "US", "UK", "FR", "DE"];

const sendRandomObjects = (count, zoom) => {
  var mess = new Object();
  mess.overlayId = "OVL_RGP";
  var plotFormat =
    document.getElementById("plotFormat").options[
      document.getElementById("plotFormat").selectedIndex
    ].value;
  const nvgPlotFormat =
    plotFormat === "nvg" &&
    document.getElementById("nvgPlotFormat").options[
      document.getElementById("nvgPlotFormat").selectedIndex
    ].value;

  mess.format = plotFormat;
  var limit = useWebRTC ? 500 : count;
  var batches = Math.floor(count / limit);
  var remainder = count % limit;
  console.log(
    `Number of Objects: ${count}. Size of batch ${limit}. Number of batches: ${
      batches + 1
    }`
  );
  var feats = [];
  var offset = 0;
  var batchCount = 0;
  for (let j = 0; j <= batches; j++) {
    batchCount = j == batches ? remainder : limit;
    if (batchCount <= 0) {
      break;
    }
    for (let i = 1; i <= batchCount; i++) {
      var feature = new Object();
      feature.overlayId = "OVL_RGP";
      feature.name = "NAME " + (i + offset);
      feature.featureId = "NAME " + (i + offset);
      feature.format = plotFormat;
      var feat = new Object();
      feat.type = "point";
      if (plotFormat === "app6b") {
        feat.symbolCode =
          app6bSymbolCodes[parseInt(Math.random() * app6bSymbolCodes.length)];
      } else if (plotFormat === "app6d") {
        feat.symbolCode =
          app6dSymbolCodes[parseInt(Math.random() * app6dSymbolCodes.length)];
      } else if (plotFormat === "nvg") {
        if (nvgPlotFormat === "app6b") {
          feat.symbolCode =
            app6bSymbolCodes[parseInt(Math.random() * app6bSymbolCodes.length)];
        } else if (nvgPlotFormat === "app6d") {
          feat.symbolCode =
            app6dSymbolCodes[parseInt(Math.random() * app6dSymbolCodes.length)];
        }
      }

      const featureX = -87 + Math.random() * 5 * 3;
      const featureY = 31 + Math.random() * 3 * 3;
      // Random coordinates within BBOX of [-87, 31] - [-82, 34] - North America
      feat.coordinates = [featureX, featureY];
      if (plotFormat === "nvg") {
        feat = encodeURI(
          `<point symbol="${nvgPlotFormat}:${feat.symbolCode}" x="${featureX}" y="${featureY}" />`
        );
      }
      feature.feature = feat;

      var properties = new Object();
      const isC4ISRPayload = document.getElementById(
        "generate-c4isr-payload"
      ).checked;

      if (isC4ISRPayload) {
        properties.nmapC4isrObj = {
          speed: Math.floor(Math.random() * 100), // random speed from 0 - 100
          course: Math.floor(Math.random() * 360), // random speed from 0 - 100
        };
        properties.nmapC4isrObj.labelData = {
          identificationNumber: Math.random()
            .toString(36)
            .substring(7)
            .toUpperCase(),
          specialDescription:
            Math.random().toString(36).substring(2).toUpperCase() +
            Math.random().toString(36).substring(2).toUpperCase(),
          country:
            countryCodes[Math.floor(Math.random() * countryCodes.length)],
          type: Math.floor(Math.random) ? "Civilian" : "Military",
        };
      }
      properties.modifiers = {};
      const useRandomSpeedLeader = document.getElementById(
        "generate-random-speed-leader"
      ).checked;
      if (useRandomSpeedLeader) {
        properties.modifiers["AJ"] =
          (getRandomInt(300) + Math.random()).toString() +
          "," +
          getRandomInt(180).toString();
      }
      feature.properties = properties;
      feats[i - 1] = feature;
    }
    mess.features = feats;

    //mess.zoom = (zoom === undefined) ? true : zoom;
    mess.readOnly = false;

    let payload;
    let message_channel;
    const useMapFeaturePlot = document.getElementById(
      "generate-payload-with-mapfeatureplot"
    ).checked;
    if (useMapFeaturePlot) {
      message_channel = "map.feature.plot";
      mess.features.forEach((featurePayload) => {
        payload = {
          overlayId: "OVL_RMP",
          name: featurePayload.name,
          featureId: featurePayload.featureId,
          format: mess.format,
          feature: featurePayload.feature,
          zoom: mess.readOnly,
        };
        processMessage(message_channel, JSON.stringify(payload));
      });
    } else {
      payload = JSON.parse(JSON.stringify(mess, undefined, 4));
      message_channel = "map.feature.plot.batch";
      processMessage(message_channel, JSON.stringify(payload));
    }

    offset += limit;
  }
};

const createRandomObjects = () => {
  var plotFormat =
    document.getElementById("plotFormat").options[
      document.getElementById("plotFormat").selectedIndex
    ].value;
  const nvgPlotFormat =
    plotFormat === "nvg" &&
    document.getElementById("nvgPlotFormat").options[
      document.getElementById("nvgPlotFormat").selectedIndex
    ].value;

  var feats = [];

  var count =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;

  for (let i = 1; i <= count; i++) {
    var feature = new Object();
    feature.overlayId = "OVL_RGP";
    feature.name = "NAME " + i;
    feature.featureId = "NAME " + i;
    feature.format = plotFormat;
    var feat = new Object();
    feat.type = "point";
    if (plotFormat === "app6b") {
      feat.symbolCode =
        app6bSymbolCodes[parseInt(Math.random() * app6bSymbolCodes.length)];
    } else if (plotFormat === "app6d") {
      feat.symbolCode =
        app6dSymbolCodes[parseInt(Math.random() * app6dSymbolCodes.length)];
    } else if (plotFormat === "nvg") {
      if (nvgPlotFormat === "app6b") {
        feat.symbolCode =
          app6bSymbolCodes[parseInt(Math.random() * app6bSymbolCodes.length)];
      } else if (nvgPlotFormat === "app6d") {
        feat.symbolCode =
          app6dSymbolCodes[parseInt(Math.random() * app6dSymbolCodes.length)];
      }
    }

    // set a default coordinate
    feat.coordinates = [0, 0];
    feature.feature = feat;

    var properties = new Object();
    const isC4ISRPayload = document.getElementById(
      "generate-c4isr-payload"
    ).checked;
    if (isC4ISRPayload) {
      properties.nmapC4isrObj = {};
      properties.nmapC4isrObj.labelData = {
        identificationNumber: Math.random()
          .toString(36)
          .substring(7)
          .toUpperCase(),
        specialDescription:
          Math.random().toString(36).substring(2).toUpperCase() +
          Math.random().toString(36).substring(2).toUpperCase(),
        speed: Math.floor(Math.random() * 100), // random speed from 0 - 100
        country: countryCodes[Math.floor(Math.random() * countryCodes.length)],
        type: Math.floor(Math.random) ? "Civilian" : "Military",
      };
    }
    properties.modifiers = {};
    const useRandomSpeedLeader = document.getElementById(
      "generate-random-speed-leader"
    ).checked;
    if (useRandomSpeedLeader) {
      properties.modifiers["AJ"] =
        (getRandomInt(300) + Math.random()).toString() +
        "," +
        getRandomInt(180).toString();
    }
    feature.properties = properties;
    feats[i - 1] = feature;
  }

  return feats;
};

const setObjectLocations = (featuresArray, startX, startY) => {
  var count =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;
  const nvgPlotFormat =
    plotFormat === "nvg" &&
    document.getElementById("nvgPlotFormat").options[
      document.getElementById("nvgPlotFormat").selectedIndex
    ].value;

  for (let i = 0; i < count; i++) {
    var feature = featuresArray[i];

    const featureX = startX + Math.random() * 5 * 3;
    const featureY = startY + Math.random() * 3 * 3;
    feature.feature.coordinates = [featureX, featureY];

    if (plotFormat === "nvg") {
      feature.feature = encodeURI(
        `<point symbol="${nvgPlotFormat}:${feature.feature.symbolCode}" x="${featureX}" y="${featureY}" />`
      );
    }
  }

  return featuresArray;
};

const sendFeaturesByPlot = (featuresArray) => {
  var mess = new Object();

  var plotFormat =
    document.getElementById("plotFormat").options[
      document.getElementById("plotFormat").selectedIndex
    ].value;
  var count =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;
  const nvgPlotFormat =
    plotFormat === "nvg" &&
    document.getElementById("nvgPlotFormat").options[
      document.getElementById("nvgPlotFormat").selectedIndex
    ].value;

  mess.format = plotFormat;
  var limit = useWebRTC ? 500 : count;
  var batches = count < limit + 1 ? 1 : Math.floor(count / limit);
  var remainder = count % limit;
  console.log(
    `Number of Objects: ${count}. Size of batch ${limit}. Number of batches: ${
      batches + 1
    }`
  );
  var offset = 0;
  var batchCount = 0;
  var numProcessed = 0;

  for (let j = 0; j < batches; j++) {
    batchCount = batches == 1 && remainder != 0 ? remainder : limit;
    if (batchCount <= 0) {
      break;
    }

    const subset = featuresArray.slice(
      numProcessed,
      numProcessed + batchCount + 1
    );
    numProcessed += batchCount;

    mess.features = subset;
    mess.overlayId = "OVL_RGP";
    //mess.zoom = (zoom === undefined) ? true : zoom;
    mess.readOnly = false;

    let payload;
    let message_channel;
    const useMapFeaturePlot = document.getElementById(
      "generate-payload-with-mapfeatureplot"
    ).checked;
    if (useMapFeaturePlot) {
      message_channel = "map.feature.plot";
      mess.features.forEach((featurePayload) => {
        payload = {
          overlayId: "OVL_RMP",
          name: featurePayload.name,
          featureId: featurePayload.featureId,
          format: mess.format,
          feature: featurePayload.feature,
          zoom: mess.readOnly,
        };
        processMessage(message_channel, JSON.stringify(payload));
      });
    } else {
      payload = JSON.parse(JSON.stringify(mess, undefined, 4));
      message_channel = "map.feature.plot.batch";
      processMessage(message_channel, JSON.stringify(payload));
    }

    offset += limit;
  }

  return featuresArray;
};

const sendFeaturesByUpdate = (featuresArray) => {
  var updateBatchMsg = new Object();

  var plotFormat =
    document.getElementById("plotFormat").options[
      document.getElementById("plotFormat").selectedIndex
    ].value;
  var count =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;
  const nvgPlotFormat =
    plotFormat === "nvg" &&
    document.getElementById("nvgPlotFormat").options[
      document.getElementById("nvgPlotFormat").selectedIndex
    ].value;

  var limit = useWebRTC ? 500 : count;
  var batches = count < limit + 1 ? 1 : Math.floor(count / limit);
  var remainder = count % limit;
  console.log(
    `Number of Objects: ${count}. Size of batch ${limit}. Number of batches: ${
      batches + 1
    }`
  );
  var offset = 0;
  var batchCount = 0;

  for (let j = 0; j < batches; j++) {
    batchCount = batches == 1 && remainder != 0 ? remainder : limit;
    if (batchCount <= 0) {
      break;
    }

    var featUpdates = [];

    for (let i = 0; i < batchCount; i++) {
      var props = new Object();
      var location = new Object();
      var featureUpdate = new Object();
      var feature = featuresArray[i + offset];

      props.location = {
        lon: feature.feature.coordinates[0],
        lat: feature.feature.coordinates[1],
      };

      featureUpdate = {
        featureId: feature.featureId,
        properties: props,
      };

      featUpdates[i + offset] = featureUpdate;
    }

    updateBatchMsg.updates = featUpdates;

    let payload;
    let message_channel;
    JSON.stringify();
    payload = JSON.parse(JSON.stringify(updateBatchMsg, undefined, 4));
    message_channel = "map.feature.update.batch";
    processMessage(message_channel, JSON.stringify(payload));

    offset += batchCount;
  }

  return featuresArray;
};

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

var generateRandomObjects = function () {
  var count =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;
  sendRandomObjects(count);
};

const processMessages = (jsonStrPayload) => {
  const messages = JSON.parse(jsonStrPayload);
  messages.forEach((message) =>
    processMessage(message.channel, JSON.stringify(message.payload))
  );
};

var sendPostMessage = (message, target) => {
  if (vcwindow != null) {
    vcwindow.postMessage(message, target);
    console.log(`Send Post Message.`);
  }
};

var sendWebRTC = (message) => {
  if (dataChannelOut != null) {
    if (dataChannelOut.readyState === "open") {
      dataChannelOut.send(JSON.stringify(message));
      console.log(`Send WebRTC Message.`);
    } else {
      console.log(`Data Channel not open. State: ${dataChannelOut.readyState}`);
    }
  } else {
    console.log(`Data Channel is null.`);
  }
};

var processMessage = function (message_channel, message_payload) {
  var json_payload = JSON.parse(message_payload);
  if (message_channel.startsWith("nmap.app.status.state")) {
  } else {
    const channelDisplay = document.getElementById("channelDisplay");
    if (channelDisplay) {
      channelDisplay.value = message_channel;
    }
    const payloadDisplay = document.getElementById("payloadDisplay");
    if (payloadDisplay) {
      payloadDisplay.value = JSON.stringify(json_payload, undefined, 4);
    }
  }
  // for map.feature related channels, wait for mapReady
  let geoViewReadyToReceiveMessages$ = geoViewReady$.pipe(
    rxjs.operators.filter((ready) => ready)
  );
  if (message_channel.startsWith("map.feature")) {
    geoViewReadyToReceiveMessages$ = geoViewReadyToReceiveMessages$.pipe(
      rxjs.operators.mergeMap((_) =>
        geoViewMapReady$.pipe(rxjs.operators.filter((ready) => ready))
      )
    );
  }

  startGeoView();

  geoViewReadyToReceiveMessages$
    .pipe(
      rxjs.operators.filter((ready) => ready),
      rxjs.operators.take(1)
    )
    .subscribe((_) => {
      logMessage("To GV:", message_channel, json_payload);
      var message = {
        channel: message_channel,
        payload: json_payload,
        senderId: "vcDemo",
      };
      console.log("Process Message. Message Channel: " + message_channel);
      if (useWebRTC) {
        sendWebRTC(message);
      } else {
        sendPostMessage(message, vcwindow.location.href);
      }
    });
};

const sendNmapiManual = () => {
  const messageChannel = document.getElementById("channelDisplay").value;
  const jsonPayload = document.getElementById("payloadDisplay").value;
  processMessage(messageChannel, jsonPayload);
};
const sendNVG = () => {
  var mess = new Object();
  mess.overlayId = "OVL_RGP";
  var plotFormat = "nvg";
  mess.format = plotFormat;
  var featurePayload = document
    .getElementById("nvgPayloadDisplay")
    .value.split(/\r?\n/);
  var i = 0;
  var feats = [];
  featurePayload.forEach((nvgFeature) => {
    var feature = new Object();
    feature.overlayId = "OVL_RGP";
    feature.name = "NAME " + i;
    feature.featureId = "NAME " + i;
    feature.format = plotFormat;
    feature.feature = encodeURI(nvgFeature);

    var properties = new Object();
    properties.nmapC4isrObj = {};
    properties.nmapC4isrObj.labelData = {
      identificationNumber: Math.random()
        .toString(36)
        .substring(7)
        .toUpperCase(),
      specialDescription:
        Math.random().toString(36).substring(2).toUpperCase() +
        Math.random().toString(36).substring(2).toUpperCase(),
      speed: Math.floor(Math.random() * 100), // random speed from 0 - 100
      country: countryCodes[Math.floor(Math.random() * countryCodes.length)],
      type: Math.floor(Math.random) ? "Civilian" : "Military",
    };
    properties.modifiers = {};
    const useRandomSpeedLeader = document.getElementById(
      "generate-random-speed-leader"
    ).checked;
    if (useRandomSpeedLeader) {
      properties.modifiers["AJ"] =
        (getRandomInt(300) + Math.random()).toString() +
        "," +
        getRandomInt(180).toString();
    }
    feature.properties = properties;
    feats[i] = feature;
    i++;
  });
  mess.features = feats;
  mess.zoom = true;
  mess.readOnly = false;

  let payload;
  let message_channel;
  const useMapFeaturePlot = false; // In case we want to send as individual plots instead of batch.
  if (useMapFeaturePlot) {
    message_channel = "map.feature.plot";
    var i = 0;
    mess.features.forEach((featurePayload) => {
      payload = {
        overlayId: "OVL_RMP",
        name: featurePayload.name,
        featureId: featurePayload.featureId,
        format: mess.format,
        feature: featurePayload.feature,
        zoom: mess.zoom,
      };
      processMessage(message_channel, JSON.stringify(payload));
    });
  } else {
    payload = mess;
    message_channel = "map.feature.plot.batch";
    processMessage(message_channel, JSON.stringify(payload));
  }
};
const spamSend = () => {
  const messageChannelSpam = document.getElementById("channelDisplay").value;
  const jsonPayloadSpam = document.getElementById("payloadDisplay").value;
  const intervalTime = document.getElementById("intervalTimer").value;
  const timeout = document.getElementById("timeoutValue").value * 1000;
  processMessage(messageChannelSpam, jsonPayloadSpam);
  var interval = setInterval(
    processMessage,
    intervalTime,
    messageChannelSpam,
    jsonPayloadSpam
  );
  setTimeout(() => {
    clearInterval(interval);
  }, timeout);
};
const removeLogs = () => {
  document.getElementById("log-table-header").innerHTML = "";
  document.getElementById("log-table-body").innerHTML = "";
  document.getElementById("log-filters").innerHTML = "";
};

const toggleChannelFilter = (channel) => {
  const originalFilter = logChannels.get(channel);
  console.log("originalFilter:", originalFilter);
  logChannels.set(channel, !originalFilter);
  console.log("channel: ", logChannels.get(channel));
  renderLogView();
};

const updateLogFilterView = () => {
  const logFilters = document.getElementById("log-filters");
  logFilters.innerHTML = "";
  logChannels.forEach((display, channel) => {
    const label = document.createElement("label");
    label.setAttribute("class", "checkbox-inline");
    const input = document.createElement("input");
    input.setAttribute("type", "checkbox");
    input.setAttribute("value", channel);
    input.checked = display;
    input.setAttribute("onclick", `toggleChannelFilter("${channel}")`);
    label.appendChild(input);
    const text = document.createTextNode(channel);
    label.appendChild(text);
    logFilters.appendChild(label);
  });
};

const renderLogView = () => {
  cleanupLogChannels();
  document.getElementById("log-table-header").innerHTML = `
    <tr>
    <th></th>
    <th>channel</th>
    <th>Payload</th>
    <th>Time</th>
    </tr>
    `;
  const tableBody = document.getElementById("log-table-body");
  tableBody.innerHTML = "";
  logs
    .filter((log) => logChannels.get(log.channel))
    .forEach((log) => {
      const trElement = document.createElement("tr");
      const type = document.createElement("td");
      type.innerHTML = log.prefix;

      const channel = document.createElement("td");
      channel.innerHTML = log.channel;

      const payload = document.createElement("td");
      payload.innerHTML =
        "<pre>" + JSON.stringify(log.data, undefined, 2) + "</pre>";

      const time = document.createElement("td");
      const dateObj = new Date(log.timeStamp);
      time.innerHTML =
        dateObj.getHours() +
        ":" +
        dateObj.getMinutes() +
        ":" +
        dateObj.getSeconds() +
        ":" +
        dateObj.getMilliseconds();
      trElement.appendChild(type);
      trElement.appendChild(channel);
      trElement.appendChild(payload);
      trElement.appendChild(time);
      tableBody.prepend(trElement);
    });
  updateLogFilterView();
};

const turnOffLogDisplay = () => {
  displayLog = false;
  updateLogsHeader();
  removeLogs();
};
const turnOnLogDisplay = () => {
  displayLog = true;
  updateLogsHeader();
  renderLogView();
};
const updateLogsHeader = () => {
  const statusText = displayLog ? "ON" : "OFF";
  document.getElementById("logs-header").innerHTML = `Logs ${statusText}`;
};

const toggleLogDisplay = () => {
  const logDisplayOn = document.getElementById("display-log-checkbox").checked;
  if (!logDisplayOn) {
    console.log("turning display off");
    turnOffLogDisplay();
  } else {
    console.log("turning display on");
    turnOnLogDisplay();
  }
};

const purgeLogs = () => {
  logs.splice(0);
  if (displayLog) {
    renderLogView();
  }
};

const switchToWebRTC = () => {
  useWebRTC = true;
  initWebRTC();
};
const switchToPostMessage = () => {
  useWebRTC = false;
};
const startGeoView = (startWithWebRTC) => {
  if (startWithWebRTC) {
    startGeoViewWebRTC$.subscribe();
  } else {
    startGeoView$.subscribe();
  }
};
const startVideoPlayer = () => {
  const videoURL =
    "https%3A%2F%2Fs3.eu-central-1.amazonaws.com%2Fpipe.public.content%2Fshort.mp4";
  const filename = "Wearing my short shorts";
  const videoPlayerURL = `http://localhost:4204/#/video?url=${videoURL}&filename=${filename}`;
  window.open(
    videoPlayerURL,
    "Video Player",
    "_parent,height=486,width=720, noopener"
  );
};
const toggleCommunication = () => {
  const useWebRTCOn = document.getElementById("use-webRTC-checkbox").checked;
  if (useWebRTCOn) {
    console.log("Switching to WebRTC");
    switchToWebRTC();
  } else {
    console.log("Switching to PostMessage");
    switchToPostMessage();
  }
};
let generateRandomObjectTimer;
const sendRandomObjectsRepeatedly = () => {
  const numberOfObjects =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;
  const intervalTime = document.getElementById("repeatedInterval").value;
  console.log("sending ", numberOfObjects, " objects in", intervalTime, "ms");
  sendRandomObjects(numberOfObjects, false);
  generateRandomObjectTimer = setTimeout((_) => {
    sendRandomObjectsRepeatedly(numberOfObjects);
  }, intervalTime);
};

const stopSendingRandomObjectsRepeatedly = () => {
  clearTimeout(generateRandomObjectTimer);
};

const startUpdateIntervalTest = () => {
  var objects = createRandomObjects();
  objects = setObjectLocations(objects, -87, 31);
  sendFeaturesByPlot(objects);

  const intervalTime = document.getElementById("updateInterval").value;
  generateRandomObjectTimer = setTimeout((_) => {
    runUpdateIntervalTest(objects);
  }, intervalTime);
};

let revertLocations = true;
const runUpdateIntervalTest = (objects) => {
  const numberOfObjects =
    document.getElementById("generate_count").options[
      document.getElementById("generate_count").selectedIndex
    ].value;
  const intervalTime = document.getElementById("updateInterval").value;
  console.log("sending ", numberOfObjects, " objects in", intervalTime, "ms");

  if (revertLocations) {
    revertLocations = false;
    objects = setObjectLocations(objects, -87, 31);
  } else {
    revertLocations = true;
    objects = setObjectLocations(objects, -52, 44);
  }

  sendFeaturesByUpdate(objects);

  generateRandomObjectTimer = setTimeout((_) => {
    runUpdateIntervalTest(objects);
  }, intervalTime);
};

const stopUpdateIntervalTest = () => {
  clearTimeout(generateRandomObjectTimer);
};

const toggleNvgPlotFormat = () => {
  const plotFormat =
    document.getElementById("plotFormat").options[
      document.getElementById("plotFormat").selectedIndex
    ].value;
  if (plotFormat === "nvg") {
    document.getElementById("nvgPlotFormat").style.display = "inline-block";
  } else {
    document.getElementById("nvgPlotFormat").style.display = "none";
  }
};
