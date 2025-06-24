// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic 플래그 없이 Static 플랫폼으로 등록
    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineTV',                        // 플랫폼 식별자
        StRoutineTV
    )
}

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log
        this.name      = config.name      || 'TV Routine'
        this.token     = config.token
        this.routineId = config.routineId
        this.api       = api

        if (!this.token || !this.routineId) {
            throw new Error('token and routineId are required')
        }

        this.api.on('didFinishLaunching', () => this.initAccessory())
    }

    initAccessory() {
        // 1) PlatformAccessory 생성
        const accessory = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        )
        accessory.category = this.api.hap.Categories.TELEVISION

        // 2) Television 서비스 구성
        const tv = new Service.Television(this.name)
        tv
            .setCharacteristic(Characteristic.ConfiguredName,    this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())

        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-in`)
        )
        input
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            )
        tv.addLinkedService(input)
        tv.setPrimaryService()

        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (v, cb) => {
                if (v === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers:{ Authorization:`Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV routine: ${this.name}`)
                    } catch (err) {
                        this.log.error(err)
                        return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                    } finally {
                        tv.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
                cb()
            })

        accessory.addService(tv)

        // 3) Static 플랫폼 어시스턴트로 등록
        this.api.registerPlatformAccessories(
            'homebridge-smartthings-routine-tv',
            'StRoutineTV',
            [ accessory ]
        )
        this.log.info('Registered TV Routine accessory in main bridge')
    }

    configureAccessory() {} // no-op
}
