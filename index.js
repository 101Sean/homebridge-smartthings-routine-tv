// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true → Child Bridge 없이 단일 External Accessory
    api.registerPlatform(
        'homebridge-smartthings-routine-tv', // package.json.name
        'StRoutineTV',                       // platform identifier
        StRoutineTV,
        true
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

        this.api.on('didFinishLaunching', () => this.publishTv())
    }

    publishTv() {
        // 1) 액세서리 생성
        const acc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        )
        acc.category = this.api.hap.Categories.TELEVISION

        // 2) TV 서비스 구성
        const tv = new Service.Television(this.name)
        tv
            .setCharacteristic(Characteristic.ConfiguredName,    this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        // 필수: ActiveIdentifier
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)

        // (권장) RemoteKey 더미
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())

        // 더미 InputSource 하나 연결
        const inp = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-in`)
        )
        inp
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        tv.addLinkedService(inp)

        // Primary Service 로 지정
        tv.setPrimaryService()

        // 3) 전원(Active) 토글만
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (v, cb) => {
                if (v === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {}, { headers: { Authorization: `Bearer ${this.token}` } }
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

        acc.addService(tv)

        // 4) External Accessory 로 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',  // package.json.name
            [ acc ]
        )
        this.log.info('Published TV Routine accessory')
    }

    configureAccessory() {} // no-op
}
