// index.js
const axios = require('axios');
const pkg   = require('./package.json');
const PLUGIN_NAME = pkg.name;   // must match package.json “name”

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // register as an Accessory, not a Platform
    api.registerAccessory(PLUGIN_NAME, 'StRoutineTV', StRoutineTV);
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log     = log;
        this.name    = config.name;
        this.token   = config.token;
        this.sceneId = config.sceneId;

        if (!this.name || !this.token || !this.sceneId) {
            throw new Error('config.json에 name, token, sceneId 모두 필요합니다');
        }

        // Information service (optional but recommended)
        this.infoService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Custom')
            .setCharacteristic(Characteristic.Model,        'SmartThings TV Routine')
            .setCharacteristic(Characteristic.Name,         this.name);

        // Television service
        this.tvService = new Service.Television(this.name)
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // Required for a working “TV” accessory
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        // Dummy input so HomeKit doesn’t hide the power button
        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(this.sceneId + '-in')
        );
        input
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);
        this.tvService.addLinkedService(input);
        this.tvService.setPrimaryService();

        // Power toggle
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value, callback) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.sceneId}/execute`,
                            {},
                            { headers:{ Authorization:`Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed TV scene: ${this.name}`);
                    } catch (e) {
                        this.log.error('Error executing TV routine', e);
                        return callback(new Error('SERVICE_COMMUNICATION_FAILURE'));
                    } finally {
                        // reset to “off”
                        this.tvService.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
                callback();
            });
    }

    getServices() {
        return [ this.infoService, this.tvService ];
    }
}
