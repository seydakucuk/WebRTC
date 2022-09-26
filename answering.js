function clickofferpasted() {
  console.log("clickremoteoffer");
  peerConnection = createPeerConnection(lasticecandidate);
  peerConnection.ondatachannel = handledatachannel;
  textelement = document.getElementById("textoffer");
  textelement.readOnly = true;
  offer = JSON.parse(textelement.value);
  setRemotePromise = peerConnection.setRemoteDescription(offer);
  setRemotePromise.then(setRemoteDone, setRemoteFailed);
}

function acceptOffer() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const offerString = urlParams.get("sdp");

  console.log("clickremoteoffer");
  peerConnection = createPeerConnection(lasticecandidate);
  peerConnection.ondatachannel = handledatachannel;
  offer = JSON.parse(offerString);
  setRemotePromise = peerConnection.setRemoteDescription(offer);
  setRemotePromise.then(setRemoteDone, setRemoteFailed);
}

function setRemoteDone() {
  console.log("setRemoteDone");
  createAnswerPromise = peerConnection.createAnswer();
  createAnswerPromise.then(createAnswerDone, createAnswerFailed);
}

function setRemoteFailed(reason) {
  console.log("setRemoteFailed");
  console.log(reason);
}

function createAnswerDone(answer) {
  console.log("createAnswerDone");
  setLocalPromise = peerConnection.setLocalDescription(answer);
  setLocalPromise.then(setLocalDone, setLocalFailed);
}

function createAnswerFailed(reason) {
  console.log("createAnswerFailed");
  console.log(reason);
}

function setLocalDone() {
  console.log("setLocalDone");
}

function setLocalFailed(reason) {
  console.log("setLocalFailed");
  console.log(reason);
}

function lasticecandidate() {
  console.log("lasticecandidate");
  textelement = document.getElementById("textanswer");
  answer = peerConnection.localDescription;
  localStorage.setItem("offer", JSON.stringify(answer));
}

function handledatachannel(event) {
  console.log("handledatachannel");
  dataChannel = event.channel;
  dataChannel.onopen = datachannelopen;
  dataChannel.onmessage = datachannelmessage;
}

window.addEventListener("load", acceptOffer);
