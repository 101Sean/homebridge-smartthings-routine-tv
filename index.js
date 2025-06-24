// index.js
const axios = require('axios');
const pkg   = require('./package.json');
const pluginName = pkg.name;  // "homebridge-smartthings-routine-tv"

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // Accessory 플러그인 등록
    api.registerAccessory(pluginName, 'StRoutineTV', StRoutineTV);
};

class StRoutineTV {
    constructor(log, config) {
        this.log       = log;
        this.name      = config.name;
        this.token     = config.token;
        this.routineId = config.routineId;

        if (!this.name || !this.token || !this.routineId) {
            throw new Error('config.json에 name, token, routineId가 모두 필요합니다');
        }

        // AccessoryInformation 서비스 (TV 아이콘 강제 지정)
        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Custom')
            .setCharacteristic(Characteristic.Model,        'Television')
            .setCharacteristic(Characteristic.Name,         this.name);

        // Television 서비스 구성 (필수 7요소)
        this.tvService = new Service.Television(this.name)
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // ActiveIdentifier
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        // RemoteKey 더미
        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        // Dummy InputSource
        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(this.routineId + '-in')
        );
        input
            .setCharacteristic(Characteristic.Identifier,              1)
            .setCharacteristic(Characteristic.ConfiguredName,          this.name)
            .setCharacteristic(Characteristic.IsConfigured,            Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,         Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            );
        this.tvService.addLinkedService(input);
        this.tvService.setPrimaryService();

        // Active 토글 (원터치 복원)
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed TV routine: ${this.name}`);
                    } catch (err) {
                        this.log.error('Error executing TV routine', err);
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        );
                    } finally {
                        // 원터치 상태 복원
                        this.tvService.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
            });
    }

    // Homebridge 가 호출: 이 배열의 서비스들이 HAP 액세서리로 노출됩니다
    getServices() {
        return [ this.informationService, this.tvService ];
    }
}
