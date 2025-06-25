const axios = require('axios');
const pkg   = require('./package.json');
const PLUGIN_NAME = pkg.name;   // "homebridge-smartthings-routine-tv"

let Service, Characteristic, uuid;

module.exports = api => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // “Accessory” 타입으로만 등록
    api.registerAccessory(PLUGIN_NAME, 'StRoutineTV', StRoutineTV);
};

class StRoutineTV {
    constructor(log, config) {
        this.log     = log;
        this.name    = config.name;     // config.json의 name
        this.token   = config.token;    // SmartThings API 토큰
        this.sceneId = config.sceneId;  // 실행할 SmartThings 씬 ID

        if (!this.name || !this.token || !this.sceneId) {
            throw new Error('config.json에 name, token, sceneId 모두 필요합니다');
        }

        // 1) Information 서비스 (제조사/모델/이름 정보)
        this.infoService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Custom')
            .setCharacteristic(Characteristic.Model,        'SmartThings TV Routine')
            .setCharacteristic(Characteristic.Name,         this.name);

        // 2) Television 서비스 생성
        this.tvService = new Service.Television(this.name)
            // 사용자 지정 이름
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            // 항상 검색 가능 모드
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // TV 액세서리 필수: ActiveIdentifier (입력 소스 인덱스)
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1);

        // RemoteKey 더미 핸들러 (필수)
        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb());

        // InputSource 더미 서비스 (power 버튼이 UI에서 사라지지 않도록)
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

        // 3) 전원 토글 구현 (ON 누르면 SmartThings 씬 실행, 즉시 OFF로 복원)
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)  // 항상 OFF 상태에서 시작
            .onSet(async (value, callback) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.sceneId}/execute`,
                            {},
                            { headers: { Authorization:`Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed TV scene: ${this.name}`);
                    } catch (e) {
                        this.log.error('Error executing TV routine', e);
                        return callback(new Error('SERVICE_COMMUNICATION_FAILURE'));
                    } finally {
                        // UI에선 곧바로 OFF로 돌아가도록
                        this.tvService.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
                callback();
            });
    }

    // Homebridge에게 노출할 서비스 목록 리턴
    getServices() {
        return [ this.infoService, this.tvService ];
    }
}
