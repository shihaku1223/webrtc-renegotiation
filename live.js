/* eslint-env browser */
var csrftoken = Cookies.get('csrftoken');
const pc = new RTCPeerConnection({
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302'
    }]
});

const log = msg => {
    document.getElementById('logs').innerHTML += msg + '<br>'
}

// icecandidate to send to forwarder for the first Negotiation
const icecandidates = []
var icecandidatesSent = false

var receiveChannel
var dataChannel
var isSendAudio = false

const handleDataChannelMessageReceived = (event) =>{
  console.log("dataChannel.OnMessage:", event, event.data.type);
  if (typeof event.data === 'string' || event.data instanceof String) {
      console.log('Incoming string message: ' + event.data);
      
      const message = JSON.parse(event.data)
      console.log(message)
      if ("sdp" in message) {
        log("Got SDP Message")
        const answerString = atob(message.sdp)
        const answer = JSON.parse(answerString)
        console.log(answer.type)
        if (answer.type != "answer") {
            log("Need answer SDP not" + answer.type)
            return
        }
        pc.setRemoteDescription(answer).then( async () => {
            log("Set answer SDP done")
            console.log("setRemoteDescription done")
        })
      } 
      if ("icecandidate" in message) {
        log("Got icecandidate Message")
        const icecandidateString = atob(message.icecandidate)
        const icecandidate = JSON.parse(icecandidateString)
        console.log(icecandidate)
        pc.addIceCandidate(icecandidate).catch( async () => {
            log("addIceCandidate error")
            console.log("addIceCandidate error")
        })
      }
  } else {
      console.log('Incoming data message');
  }
  //dataChannel.send("Hi! (from browser)");
};

const handleDataChannelOpen = (event) =>{
  console.log("dataChannel.OnOpen", event);
  if (!icecandidatesSent) {
    icecandidates.forEach(async (ice) => {
        const iceValue = JSON.stringify(ice)
        console.log(iceValue)
        const candidate = btoa(iceValue)
        const iceMessage = JSON.stringify({'icecandidate': candidate})
        console.log(iceMessage)
        dataChannel.send(iceMessage)
    })
    //icecandidates = []
    icecandidatesSent = true
  }
};

const handleDataChannelError = (error) =>{
    console.log("dataChannel.OnError:", error);
};

const handleDataChannelClose = (event) =>{
    console.log("dataChannel.OnClose", event);
};

function setError(text) {
    console.error(text)
}

const handleRemoteDataChannelOpen = (event) =>{
    console.log("remote dataChannel.OnOpen", event);
};

const handleRemoteDataChannelMessageReceived = (event) =>{
    console.log("remote dataChannel.OnMessage:", event, event.data.type);

    if (typeof event.data === 'string' || event.data instanceof String) {
        console.log('Incoming string message: ' + event.data);
    } else {
        console.log('Incoming data message');
    }
    receiveChannel.send("Hi! (from browser)")
};

function onDataChannel(event) {
    console.log("Incoming Data channel created");
    receiveChannel = event.channel;
    receiveChannel.onopen = handleRemoteDataChannelOpen;
    receiveChannel.onmessage = handleRemoteDataChannelMessageReceived;
    receiveChannel.onerror = handleDataChannelError;
    receiveChannel.onclose = handleDataChannelClose;
}

startNegotiation = (cameraId) => {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/viewer_connect", true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-CSRFToken', csrftoken);
    xhr.onreadystatechange = () => {
        if (xhr.readyState == XMLHttpRequest.DONE) {

            try {
                const answer = JSON.parse(atob(xhr.responseText))
                console.log(answer)
		
                if (xhr.status == 200) {
                    pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(atob(xhr.responseText))))
                } else if (xhr.status == 502) {
                    document.getElementById("offline").removeAttribute("class");
                } else if (xhr.status == 429) {
                    alert("ERROR: Too many viewer connections");
                } else {
                    alert("Unexpected status code " + xhr.status + "\n" + resp["error"]);
                }
            } catch (e) {
                alert(e)
            }
        }
    }

    console.log(JSON.stringify(pc.localDescription))

    var request = {
	"camera_id": cameraId,
        "sdp": btoa(JSON.stringify(pc.localDescription)),
    }
    console.log(request)
    xhr.send(JSON.stringify(request));
}

window.startSession = () => {
    const sd = document.getElementById('remoteSessionDescription').value
    if (sd === '') {
        return alert('Session Description must not be empty')
    }
    try {
        pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(atob(sd))))
    } catch (e) {
	console.log(e)
    }
}

