// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineTV',                        // platform identifier
        StRoutineTV,
        true                                  // dynamic=true
    )
}

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log
        this.token     = config.token
        this.routineId = config.routineId
        this.name      = config.name || 'TV Routine'  // ← 여기서 받아서 저장
        this.api       = api

        if (!this.token || !this.routineId) {
            throw new Error('token and routineId are required')
        }

        this.api.on('didFinishLaunching', () => this.publishTvAccessory())
    }

    publishTvAccessory() {
        // 이제 this.name 을 사용
        const name = this.name

        const acc = new this.api.platformAccessory(
            name,
            uuid.generate(this.routineId)
        )
        acc.category = this.api.hap.Categories.TELEVISION

        const tvSvc = new Service.Television(name)
        tvSvc
            .setCharacteristic(Characteristic.ConfiguredName,    name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        tvSvc.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)

        tvSvc.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())

        const inp = new Service.InputSource(`${name} Input`, uuid.generate(`${this.routineId}-in`))
        inp
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        tvSvc.addLinkedService(inp)

        tvSvc.setPrimaryService()

        tvSvc.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (v, cb) => {
                if (v === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV routine: ${name}`)
                    } catch (err) {
                        this.log.error('Error executing TV routine', err)
                        return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                    } finally {
                        tvSvc.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
                cb()
            })

        acc.addService(tvSvc)

        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',  // package.json.name
            [ acc ]
        )
        this.log.info('Published TV Routine accessory')
    }

    configureAccessory() {}  // no-op
}
