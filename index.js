// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true → 외부 액세서리 모드
    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineTV',                        // platform identifier
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
        // 1) 루트 레벨 PlatformAccessory
        const accessory = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        )
        accessory.category = this.api.hap.Categories.TELEVISION

        // 2) Television 서비스 최소 요건
        const tv = new Service.Television(this.name)
        tv
            .setCharacteristic(Characteristic.ConfiguredName,    this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )
        // ActiveIdentifier (필수)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)
        // 더미 InputSource (필수)
        const inp = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-input`)
        )
        inp
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            )
        tv.addLinkedService(inp)
        tv.setPrimaryService() // “이게 주요 서비스입니다” 표시

        // 3) 전원 토글만 구현
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (v, cb) => {
                if (v === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {}, { headers:{ Authorization:`Bearer ${this.token}` } }
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

        accessory.addService(tv)

        // 4) publishExternalAccessories → 루트 레벨 TV 액세서리로 노출
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',  // package.json.name
            [ accessory ]
        )
        this.log.info('Published TV Routine as external accessory')
    }

    configureAccessory() {} // no-op
}
