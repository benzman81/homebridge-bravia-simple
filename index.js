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
  var addLightbuildspeaker = config.add_lightbuildspeaker === false ? false : true;
  var port = config.port || 80;
  var pollInterval = config.pollinterval || 60000;
  this.services = [];
  this.inputSources = [];

  this.unknownName = "ZZ_Unknown";
  this.unknownActiveIdentifier = 99;
  
  var inputs = config.inputs || [];
  inputs.push({"name": this.unknownName, "source": "other", "num": 1});
  
  this.bravia = new Bravia(config.ip, port,  config.psk);

  var informationService = new Service.AccessoryInformation();
  informationService.setCharacteristic(Characteristic.Manufacturer, "BraviaSimpleHomebridgePlatform");
  informationService.setCharacteristic(Characteristic.Model, "BraviaHomebridgeTV-"+this.name);
  informationService.setCharacteristic(Characteristic.SerialNumber, this.id);
  this.services.push(informationService);
  
  this.tvService = new Service.Television(this.name, 'tvService');
  this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
  this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
  this.tvService.getCharacteristic(Characteristic.Active).on('set', this.setPowerState.bind(this)).on('get', this.getPowerState.bind(this));
  this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, this.unknownActiveIdentifier);
  this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).on('set', this.setActiveIdentifier.bind(this)).on('get', this.getActiveIdentifier.bind(this));
  this.tvService.getCharacteristic(Characteristic.RemoteKey).on('set', this.setRemoteKey.bind(this));
  this.tvService.getCharacteristic(Characteristic.PowerModeSelection).on('set', this.setPowerModeSelection.bind(this));
  this.services.push(this.tvService);
  // Optional Characteristics
  // TODO this.addOptionalCharacteristic(Characteristic.Brightness);
  // TODO this.addOptionalCharacteristic(Characteristic.ClosedCaptions);
  // TODO this.addOptionalCharacteristic(Characteristic.DisplayOrder);
  // TODO this.addOptionalCharacteristic(Characteristic.CurrentMediaState);
  // TODO this.addOptionalCharacteristic(Characteristic.TargetMediaState);
  // TODO this.addOptionalCharacteristic(Characteristic.PictureMode);
  
  
  this.speakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
  this.speakerService.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);
  this.speakerService.setCharacteristic(Characteristic.Name, "speaker");
  this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
  this.speakerService.getCharacteristic(Characteristic.VolumeSelector).on('set', this.setVolumeSelector.bind(this));
  this.speakerService.getCharacteristic(Characteristic.Mute).on('get', this.getMuted.bind(this, false)).on('set', this.setMuted.bind(this, false));
  this.speakerService.getCharacteristic(Characteristic.Volume).on('get', this.getVolume.bind(this)).on('set', this.setVolume.bind(this));
  this.tvService.addLinkedService(this.speakerService);
  this.services.push(this.speakerService);
  
  if(addLightbuildspeaker) {
    this.speakerLightBulbService = new Service.Lightbulb(this.name + ' Volume LightBulb', 'tvSpeakerLightBulbService');
    this.speakerLightBulbService.getCharacteristic(Characteristic.On).on('get', this.getMuted.bind(this, true)).on('set', this.setMuted.bind(this, true));
    this.speakerLightBulbService.getCharacteristic(Characteristic.Brightness).on('get', this.getVolume.bind(this)).on('set', this.setVolume.bind(this));
    this.services.push(this.speakerLightBulbService);
  }
  
  for (var i = 1; i < inputs.length+1; i++) {
    var input = inputs[i-1]
    this._addInput(input, i);
  }
  
  setInterval(this._update.bind(this), pollInterval);
};

