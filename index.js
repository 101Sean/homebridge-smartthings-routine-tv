// index.js
const axios = require('axios')

let Service, Characteristic, Bridge, Accessory, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    Bridge         = api.hap.Bridge
    Accessory      = api.platformAccessory
    uuid           = api.hap.uuid

    // dynamic=true → Child Bridge 모드
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

        this.api.on('didFinishLaunching', () => this.publishBridge())
    }

    publishBridge() {
        // 1) Child Bridge 생성
        const bridgeUUID  = uuid.generate(this.name)
        const childBridge = new Bridge(this.name, bridgeUUID)
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'TVRoutineBridge')

        // 2) TV 액세서리(Bridged Accessory) 생성
        const tvAcc = new Accessory(this.name, uuid.generate(this.routineId))
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // 3) Television 서비스 구성
        const tv = new Service.Television(this.name)
        tv
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        // 필수: ActiveIdentifier
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)

        // 권장: RemoteKey 더미 핸들러
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())

        // 더미 InputSource 서비스
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

        // Primary Service 지정
        tv.setPrimaryService()

        // 전원 토글만 (Active)
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (v, cb) => {
                if (v === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV Routine: ${this.name}`)
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

        // 4) Child Bridge에 TV 액세서리 연결
        childBridge.addBridgedAccessory(tvAcc)

        // 5) External Accessory로 HomeKit에 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',  // package.json.name
            [ childBridge ]
        )
        this.log.info(`Published child bridge "${this.name}" with TV accessory`)
    }

    configureAccessory() {}  // no-op
}
