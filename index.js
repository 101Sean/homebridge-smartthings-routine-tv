// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // ← must match package.json.name
    api.registerPlatform(
        'homebridge-smartthings-routine-tv',
        'StRoutineTV',
        StRoutineTV,
        true
    )
}

class StRoutineTV {
    // … constructor etc …

    async initAccessories() {
        // … fetch scenes, filter to sceneIcon === '204' …

        const accessories = scenes.map(scene => {
            const name = (scene.sceneName || '').trim() || scene.sceneId
            const svc  = new Service.Television(name)
            const acc  = new this.api.platformAccessory(name, uuid.generate(scene.sceneId))

            acc.category = this.api.hap.Categories.TELEVISION

            svc
                .setCharacteristic(Characteristic.ConfiguredName, name)
                .setCharacteristic(
                    Characteristic.SleepDiscoveryMode,
                    Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                )
            svc.getCharacteristic(Characteristic.Active)
                .onGet(() => Characteristic.Active.INACTIVE)
                .onSet(async (v, cb) => {
                    if (v === Characteristic.Active.ACTIVE) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {},
                                { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed scene: ${name}`)
                        } catch (e) {
                            this.log.error(e)
                            return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                        } finally {
                            svc.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            )
                        }
                    }
                    cb()
                })

            acc.addService(svc)
            return acc
        })

        // ← publish with the same pluginName
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',
            accessories
        )
        this.log.info(`Published ${accessories.length} TV routines`)
    }

    configureAccessory() {} // no-op
}