BraviaHomebridgeTV.prototype._addInput = function(config, inputSourceId) {
  var idToUse = inputSourceId;
  if(this.unknownName === config.name) {
    idToUse = this.unknownActiveIdentifier;
  }
  var inputSource = new Service.InputSource(config.name, "input-"+idToUse);
  inputSource.setCharacteristic(Characteristic.Identifier, idToUse)
    .setCharacteristic(Characteristic.ConfiguredName, config.name)
    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
    .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
    .setCharacteristic(Characteristic.InputSourceType, this._getSourceType(config.source))
    .setCharacteristic(Characteristic.InputDeviceType, config.source.indexOf("tv:") !== -1 ? Characteristic.InputDeviceType.TUNER : Characteristic.InputDeviceType.OTHER);
  inputSource.hb_config = config;
  this.services.push(inputSource);
  this.tvService.addLinkedService(inputSource);
  this.inputSources[idToUse] = inputSource;
  this.log("Input created:"+idToUse+" "+config.name);
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

BraviaHomebridgeTV.prototype._update = function() {
  var bravia = this.bravia;
  this.getActiveIdentifier((function(err, activeId) {
    if(err) {
      this.log("Background update with error:"+false+" "+0, err);
      this.tvService.getCharacteristic(Characteristic.Active).updateValue(false);
      this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.unknownActiveIdentifier);
    }
    else {
      this.tvService.getCharacteristic(Characteristic.Active).updateValue(true);
      this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(activeId);
      this.log("Background update:"+true+" "+activeId);
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setPowerState = function(state, callback) {
  var toPoweredOn = state === Characteristic.Active.ACTIVE;
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
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
    callback(null, info.status === "active" ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
  })
  .catch(error => {
    callback(error);
 });
};


BraviaHomebridgeTV.prototype._getUriForNumber = function(bravia, source, number, stIdx, callback) {
  var count = 200;
  bravia.avContent.invoke('getContentList', '1.0', { "source": source, "stIdx":stIdx, "cnt": count}).
  then(contentList => {
    var uri = null;
    for (var i = 0; i < contentList.length; i++) {
      var content = contentList[i];
      if(number === Number(content.dispNum)) {
        uri = content.uri;
        break;
      }
    }
    if(!uri && contentList.length > 0) {
      this._getUriForNumber(bravia, source, number, stIdx+count, callback);
    }
    else {
      callback(null, uri);
    }
  })
  .catch(error => callback(error));
};

BraviaHomebridgeTV.prototype.setActiveIdentifier = function(identifier, callback) {
  if(identifier === this.unknownActiveIdentifier) {
    callback(null, identifier);
    return;
  }
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
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
          callback(null, identifier);
        })
        .catch(error => callback(error));
      }
      else {
        this._getUriForNumber(bravia, config.source, config.num, 0, function(err, uri) {
          if(err) {
            callback(err);
          }
          else if(!uri){
            callback(new Error("No uri found for config.num="+config.num));
          }
          else {
            bravia.avContent.invoke('setPlayContent', '1.0', { "uri": uri}).
            then(() => { 
              callback(null, identifier);
            })
            .catch(error => callback(error));
          }
        });
      }
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getActiveIdentifier = function(callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      bravia.avContent.invoke('getPlayingContentInfo', '1.0').
      then(playingContentInfo => {
        var activeId = this.unknownActiveIdentifier;
        if(playingContentInfo) {
          var source = playingContentInfo.source;
          if(source.indexOf("extInput:") !== -1) {
            var uri = playingContentInfo.uri;
            for (var i = 1; i < this.inputSources.length + 1; i++) {
              var inputSource = this.inputSources[i];
              if(!inputSource|| !inputSource.hb_config){
                continue;
              }
              var config = inputSource.hb_config;
              if(config.source === source && uri.indexOf("?port="+config.num) !== -1) {
                activeId = i;
                break;
              }
            }
          }
          else {
            var dispNum = playingContentInfo.dispNum;
            for (var i = 1; i < this.inputSources.length + 1; i++) {
              var inputSource = this.inputSources[i];
              if(!inputSource || !inputSource.hb_config){
                continue;
              }
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

BraviaHomebridgeTV.prototype.getMuted = function(reverse, callback) {
  this._getVolumeInformation((function(err, volumeInformation) {
    if(!err) {
      this.log("getMuted:"+volumeInformation.mute);
      var mute = volumeInformation.mute;
      if(reverse === true) {
        mute = !mute;
      }
      callback(err, mute);
    }
    else {
      callback(err);
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setMuted = function(reverse, muted, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      if(reverse === true) {
        muted = !muted;
      }
      this.log("setMuted to:"+muted);
      bravia.audio.invoke('setAudioMute', '1.0', { status: muted }).
      then(() => callback(null, muted))
      .catch(error => callback(error));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setVolumeSelector = function(key, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
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
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
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
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
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
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
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
          commandName="Rewind";
          break;
        case Characteristic.RemoteKey.FAST_FORWARD:
          commandName="Forward";
          break;
        case Characteristic.RemoteKey.NEXT_TRACK:
          commandName="Next";
          break;
        case Characteristic.RemoteKey.PREVIOUS_TRACK:
          commandName="Prev";
          break;
        case Characteristic.RemoteKey.ARROW_UP:
          commandName="Up";
          break;
        case Characteristic.RemoteKey.ARROW_DOWN:
          commandName="Down";
          break;
        case Characteristic.RemoteKey.ARROW_LEFT:
          commandName="Left";
          break;
        case Characteristic.RemoteKey.ARROW_RIGHT:
          commandName="Right";
          break;
        case Characteristic.RemoteKey.SELECT:
          commandName="Confirm";
          break;
        case Characteristic.RemoteKey.BACK:
          commandName="Return";
          break;
        case Characteristic.RemoteKey.EXIT:
          commandName="Exit";
          break;
        case Characteristic.RemoteKey.PLAY_PAUSE:
          commandName="Play";
          break;
        case Characteristic.RemoteKey.INFORMATION:
          commandName="Display";
          break;
      }
      this.log("setRemoteKey:"+commandName);
      bravia.send(commandName).
      then(() => callback(null, key))
      .catch(error => callback(err));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.setPowerModeSelection = function(newValue, callback) {
  var bravia = this.bravia;
  this.getPowerState((function(err, isPoweredOnHomeKit) {
    var isPoweredOn = isPoweredOnHomeKit === Characteristic.Active.ACTIVE;
    if(err) {
      callback(err);
    }
    else if(!isPoweredOn) {
      callback(new Error("Bravia '"+this.name+"' is not powered on."));
    }
    else {
      var commandName = "ActionMenu";
      this.log("setPowerModeSelection for value '"+newValue+"':"+commandName);
      bravia.send(commandName).
      then(() => callback(null, newValue))
      .catch(error => callback(err));
    }
  }).bind(this));
};

BraviaHomebridgeTV.prototype.getServices = function() {
  return this.services;
};
