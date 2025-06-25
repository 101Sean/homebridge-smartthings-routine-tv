// index.js
const axios = require('axios');
const pkg   = require('./package.json');
const PLUGIN_NAME = pkg.name; // 반드시 package.json의 name과 일치

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // 오직 Accessory 로만 등록
    api.registerAccessory(PLUGIN_NAME, 'StRoutineTV', StRoutineTV);
};

class StRoutineTV {
    constructor(log, config) {
        this.log     = log;
        this.name    = config.name;
        this.token   = config.token;
        this.sceneId = config.sceneId;

        if (!this.name || !this.token || !this.sceneId) {
            throw new Error('config.json에 name, token, sceneId 모두 필요합니다');
        }

        // 액세서리 정보
        this.infoService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Custom')
            .setCharacteristic(Characteristic.Model,        'Television')
            .setCharacteristic(Characteristic.Name,         this.name);

        // TV 서비스
        this.tvService = new Service.Television(this.name)
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // 필수 ActiveIdentifier
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        // RemoteKey 더미
        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        // InputSource 더미
        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(this.sceneId + '-in')
        );
        input
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            );
        this.tvService.addLinkedService(input);
        this.tvService.setPrimaryService();

        // Active 토글 (원터치 복원)
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async value => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.sceneId}/execute`,
                            {},
                            { headers: { Authorization:`Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed TV routine: ${this.name}`);
                    } catch (e) {
                        this.log.error('Error executing TV routine', e);
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        );
                    } finally {
                        this.tvService.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
            });
    }

    // Homebridge가 서비스 목록을 여기서 읽어갑니다
    getServices() {
        return [ this.infoService, this.tvService ];
    }
}
