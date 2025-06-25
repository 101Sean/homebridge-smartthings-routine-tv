// index.js
const axios = require('axios');

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // dynamic 외부 액세서리 모드로 등록
    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json name
        'StRoutineTV',                        // 플랫폼 식별자
        StRoutineTV,
        true
    );
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log;
        this.token     = config.token;      // SmartThings API 토큰
        this.routineId = config.routineId;  // TV 전원 루틴 ID
        this.name      = config.name;       // 홈앱에 표시될 이름
        this.api       = api;

        if (!this.token || !this.routineId || !this.name) {
            throw new Error('config.json에 name, token, routineId 모두 필요합니다');
        }

        this.api.on('didFinishLaunching', () => this.publishAccessory());
    }

    publishAccessory() {
        // 1) PlatformAccessory 생성
        const acc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        );
        acc.category = this.api.hap.Categories.TELEVISION;

        // 2) Television 서비스 구성
        const tv = new Service.Television(this.name);
        tv
            .setCharacteristic(Characteristic.ConfiguredName,    this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // ActiveIdentifier (필수)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        // RemoteKey 더미 핸들러
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        // Dummy InputSource 연결 (전원 버튼이 숨겨지지 않게 해 줌)
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
        tv.addLinkedService(input);
        tv.setPrimaryService();

        // Active(전원) 토글 구현
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value, cb) => {
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
                        return cb(new Error('SERVICE_COMMUNICATION_FAILURE'));
                    }
                    cb();  // HomeKit에 성공 응답
                    // 1초 뒤에 꺼짐으로 자동 리셋
                    setTimeout(() => {
                        tv.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }, 1000);
                } else {
                    cb();
                }
            });

        acc.addService(tv);

        // 3) 외부 액세서리로 광고
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',
            [ acc ]
        );
        this.log.info('✅ Published TV Routine accessory');
    }

    configureAccessory() {}  // no-op
}
