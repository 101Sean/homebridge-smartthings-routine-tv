// index.js
const axios = require('axios');
const pkg   = require('./package.json');
const plugin = pkg.name;  // "homebridge-smartthings-routine-tv"

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // Accessory 플러그인 등록
    api.registerAccessory(plugin, 'StRoutineTV', StRoutineTV);
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;      // 홈 앱에 표시될 이름
        this.token     = config.token;     // SmartThings API 토큰
        this.routineId = config.routineId; // TV 전원 씬 ID
        this.api       = api;

        if (!this.name || !this.token || !this.routineId) {
            throw new Error('config.json에 name, token, routineId 모두 필요합니다');
        }

        // 단일 Accessory 인스턴스 생성
        const uuidStr = uuid.generate(this.routineId);
        const acc     = new api.platformAccessory(this.name, uuidStr);
        acc.category  = api.hap.Categories.TELEVISION;

        // AccessoryInformation 패치 → TV 아이콘 강제
        acc.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'Custom')
            .setCharacteristic(Characteristic.Model,        'Television');

        // Television 서비스 구성 (필수 7요소)
        const tv = new Service.Television(this.name);
        tv
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        const input = new Service.InputSource(`${this.name} Input`, uuid.generate(this.routineId + '-in'));
        input
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            );
        tv.addLinkedService(input);
        tv.setPrimaryService();

        tv.getCharacteristic(Characteristic.Active)
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
                        throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                    } finally {
                        tv.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE);
                    }
                }
            });

        acc.addService(tv);
        this.api.registerPlatformAccessories(plugin, 'StRoutineTV', [acc]);
        this.log.info('✅ Registered TV Routine accessory');
    }

    configureAccessory() {}  // no-op
}
