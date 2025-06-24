// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true 로 External Accessory 모드
    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineTV',                        // 플랫폼 식별자
        StRoutineTV,
        true                                  // ← dynamic=true 반드시!
    )
}

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log
        this.token     = config.token       // SmartThings API 토큰
        this.routineId = config.routineId   // TV 전용 씬 ID
        this.api       = api

        if (!this.token || !this.routineId) {
            throw new Error('token and routineId are required')
        }

        this.api.on('didFinishLaunching', () => this.publishTvAccessory())
    }

    publishTvAccessory() {
        const name = this.api.config.name || 'TV Routine'
        // 1) accessory 인스턴스 생성
        const acc = new this.api.platformAccessory(name, uuid.generate(this.routineId))
        acc.category = this.api.hap.Categories.TELEVISION

        // 2) TV 서비스 구성
        const tvSvc = new Service.Television(name)
        tvSvc
            .setCharacteristic(Characteristic.ConfiguredName,        name)
            .setCharacteristic(Characteristic.SleepDiscoveryMode,     Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)

        // ActiveIdentifier (필수)
        tvSvc.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)

        // RemoteKey 더미
        tvSvc.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())

        // 더미 InputSource
        const inp = new Service.InputSource(`${name} Input`, uuid.generate(`${this.routineId}-in`))
        inp
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        tvSvc.addLinkedService(inp)

        tvSvc.setPrimaryService()

        // 전원 토글만
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

        // 3) External Accessory 로 HomeKit에 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',  // package.json.name
            [ acc ]
        )
        this.log.info('Published TV Routine accessory')
    }

    configureAccessory() {}  // no-op
}
