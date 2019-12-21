var Service, Characteristic;

const Bravia = require('bravia');
const isReachable = require('is-reachable');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-bravia-simple", "BraviaSimpleHomebridgePlatform", BraviaSimpleHomebridgePlatform);
};

function BraviaSimpleHomebridgePlatform(log, config) {
  this.log = log;
  this.tvs = config["tvs"] || [];
}

BraviaSimpleHomebridgePlatform.prototype = {

  accessories : function(callback) {
    var accessories = [];
    for (var i = 0; i < this.tvs.length; i++) {
      var tv = new BraviaHomebridgeTV(this.log, this.tvs[i]);
      accessories.push(tv);
    }
    callback(accessories);
  }
}

function BraviaHomebridgeTV(log, config) {
  this.log = log;
  this.id = "id-"+config.name;
  this.name = config.name;
  var port = config.port || 80;
  var pollInterval = config.pollinterval || 60000;
  this.services = [];
  this.inputSources = [];
  
  var inputs = config.inputs || [];
  //inputs.push({"name":"Unknown", "source": "other", "num": 1});  // TODO
  
  this.bravia = new Bravia(config.ip, port,  config.psk);

  var informationService = new Service.AccessoryInformation();
  informationService.setCharacteristic(Characteristic.Manufacturer, "BraviaSimpleHomebridgePlatform");
  informationService.setCharacteristic(Characteristic.Model, "BraviaHomebridgeTV-"+this.name);
  informationService.setCharacteristic(Characteristic.SerialNumber, this.id);
  this.services.push(informationService);
  
  this.tvService = new Service.Television(this.name);
  this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
  this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
  this.tvService.getCharacteristic(Characteristic.Active).on('set', this.setPowerState.bind(this)).on('get', this.getPowerState.bind(this));
  this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, 0); // TODO
  this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).on('set', this.setActiveIdentifier.bind(this)).on('get', this.getActiveIdentifier.bind(this));
  this.tvService.getCharacteristic(Characteristic.RemoteKey).on('set', this.setRemoteKey.bind(this));
  this.services.push(this.tvService);
  // TODO PowerModeSelection?
  // TODO Characteristic.PictureMode?
  
  this.speakerService = new Service.TelevisionSpeaker();
  this.speakerService.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);
  this.speakerService.setCharacteristic(Characteristic.Name, "speaker");
  this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
  this.speakerService.getCharacteristic(Characteristic.VolumeSelector).on('set', this.setVolumeSelector.bind(this));
  this.speakerService.getCharacteristic(Characteristic.Mute).on('get', this.getMuted.bind(this)).on('set', this.setMuted.bind(this));
  this.speakerService.getCharacteristic(Characteristic.Volume).on('get', this.getVolume.bind(this)).on('set', this.setVolume.bind(this));
  this.tvService.addLinkedService(this.speakerService);
  this.services.push(this.speakerService);
  
  //setTimeout((function(){ // TODO
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i]
      this._addInput(input, i);
    }
  //}).bind(this), 5000);
  
  setInterval(this._update.bind(this), pollInterval);
};

BraviaHomebridgeTV.prototype._addInput = function(config, inputSourceId) {
  var inputSource = new Service.InputSource(config.name, "InputSource-id-"+inputSourceId);
  
  inputSource
  .setCharacteristic(Characteristic.Identifier, 1)
  .setCharacteristic(Characteristic.ConfiguredName, "HDMI "+inputSourceId)
  .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
  .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI);
  

  inputSource.hb_config = {
      "source": "extInput:hdmi",
      "num": 1
      };
  this.services.push(inputSource);
  this.tvService.addLinkedService(inputSource);
  this.inputSources[inputSourceId] = inputSource;
  this.log("Input created:"+inputSourceId+" ");
  
  
  //var inputSource = new Service.InputSource(config.name, "InputSource-id-"+inputSourceId);
  //inputSource.setCharacteristic(Characteristic.Identifier, inputSourceId)
  //  .setCharacteristic(Characteristic.ConfiguredName, config.name)
  //  .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
  //  .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
  //  .setCharacteristic(Characteristic.InputSourceType, this._getSourceType(config.source));
  //inputSource.hb_config = config;
  //this.services.push(inputSource);
  //this.tvService.addLinkedService(inputSource);
  //this.inputSources[inputSourceId] = inputSource;
  //this.log("Input created:"+inputSourceId+" "+config.name);
};

