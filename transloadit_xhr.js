// Transloadit xhr file upload implementation
function TransloaditXhr(opts) {
  this.authKey = opts.authKey;
  this.templateId = opts.templateId;
  this.successCb = opts.successCb || null;
  this.errorCb = opts.errorCb || null;
  this.steps = opts.steps;
}

TransloaditXhr.prototype.checkAssemblyStatus = function(assemblyUrl) {
  var self = this;

  $.ajax({
    url: assemblyUrl,
    type: "GET",
    dataType: "json",
    success: function(data, textStatus) {
      if (data.ok && data.ok == "ASSEMBLY_COMPLETED") {
        if (typeof self.successCb === "function") {
          self.successCb(data.results);
        }
        return;
      }

      if (data.error || data.ok != "ASSEMBLY_EXECUTING") {
        if (typeof self.errorCb === "function") {
          self.errorCb("Failed to check assembly (" + textStatus + ")");
        }
        return;
      }

      setTimeout(function() {
        self.checkAssemblyStatus(assemblyUrl);
      }, 1000);
    },
    error: function(XMLHttpRequest, textStatus) {
      if (typeof self.errorCb === "function") {
        self.errorCb("Failed to check assembly (" + textStatus + ")");
      }
    }
  });
};

TransloaditXhr.prototype.uploadFile = function(file) {
  var params = {
    auth: {key: this.authKey},
    "template_id": this.templateId,
    steps: this.steps
  };
  var self = this;

  var formPost = new FormData();
  formPost.append("params", JSON.stringify(params));
  formPost.append("file", file);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "http://api2.transloadit.com/assemblies", true);

  xhr.onreadystatechange = function(event) {
    var req = event.target;

    if (req.readyState === 4) {
      if (req.status === 200) {
        var parsedData = jQuery.parseJSON(req.responseText);
        self.checkAssemblyStatus(parsedData.assembly_url);
      } else if (typeof self.errorCb === "function") {
        self.errorCb("Failed to upload file");
      }
    }
  };

  xhr.send(formPost);
};