initPeerConnection = async () => {

    pc.ontrack = event => {
        const el = document.createElement(event.track.kind);
        el.srcObject = event.streams[0];
        el.muted = true;
        el.autoplay = true;
        el.controls = true;
        document.getElementById('remoteVideos').appendChild(el);
    }

    dataChannel = pc.createDataChannel("bidi-channel-v0", null)
    dataChannel.onopen = handleDataChannelOpen;
    dataChannel.onmessage = handleDataChannelMessageReceived;
    dataChannel.onerror = handleDataChannelError
    dataChannel.onclose = handleDataChannelClose

    pc.oniceconnectionstatechange =  (event) => {
        log("iceconnectionstate:" + pc.iceConnectionState)
    };

    pc.onicecandidate = (event) => {
        // We have a candidate, send it to the remote party with the
        // same uuid
        if (event.candidate == null) {
            console.log("ICE Candidate was null, done");
            return;
        }
        console.log("send ice candidate")
    
        if (icecandidatesSent) {
            const candidate = btoa(JSON.stringify(event.candidate))
            const iceMessage = JSON.stringify({'icecandidate': candidate})
            dataChannel.send(iceMessage)
        } else {
            icecandidates.push(event.candidate)
        }
    };

    pc.ondatachannel = onDataChannel;
    // default audio, video Transceiver
    pc.addTransceiver('audio', {'direction': 'recvonly'});
    pc.addTransceiver('video', {'direction': 'recvonly'});
    
    pc.onnegotiationneeded = async () => {
        log("onnegotiationneeded")

        // Get audio transceiver
        const currentAudioTransceivers = pc.getTransceivers().filter(tr => tr.receiver.track.kind == 'audio');
        const currentAudioTransceiverCount = currentAudioTransceivers.length
        log("AudioTransceiver count:" + currentAudioTransceiverCount)

        try {
            makingOffer = true;
    
            log("createOffer")
            pc.createOffer({
                offerToReceiveAudio: 1,
                offerToReceiveVideo: 1,
            })
            .then((offer) => {
                return pc.setLocalDescription(offer)
            })
            .then(() => {
                log("send SDP Message")
                console.log("do renego")
                var sdp = btoa(JSON.stringify(pc.localDescription))
                var sdpMessage = JSON.stringify({'sdp': sdp})
                console.log(sdpMessage)
                dataChannel.send(sdpMessage)
            })
        } catch (err) {
            handleIncomingError(err);
        } finally {
            makingOffer = false;
        }
    };
}

startSession = async () => {
    initPeerConnection()
    var cameraIdInput = document.getElementById('camera-id');
    console.log(cameraIdInput.value)
    await pc.setLocalDescription(await pc.createOffer());

    startNegotiation(cameraIdInput.value);
}

sendMessage = async () => {
    console.log(dataChannel)
    dataChannel.send("message from browser")
}

function getLocalStream() {
    var constraints;
    var textarea = document.getElementById('constraints');
    try {
        constraints = JSON.parse(textarea.value);
    } catch (e) {
        console.error(e);
        setError('ERROR parsing constraints: ' + e.message + ', using default constraints');
        constraints = default_constraints;
    }
    console.log(JSON.stringify(constraints));

    // Add local stream
    if (navigator.mediaDevices.getUserMedia) {
        return navigator.mediaDevices.getUserMedia(constraints);
    } else {
        errorUserMediaHandler();
    }
}

let playLocalStream = (stream, kind) => {
    var el = document.createElement(kind)
    el.srcObject = stream
    el.autoplay = true
    el.muted = true
    el.controls = true

    document.getElementById('localVideos').appendChild(el)
}

addLocalTrack = async () => {
    getLocalStream()
        .then(stream => {
            stream.getTracks().forEach(function(track) {
                console.log(track.kind)
                console.log(stream)
                isSendAudio = true

                const currentAudioTransceivers = pc.getTransceivers().filter(tr => tr.receiver.track.kind == 'audio');
                // add Transceiver 
                if (currentAudioTransceivers.length == 0) {
                    pc.addTransceiver(track, {streams: [stream], direction: 'sendrecv'});
                } else  {
                    // replace current sender with audio track
                    currentAudioTransceivers.forEach((t) => {
                        t.direction = "sendrecv"
                        t.sender.replaceTrack(track)
                    })
                }

                playLocalStream(stream, track.kind)
            });

        })
        .catch(setError)
}

removeLocalTrack = async () => {
    isSendAudio = false

    const currentAudioTransceivers = pc.getTransceivers().filter(tr => tr.receiver.track.kind == 'audio');
    // there is no audio track has been added
    if (currentAudioTransceivers.length == 0) {
        return
    } else  {
        // remove audio track from connection
        currentAudioTransceivers.forEach((t) => {
            t.direction = "recvonly"
            t.sender.replaceTrack(null)
        })
    }

    let localVideosElement = document.getElementById('localVideos')
    localVideosElement.childNodes.forEach( (child) => {
        localVideosElement.removeChild(child)
    })
}