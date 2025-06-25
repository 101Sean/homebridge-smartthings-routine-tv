// index.js
const axios = require('axios');

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineTV',                        // platform identifier
        StRoutineTV,
        true
    );
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log     = log;
        this.token   = config.token;    // SmartThings API 토큰
        this.sceneId = config.sceneId;  // config.json 에 추가된 씬 ID
        this.api     = api;

        if (!this.token || !this.sceneId) {
            throw new Error('config.json에 token과 sceneId 모두 필요합니다');
        }

        this.api.on('didFinishLaunching', () => this.initAccessories());
    }

    async initAccessories() {
        // 단일 씬을 직접 사용
        const scene = { sceneId: this.sceneId, sceneName: null };

        // (선택) 씬 이름을 SmartThings API 에서 받아오고 싶다면:
        // const res = await axios.get(
        //   `https://api.smartthings.com/v1/scenes/${this.sceneId}`,
        //   { headers: { Authorization: `Bearer ${this.token}` } }
        // );
        // scene.sceneName = res.data.sceneName;

        const displayName = scene.sceneName || 'TV Routine';

        const acc = new this.api.platformAccessory(
            displayName,
            uuid.generate(this.sceneId)
        );
        acc.category = this.api.hap.Categories.TELEVISION;

        const tvSvc = new Service.Television(displayName);
        tvSvc
            .setCharacteristic(Characteristic.ConfiguredName, displayName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        tvSvc.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value, callback) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.sceneId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed scene: ${displayName}`);
                    } catch (e) {
                        this.log.error(`Error executing ${displayName}`, e);
                        return callback(new Error('SERVICE_COMMUNICATION_FAILURE'));
                    } finally {
                        tvSvc.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
                callback();
            });

        acc.addService(tvSvc);

        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',
            [ acc ]
        );
        this.log.info(`Published TV routine: ${displayName}`);
    }

    configureAccessory() {}  // no-op
}
