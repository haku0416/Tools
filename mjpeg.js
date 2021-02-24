/* eslint-disable no-unused-vars */
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for
// full license information.

let queue = new Uint8Array();
let isPaused = true;
let websocket;
let buffer;

let foundJpegHead = false;
let frameCount = 0;

function renderImage(imgBuffer)
{
    frameCount++;
    console.log('renderImage... frame#=' + frameCount + ", len=" + imgBuffer.byteLength);

    var packet = new Uint8Array(imgBuffer);
    console.log('image... head=' + packet[0].toString() + ", " + packet[1].toString() + ', end=' + packet[packet.byteLength-2].toString() + ", " + packet[packet.byteLength-1].toString());

    var i = imgBuffer.length;
    var binaryString = [i];
    while (i--) {
        binaryString[i] = String.fromCharCode(imgBuffer[i]);
    }
    var data = binaryString.join('');

    var base64 = window.btoa(data);
    var img = new Image();
    img.src = "data:image/jpeg;base64," + base64;
    //img.src = imgBuffer;
    setTimeout(function() {
        updateImage(img);
    }, 50);
}

function concatByteArray(a1, a2)
{
    var anew = new Uint8Array(a1.length + a2.length);
    anew.set(a1);
    anew.set(a2, a1.length);
    return anew;
}

function parseMediaStream(payload)
{
    try {
        if (typeof payload !== 'string') {

            console.log('parseMediaStream... ' + queue.length);
            var packet = new Uint8Array(payload);

            if (packet.length > 0)
            {
                var index = 0;
                var lastByte = null;
                var curByte = null;
                var headIndex = 0;

                if (queue.length > 0)
                {
                    lastByte = queue[queue.length-1];
                    curByte = packet[index++];
                }
                else
                {
                    lastByte = packet[index++];
                }
                curByte = packet[index++];

                while (index <= packet.length)
                {                    
                    if (foundJpegHead && lastByte == 255 && curByte == 217) // JPEG image end (FF D9)
                    {
                        console.log('found image end at ' + (index+2));
                        queue = concatByteArray(queue, packet.slice(headIndex, (index+2)));
                        renderImage(queue);
                        queue = new Uint8Array();
                        foundJpegHead = false;
                        headIndex = 0;
                    }
                    else if (lastByte == 255 && curByte == 216) // JPEG image head (FF D8)
                    {
                        console.log('found image head at ' + (index-2));

                        if (foundJpegHead)
                        {
                            queue = concatByteArray(queue, packet.slice(headIndex,index-1));
                            renderImage(queue);
                            queue = new Uint8Array();
                        }

                        headIndex = index-2;
                        if (headIndex < 0)
                        {
                            queue = new Uint8Array([0xFF]);
                            headIndex = 0;
                        }
                        foundJpegHead = true;
                    }
                    lastByte = curByte;
                    curByte = packet[index++];
                }
                if (foundJpegHead)
                {
                    queue = concatByteArray(queue, packet.slice(headIndex, index-1));
                    console.log('keep parsed data in queue ' + (index - headIndex-1) + " / " + queue.length);
                }
            }
        }
    } catch (err) {
        console.error('Exception in parsing mediastream payload!');
        console.log(err);
    }
}

function OnClickPlay() {
    console.log('OnClickPlay fired. isPaused: ' + isPaused);
    if (!isPaused || websocket) {
        return;
    }

    isPaused = false;

    websocket = new WebSocket('ws://' + document.location.hostname + ':3002');
//    websocket = new WebSocket('ws://10.168.110.53:3002');
    websocket.binaryType = 'arraybuffer';
    websocket.onopen = (event) => {
        try {
            console.log('Connection established.');
        } catch (err) {
            console.error('Exception opening websocket!');
            console.log(err);
        }
    }

    websocket.addEventListener('message', (e) => {
        console.log('New message... len=' + e.data.byteLength);
        try {
            if (typeof e.data !== 'string') {
                let payload = e.data;
                parseMediaStream(payload);
            }
        } catch (err) {
            console.error('Exception in websocket message!');
            console.log(err);
        }
    }, false);

    websocket.onerror = (event) => {
        console.error('WebSocket error!');
        console.log(event);
        console.log('WebSocket ready state: ' + websocket.readyState);
    }

    websocket.onclose = (event) => {
        let reason;
        // See http://tools.ietf.org/html/rfc6455#section-7.4.1
        if (event.code === 1000)
            reason = `Normal closure, meaning that the purpose for which the connection was established has been fulfilled.`;
        else
            reason = `Error!`;

        if (event.code !== 1000) { 
            console.error('WebSocket closed due to: ' + reason);
        } else {
            console.log('WebSocket closed due to: ' + reason);
        }

        console.log(event);

        // restart the video stream on network errors
        if (!isPaused) {
            isPaused = true;
            OnClickPlay();
        }
    }
}

function scaleRect(srcSize, dstSize) {
    var ratio = Math.min(dstSize.width / srcSize.width,
                         dstSize.height / srcSize.height);
    var newRect = {
        x: 0, y: 0,
        width: srcSize.width * ratio,
        height: srcSize.height * ratio
    };
    newRect.x = (dstSize.width/2) - (newRect.width/2);
    newRect.y = (dstSize.height/2) - (newRect.height/2);

    return newRect;
}

function updateImage(img) {
    var canvas = document.getElementById("player");
    var context = canvas.getContext("2d");
    var srcRect = {
        x: 0, y: 0,
        width: img.naturalWidth,
        height: img.naturalHeight
    };
    var dstRect = scaleRect(srcRect, {
        width: canvas.width,
        height: canvas.height
    });

    try {
        console.log("updateImage");
        context.drawImage(img,
        srcRect.x,
        srcRect.y,
        srcRect.width,
        srcRect.height,
        dstRect.x,
        dstRect.y,
        dstRect.width,
        dstRect.height
      );
      console.log(".");
      } catch (e) {
        self.stop();
        console.log("stop!");
        throw e;
      }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (websocket) {
            websocket.close(1000);
            websocket = null;
        }
        isPaused = true;
    } else {
        OnClickPlay();
    }
}, false);

window.onload = function () {
    OnClickPlay();
};