BraviaHomebridgeTV.prototype._getSourceType = function(source) {
  if(source.indexOf("hdmi") !== -1){
    return Characteristic.InputSourceType.HDMI;
  } else if(source.indexOf("component") !== -1){
    return Characteristic.InputSourceType.COMPONENT_VIDEO;
  } else if(source.indexOf("scart") !== -1){
    return Characteristic.InputSourceType.S_VIDEO;
  } else if(source.indexOf("cec") !== -1){
    return Characteristic.InputSourceType.OTHER;
  } else if(source.indexOf("widi") !== -1){
    return Characteristic.InputSourceType.AIRPLAY;
  } else if(source.indexOf("dvb") !== -1){
    return Characteristic.InputSourceType.TUNER;
  } else if(source.indexOf("app") !== -1){
    return Characteristic.InputSourceType.APPLICATION;
  } else {
    return Characteristic.InputSourceType.OTHER;
  }
};

BraviaHomebridgeTV.prototype._update = function(config, inputSourceId) {
  var bravia = this.bravia;
  this.getActiveIdentifier((function(err, activeId) {
    if(err) {
      this.log("Background update:"+false+" "+0);
      this.tvService.getCharacteristic(Characteristic.Active).updateValue(false);
      this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(0);
    }
    else {
      this.tvService.getCharacteristic(Characteristic.Active).updateValue(true);
      this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(activeId);
      this.log("Background update:"+true+" "+activeId);
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setPowerState = function(state, callback) {
  var toPoweredOn = state === 1;
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    this.log("setPowerState to:"+toPoweredOn +" from "+ isPoweredOn);
    if(!err && toPoweredOn !== isPoweredOn) {
      bravia.system.invoke('setPowerStatus', '1.0', { status: toPoweredOn }).
      then(() => callback(null))
      .catch(error => callback(err));
    }
    else {
      callback(err);
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getPowerState = function(callback) {
  var bravia = this.bravia;
  isReachable(bravia.host+":"+bravia.port).then(isOn => {
    if(isOn) {
      return bravia.system.invoke('getPowerStatus');
    }
    else {
      return new Promise((resolve, reject) => {
        reject("Bravia '"+this.name+"' is not reachable.")
      });
    }
  }).then(info => {
    callback(null, info.status === "active" ? 1 : 0);
  })
  .catch(error => {
    callback(error);
 });
};

BraviaHomebridgeTV.prototype.setActiveIdentifier = function(identifier, callback) {
  if(identifier === this.inputSources.length -1) {
    callback(null);
    return;
  }
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      this.log("setActiveIdentifier to:"+identifier);
      var inputSource = this.inputSources[identifier];
      var config = inputSource.hb_config;
      if(config.source.indexOf("extInput:") !== -1) {
        var uri = config.source+"?port="+config.num;
        bravia.avContent.invoke('setPlayContent', '1.0', { "uri": uri}).
        then(() => { 
          callback(null)
        })
        .catch(error => callback(error));
      }
      else {
        bravia.avContent.invoke('getContentList', '1.0', { "source": config.source, "stIdx":0, "cnt": 9999}).
        then(contentList => {
          var uri = null;
          for (var i = 0; i < contentList.length; i++) {
            var content = contentList[i];
            if(config.num === Number(content.dispNum)) {
              uri = content.uri;
              break;
            }
          }
          bravia.avContent.invoke('setPlayContent', '1.0', { "uri": uri}).
          then(() => { 
            callback(null)
          })
          .catch(error => callback(error));
        })
        .catch(error => callback(error));
      }
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getActiveIdentifier = function(callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      bravia.avContent.invoke('getPlayingContentInfo', '1.0').
      then(playingContentInfo => {
        var activeId = this.inputSources.length -1;
        if(playingContentInfo) {
          var source = playingContentInfo.source;
          if(source.indexOf("extInput:") !== -1) {
            var uri = playingContentInfo.uri;
            for (var i = 0; i < this.inputSources.length; i++) {
              var inputSource = inputSources[i];
              var config = inputSource.hb_config;
              if(config.source === source && uri.indexOf("?port="+config.num)) {
                activeId = i;
                break;
              }
            }
          }
          else {
            var dispNum = playingContentInfo.dispNum;
            for (var i = 0; i < this.inputSources.length; i++) {
              var inputSource = inputSources[i];
              var config = inputSource.hb_config;
              if(config.source === source && config.num === Number(dispNum)) {
                activeId = i;
                break;
              }
            }
          }
        }
        this.log("getActiveIdentifier to:"+activeId);
        callback(null, activeId);
      })
      .catch(error => callback(error));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getMuted = function(callback) {
  this._getVolumeInformation((function(err, volumeInformation) {
    if(!err) {
      this.log("getMuted to:"+volumeInformation.mute);
      callback(err, volumeInformation.mute);
    }
    else {
      callback(err);
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setMuted = function(muted, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      this.log("setMuted to:"+muted);
      bravia.audio.invoke('setAudioMute', '1.0', { status: muted }).
      then(() => callback(null, muted))
      .catch(error => callback(error));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setVolumeSelector = function(key, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      var commandName = "VolumeDown";
      if(key === Characteristic.VolumeSelector.INCREMENT) {
        commandName = "VolumeUp";
      }
      this.log("setVolumeSelector:"+commandName);
      bravia.send(commandName).
      then(() => callback(null, key))
      .catch(error => callback(error));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getVolume = function(callback) {
  this._getVolumeInformation((function(err, volumeInformation) {
    if(!err) {
      this.log("getVolume:"+volumeInformation.volume);
      callback(err, volumeInformation.volume);
    }
    else {
      callback(err);
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setVolume = function(volume, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      this.log("setVolume:"+volume);
      bravia.audio.invoke('setAudioVolume', '1.0', { target: 'speaker', volume: ''+volume }).
      then(() => callback(null, volume))
      .catch(error => callback(error));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype._getVolumeInformation = function(callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      bravia.audio.invoke('getVolumeInformation', '1.0').
      then(volumeInformation => {
        var speaker = null;
        for (var i = 0; i < volumeInformation.length; i++) {
          if(volumeInformation[i].target === "speaker") {
            speaker = volumeInformation[i];
            break;
          }
        }
        callback(null, speaker)
      })
      .catch(error => callback(error, null));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setRemoteKey = function(key, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOn) {
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      var commandName = null;
      switch(key){
        case Characteristic.RemoteKey.REWIND:
          value="Rewind";
          break;
        case Characteristic.RemoteKey.FAST_FORWARD:
          value="Forward";
          break;
        case Characteristic.RemoteKey.NEXT_TRACK:
          value="Next";
          break;
        case Characteristic.RemoteKey.PREVIOUS_TRACK:
          value="Prev";
          break;
        case Characteristic.RemoteKey.ARROW_UP:
          value="Up";
          break;
        case Characteristic.RemoteKey.ARROW_DOWN:
          value="Down";
          break;
        case Characteristic.RemoteKey.ARROW_LEFT:
          value="Left";
          break;
        case Characteristic.RemoteKey.ARROW_RIGHT:
          value="Right";
          break;
        case Characteristic.RemoteKey.SELECT:
          value="Confirm";
          break;
        case Characteristic.RemoteKey.BACK:
          value="Return";
          break;
        case Characteristic.RemoteKey.EXIT:
          value="Exit";
          break;
        case Characteristic.RemoteKey.PLAY_PAUSE:
          value="Play";
          break;
        case Characteristic.RemoteKey.INFORMATION:
          value="Display";
          break;
      }
      this.log("setRemoteKey:"+commandName);
      bravia.send(commandName).
      then(() => callback(null, key))
      .catch(error => callback(err));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getServices = function() {
  return this.services;
};
