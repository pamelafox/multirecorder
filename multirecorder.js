(function(window) {

  var WORKER_PATH = "multirecorder-worker.js";

  var Recorder = function(source, cfg) {

    var config = cfg || {};
    var bufferLen = config.bufferLen || 4096;
    this.context = source.context;
    this.pausePoints = [];
    this.node = this.context.createJavaScriptNode(bufferLen, 2, 2);
    var worker = new Worker(config.workerPath || WORKER_PATH);
    worker.postMessage({
      command: "init",
      config: {
        sampleRate: this.context.sampleRate
      }
    });
    var recording = false;

    function makeCallback(callback) {
      if (!callback) {
        throw new Error("Callback not set");
      }
      var callbackId = "RecorderCallback" +
        Math.round(Math.random() * 1000001);
      window[callbackId] = function(json) {
        callback(json);
        delete window[callbackId];
      };
      return callbackId;
    }

    function sendMessage(message, callback) {
      if (callback) {
        message.callbackId = makeCallback(callback);
      }
      worker.postMessage(message);
    }

    this.node.onaudioprocess = function(e) {
      if (!recording) {
        return;
      }
      sendMessage({
        command: "record",
        buffer: [
          e.inputBuffer.getChannelData(0),
          e.inputBuffer.getChannelData(1)
        ]
      });
    };

    this.configure = function(cfg) {
      for (var prop in cfg) {
        if (cfg.hasOwnProperty(prop)) {
          config[prop] = cfg[prop];
        }
      }
    };

    this.record = function() {
      recording = true;
    };

    this.stop = function() {
      recording = false;
    };

    this.isRecording = function() {
      return recording;
    };

    this.clear = function() {
      sendMessage({command: "clear"});
    };

    this.finishRecording = function(cb) {
      var self = this;

      var onFinish = function(exported) {
        self.wav = exported.wav;
        self.samples = exported.samples;
        cb(self);
      };

      sendMessage({
        command: "finishRecording"
      }, onFinish);
    };

    this.combineRecordings = function(cb, recordings) {
      var self = this;

      var samples = [];
      for (var i = 0; i < recordings.length; i++) {
        samples.push(recordings[i].samples);
      }

      var onFinish = function(exported) {
        self.wav = exported.wav;
        self.samples = exported.samples;
        cb(self);
      };

      sendMessage({
        command: "combineRecordings",
        samples: samples
      }, onFinish);
    };

    this.createAudioPlayer = function() {
      var url = URL.createObjectURL(this.wav);
      var au = document.createElement("audio");
      au.controls = true;
      au.src = url;
      return au;
    };

    this.createDownloadLink = function() {
      var url = URL.createObjectURL(this.wav);
      var hf = document.createElement("a");
      hf.href = url;
      hf.download = new Date().toISOString() + ".wav";
      hf.innerHTML = hf.download;
      return hf;
    };

    worker.onmessage = function(e) {
      var callbackId = e.data.callbackId;
      if (callbackId) {
        window[callbackId](e.data.result);
      }
    };

    source.connect(this.node);
    this.node.connect(this.context.destination); //this should not be necessary
  };

  // We create this object so that we only
  // have to request getUserMedia once per app
  function MultiRecorder() {
    var audioContext;
    var source;
    var currentRecording;

    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    navigator.getUserMedia = navigator.getUserMedia ||
      navigator.webkitGetUserMedia;
    window.URL = window.URL || window.webkitURL;

    this.isRecording = function() {
      return currentRecording && currentRecording.isRecording();
    };

    this.startRecording = function(delaySeconds) {
      var deferred = jQuery.Deferred();
      if (!window.AudioContext || !navigator.getUserMedia) {
        deferred.reject("Audio recording does not work in this browser");
      }

      function startRecordingForReal() {
        currentRecording = new Recorder(source);

        if (delaySeconds) {
          var delayTimer = window.setInterval(function() {
            if (delaySeconds === 0) {
              deferred.resolve(currentRecording);
              currentRecording.record();
              window.clearInterval(delayTimer);
            } else {
              deferred.notify(delaySeconds);
              delaySeconds--;
            }
          }, 1000);
        } else {
          currentRecording.record();
        }
      }

      if (!audioContext) {
        audioContext = new AudioContext();
        navigator.getUserMedia({audio: true}, function(stream) {
          source = audioContext.createMediaStreamSource(stream);
          source.connect(audioContext.destination);
          startRecordingForReal();
        }, function() {
          deferred.reject("Error getting mic input");
        });
      } else {
        startRecordingForReal();
      }
      return deferred;
    };

    this.stopRecording = function() {
      var deferred = jQuery.Deferred();
      currentRecording.stop();
      currentRecording.finishRecording(function() {
        deferred.resolve(currentRecording);
        });
      return deferred;
    };

    this.combineRecordings = function(recordings) {
      var deferred = jQuery.Deferred();
      // This recorder is only used for its encoding functionality
      var combined = new Recorder(source);
      combined.combineRecordings(function() {
        deferred.resolve(combined);
        }, recordings);
      return deferred;
    };
  }

  window.MultiRecorder = MultiRecorder;

})(window);
