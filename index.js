// index.js
const axios = require('axios');

let Service, Characteristic, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    uuid           = api.hap.uuid;

    // dynamic=true → External Accessory 모드의 플랫폼 플러그인
    api.registerPlatform(
        'homebridge-smartthings-routine-tv', // package.json name
        'StRoutineTV',                       // platform identifier
        StRoutineTV,
        true
    );
};

class StRoutineTV {
    constructor(log, config, api) {
        this.log   = log;
        this.token = config.token;
        this.api   = api;

        if (!this.token) {
            throw new Error('`token` is required in config.json');
        }

        this.api.on('didFinishLaunching', () => this.initAccessories());
    }

    async initAccessories() {
        let scenes;
        try {
            const res = await axios.get(
                'https://api.smartthings.com/v1/scenes',
                { headers: { Authorization: `Bearer ${this.token}` } }
            );
            scenes = res.data.items;
        } catch (err) {
            this.log.error('Failed to fetch SmartThings scenes', err);
            return;
        }

        // TV 전원 씬(icon 204)만 필터
        scenes = scenes.filter(scene => String(scene.sceneIcon) === '204');

        const accessories = scenes.map(scene => {
            const name = (scene.sceneName || '').trim() || `Routine ${scene.sceneId}`;
            const acc  = new this.api.platformAccessory(name, uuid.generate(scene.sceneId));
            acc.category = this.api.hap.Categories.TELEVISION;

            const tv = new Service.Television(name);
            tv
                .setCharacteristic(Characteristic.ConfiguredName, name)
                .setCharacteristic(
                    Characteristic.SleepDiscoveryMode,
                    Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                );

            // 원터치 전원(Active) 토글
            tv.getCharacteristic(Characteristic.Active)
                .onGet(() => Characteristic.Active.INACTIVE)
                .onSet(async (v, cb) => {
                    if (v === Characteristic.Active.ACTIVE) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {},
                                { headers: { Authorization: `Bearer ${this.token}` } }
                            );
                            this.log.info(`Executed scene: ${name}`);
                        } catch (e) {
                            this.log.error(`Error executing ${name}`, e);
                            return cb(new Error('SERVICE_COMMUNICATION_FAILURE'));
                        } finally {
                            tv.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            );
                        }
                    }
                    cb();
                });

            acc.addService(tv);
            return acc;
        });

        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',
            accessories
        );
        this.log.info(`Published ${accessories.length} TV routines`);
    }

    configureAccessory() {
        // no-op
    }
}
