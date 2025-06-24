// index.js
const axios  = require('axios')
const pkg    = require('./package.json')
const plugin = pkg.name  // "homebridge-smartthings-routine-tv"

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true 로 external accessory 모드
    api.registerPlatform(
        plugin,           // package.json.name 과 100% 동일
        'StRoutineTV',    // platform identifier
        StRoutineTV,
        true
    )
}

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log
        this.name      = config.name
        this.token     = config.token
        this.routineId = config.routineId
        this.api       = api

        if (!this.name || !this.token || !this.routineId) {
            throw new Error('config.json에 name, token, routineId 필수')
        }

        this.api.on('didFinishLaunching', () => this.publishTv())
    }

    publishTv() {
        // 1) PlatformAccessory (TV 서비스만 붙이는 외부 액세서리)
        const tvAcc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        )
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // 2) Television 서비스 세팅
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
                        this.log.error('Error executing TV routine', err)
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

        tvAcc.addService(tv)

        // 3) TV 액세서리만 external-액세서리로 게시
        this.api.publishExternalAccessories(
            plugin,
            [ tvAcc ]
        )
        this.log.info('Published TV Routine as root-level external accessory')
    }

    configureAccessory() {}  // no-op
}
