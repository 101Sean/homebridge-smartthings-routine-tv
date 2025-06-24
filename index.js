// index.js
const axios  = require('axios');
const pkg    = require('./package.json');
const plugin = pkg.name;  // package.json.name 과 100% 일치

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // dynamic=true → External Accessory 모드
    api.registerPlatform(
        plugin,        // package.json.name
        'StRoutineTV', // platform identifier
        StRoutineTV,
        true           // dynamic
    );
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;      // 홈 앱에 표시될 이름
        this.token     = config.token;     // SmartThings API 토큰
        this.routineId = config.routineId; // sceneIcon=204 씬 ID
        this.api       = api;

        if (!this.name || !this.token || !this.routineId) {
            throw new Error('config.json 에 name, token, routineId 모두 필요');
        }
        this.api.on('didFinishLaunching', () => this.publishAccessory());
    }

    publishAccessory() {
        // 1) 액세서리 생성 (TV 카테고리)
        const tvAcc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        );
        tvAcc.category = this.api.hap.Categories.TELEVISION;

        // 2) TV 서비스 세팅
        const tv = new Service.Television(this.name);
        tv
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // 3) ActiveIdentifier (필수)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        // 4) RemoteKey 더미 (필수)
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        // 5) InputSource (필수)
        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-in`)
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
        tv.addLinkedService(input);

        // 6) Primary Service 지정
        tv.setPrimaryService();

        // 7) Active 토글 구현 (원터치)
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers:{ Authorization:`Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed TV routine: ${this.name}`);
                    } catch (err) {
                        this.log.error('Error executing TV routine', err);
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        );
                    } finally {
                        tv.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
            });

        tvAcc.addService(tv);

        // 8) External Accessory 로 게시
        this.api.publishExternalAccessories(
            plugin,
            [ tvAcc ]
        );
        this.log.info('✅ Published TV Routine as external accessory');
    }

    configureAccessory() {} // no-op
}
