function clickcreateoffer() {
  console.log("clickcreateoffer");
  peerConnection = createPeerConnection(lasticecandidate);
  dataChannel = peerConnection.createDataChannel("chat");
  dataChannel.onopen = datachannelopen;
  dataChannel.onmessage = datachannelmessage;
  createOfferPromise = peerConnection.createOffer();
  createOfferPromise.then(createOfferDone, createOfferFailed);
}

function createOfferDone(offer) {
  console.log("createOfferDone");
  setLocalPromise = peerConnection.setLocalDescription(offer);
  setLocalPromise.then(setLocalDone, setLocalFailed);
}

function createOfferFailed(reason) {
  console.log("createOfferFailed");
  console.log(reason);
}

var answeringWindow = null;

function setLocalDone() {
  console.log("setLocalDone");
}

function setLocalFailed(reason) {
  console.log("setLocalFailed");
  console.log(reason);
}

function lasticecandidate() {
  console.log("lasticecandidate");
  offer = peerConnection.localDescription;
  offerString = JSON.stringify(offer);

  answeringWindow = window.open(
    "answering.html?sdp=" + offerString,
    "answering",
    "left=600,height=900,width=1200,noopener"
  );
}

function clickoffersent() {
  console.log("clickoffersent");
}

function setRemoteDone() {
  console.log("setRemoteDone");
}

function setRemoteFailed(reason) {
  console.log("setRemoteFailed");
  console.log(reason);
}

let offerString = "";
window.addEventListener("load", clickcreateoffer);

window.addEventListener("storage", (event) => {
  if (event.key == "offer") {
    answer = JSON.parse(event.newValue);
    setRemotePromise = peerConnection.setRemoteDescription(answer);
    setRemotePromise.then(setRemoteDone, setRemoteFailed);
    localStorage.removeItem("offer");
  }
});
