// index.js
const axios  = require('axios');
const pkg    = require('./package.json');
const plugin = pkg.name;  // "homebridge-smartthings-routine-tv"

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // dynamic=true 로 External Accessory 모드 등록
    api.registerPlatform(
        plugin,        // 반드시 package.json.name 과 일치
        'StRoutineTV', // 플랫폼 식별자
        StRoutineTV,
        true           // dynamic
    );
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;      // 홈 앱에 표시될 이름
        this.token     = config.token;     // SmartThings API 토큰
        this.routineId = config.routineId; // TV 전원 씬 ID
        this.api       = api;

        if (!this.name || !this.token || !this.routineId) {
            throw new Error('config.json에 name, token, routineId 세 개가 모두 필요합니다');
        }

        this.api.on('didFinishLaunching', () => this.publishAccessory());
    }

    publishAccessory() {
        // 1) TV PlatformAccessory 생성
        const tvAcc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        );
        tvAcc.category = this.api.hap.Categories.TELEVISION;

        // 2) Television 서비스 구성
        const tv = new Service.Television(this.name);
        tv
            .setCharacteristic(Characteristic.ConfiguredName,        this.name)
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

        // 5) Dummy InputSource (필수)
        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-in`)
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
        tv.addLinkedService(input);

        // 6) Primary Service 지정
        tv.setPrimaryService();

        // 7) Active(전원) 토글 구현
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
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        );
                    } finally {
                        // 원터치 토글 복원
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
            [tvAcc]
        );
        this.log.info('✅ Published TV Routine as external accessory');
    }

    configureAccessory() {} // no-op
}
