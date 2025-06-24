// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true → 루트 액세서리(external)가 가능해집니다
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

        this.api.on('didFinishLaunching', () => this.publishTvAccessory())
    }

    publishTvAccessory() {
        // 1) PlatformAccessory 생성 (TV 카테고리)
        const tvAcc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        )
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // 2) Television 서비스 구성
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
        // RemoteKey 더미
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())
        // Dummy InputSource (필수)
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

        // 3) 전원 토글 (Active) 구현
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value, cb) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {}, { headers:{ Authorization:`Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV routine: ${this.name}`)
                    } catch (e) {
                        this.log.error('Error executing TV routine', e)
                        return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                    } finally {
                        // 바로 원위치
                        tv.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
                cb()
            })

        tvAcc.addService(tv)

        // 4) 루트 외부 액세서리로 HomeKit에 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',  // package.json.name
            [ tvAcc ]
        )
        this.log.info('Published TV accessory as root-level external accessory')
    }

    configureAccessory() {}  // no-op
}
