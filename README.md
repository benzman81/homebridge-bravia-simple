# homebridge-bravia-simple
A simple plugin to control sony bravia for [Homebridge](https://github.com/nfarina/homebridge). 
Applications are currently not supported as input.

# Configuration

## TV
* Turn on your TV
* On the TV go to Settings > Network > Home network setup > Remote device/Renderer > On
* On the TV go to Settings > Network > Home network setup > IP Control > Authentication > Normal and Pre-Shared Key
* On the TV go to Settings > Network > Home network setup > Remote device/Renderer > Enter Pre-Shared Key > 0000 (or whatever you want your PSK Key to be)
* On the TV go to Settings > Network > Home network setup > Remote device/Renderer > Simple IP Control > On

## Homebridge
Example config.json:

    {
        "platforms": [
            {
                "platform": "BraviaSimpleHomebridgePlatform",
                "tvs": [
                    {
                        "name": "My TV",
                        "ip": "1.1.1.1",
                        "port": 80,  // (optional, default 80)
                        "psk": "0000",
                        "pollinterval": 15000,  // (optional, default 60000)
                        "add_lightbuildspeaker": false,  // (optional, default true)
                        "inputs": [
	                        	{
	                        		"name": "PlayStation",
	                        		"source": "extInput:hdmi",
	                        		"num": 2
	                        	},
	                        	{
	                        		"name": "Nintendo Wii",
	                        		"source": "extInput:component",
	                        		"num": 1
	                        	},
	                        	{
	                        		"name": "Disney Channel",
	                        		"source": "tv:dvbs",
	                        		"num": 15
	                        	},
	                        	{
	                        		"name": "CNN",
	                        		"source": "tv:dvbs",
	                        		"num": 765
	                        	}
                        ]
                    }
                ]
            }
        ]
    }

### Supported sources for inputs

#### TV
* tv:dvbt
* tv:dvbs
* tv:dvbc

Set "num" to the channel number to use.

#### External
* extInput:component
* extInput:composite
* extInput:hdmi
* extInput:widi

Set "num" to the port number to use. "extInput:cec" is currently not supported.